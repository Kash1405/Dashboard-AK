import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Icon } from "../components/ui";
import {
  COLORS, COLOR_KEYS, KINDS, TEMPLATES, anchor, boundsOf, contains, edgeGeometry, intersects, kindInfo, newFlow, normalizeDoc, routePath, serializeDoc, sideToward,
  useActiveFlowId, useFlowViews, useFlows,
  type ArrowMode, type Box, type EdgeStyle, type Flow, type FlowDoc, type FlowEdge, type FlowNode, type NodeKind, type Pt, type Side, type TextSize, type View,
} from "../lib/flows";
import { uid } from "../lib/utils";

// ---------- Page ----------

export default function Flows() {
  const [flows, setFlows] = useFlows();
  const [activeId, setActiveId] = useActiveFlowId();
  const [filter, setFilter] = useState<"active" | "archived">("active");
  const [fullscreen, setFullscreen] = useState(false);
  const active = flows.find((f) => f.id === activeId) ?? flows.find((f) => f.status === "active") ?? null;

  const create = (templateId: string) => {
    const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
    const count = flows.filter((f) => f.name.startsWith("Untitled flow")).length;
    const flow = newFlow(template.id === "blank" ? `Untitled flow${count ? ` ${count + 1}` : ""}` : template.name, template.build());
    setFlows((list) => [flow, ...list]);
    setActiveId(flow.id);
    setFilter("active");
  };
  const update = (id: string, patch: Partial<Flow>) =>
    setFlows((list) => list.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: patch.updatedAt ?? new Date().toISOString() } : f)));
  const duplicate = (flow: Flow) => {
    const map = new Map(flow.nodes.map((n) => [n.id, uid()]));
    const copy = newFlow(`${flow.name} (copy)`, {
      nodes: flow.nodes.map((n) => ({ ...n, id: map.get(n.id)! })),
      edges: flow.edges.map((e) => ({ ...e, id: uid(), from: map.get(e.from)!, to: map.get(e.to)! })),
    }, flow.description);
    setFlows((list) => [copy, ...list]);
    setActiveId(copy.id);
    setFilter("active");
  };
  const remove = (id: string) => {
    setFlows((list) => list.filter((f) => f.id !== id));
    if (active?.id === id) setActiveId("");
  };
  const importFile = async (file: File) => {
    try {
      const raw = JSON.parse(await file.text());
      const doc = normalizeDoc(raw);
      const flow = newFlow(typeof raw.name === "string" ? raw.name : file.name.replace(/\.json$/i, ""), doc, typeof raw.description === "string" ? raw.description : "");
      setFlows((list) => [flow, ...list]);
      setActiveId(flow.id);
      setFilter("active");
    } catch {
      window.alert("That file isn't a flow export (JSON).");
    }
  };

  return (
    <main className="page flows-page">
      <div className="welcome">
        <div><p className="eyebrow red">RACE STRATEGY BOARD</p><h1>Flows.</h1><p>Sketch processes, decisions and systems on an open canvas. Everything saves as you go.</p></div>
      </div>
      <div className="flows-layout">
        <Library
          flows={flows} activeId={active?.id ?? ""} filter={filter} setFilter={setFilter}
          onOpen={(id) => setActiveId(id)} onCreate={create} onDuplicate={duplicate} onImport={importFile}
          onArchive={(f) => update(f.id, { status: f.status === "archived" ? "active" : "archived" })} onDelete={remove}
        />
        {active ? (
          <Editor
            key={active.id} flow={active} fullscreen={fullscreen} setFullscreen={setFullscreen}
            onSave={(patch) => update(active.id, patch)}
            onRestore={() => update(active.id, { status: "active" })}
          />
        ) : (
          <EmptyState onCreate={create}/>
        )}
      </div>
    </main>
  );
}

function EmptyState({ onCreate }: { onCreate: (template: string) => void }) {
  return (
    <section className="flow-empty">
      <div className="flow-empty-art" aria-hidden="true">
        <span className="a"/><i/><span className="b"/><i/><span className="c"/>
      </div>
      <h2>Map your first flow</h2>
      <p>Pick a starting point. You can change everything afterwards.</p>
      <div className="template-grid">
        {TEMPLATES.map((t) => (
          <button key={t.id} onClick={() => onCreate(t.id)}><strong>{t.name}</strong><span>{t.blurb}</span></button>
        ))}
      </div>
    </section>
  );
}

// ---------- Library ----------

