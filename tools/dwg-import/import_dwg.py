#!/usr/bin/env python3
"""DWG/DXF -> site.json importer.

  python -I import_dwg.py discover <layout.dxf>                       # layer/block/text stats
  python -I import_dwg.py build <sites/ID/import.config.yaml> <layout.dxf> <out_dir> [--preview]

All client-specific knowledge lives in the YAML config. Output geometry is in meters,
X east / Y north, origin at the crop's SW corner. See CLAUDE.md section 5.
"""
import sys, re, json, math, collections
import numpy as np
import ezdxf, yaml
from scipy import ndimage

STEP_MM = 50


def clean_text(s):
    s = re.sub(r"\\[A-Za-z0-9.]+;?", "", s)
    s = s.replace("\\P", " ").replace("{", "").replace("}", "")
    return re.sub(r"\s+", " ", s).strip()


def entity_segments(e):
    """Yield (x1,y1,x2,y2) in DWG units for the entity, best effort (arcs/circles approximated)."""
    t = e.dxftype()
    if t == "LINE":
        s, f = e.dxf.start, e.dxf.end
        yield (s.x, s.y, f.x, f.y)
    elif t == "LWPOLYLINE":
        p = [(x, y) for x, y, *_ in e.get_points()]
        for a, b in zip(p, p[1:]):
            yield (a[0], a[1], b[0], b[1])
        if e.closed and len(p) > 2:
            yield (p[-1][0], p[-1][1], p[0][0], p[0][1])
    elif t in ("CIRCLE", "ARC"):
        c, r = e.dxf.center, e.dxf.radius
        if r > 0:
            pts = [(c.x + r * math.cos(a), c.y + r * math.sin(a)) for a in np.linspace(0, 2 * math.pi, 13)]
            for a, b in zip(pts, pts[1:]):
                yield (a[0], a[1], b[0], b[1])


def block_bboxes(doc):
    """Local-space bbox of every block definition (cheap: LINE/LWPOLYLINE/CIRCLE/ARC only)."""
    out = {}
    for blk in doc.blocks:
        xs, ys = [], []
        for e in blk:
            try:
                for x1, y1, x2, y2 in entity_segments(e):
                    xs += [x1, x2]; ys += [y1, y2]
            except Exception:
                pass
        if xs:
            out[blk.name] = (min(xs), min(ys), max(xs), max(ys))
    return out


def rasterize(segs, box, cell):
    x0, y0, x1, y1 = box
    w, h = int((x1 - x0) / cell) + 1, int((y1 - y0) / cell) + 1
    g = np.zeros((h, w), dtype=bool)
    for ax, ay, bx, by in segs:
        L = math.hypot(bx - ax, by - ay)
        n = max(2, int(L / min(cell, STEP_MM)) + 1)
        xs = np.linspace(ax, bx, n); ys = np.linspace(ay, by, n)
        ix = ((xs - x0) / cell).astype(int); iy = ((ys - y0) / cell).astype(int)
        ok = (ix >= 0) & (ix < w) & (iy >= 0) & (iy < h)
        g[iy[ok], ix[ok]] = True
    return g


def rects_from_mask(m):
    """Greedy decomposition of a boolean mask into rectangles (row runs merged vertically)."""
    rects, active = [], {}
    for y in range(m.shape[0] + 1):
        row = m[y] if y < m.shape[0] else np.zeros(m.shape[1], bool)
        d = np.diff(np.concatenate([[0], row.view(np.int8), [0]]))
        runs = list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))
        nxt = {}
        for (a, b) in runs:
            if (a, b) in active:
                nxt[(a, b)] = active.pop((a, b))
            else:
                nxt[(a, b)] = y
        for (a, b), ys in active.items():
            rects.append((a, ys, b, y))
        active = nxt
    return rects


