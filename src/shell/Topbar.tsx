import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Menu02, SearchLg } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { Input } from '@/components/base/input/input';
import { Brain, HeadsetHelp } from '@/ui/icons/figma-icons';
import { notify } from '@/ui/toast';
import type { SearchHit } from './types';

interface Props {
  onMenu: () => void;
  /** Left-hand history buttons. Defaults to back/forward; the Workflow Builder passes undo/redo. */
  leading?: ReactNode;
  searchPlaceholder: string; getHits: (q: string) => SearchHit[];
  onAi?: () => void; onSupport?: () => void;
}
/** Generic top app bar (Figma node 837:5352). Pages provide search behaviour and the left-hand buttons. */
export function Topbar({ onMenu, leading, searchPlaceholder, getHits, onAi, onSupport }: Props) {
  const navigate = useNavigate(); const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const hits = q.trim() ? getHits(q.trim()) : [];
  return (
    <header className="topbar">
      <ButtonUtility className="menu-btn" icon={Menu02} tooltip="Open menu" onPress={onMenu} />
      {leading ?? <><ButtonUtility className="hide-sm" icon={ChevronLeft} tooltip="Back" /><ButtonUtility className="hide-sm" icon={ChevronRight} tooltip="Forward" isDisabled /></>}
      <div className="search">
        <Input size="sm" icon={SearchLg} placeholder={searchPlaceholder} aria-label="Search" value={q}
          onChange={(v) => { setQ(v); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {open && hits.length > 0 && <div className="results">{hits.map((h, i) => <button key={i} onMouseDown={() => { h.go?.(); if (h.to) navigate(h.to); setQ(''); }}><b>{h.title}</b><small>{h.kind}{h.sub ? ` · ${h.sub}` : ''}</small></button>)}</div>}
      </div>
      <div className="tb-spacer" />
      <Button className="hide-sm" size="sm" color="secondary" iconLeading={HeadsetHelp} onPress={onSupport ?? (() => notify.info('Support', 'Reach the AtiFlow support desk from the full app.', 'support'))}>Go to Support</Button>
      <Button className="hide-sm" size="sm" color="primary" iconLeading={Brain} onPress={onAi}>Ati AI</Button>
    </header>
  );
}