function ago(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(s) || s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Library({ flows, activeId, filter, setFilter, onOpen, onCreate, onDuplicate, onArchive, onDelete, onImport }: {
  flows: Flow[]; activeId: string; filter: "active" | "archived"; setFilter: (f: "active" | "archived") => void;
  onOpen: (id: string) => void; onCreate: (template: string) => void; onDuplicate: (f: Flow) => void; onArchive: (f: Flow) => void; onDelete: (id: string) => void; onImport: (file: File) => void;
}) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const counts = { active: flows.filter((f) => f.status !== "archived").length, archived: flows.filter((f) => f.status === "archived").length };
  const shown = flows
    .filter((f) => (filter === "archived" ? f.status === "archived" : f.status !== "archived"))
    .filter((f) => !query.trim() || `${f.name} ${f.description}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <aside className="flow-library">
      <div className="flow-library-head">
        <div><p className="eyebrow">LIBRARY</p><h2>Your flows</h2></div>
        <div className="new-flow">
          <button className="primary-button" onClick={() => setMenu((m) => !m)} aria-expanded={menu}><Icon name="plus" size={15}/>New</button>
          {menu && (
            <div className="new-flow-menu" onMouseLeave={() => setMenu(false)}>
              {TEMPLATES.map((t) => (
                <button key={t.id} onClick={() => { onCreate(t.id); setMenu(false); }}><strong>{t.name}</strong><span>{t.blurb}</span></button>
              ))}
              <button onClick={() => { fileRef.current?.click(); setMenu(false); }}><strong>Import JSON…</strong><span>A flow exported from here.</span></button>
            </div>
          )}
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ""; }}/>
        </div>
      </div>
      <input className="flow-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search flows" aria-label="Search flows"/>
      <div className="flow-filter" role="tablist">
        <button role="tab" aria-selected={filter === "active"} className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Active <b>{counts.active}</b></button>
        <button role="tab" aria-selected={filter === "archived"} className={filter === "archived" ? "active" : ""} onClick={() => setFilter("archived")}>Archived <b>{counts.archived}</b></button>
      </div>
      <ul className="flow-list">
        {shown.map((f) => (
          <li key={f.id} className={f.id === activeId ? "current" : ""}>
            <button className="flow-item" onClick={() => onOpen(f.id)}>
              <FlowThumb flow={f}/>
              <span className="flow-item-text">
                <strong>{f.name || "Untitled flow"}</strong>
                <small>{f.nodes.length} shape{f.nodes.length === 1 ? "" : "s"} · {ago(f.updatedAt)}</small>
              </span>
            </button>
            {confirm === f.id ? (
              <div className="flow-confirm">
                <span>Delete for good?</span>
                <button className="danger" onClick={() => { onDelete(f.id); setConfirm(""); }}>Delete</button>
                <button onClick={() => setConfirm("")}>Keep</button>
              </div>
            ) : (
              <div className="flow-item-actions">
                <button onClick={() => onDuplicate(f)} title="Duplicate" aria-label={`Duplicate ${f.name}`}><Glyph name="copy"/></button>
                <button onClick={() => onArchive(f)} title={f.status === "archived" ? "Restore" : "Archive"} aria-label={`${f.status === "archived" ? "Restore" : "Archive"} ${f.name}`}><Glyph name={f.status === "archived" ? "restore" : "archive"}/></button>
                <button onClick={() => setConfirm(f.id)} title="Delete" aria-label={`Delete ${f.name}`}><Icon name="trash" size={15}/></button>
              </div>
            )}
          </li>
        ))}
        {shown.length === 0 && (
          <li className="flow-list-empty">{query ? "No flows match." : filter === "archived" ? "Nothing archived. Archive a flow to tuck it away without deleting it." : "No flows yet. Press New to start one."}</li>
        )}
      </ul>
    </aside>
  );
}

function FlowThumb({ flow }: { flow: Flow }) {
  const b = boundsOf(flow.nodes);
  if (!b) return <span className="flow-thumb empty"/>;
  const pad = 20;
  return (
    <svg className="flow-thumb" viewBox={`${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      {flow.nodes.filter((n) => n.kind !== "text").map((n) =>
        n.kind === "frame" ? <rect key={n.id} x={n.x} y={n.y} width={n.w} height={n.h} fill="none" stroke="#3a3d44" strokeWidth={Math.max(b.w, b.h) / 90}/>
          : n.kind === "circle" ? <ellipse key={n.id} cx={n.x + n.w / 2} cy={n.y + n.h / 2} rx={n.w / 2} ry={n.h / 2} fill={COLORS[n.color].fill}/>
          : n.kind === "diamond" ? <polygon key={n.id} points={`${n.x + n.w / 2},${n.y} ${n.x + n.w},${n.y + n.h / 2} ${n.x + n.w / 2},${n.y + n.h} ${n.x},${n.y + n.h / 2}`} fill={COLORS[n.color].fill}/>
          : <rect key={n.id} x={n.x} y={n.y} width={n.w} height={n.h} rx={n.kind === "pill" ? n.h / 2 : 4} fill={COLORS[n.color].fill}/>)}
    </svg>
  );
}

// ---------- Small icons used only here ----------

const glyphs: Record<string, ReactNode> = {
  cursor: <path d="M5 3l14 8-6 1.5L10 19Z"/>,
  hand: <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.6 0-4-1.3-5.6-3.6L4 13.6a1.5 1.5 0 0 1 2.4-1.8L8 14"/>,
  rect: <rect x="4" y="6" width="16" height="12" rx="1"/>,
  rounded: <rect x="3" y="6" width="18" height="12" rx="4"/>,
  circle: <circle cx="12" cy="12" r="8"/>,
  diamond: <path d="M12 3l9 9-9 9-9-9Z"/>,
  pill: <rect x="2" y="7" width="20" height="10" rx="5"/>,
  slant: <path d="M7 6h14l-4 12H3Z"/>,
  sticky: <><path d="M4 4h16v11l-5 5H4Z"/><path d="M15 20v-5h5"/></>,
  text: <><path d="M5 6V4h14v2"/><path d="M12 4v16M9 20h6"/></>,
  frame: <><path d="M7 3v18M17 3v18M3 7h18M3 17h18"/></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></>,
  archive: <><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/></>,
  restore: <><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></>,
  redo: <><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>,
  fit: <><path d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4"/><rect x="8" y="9" width="8" height="6" rx="1"/></>,
  minus: <path d="M5 12h14"/>,
  magnet: <><path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 7h4M14 7h4"/></>,
  front: <><rect x="8" y="8" width="12" height="12" rx="1" fill="currentColor"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/></>,
  back: <><rect x="4" y="4" width="12" height="12" rx="1"/><path d="M20 8v11a1 1 0 0 1-1 1H8" /></>,
  elbow: <path d="M4 6h8v12h8"/>,
  straight: <path d="M4 19 20 5"/>,
  curved: <path d="M4 18C4 8 20 16 20 6"/>,
  dashed: <path d="M3 12h3M10 12h4M18 12h3"/>,
  swap: <><path d="M4 8h14l-3-3M20 16H6l3 3"/></>,
  label: <><path d="M4 7h16v10H4Z"/><path d="M8 12h8"/></>,
  alignL: <><path d="M4 3v18"/><rect x="7" y="6" width="10" height="4"/><rect x="7" y="14" width="6" height="4"/></>,
  alignC: <><path d="M12 3v18"/><rect x="6" y="6" width="12" height="4"/><rect x="8" y="14" width="8" height="4"/></>,
  alignR: <><path d="M20 3v18"/><rect x="7" y="6" width="10" height="4"/><rect x="11" y="14" width="6" height="4"/></>,
  alignT: <><path d="M3 4h18"/><rect x="6" y="7" width="4" height="10"/><rect x="14" y="7" width="4" height="6"/></>,
  alignM: <><path d="M3 12h18"/><rect x="6" y="6" width="4" height="12"/><rect x="14" y="8" width="4" height="8"/></>,
  alignB: <><path d="M3 20h18"/><rect x="6" y="7" width="4" height="10"/><rect x="14" y="11" width="4" height="6"/></>,
  distH: <><path d="M4 4v16M20 4v16"/><rect x="10" y="8" width="4" height="8"/></>,
  distV: <><path d="M4 4h16M4 20h16"/><rect x="8" y="10" width="8" height="4"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01"/></>,
};

function Glyph({ name, size = 17 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{glyphs[name]}</svg>
  );
}

// ---------- Editor ----------

type Tool = "select" | "hand" | NodeKind;
type Selection = { nodes: string[]; edges: string[] };
type Corner = "nw" | "ne" | "sw" | "se";
type Drag =
  | { type: "pan"; sx: number; sy: number; view: View }
  | { type: "move"; ids: string[]; lead: string; start: Pt; orig: Map<string, Pt>; moved: boolean; clickedSelected: boolean }
  | { type: "resize"; id: string; corner: Corner; start: Pt; orig: Box; moved: boolean }
  | { type: "connect"; from: string; side: Side; start: Pt }
  | { type: "marquee"; start: Pt; base: Selection }
  | { type: "create"; kind: NodeKind; start: Pt };
type Ghost =
  | { type: "connect"; from: string; side: Side; to: Pt; target: string | null }
  | { type: "rect"; box: Box; kind?: NodeKind };

const FONT: Record<TextSize, number> = { s: 12, m: 15, l: 20, xl: 28 };
const SELECT = "#5b9dff";
const EDGE = "#b9bbc1";
const GRID = 10;
const HISTORY_LIMIT = 120;
const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
let clipboard: FlowDoc | null = null;

const clampZoom = (z: number) => Math.min(3, Math.max(0.15, z));

function textStyle(node: FlowNode): CSSProperties {
  const size = FONT[node.size ?? (node.kind === "frame" ? "m" : node.kind === "sticky" ? "s" : "m")];
  const c = COLORS[node.color];
  const ink = node.kind === "text" ? c.fill : node.kind === "frame" ? (node.color === "slate" ? "#d6d7d9" : c.fill) : c.ink;
  const left = node.kind === "text" || node.kind === "sticky" || node.kind === "frame";
  return {
    width: "100%", height: "100%", boxSizing: "border-box", display: "flex",
    alignItems: node.kind === "sticky" ? "flex-start" : node.kind === "frame" ? "flex-end" : "center",
    justifyContent: left ? "flex-start" : "center", textAlign: left ? "left" : "center",
    padding: node.kind === "frame" ? "0 2px 6px" : node.kind === "sticky" ? "14px 14px" : node.kind === "text" ? "4px 2px" : "8px 12px",
    color: ink, fontFamily: "'Play', sans-serif", fontSize: size, lineHeight: 1.25, fontWeight: node.kind === "frame" || size >= 20 ? 700 : 600,
    whiteSpace: "pre-wrap", overflowWrap: "anywhere", overflow: "hidden", letterSpacing: node.kind === "frame" ? ".02em" : undefined,
  };
}

// Where a node's text sits: diamonds keep it inside the shape, frames put it above as a title.
function textBox(n: FlowNode): Box {
  if (n.kind === "diamond") return { x: n.x + n.w * 0.18, y: n.y + n.h * 0.2, w: n.w * 0.64, h: n.h * 0.6 };
  if (n.kind === "slant") return { x: n.x + 16, y: n.y, w: n.w - 32, h: n.h };
  if (n.kind === "frame") return { x: n.x, y: n.y - 34, w: n.w, h: 34 };
  return n;
}

function Shape({ n, readOnly }: { n: FlowNode; readOnly: boolean }) {
  const c = COLORS[n.color];
  const { x, y, w, h } = n;
  switch (n.kind) {
    case "circle": return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={c.fill}/>;
    case "diamond": return <polygon points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`} fill={c.fill} strokeLinejoin="round"/>;
    case "slant": return <polygon points={`${x + 18},${y} ${x + w},${y} ${x + w - 18},${y + h} ${x},${y + h}`} fill={c.fill}/>;
    case "pill": return <rect x={x} y={y} width={w} height={h} rx={Math.min(h, w) / 2} fill={c.fill}/>;
    case "rounded": return <rect x={x} y={y} width={w} height={h} rx={14} fill={c.fill}/>;
    case "sticky": {
      const f = Math.min(22, w / 5, h / 5);
      return (
        <g filter="url(#flow-shadow)">
          <path d={`M${x},${y} H${x + w} V${y + h - f} L${x + w - f},${y + h} H${x} Z`} fill={c.fill}/>
          <path d={`M${x + w},${y + h - f} L${x + w - f},${y + h - f} L${x + w - f},${y + h} Z`} fill="rgba(0,0,0,.22)"/>
        </g>
      );
    }
    case "text": return <rect x={x} y={y} width={w} height={h} fill="transparent"/>;
    case "frame": return (
      <g>
        <rect x={x} y={y} width={w} height={h} rx={10} fill={n.color === "slate" ? "rgba(255,255,255,.025)" : `${c.fill}12`} stroke={n.color === "slate" ? "#3a3d44" : `${c.fill}88`} strokeWidth={1.5} pointerEvents="none"/>
        {!readOnly && <rect x={x} y={y} width={w} height={h} rx={10} fill="none" stroke="transparent" strokeWidth={14} pointerEvents="stroke"/>}
      </g>
    );
    default: return <rect x={x} y={y} width={w} height={h} rx={4} fill={c.fill}/>;
  }
}

function Editor({ flow, onSave, onRestore, fullscreen, setFullscreen }: {
  flow: Flow; onSave: (patch: Partial<Flow>) => void; onRestore: () => void; fullscreen: boolean; setFullscreen: (v: boolean) => void;
}) {
  const readOnly = flow.status === "archived";
  const [views, setViews] = useFlowViews();
  const [doc, setDocState] = useState<FlowDoc>(() => ({ nodes: flow.nodes, edges: flow.edges }));
  const [view, setViewState] = useState<View>(() => views[flow.id] ?? { x: 80, y: 80, zoom: 1 });
  const [sel, setSel] = useState<Selection>({ nodes: [], edges: [] });
  const [tool, setTool] = useState<Tool>("select");
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [editing, setEditing] = useState<{ type: "node" | "edge"; id: string } | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [snapOn, setSnapOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [panning, setPanning] = useState(false);
  const [help, setHelp] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [, setHistoryTick] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const docRef = useRef(doc);
  const viewRef = useRef(view);
  const selRef = useRef(sel);
  docRef.current = doc;
  viewRef.current = view;
  selRef.current = sel;
  const drag = useRef<Drag | null>(null);
  const past = useRef<FlowDoc[]>([]);
  const future = useRef<FlowDoc[]>([]);
  const pending = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);
  const lastWritten = useRef(serializeDoc({ nodes: flow.nodes, edges: flow.edges }));
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const byId = useMemo(() => new Map(doc.nodes.map((n) => [n.id, n])), [doc.nodes]);

  // ----- saving & history -----
  const flush = () => {
    window.clearTimeout(saveTimer.current);
    if (!pending.current) return;
    pending.current = false;
    const d = docRef.current;
    lastWritten.current = serializeDoc(d);
    onSaveRef.current({ nodes: d.nodes, edges: d.edges });
    setSaving(false);
  };
  const setDoc = (next: FlowDoc) => {
    docRef.current = next;
    setDocState(next);
    pending.current = true;
    setSaving(true);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flush, 450);
  };
  const checkpoint = () => {
    past.current = [...past.current.slice(-HISTORY_LIMIT), docRef.current];
    future.current = [];
    setHistoryTick((t) => t + 1);
  };
  const commit = (next: FlowDoc) => {
    if (readOnly) return;
    checkpoint();
    setDoc(next);
  };
  const undo = () => {
    const prev = past.current.pop();
    if (!prev || readOnly) return;
    future.current.push(docRef.current);
    setDoc(prev);
    setSel({ nodes: [], edges: [] });
    setHistoryTick((t) => t + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next || readOnly) return;
    past.current.push(docRef.current);
    setDoc(next);
    setHistoryTick((t) => t + 1);
  };
  useEffect(() => () => flush(), []);

  // Changes that arrive from elsewhere (Drive sync, another tab) replace the canvas when nothing is unsaved here.
  useEffect(() => {
    if (pending.current || drag.current) return;
    const incoming = serializeDoc({ nodes: flow.nodes, edges: flow.edges });
    if (incoming !== lastWritten.current) {
      lastWritten.current = incoming;
      docRef.current = { nodes: flow.nodes, edges: flow.edges };
      setDocState(docRef.current);
    }
  }, [flow.nodes, flow.edges]);

  // ----- view -----
  const setView = (next: View) => {
    viewRef.current = next;
    setViewState(next);
  };
  useEffect(() => {
    const t = window.setTimeout(() => setViews((all) => ({ ...all, [flow.id]: view })), 600);
    return () => window.clearTimeout(t);
  }, [view, flow.id, setViews]);

  const fit = () => {
    const el = wrapRef.current;
    const b = boundsOf(docRef.current.nodes.map((n) => (n.kind === "frame" ? { ...n, y: n.y - 34, h: n.h + 34 } : n)));
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (!b) return setView({ x: width / 2, y: height / 2, zoom: 1 });
    const zoom = clampZoom(Math.min((width - 160) / b.w, (height - 140) / b.h, 1.25));
    setView({ zoom, x: width / 2 - (b.x + b.w / 2) * zoom, y: height / 2 - (b.y + b.h / 2) * zoom + 10 });
  };
  useLayoutEffect(() => {
    if (!views[flow.id]) fit();
  }, []);
  useEffect(() => {
    const t = window.setTimeout(fit, 60);
    return () => window.clearTimeout(t);
  }, [fullscreen]);

  const zoomAt = (factor: number, sx?: number, sy?: number) => {
    const el = wrapRef.current!;
    const r = el.getBoundingClientRect();
    const px = sx ?? r.width / 2, py = sy ?? r.height / 2;
    const v = viewRef.current;
    const zoom = clampZoom(v.zoom * factor);
    const wx = (px - v.x) / v.zoom, wy = (py - v.y) / v.zoom;
    setView({ zoom, x: px - wx * zoom, y: py - wy * zoom });
  };

  // Wheel: pinch / ctrl+wheel zooms around the cursor, plain wheel pans (as in Figma).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)), e.clientX - r.left, e.clientY - r.top);
      else {
        const v = viewRef.current;
        const k = e.deltaMode ? 30 : 1;
        setView({ ...v, x: v.x - (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k, y: v.y - (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k });
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const toWorld = (clientX: number, clientY: number): Pt => {
    const r = wrapRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  };
  const snap = (value: number, free = false) => (snapOn && !free ? Math.round(value / GRID) * GRID : value);

  // ----- doc operations -----
  const addNode = (kind: NodeKind, box: Box, extra: Partial<FlowNode> = {}) => {
    const info = kindInfo(kind);
    const node: FlowNode = { id: uid(), kind, x: snap(box.x), y: snap(box.y), w: Math.max(20, snap(box.w)), h: Math.max(20, snap(box.h)), text: "", color: info.color, ...extra };
    // New frames go to the back so they hold what is already on the canvas.
    const nodes = kind === "frame" ? [node, ...docRef.current.nodes] : [...docRef.current.nodes, node];
    commit({ ...docRef.current, nodes });
    return node;
  };
  const deleteSelection = () => {
    const s = selRef.current;
    if (!s.nodes.length && !s.edges.length) return;
    const gone = new Set(s.nodes);
    commit({
      nodes: docRef.current.nodes.filter((n) => !gone.has(n.id)),
      edges: docRef.current.edges.filter((e) => !s.edges.includes(e.id) && !gone.has(e.from) && !gone.has(e.to)),
    });
    setSel({ nodes: [], edges: [] });
  };
  const selectedDoc = (): FlowDoc => {
    const ids = new Set(selRef.current.nodes);
    return { nodes: docRef.current.nodes.filter((n) => ids.has(n.id)), edges: docRef.current.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
  };
  const paste = (source: FlowDoc, offset = 24) => {
    if (!source.nodes.length) return;
    const map = new Map(source.nodes.map((n) => [n.id, uid()]));
    const nodes = source.nodes.map((n) => ({ ...n, id: map.get(n.id)!, x: n.x + offset, y: n.y + offset }));
    const edges = source.edges.map((e) => ({ ...e, id: uid(), from: map.get(e.from)!, to: map.get(e.to)! }));
    commit({ nodes: [...docRef.current.nodes, ...nodes], edges: [...docRef.current.edges, ...edges] });
    setSel({ nodes: nodes.map((n) => n.id), edges: edges.map((e) => e.id) });
  };
  const patchNodes = (ids: string[], patch: Partial<FlowNode> | ((n: FlowNode) => Partial<FlowNode>)) => {
    const set = new Set(ids);
    commit({ ...docRef.current, nodes: docRef.current.nodes.map((n) => (set.has(n.id) ? { ...n, ...(typeof patch === "function" ? patch(n) : patch) } : n)) });
  };
  const patchEdges = (ids: string[], patch: Partial<FlowEdge> | ((e: FlowEdge) => Partial<FlowEdge>)) => {
    const set = new Set(ids);
    commit({ ...docRef.current, edges: docRef.current.edges.map((e) => (set.has(e.id) ? { ...e, ...(typeof patch === "function" ? patch(e) : patch) } : e)) });
  };
  const reorder = (front: boolean) => {
    const ids = new Set(selRef.current.nodes);
    const picked = docRef.current.nodes.filter((n) => ids.has(n.id));
    const rest = docRef.current.nodes.filter((n) => !ids.has(n.id));
    commit({ ...docRef.current, nodes: front ? [...rest, ...picked] : [...picked, ...rest] });
  };
  const align = (how: "l" | "c" | "r" | "t" | "m" | "b" | "dh" | "dv") => {
    const nodes = docRef.current.nodes.filter((n) => selRef.current.nodes.includes(n.id));
    const b = boundsOf(nodes);
    if (!b || nodes.length < 2) return;
    const pos = new Map<string, Partial<FlowNode>>();
    if (how === "dh" || how === "dv") {
      const horiz = how === "dh";
      const sorted = [...nodes].sort((a, c) => (horiz ? a.x - c.x : a.y - c.y));
      const total = sorted.reduce((s, n) => s + (horiz ? n.w : n.h), 0);
      const gap = ((horiz ? b.w : b.h) - total) / (sorted.length - 1);
      let at = horiz ? b.x : b.y;
      for (const n of sorted) {
        pos.set(n.id, horiz ? { x: at } : { y: at });
        at += (horiz ? n.w : n.h) + gap;
      }
    } else {
      for (const n of nodes) {
        pos.set(n.id, how === "l" ? { x: b.x } : how === "c" ? { x: b.x + b.w / 2 - n.w / 2 } : how === "r" ? { x: b.x + b.w - n.w } : how === "t" ? { y: b.y } : how === "m" ? { y: b.y + b.h / 2 - n.h / 2 } : { y: b.y + b.h - n.h });
      }
    }
    patchNodes(nodes.map((n) => n.id), (n) => pos.get(n.id) ?? {});
  };

  // ----- pointer handling -----
  const nodeAt = (clientX: number, clientY: number, exclude?: string) => {
    const el = document.elementFromPoint(clientX, clientY)?.closest("[data-node]");
    const id = el?.getAttribute("data-node");
    const node = id ? byId.get(id) : undefined;
    return node && node.id !== exclude && node.kind !== "frame" ? node : null;
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (editing) (document.activeElement as HTMLElement | null)?.blur();
    const target = e.target as Element;
    const p = toWorld(e.clientX, e.clientY);
    setExportMenu(false);
    svgRef.current?.setPointerCapture(e.pointerId);
    if (e.button === 1 || tool === "hand" || spaceDown || (readOnly && e.button === 0 && !target.closest("[data-node],[data-edge]"))) {
      drag.current = { type: "pan", sx: e.clientX, sy: e.clientY, view: viewRef.current };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    const port = target.closest("[data-port]");
    if (port && !readOnly) {
      const from = port.getAttribute("data-owner")!, side = port.getAttribute("data-port") as Side;
      drag.current = { type: "connect", from, side, start: p };
      setGhost({ type: "connect", from, side, to: p, target: null });
      return;
    }
    const handle = target.closest("[data-handle]");
    if (handle && !readOnly) {
      const id = handle.getAttribute("data-owner")!;
      const n = byId.get(id);
      if (n) drag.current = { type: "resize", id, corner: handle.getAttribute("data-handle") as Corner, start: p, orig: { x: n.x, y: n.y, w: n.w, h: n.h }, moved: false };
      return;
    }
    if (tool !== "select" && !readOnly) {
      drag.current = { type: "create", kind: tool, start: p };
      setGhost({ type: "rect", box: { x: p.x, y: p.y, w: 0, h: 0 }, kind: tool });
      return;
    }
    const nodeEl = target.closest("[data-node]");
    const edgeEl = target.closest("[data-edge]");
    if (nodeEl) {
      const id = nodeEl.getAttribute("data-node")!;
      const already = sel.nodes.includes(id);
      let next: Selection;
      if (e.shiftKey) next = already ? { ...sel, nodes: sel.nodes.filter((x) => x !== id) } : { ...sel, nodes: [...sel.nodes, id] };
      else next = already ? sel : { nodes: [id], edges: [] };
      setSel(next);
      if (readOnly || (e.shiftKey && already)) return;
      // Moving a section also moves everything sitting inside it.
      const ids = new Set(next.nodes);
      for (const n of docRef.current.nodes) if (n.kind === "frame" && ids.has(n.id)) for (const m of docRef.current.nodes) if (m.id !== n.id && contains(n, m)) ids.add(m.id);
      drag.current = { type: "move", ids: [...ids], lead: id, start: p, orig: new Map(docRef.current.nodes.filter((n) => ids.has(n.id)).map((n) => [n.id, { x: n.x, y: n.y }])), moved: false, clickedSelected: already && !e.shiftKey };
      return;
    }
    if (edgeEl) {
      const id = edgeEl.getAttribute("data-edge")!;
      setSel(e.shiftKey ? { ...sel, edges: sel.edges.includes(id) ? sel.edges.filter((x) => x !== id) : [...sel.edges, id] } : { nodes: [], edges: [id] });
      return;
    }
    const base = e.shiftKey ? sel : { nodes: [], edges: [] };
    setSel(base);
    drag.current = { type: "marquee", start: p, base };
    setGhost({ type: "rect", box: { x: p.x, y: p.y, w: 0, h: 0 } });
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = toWorld(e.clientX, e.clientY);
    const free = e.altKey;
    if (d.type === "pan") {
      setView({ ...d.view, x: d.view.x + e.clientX - d.sx, y: d.view.y + e.clientY - d.sy });
    } else if (d.type === "move") {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (!d.moved) {
        if (Math.hypot(dx, dy) * viewRef.current.zoom < 3) return;
        d.moved = true;
        checkpoint();
      }
      const lead = d.orig.get(d.lead)!;
      const sx = snap(lead.x + dx, free) - lead.x, sy = snap(lead.y + dy, free) - lead.y;
      setDoc({ ...docRef.current, nodes: docRef.current.nodes.map((n) => { const o = d.orig.get(n.id); return o ? { ...n, x: o.x + sx, y: o.y + sy } : n; }) });
    } else if (d.type === "resize") {
      if (!d.moved) {
        d.moved = true;
        checkpoint();
      }
      const o = d.orig;
      let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
      if (d.corner.includes("w")) x1 = Math.min(snap(p.x, free), x2 - 20); else x2 = Math.max(snap(p.x, free), x1 + 20);
      if (d.corner.includes("n")) y1 = Math.min(snap(p.y, free), y2 - 20); else y2 = Math.max(snap(p.y, free), y1 + 20);
      if (e.shiftKey) {
        const ratio = o.w / o.h;
        const w = x2 - x1, h = y2 - y1;
        if (w / h > ratio) { const nh = w / ratio; if (d.corner.includes("n")) y1 = y2 - nh; else y2 = y1 + nh; }
        else { const nw = h * ratio; if (d.corner.includes("w")) x1 = x2 - nw; else x2 = x1 + nw; }
      }
      setDoc({ ...docRef.current, nodes: docRef.current.nodes.map((n) => (n.id === d.id ? { ...n, x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : n)) });
    } else if (d.type === "connect") {
      setGhost({ type: "connect", from: d.from, side: d.side, to: p, target: nodeAt(e.clientX, e.clientY, d.from)?.id ?? null });
    } else if (d.type === "marquee" || d.type === "create") {
      const box = { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.abs(p.x - d.start.x), h: Math.abs(p.y - d.start.y) };
      setGhost({ type: "rect", box, kind: d.type === "create" ? d.kind : undefined });
      if (d.type === "marquee") {
        const hit = docRef.current.nodes.filter((n) => (n.kind === "frame" ? contains(box, n) : intersects(box, n))).map((n) => n.id);
        const ids = new Set([...d.base.nodes, ...hit]);
        setSel({ nodes: [...ids], edges: [...new Set([...d.base.edges, ...docRef.current.edges.filter((ed) => ids.has(ed.from) && ids.has(ed.to)).map((ed) => ed.id)])] });
      }
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    drag.current = null;
    setPanning(false);
    setGhost(null);
    if (!d) return;
    const p = toWorld(e.clientX, e.clientY);
    if (d.type === "move" && !d.moved && d.clickedSelected) setSel({ nodes: [d.lead], edges: [] });
    if (d.type === "create") {
      const info = kindInfo(d.kind);
      const w = Math.abs(p.x - d.start.x), h = Math.abs(p.y - d.start.y);
      const box = w * viewRef.current.zoom < 8 && h * viewRef.current.zoom < 8
        ? { x: d.start.x - info.w / 2, y: d.start.y - info.h / 2, w: info.w, h: info.h }
        : { x: Math.min(d.start.x, p.x), y: Math.min(d.start.y, p.y), w: Math.max(w, 20), h: Math.max(h, 20) };
      const node = addNode(d.kind, box);
      setSel({ nodes: [node.id], edges: [] });
      setTool("select");
      setEditing({ type: "node", id: node.id });
    }
    if (d.type === "connect") {
      const target = nodeAt(e.clientX, e.clientY, d.from);
      const source = byId.get(d.from);
      if (!source) return;
      if (target) {
        const edge: FlowEdge = { id: uid(), from: d.from, to: target.id, fromSide: d.side, toSide: sideToward(target, p), label: "", style: "elbow" };
        commit({ ...docRef.current, edges: [...docRef.current.edges, edge] });
        setSel({ nodes: [], edges: [edge.id] });
      } else if (Math.hypot(p.x - d.start.x, p.y - d.start.y) * viewRef.current.zoom > 40) {
        // Dropped on empty canvas: make a matching shape there, already connected.
        const kind: NodeKind = source.kind === "text" || source.kind === "frame" || source.kind === "sticky" ? "rounded" : source.kind;
        const w = source.kind === kind ? source.w : kindInfo(kind).w, h = source.kind === kind ? source.h : kindInfo(kind).h;
        const toSide = OPPOSITE[d.side];
        const x = toSide === "left" ? p.x : toSide === "right" ? p.x - w : p.x - w / 2;
        const y = toSide === "top" ? p.y : toSide === "bottom" ? p.y - h : p.y - h / 2;
        const node: FlowNode = { id: uid(), kind, x: snap(x), y: snap(y), w, h, text: "", color: source.kind === kind ? source.color : kindInfo(kind).color };
        const edge: FlowEdge = { id: uid(), from: d.from, to: node.id, fromSide: d.side, toSide, label: "", style: "elbow" };
        commit({ nodes: [...docRef.current.nodes, node], edges: [...docRef.current.edges, edge] });
        setSel({ nodes: [node.id], edges: [] });
        setEditing({ type: "node", id: node.id });
      }
    }
  };

  const onDoubleClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (readOnly) return;
    const target = e.target as Element;
    const nodeEl = target.closest("[data-node]");
    const edgeEl = target.closest("[data-edge]");
    if (nodeEl) setEditing({ type: "node", id: nodeEl.getAttribute("data-node")! });
    else if (edgeEl) setEditing({ type: "edge", id: edgeEl.getAttribute("data-edge")! });
    else {
      const p = toWorld(e.clientX, e.clientY);
      const node = addNode("text", { x: p.x - 10, y: p.y - 20, w: 200, h: 40 });
      setSel({ nodes: [node.id], edges: [] });
      setEditing({ type: "node", id: node.id });
    }
  };

  // ----- keyboard -----
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keyHandler.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();
    if (e.key === " ") { e.preventDefault(); setSpaceDown(true); return; }
    if (mod && k === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === "y") { e.preventDefault(); redo(); return; }
    if (mod && k === "a") { e.preventDefault(); setSel({ nodes: docRef.current.nodes.map((n) => n.id), edges: docRef.current.edges.map((x) => x.id) }); return; }
    if (mod && k === "c") { if (sel.nodes.length) { clipboard = selectedDoc(); e.preventDefault(); } return; }
    if (mod && k === "x") { if (sel.nodes.length && !readOnly) { clipboard = selectedDoc(); deleteSelection(); e.preventDefault(); } return; }
    if (mod && k === "v") { if (clipboard && !readOnly) { e.preventDefault(); paste(clipboard); } return; }
    if (mod && k === "d") { e.preventDefault(); if (!readOnly) paste(selectedDoc()); return; }
    if (mod) return;
    if (e.key === "Escape") {
      if (sel.nodes.length || sel.edges.length) setSel({ nodes: [], edges: [] });
      else if (tool !== "select") setTool("select");
      else if (fullscreen) setFullscreen(false);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && !readOnly) { e.preventDefault(); deleteSelection(); return; }
    if (e.key === "Enter" && sel.nodes.length === 1 && !readOnly) { e.preventDefault(); setEditing({ type: "node", id: sel.nodes[0] }); return; }
    if (e.key.startsWith("Arrow") && sel.nodes.length && !readOnly) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0, dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      patchNodes(sel.nodes, (n) => ({ x: n.x + dx, y: n.y + dy }));
      return;
    }
    if (e.shiftKey && e.code === "Digit1") { fit(); return; }
    if (e.shiftKey && e.code === "Digit0") { zoomAt(1 / viewRef.current.zoom); return; }
    if (e.key === "+" || e.key === "=") { zoomAt(1.2); return; }
    if (e.key === "-" || e.key === "_") { zoomAt(1 / 1.2); return; }
    if (k === "v") setTool("select");
    else if (k === "h") setTool("hand");
    else if (!readOnly) {
      const kind = KINDS.find((x) => x.key === k);
      if (kind) setTool(kind.kind);
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => keyHandler.current(e);
    const up = (e: KeyboardEvent) => { if (e.key === " ") setSpaceDown(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  // ----- export -----
  const download = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const fileBase = (flow.name || "flow").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "flow";
  const buildSvg = () => {
    const svg = svgRef.current!;
    const b = boundsOf(docRef.current.nodes.map((n) => (n.kind === "frame" ? { ...n, y: n.y - 34, h: n.h + 34 } : n)));
    if (!b) return null;
    const pad = 40;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll(".flow-ui").forEach((el) => el.remove());
    const world = clone.querySelector(".flow-world");
    world?.removeAttribute("transform");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("viewBox", `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`);
    clone.setAttribute("width", String(Math.round(b.w + pad * 2)));
    clone.setAttribute("height", String(Math.round(b.h + pad * 2)));
    clone.removeAttribute("class");
    clone.removeAttribute("style");
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", String(b.x - pad)); bg.setAttribute("y", String(b.y - pad));
    bg.setAttribute("width", String(b.w + pad * 2)); bg.setAttribute("height", String(b.h + pad * 2)); bg.setAttribute("fill", "#0f1013");
    clone.insertBefore(bg, clone.firstChild?.nextSibling ?? null);
    return { text: new XMLSerializer().serializeToString(clone), w: b.w + pad * 2, h: b.h + pad * 2 };
  };
  const exportAs = async (kind: "svg" | "png" | "json") => {
    setExportMenu(false);
    if (kind === "json") {
      download(new Blob([JSON.stringify({ app: "kash-flows", v: 1, name: flow.name, description: flow.description, ...JSON.parse(serializeDoc(docRef.current)) }, null, 2)], { type: "application/json" }), `${fileBase}.json`);
      return;
    }
    const built = buildSvg();
    if (!built) return window.alert("Add a shape first.");
    if (kind === "svg") return download(new Blob([built.text], { type: "image/svg+xml" }), `${fileBase}.svg`);
    try {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(built.text)}`;
      await img.decode();
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(built.w * scale);
      canvas.height = Math.round(built.h * scale);
      const ctx = canvas.getContext("2d")!;
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, built.w, built.h);
      canvas.toBlob((blob) => (blob ? download(blob, `${fileBase}.png`) : window.alert("PNG export failed here; try SVG.")), "image/png");
    } catch {
      window.alert("This browser can't turn the canvas into a PNG; export SVG instead.");
    }
  };

  // ----- render helpers -----
  const z = view.zoom;
  const selNodes = doc.nodes.filter((n) => sel.nodes.includes(n.id));
  const selEdges = doc.edges.filter((e) => sel.edges.includes(e.id));
  const single = selNodes.length === 1 && !selEdges.length ? selNodes[0] : null;
  const frames = doc.nodes.filter((n) => n.kind === "frame");
  const shapes = doc.nodes.filter((n) => n.kind !== "frame");
  const showPorts = (id: string) => !readOnly && tool === "select" && !ghost && !editing && (hover === id || (single?.id === id));
  const connectTarget = ghost?.type === "connect" ? ghost.target : null;
  const cursor = panning ? "grabbing" : spaceDown || tool === "hand" ? "grab" : tool !== "select" ? "crosshair" : "default";

  const renderNode = (n: FlowNode) => {
    const tb = textBox(n);
    const isEditing = editing?.type === "node" && editing.id === n.id;
    return (
      <g key={n.id} data-node={n.id} className={`flow-node kind-${n.kind}`} onPointerEnter={() => setHover(n.id)} onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}>
        <Shape n={n} readOnly={readOnly}/>
        {!isEditing && (
          <foreignObject x={tb.x} y={tb.y} width={tb.w} height={tb.h} style={{ overflow: "visible" }}>
            <div style={{ ...textStyle(n), cursor: n.kind === "frame" ? "move" : undefined, pointerEvents: n.kind === "frame" && !readOnly ? "auto" : "none" }}>
              {n.text || (n.kind === "text" ? <span style={{ opacity: 0.35 }}>Text</span> : n.kind === "frame" ? <span style={{ opacity: 0.5 }}>Section</span> : "")}
            </div>
          </foreignObject>
        )}
        {isEditing && (
          <foreignObject x={tb.x} y={tb.y} width={tb.w} height={tb.h} className="flow-ui">
            <TextArea initial={n.text} style={textStyle(n)} onDone={(text) => {
              setEditing(null);
              if (text !== n.text) patchNodes([n.id], { text });
            }}/>
          </foreignObject>
        )}
        {connectTarget === n.id && <rect className="flow-ui" x={n.x - 4} y={n.y - 4} width={n.w + 8} height={n.h + 8} rx={8} fill="none" stroke={SELECT} strokeWidth={2 / z} strokeDasharray={`${6 / z} ${4 / z}`}/>}
        {showPorts(n.id) && n.kind !== "frame" && (["top", "right", "bottom", "left"] as Side[]).map((side) => {
          const a = anchor(n, side);
          const off = 16 / z;
          const pt = side === "top" ? { x: a.x, y: a.y - off } : side === "bottom" ? { x: a.x, y: a.y + off } : side === "left" ? { x: a.x - off, y: a.y } : { x: a.x + off, y: a.y };
          return (
            <g key={side} className="flow-ui flow-port" data-port={side} data-owner={n.id}>
              <circle cx={pt.x} cy={pt.y} r={11 / z} fill="transparent"/>
              <circle cx={pt.x} cy={pt.y} r={5.5 / z} fill="#0f1013" stroke={SELECT} strokeWidth={2 / z}/>
            </g>
          );
        })}
      </g>
    );
  };

  const renderEdge = (edge: FlowEdge) => {
    const g = edgeGeometry(edge, byId);
    if (!g) return null;
    const selected = sel.edges.includes(edge.id);
    const arrow = edge.arrow ?? "end";
    const marker = selected ? "url(#flow-arrow-sel)" : "url(#flow-arrow)";
    const isEditing = editing?.type === "edge" && editing.id === edge.id;
    return (
      <g key={edge.id} data-edge={edge.id} className="flow-edge">
        <path d={g.d} fill="none" stroke="transparent" strokeWidth={Math.max(14, 14 / z)}/>
        <path d={g.d} fill="none" stroke={selected ? SELECT : EDGE} strokeWidth={2} strokeDasharray={edge.dashed ? "7 6" : undefined}
          markerEnd={arrow !== "none" ? marker : undefined} markerStart={arrow === "both" ? marker : undefined}/>
        {(edge.label || isEditing) && (
          <foreignObject x={g.mid.x - 110} y={g.mid.y - 15} width={220} height={30} style={{ overflow: "visible" }}>
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              {isEditing ? (
                <LabelInput initial={edge.label} onDone={(label) => { setEditing(null); if (label !== edge.label) patchEdges([edge.id], { label }); }}/>
              ) : (
                <span style={{ pointerEvents: "auto", background: "#0f1013", color: selected ? SELECT : "#d6d7d9", padding: "2px 8px", borderRadius: 4, border: `1px solid ${selected ? SELECT : "#2c2e33"}`, fontFamily: "'Play', sans-serif", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{edge.label}</span>
              )}
            </div>
          </foreignObject>
        )}
      </g>
    );
  };

  const ghostEl = () => {
    if (!ghost) return null;
    if (ghost.type === "rect") {
      const b = ghost.box;
      return <rect className="flow-ui" x={b.x} y={b.y} width={b.w} height={b.h} rx={ghost.kind === "circle" ? Math.min(b.w, b.h) / 2 : 3} fill={ghost.kind ? "rgba(91,157,255,.08)" : "rgba(91,157,255,.08)"} stroke={SELECT} strokeWidth={1 / z} strokeDasharray={ghost.kind ? undefined : `${4 / z} ${3 / z}`}/>;
    }
    const from = byId.get(ghost.from);
    if (!from) return null;
    const target = ghost.target ? byId.get(ghost.target) : undefined;
    const p1 = anchor(from, ghost.side);
    const s2 = target ? sideToward(target, ghost.to) : OPPOSITE[ghost.side];
    const p2 = target ? anchor(target, s2) : ghost.to;
    return <path className="flow-ui" d={routePath("elbow", p1, ghost.side, p2, s2).d} fill="none" stroke={SELECT} strokeWidth={2} strokeDasharray="6 5" markerEnd="url(#flow-arrow-sel)"/>;
  };

  const selectionChrome = () => {
    if (!selNodes.length || editing) return null;
    return (
      <g className="flow-ui" pointerEvents="none">
        {selNodes.map((n) => <rect key={n.id} x={n.x - 3 / z} y={n.y - 3 / z} width={n.w + 6 / z} height={n.h + 6 / z} rx={3 / z} fill="none" stroke={SELECT} strokeWidth={1.5 / z}/>)}
        {single && !readOnly && (["nw", "ne", "sw", "se"] as Corner[]).map((c) => {
          const s = 9 / z;
          const x = c.includes("w") ? single.x - 3 / z : single.x + single.w + 3 / z, y = c.includes("n") ? single.y - 3 / z : single.y + single.h + 3 / z;
          return <rect key={c} data-handle={c} data-owner={single.id} x={x - s / 2} y={y - s / 2} width={s} height={s} rx={1.5 / z} fill="#fff" stroke={SELECT} strokeWidth={1.5 / z} pointerEvents="all" style={{ cursor: c === "nw" || c === "se" ? "nwse-resize" : "nesw-resize" }}/>;
        })}
      </g>
    );
  };

  const toolButtons: { tool: Tool; glyph: string; label: string; key: string }[] = [
    { tool: "select", glyph: "cursor", label: "Select", key: "V" },
    { tool: "hand", glyph: "hand", label: "Pan", key: "H / Space" },
    ...KINDS.map((k) => ({ tool: k.kind as Tool, glyph: k.kind, label: k.label, key: k.key.toUpperCase() })),
  ];
  const sizeLabel = (s: TextSize) => ({ s: "S", m: "M", l: "L", xl: "XL" })[s];
  const anyNodes = selNodes.length > 0;
  const firstNode = selNodes[0];
  const firstEdge = selEdges[0];

  return (
    <section className={`flow-shell ${fullscreen ? "fullscreen" : ""}`}>
      <div className="flow-topbar">
        <div className="flow-title">
          <input value={flow.name} onChange={(e) => onSave({ name: e.target.value })} placeholder="Untitled flow" aria-label="Flow name" disabled={readOnly}/>
          <input className="flow-desc" value={flow.description} onChange={(e) => onSave({ description: e.target.value })} placeholder={readOnly ? "" : "Add a description"} aria-label="Flow description" disabled={readOnly}/>
        </div>
        <div className="flow-topbar-actions">
          <span className={`flow-save ${saving ? "busy" : ""}`}>{readOnly ? "Archived · read-only" : saving ? "Saving…" : "Saved"}</span>
          <button className="flow-icon" onClick={undo} disabled={readOnly || !past.current.length} title="Undo (⌘Z)" aria-label="Undo"><Icon name="undo" size={16}/></button>
          <button className="flow-icon" onClick={redo} disabled={readOnly || !future.current.length} title="Redo (⇧⌘Z)" aria-label="Redo"><Glyph name="redo" size={16}/></button>
          <div className="flow-export">
            <button className="flow-icon" onClick={() => setExportMenu((m) => !m)} title="Export" aria-label="Export" aria-expanded={exportMenu}><Icon name="download" size={16}/></button>
            {exportMenu && (
              <div className="flow-menu">
                <button onClick={() => exportAs("png")}>PNG image</button>
                <button onClick={() => exportAs("svg")}>SVG vector</button>
                <button onClick={() => exportAs("json")}>JSON (re-importable)</button>
              </div>
            )}
          </div>
          <button className="flow-icon" onClick={() => setFullscreen(!fullscreen)} title={fullscreen ? "Exit full screen (Esc)" : "Full screen"} aria-label="Toggle full screen"><Glyph name={fullscreen ? "shrink" : "expand"} size={16}/></button>
        </div>
      </div>

      <div ref={wrapRef} className="flow-canvas" style={{ cursor, backgroundSize: `${20 * z}px ${20 * z}px`, backgroundPosition: `${view.x}px ${view.y}px` }}>
        <svg ref={svgRef} className="flow-svg" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onDoubleClick={onDoubleClick}>
          <defs>
            <marker id="flow-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.5,5 Z" fill={EDGE}/></marker>
            <marker id="flow-arrow-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 L2.5,5 Z" fill={SELECT}/></marker>
            <filter id="flow-shadow" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity=".35"/></filter>
          </defs>
          <g className="flow-world" transform={`translate(${view.x} ${view.y}) scale(${z})`}>
            {frames.map(renderNode)}
            {doc.edges.map(renderEdge)}
            {shapes.map(renderNode)}
            {selectionChrome()}
            {ghostEl()}
          </g>
        </svg>

        {readOnly && (
          <div className="flow-archived">
            <span>This flow is archived. Restore it to make changes.</span>
            <button className="primary-button" onClick={onRestore}><Glyph name="restore" size={15}/>Restore</button>
          </div>
        )}

        {!readOnly && (
          <div className="flow-tools" role="toolbar" aria-label="Canvas tools">
            {toolButtons.map((b, i) => (
              <button key={b.tool} className={`${tool === b.tool ? "active" : ""} ${i === 1 ? "sep" : ""}`} onClick={() => setTool(b.tool)} title={`${b.label} (${b.key})`} aria-label={b.label} aria-pressed={tool === b.tool}>
                <Glyph name={b.glyph} size={19}/>
              </button>
            ))}
          </div>
        )}

        {!readOnly && (anyNodes || firstEdge) && !editing && !ghost && (
          <div className="flow-context" onPointerDown={(e) => e.stopPropagation()}>
            {anyNodes && (
              <>
                <div className="swatches">
                  {COLOR_KEYS.map((c) => (
                    <button key={c} className={firstNode.color === c ? "on" : ""} style={{ background: COLORS[c].fill }} onClick={() => patchNodes(sel.nodes, { color: c })} title={COLORS[c].label} aria-label={COLORS[c].label}/>
                  ))}
                </div>
                <i/>
                <select value={selNodes.every((n) => n.kind === firstNode.kind) ? firstNode.kind : ""} onChange={(e) => patchNodes(sel.nodes, { kind: e.target.value as NodeKind })} aria-label="Shape">
                  {!selNodes.every((n) => n.kind === firstNode.kind) && <option value="">Mixed</option>}
                  {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                </select>
                <div className="seg">
                  {(["s", "m", "l", "xl"] as TextSize[]).map((s) => (
                    <button key={s} className={(firstNode.size ?? (firstNode.kind === "sticky" ? "s" : "m")) === s ? "on" : ""} onClick={() => patchNodes(sel.nodes, { size: s })} title={`Text size ${sizeLabel(s)}`}>{sizeLabel(s)}</button>
                  ))}
                </div>
                <i/>
                {selNodes.length >= 2 && (
                  <>
                    {(["l", "c", "r", "t", "m", "b"] as const).map((a) => (
                      <button key={a} className="tb" onClick={() => align(a)} title={{ l: "Align left", c: "Align centre", r: "Align right", t: "Align top", m: "Align middle", b: "Align bottom" }[a]}><Glyph name={`align${a.toUpperCase()}`} size={16}/></button>
                    ))}
                    {selNodes.length >= 3 && <>
                      <button className="tb" onClick={() => align("dh")} title="Distribute horizontally"><Glyph name="distH" size={16}/></button>
                      <button className="tb" onClick={() => align("dv")} title="Distribute vertically"><Glyph name="distV" size={16}/></button>
                    </>}
                    <i/>
                  </>
                )}
                <button className="tb" onClick={() => reorder(true)} title="Bring to front"><Glyph name="front" size={16}/></button>
                <button className="tb" onClick={() => reorder(false)} title="Send to back"><Glyph name="back" size={16}/></button>
                <button className="tb" onClick={() => paste(selectedDoc())} title="Duplicate (⌘D)"><Glyph name="copy" size={16}/></button>
              </>
            )}
            {firstEdge && (
              <>
                {anyNodes && <i/>}
                <div className="seg">
                  {(["elbow", "straight", "curved"] as EdgeStyle[]).map((s) => (
                    <button key={s} className={firstEdge.style === s ? "on" : ""} onClick={() => patchEdges(sel.edges, { style: s })} title={`${s[0].toUpperCase()}${s.slice(1)} line`}><Glyph name={s} size={16}/></button>
                  ))}
                </div>
                <button className={`tb ${firstEdge.dashed ? "on" : ""}`} onClick={() => patchEdges(sel.edges, { dashed: !firstEdge.dashed })} title="Dashed line"><Glyph name="dashed" size={16}/></button>
                <select value={firstEdge.arrow ?? "end"} onChange={(e) => patchEdges(sel.edges, { arrow: e.target.value as ArrowMode })} aria-label="Arrowheads">
                  <option value="end">Arrow →</option>
                  <option value="both">Arrows ↔</option>
                  <option value="none">No arrow</option>
                </select>
                <button className="tb" onClick={() => patchEdges(sel.edges, (ed) => ({ from: ed.to, to: ed.from, fromSide: ed.toSide, toSide: ed.fromSide }))} title="Reverse direction"><Glyph name="swap" size={16}/></button>
                {selEdges.length === 1 && <button className="tb" onClick={() => setEditing({ type: "edge", id: firstEdge.id })} title="Edit label"><Glyph name="label" size={16}/></button>}
              </>
            )}
            <i/>
            <button className="tb danger" onClick={deleteSelection} title="Delete (⌫)"><Icon name="trash" size={16}/></button>
          </div>
        )}

        <div className="flow-zoom">
          <button onClick={() => zoomAt(1 / 1.2)} title="Zoom out (−)" aria-label="Zoom out"><Glyph name="minus" size={15}/></button>
          <button className="pct" onClick={() => zoomAt(1 / z)} title="Reset to 100% (⇧0)">{Math.round(z * 100)}%</button>
          <button onClick={() => zoomAt(1.2)} title="Zoom in (+)" aria-label="Zoom in"><Icon name="plus" size={15}/></button>
          <i/>
          <button onClick={fit} title="Zoom to fit (⇧1)" aria-label="Zoom to fit"><Glyph name="fit" size={15}/></button>
          {!readOnly && <button className={snapOn ? "on" : ""} onClick={() => setSnapOn(!snapOn)} title={`Snap to grid: ${snapOn ? "on" : "off"} (hold ⌥ to move freely)`} aria-pressed={snapOn} aria-label="Snap to grid"><Glyph name="magnet" size={15}/></button>}
          <button className={help ? "on" : ""} onClick={() => setHelp(!help)} title="Shortcuts" aria-label="Shortcuts"><Glyph name="help" size={15}/></button>
        </div>

        {help && (
          <div className="flow-help">
            <strong>Working the canvas</strong>
            <ul>
              <li><b>Drag a blue dot</b> onto a shape to connect; drop on empty space to add a linked shape</li>
              <li><b>Double-click</b> a shape or line to edit its text; empty space adds text</li>
              <li><b>Scroll</b> to pan · <b>⌘/Ctrl + scroll</b> or pinch to zoom · hold <b>Space</b> to drag</li>
              <li><b>Shift-click</b> or drag a box to select several · <b>Shift</b> keeps proportions while resizing</li>
              <li><b>⌘Z / ⇧⌘Z</b> undo / redo · <b>⌘D</b> duplicate · <b>⌘C / ⌘V</b> copy / paste · <b>⌫</b> delete</li>
              <li><b>R P O D E I S T F</b> shapes · <b>V</b> select · <b>⇧1</b> fit · Moving a section moves what's inside</li>
            </ul>
          </div>
        )}

        {doc.nodes.length === 0 && !readOnly && (
          <div className="flow-hint">Pick a shape on the left and click the canvas, or double-click anywhere to write.</div>
        )}
      </div>
    </section>
  );
}

function TextArea({ initial, style, onDone }: { initial: string; style: CSSProperties; onDone: (text: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone(ref.current?.value ?? initial);
  };
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <textarea
      ref={ref} defaultValue={initial} className="flow-textarea"
      style={{ ...style, display: "block", resize: "none", border: 0, outline: "none", background: "transparent", caretColor: style.color as string, overflow: "auto" }}
      onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      onBlur={finish}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); finish(); }
      }}
    />
  );
}

function LabelInput({ initial, onDone }: { initial: string; onDone: (text: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone((ref.current?.value ?? initial).trim());
  };
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref} defaultValue={initial} placeholder="Label" className="flow-label-input"
      style={{ pointerEvents: "auto" }}
      onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      onBlur={finish}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); finish(); } }}
    />
  );
}