def build(cfg, doc, out_dir, preview):
    sc = cfg["scale"]
    cx0, cy0, cx1, cy1 = cfg["crop"]
    ox, oy = cx0, cy0
    inside = lambda x, y, b: b[0] <= x <= b[2] and b[1] <= y <= b[3]
    M = lambda v, o: round((v - o) * sc, 3)
    ms = doc.modelspace()

    walls, equip_segs, labels = [], collections.defaultdict(list), []
    seen = set()
    wl, el = cfg["walls"], cfg["equipment"]
    for e in ms:
        lay = e.dxf.layer
        try:
            t = e.dxftype()
            if lay in wl:
                for x1, y1, x2, y2 in entity_segments(e):
                    if not (inside(x1, y1, cfg["crop"]) and inside(x2, y2, cfg["crop"])):
                        continue
                    if math.hypot(x2 - x1, y2 - y1) < 300:
                        continue
                    key = (lay, round(min(x1, x2), -1), round(min(y1, y2), -1), round(max(x1, x2), -1), round(max(y1, y2), -1))
                    if key in seen:
                        continue
                    seen.add(key)
                    walls.append((x1, y1, x2, y2, lay))
            if lay in el:
                for s in entity_segments(e):
                    if inside(s[0], s[1], cfg["detail"]):
                        equip_segs[lay].append(s)
            if t in ("TEXT", "MTEXT") and lay in cfg["labelLayers"]:
                raw = e.dxf.text if t == "TEXT" else e.text
                s = clean_text(raw)
                p = e.dxf.insert
                if s and inside(p.x, p.y, cfg["crop"]) and any(re.search(r, s, re.I) for r in cfg["labelPatterns"]):
                    labels.append({"text": s[:48], "x": M(p.x, ox), "y": M(p.y, oy)})
        except Exception:
            continue

    # --- walls: merge exact duplicates, emit centre-line boxes
    wall_out = []
    for x1, y1, x2, y2, lay in walls:
        c = wl[lay]
        wall_out.append({"a": [M(x1, ox), M(y1, oy)], "b": [M(x2, ox), M(y2, oy)], "t": c["t"], "h": c["h"], "layer": lay})

    # --- equipment: raster -> clusters -> rectangles
    detail = cfg["detail"]; cell = cfg["cell"]
    equip = []
    for lay, segs in equip_segs.items():
        c = el[lay]
        g = rasterize(segs, detail, cell)
        cl = c.get("close", cfg["close"]); k = np.ones((2 * cl + 1,) * 2, bool)
        g = ndimage.binary_dilation(g, k)
        if c.get("fill", True):
            g = ndimage.binary_fill_holes(g)
        g = ndimage.binary_erosion(g, np.ones((cl * 2 - 1,) * 2, bool)) if cl > 1 else g
        lab, n = ndimage.label(g)
        for i, sl in enumerate(ndimage.find_objects(lab), 1):
            sub = lab[sl] == i
            cw, ch = sub.shape[1] * cell * sc, sub.shape[0] * cell * sc
            if cw * ch < cfg["minArea"] or cw * ch > cfg.get("maxArea", 450):  # huge closed outlines are enclosures, not machines
                continue
            parts = [(0, 0, sub.shape[1], sub.shape[0])] if sub.mean() > 0.6 else rects_from_mask(sub)
            for a, b, c2, d in parts:
                gx0 = detail[0] + (sl[1].start + a) * cell; gy0 = detail[1] + (sl[0].start + b) * cell
                w, h = (c2 - a) * cell * sc, (d - b) * cell * sc
                if w * h < cfg["minArea"]:
                    continue
                equip.append({"kind": c["kind"], "x": M(gx0 + (c2 - a) * cell / 2, ox), "y": M(gy0 + (d - b) * cell / 2, oy),
                              "w": round(w, 2), "d": round(h, 2), "h": c["h"], "layer": lay})

    sh = cfg.get("shell")  # generated perimeter walls from floor rects (DWG often lacks a closed outline)
    if sh:
        for r in cfg["floors"]:
            pts = [(r[0], r[1]), (r[2], r[1]), (r[2], r[3]), (r[0], r[3]), (r[0], r[1])]
            for p0, p1 in zip(pts, pts[1:]):
                wall_out.append({"a": [M(p0[0], ox), M(p0[1], oy)], "b": [M(p1[0], ox), M(p1[1], oy)], "t": sh["t"], "h": sh["h"], "layer": "shell"})

    zones = []
    for z in cfg["zones"]:
        r = z["rect"]
        zones.append({"id": z["id"], "name": z["name"], "kind": z["kind"], "active": z["active"], "color": z["color"],
                      "polygon": [[M(r[0], ox), M(r[1], oy)], [M(r[2], ox), M(r[1], oy)], [M(r[2], ox), M(r[3], oy)], [M(r[0], ox), M(r[3], oy)]]})
    floors = [[[M(r[0], ox), M(r[1], oy)], [M(r[2], ox), M(r[1], oy)], [M(r[2], ox), M(r[3], oy)], [M(r[0], ox), M(r[3], oy)]] for r in cfg["floors"]]

    site = {
        "schema": 1, "siteId": cfg["siteId"], "name": cfg["name"], "units": "m",
        "bounds": {"minX": 0, "minY": 0, "maxX": M(cx1, ox), "maxY": M(cy1, oy)},
        "floorPolygons": floors, "walls": wall_out, "pillars": [], "zones": zones,
        "equipment": equip, "doors": [], "labels": labels,
    }
    import os
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "site.json"), "w") as f:
        json.dump(site, f, separators=(",", ":"))
    print(f"walls={len(wall_out)} equipment={len(equip)} labels={len(labels)} zones={len(zones)}",
          f"size={os.path.getsize(os.path.join(out_dir, 'site.json')) / 1e6:.2f}MB")
    if preview:
        import matplotlib; matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        from matplotlib.collections import LineCollection
        from matplotlib.patches import Rectangle
        fig, ax = plt.subplots(figsize=(16, 9), dpi=110)
        ax.add_collection(LineCollection([[w["a"], w["b"]] for w in wall_out], linewidths=.3, colors="k"))
        for q in equip:
            ax.add_patch(Rectangle((q["x"] - q["w"] / 2, q["y"] - q["d"] / 2), q["w"], q["d"], fc="#14b8a6", ec="none", alpha=.6))
        for z in zones:
            p = np.array(z["polygon"]); ax.plot(*np.vstack([p, p[0]]).T, color=z["color"], lw=1.5)
        ax.set_xlim(0, site["bounds"]["maxX"]); ax.set_ylim(0, site["bounds"]["maxY"]); ax.set_aspect("equal")
        fig.savefig(os.path.join(out_dir, "preview.png"), bbox_inches="tight")


def discover(doc):
    ms = doc.modelspace()
    lay, blk = collections.Counter(), collections.Counter()
    for e in ms:
        lay[e.dxf.layer] += 1
        if e.dxftype() == "INSERT":
            blk[e.dxf.name] += 1
    print("LAYERS", lay.most_common(40)); print("BLOCKS", blk.most_common(30))


if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "discover":
        discover(ezdxf.readfile(sys.argv[2]))
    elif cmd == "build":
        cfg = yaml.safe_load(open(sys.argv[2]))
        build(cfg, ezdxf.readfile(sys.argv[3]), sys.argv[4], "--preview" in sys.argv)
    else:
        sys.exit(__doc__)
