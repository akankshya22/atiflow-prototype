"""Convert a 2D LiDAR floor scan into a site's point map (public/sites/<id>/pointmap-2d.json).

Input: the "AtiFlow Live View" pointclouds.json (layer "a" = 2D LiDAR floor scan, 5 bytes per point:
x,y as uint16 over `bounds`, z as uint8), in CAD drawing units (1 u = 0.628 m, y pointing south).
The transform below puts the scan's clean room (x 336..445, y 162..382 u) on the ECC site frame
(metres, x east, y north, origin at the site's SW corner); it was checked by overlaying the scan on
site.json walls and equipment. Output: uint16 x,y in centimetres, little endian, base64.

usage: python -I tools/pointmap/import_pointmap.py <pointclouds.json> <site.json> <out pointmap-2d.json>
"""
import base64, json, struct, sys

SCALE, X0, Y0, OX, OY = 0.628, 336.0, 382.0, 3.0, 3.0   # metres per unit; scan origin; site offset

def main(src, site_path, out):
    d = json.load(open(src)); bx0, by0, bx1, by1 = d['bounds']; raw = base64.b64decode(d['a'])
    b = json.load(open(site_path))['bounds']; buf = bytearray(); seen = set()
    for i in range(len(raw) // 5):
        qx = raw[i * 5] | raw[i * 5 + 1] << 8; qy = raw[i * 5 + 2] | raw[i * 5 + 3] << 8
        x = (bx0 + qx / 65535 * (bx1 - bx0) - X0) * SCALE + OX
        y = (Y0 - (by0 + qy / 65535 * (by1 - by0))) * SCALE + OY
        if not (b['minX'] <= x <= b['maxX'] and b['minY'] <= y <= b['maxY']): continue
        key = (round(x * 20), round(y * 20))                 # drop duplicates closer than 5 cm
        if key in seen: continue
        seen.add(key); buf += struct.pack('<HH', round(x * 100), round(y * 100))
    json.dump({'schema': 1, 'units': 'cm', 'kind': '2d-lidar', 'count': len(buf) // 4, 'b64': base64.b64encode(bytes(buf)).decode()}, open(out, 'w'))
    print(f'{len(buf) // 4} points -> {out}')

if __name__ == '__main__':
    main(*sys.argv[1:4])
