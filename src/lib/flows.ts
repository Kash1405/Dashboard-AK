import { useStored } from "./store";
import { uid } from "./utils";

// Flows: editable workflow diagrams (shapes + connectors on an infinite canvas).
// Stored under "flows" (synced to the "Flows" tab of Dashboard Data); the open flow and
// each flow's pan/zoom stay on this device only.

export type Side = "top" | "right" | "bottom" | "left";
export type NodeKind = "rect" | "rounded" | "circle" | "diamond" | "pill" | "slant" | "sticky" | "text" | "frame";
export type FlowColor = "red" | "pink" | "amber" | "blue" | "green" | "purple" | "slate" | "white";
export type TextSize = "s" | "m" | "l" | "xl";
export type FlowNode = { id: string; kind: NodeKind; x: number; y: number; w: number; h: number; text: string; color: FlowColor; size?: TextSize };
export type EdgeStyle = "elbow" | "straight" | "curved";
export type ArrowMode = "end" | "both" | "none";
export type FlowEdge = { id: string; from: string; to: string; fromSide?: Side; toSide?: Side; label: string; style: EdgeStyle; dashed?: boolean; arrow?: ArrowMode };
export type FlowDoc = { nodes: FlowNode[]; edges: FlowEdge[] };
export type FlowStatus = "active" | "archived";
export type Flow = FlowDoc & { id: string; name: string; description: string; status: FlowStatus; createdAt: string; updatedAt: string };
export type View = { x: number; y: number; zoom: number };

export const FLOWS_KEY = "flows";
export const useFlows = () => useStored<Flow[]>(FLOWS_KEY, []);
export const useActiveFlowId = () => useStored<string>("flows.active", "");
export const useFlowViews = () => useStored<Record<string, View>>("flows.views", {});

export const COLORS: Record<FlowColor, { fill: string; ink: string; label: string }> = {
  red: { fill: "#f2382b", ink: "#ffffff", label: "Red" },
  pink: { fill: "#f57fe8", ink: "#1f0a1c", label: "Pink" },
  amber: { fill: "#ffab00", ink: "#1d1400", label: "Amber" },
  blue: { fill: "#4f7cff", ink: "#ffffff", label: "Blue" },
  green: { fill: "#16c47f", ink: "#04140d", label: "Green" },
  purple: { fill: "#9b6bff", ink: "#ffffff", label: "Purple" },
  slate: { fill: "#2f323a", ink: "#e8e9eb", label: "Slate" },
  white: { fill: "#f1f0ec", ink: "#141518", label: "White" },
};
export const COLOR_KEYS = Object.keys(COLORS) as FlowColor[];

export const KINDS: { kind: NodeKind; label: string; key: string; w: number; h: number; color: FlowColor }[] = [
  { kind: "rect", label: "Rectangle", key: "r", w: 120, h: 80, color: "red" },
  { kind: "rounded", label: "Process", key: "p", w: 160, h: 80, color: "pink" },
  { kind: "circle", label: "Circle", key: "o", w: 90, h: 90, color: "amber" },
  { kind: "diamond", label: "Decision", key: "d", w: 120, h: 120, color: "blue" },
  { kind: "pill", label: "Start / end", key: "e", w: 150, h: 56, color: "green" },
  { kind: "slant", label: "Input / output", key: "i", w: 160, h: 76, color: "purple" },
  { kind: "sticky", label: "Sticky note", key: "s", w: 160, h: 140, color: "amber" },
  { kind: "text", label: "Text", key: "t", w: 200, h: 40, color: "white" },
  { kind: "frame", label: "Section", key: "f", w: 520, h: 360, color: "slate" },
];
export const kindInfo = (kind: NodeKind) => KINDS.find((k) => k.kind === kind)!;

const SIDES: Side[] = ["top", "right", "bottom", "left"];
const KIND_SET = new Set(KINDS.map((k) => k.kind));
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

// Repairs anything read from Sheets or an imported file.
export function normalizeDoc(raw: unknown): FlowDoc {
  const r = (raw ?? {}) as Partial<FlowDoc>;
  const nodes = (Array.isArray(r.nodes) ? r.nodes : []).filter((n) => n && typeof n.id === "string").map((n): FlowNode => ({
    id: n.id,
    kind: KIND_SET.has(n.kind) ? n.kind : "rect",
    x: num(n.x, 0), y: num(n.y, 0), w: Math.max(20, num(n.w, 120)), h: Math.max(20, num(n.h, 80)),
    text: typeof n.text === "string" ? n.text : "",
    color: n.color in COLORS ? n.color : "slate",
    ...(n.size && ["s", "m", "l", "xl"].includes(n.size) ? { size: n.size } : {}),
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (Array.isArray(r.edges) ? r.edges : []).filter((e) => e && ids.has(e.from) && ids.has(e.to)).map((e): FlowEdge => ({
    id: typeof e.id === "string" ? e.id : uid(),
    from: e.from, to: e.to,
    ...(SIDES.includes(e.fromSide as Side) ? { fromSide: e.fromSide } : {}),
    ...(SIDES.includes(e.toSide as Side) ? { toSide: e.toSide } : {}),
    label: typeof e.label === "string" ? e.label : "",
    style: ["elbow", "straight", "curved"].includes(e.style) ? e.style : "elbow",
    ...(e.dashed ? { dashed: true } : {}),
    ...(e.arrow && e.arrow !== "end" && ["both", "none"].includes(e.arrow) ? { arrow: e.arrow } : {}),
  }));
  return { nodes, edges };
}

// Compact form for storage: whole-pixel coordinates.
export const serializeDoc = (doc: FlowDoc) =>
  JSON.stringify({ v: 1, nodes: doc.nodes.map((n) => ({ ...n, x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.w), h: Math.round(n.h) })), edges: doc.edges });

export function newFlow(name: string, doc: FlowDoc = { nodes: [], edges: [] }, description = ""): Flow {
  const now = new Date().toISOString();
  return { id: uid(), name, description, status: "active", createdAt: now, updatedAt: now, ...doc };
}

// ---------- Templates ----------

const n = (kind: NodeKind, x: number, y: number, text: string, color?: FlowColor, w?: number, h?: number): FlowNode => {
  const k = kindInfo(kind);
  return { id: uid(), kind, x, y, w: w ?? k.w, h: h ?? k.h, text, color: color ?? k.color };
};
const e = (from: FlowNode, to: FlowNode, label = "", extra: Partial<FlowEdge> = {}): FlowEdge => ({ id: uid(), from: from.id, to: to.id, label, style: "elbow", ...extra });

export const TEMPLATES: { id: string; name: string; blurb: string; build: () => FlowDoc }[] = [
  { id: "blank", name: "Blank canvas", blurb: "Start from nothing.", build: () => ({ nodes: [], edges: [] }) },
  {
    id: "process", name: "Simple process", blurb: "Start, three steps, end.",
    build: () => {
      const a = n("pill", 0, 12, "Start"), b = n("rounded", 210, 0, "Step one"), c = n("rounded", 430, 0, "Step two"), d = n("rounded", 650, 0, "Step three"), z = n("pill", 870, 12, "Done", "red");
      return { nodes: [a, b, c, d, z], edges: [e(a, b), e(b, c), e(c, d), e(d, z)] };
    },
  },
  {
    id: "decision", name: "Decision flow", blurb: "A question that branches yes / no.",
    build: () => {
      const a = n("pill", 0, 32, "Request in"), b = n("rounded", 210, 20, "Review"), q = n("diamond", 440, 0, "Approve?"),
        y = n("rounded", 640, 20, "Do it", "green"), no = n("rounded", 420, 220, "Send back", "red"), z = n("pill", 860, 32, "Closed");
      return { nodes: [a, b, q, y, no, z], edges: [e(a, b), e(b, q), e(q, y, "Yes"), e(q, no, "No"), e(no, b, "", { dashed: true }), e(y, z)] };
    },
  },
  {
    id: "key", name: "Flow key + visualisation", blurb: "A legend of shapes beside the flow itself.",
    build: () => {
      const keyFrame = n("frame", 0, 0, "Flow Key", "slate", 380, 640), viz = n("frame", 440, 0, "Visualization", "slate", 980, 640);
      const k1 = n("rect", 40, 60, "", "red", 80, 70), k2 = n("rect", 40, 160, "", "pink", 120, 70), k3 = n("circle", 40, 260, "", "amber", 80, 80), k4 = n("diamond", 40, 370, "", "blue", 90, 90), k5 = n("rect", 40, 490, "", "green", 80, 110);
      const t = (y: number, text: string) => n("text", 160, y, text, "white", 190, 40);
      const legend = [t(75, "Trigger / input"), t(175, "Process step"), t(280, "Event / state"), t(395, "Decision"), t(525, "Outcome")];
      const s1 = n("rect", 520, 60, "Trigger", "red", 100, 80), s2 = n("rect", 500, 200, "Process", "pink", 150, 80), s3 = n("circle", 760, 195, "Event", "amber"), s4 = n("circle", 1000, 195, "Event", "amber"),
        s5 = n("rect", 1220, 200, "Result", "red", 110, 80), s6 = n("circle", 530, 380, "State", "amber"), s7 = n("circle", 530, 530, "End", "amber", 80, 80), s8 = n("diamond", 755, 360, "Check?", "blue"), s9 = n("rect", 1000, 380, "Outcome", "red", 100, 80);
      return {
        nodes: [keyFrame, viz, k1, k2, k3, k4, k5, ...legend, s1, s2, s3, s4, s5, s6, s7, s8, s9],
        edges: [e(s1, s2), e(s2, s3, "then"), e(s3, s4, "then"), e(s4, s5, "then"), e(s2, s6, "else"), e(s6, s7), e(s3, s8, "if"), e(s8, s9, "yes")],
      };
    },
  },
];

// ---------- Geometry ----------

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

export const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
export function anchor(b: Box, side: Side): Pt {
  if (side === "top") return { x: b.x + b.w / 2, y: b.y };
  if (side === "bottom") return { x: b.x + b.w / 2, y: b.y + b.h };
  if (side === "left") return { x: b.x, y: b.y + b.h / 2 };
  return { x: b.x + b.w, y: b.y + b.h / 2 };
}
const horizontal = (s: Side) => s === "left" || s === "right";
const offset = (p: Pt, s: Side, d: number): Pt => (s === "top" ? { x: p.x, y: p.y - d } : s === "bottom" ? { x: p.x, y: p.y + d } : s === "left" ? { x: p.x - d, y: p.y } : { x: p.x + d, y: p.y });

// The side of a box that faces a point.
export function sideToward(b: Box, p: Pt): Side {
  const c = center(b);
  const dx = (p.x - c.x) / (b.w / 2 || 1), dy = (p.y - c.y) / (b.h / 2 || 1);
  return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : dy >= 0 ? "bottom" : "top";
}

// Picks facing sides for two boxes, along whichever axis has the bigger gap.
export function autoSides(a: Box, b: Box): [Side, Side] {
  const ca = center(a), cb = center(b);
  const gapX = Math.abs(cb.x - ca.x) - (a.w + b.w) / 2;
  const gapY = Math.abs(cb.y - ca.y) - (a.h + b.h) / 2;
  if (gapX >= gapY) return cb.x >= ca.x ? ["right", "left"] : ["left", "right"];
  return cb.y >= ca.y ? ["bottom", "top"] : ["top", "bottom"];
}

function elbowPoints(p1: Pt, s1: Side, p2: Pt, s2: Side): Pt[] {
  const stub = 22;
  const a = offset(p1, s1, stub), b = offset(p2, s2, stub);
  let mid: Pt[];
  if (horizontal(s1) && horizontal(s2)) {
    const facing = (s1 === "right" && b.x >= a.x) || (s1 === "left" && b.x <= a.x);
    if (facing || s1 === s2) {
      const mx = s1 === s2 ? (s1 === "right" ? Math.max(a.x, b.x) : Math.min(a.x, b.x)) : (a.x + b.x) / 2;
      mid = [{ x: mx, y: a.y }, { x: mx, y: b.y }];
    } else {
      const my = (a.y + b.y) / 2;
      mid = [{ x: a.x, y: my }, { x: b.x, y: my }];
    }
  } else if (!horizontal(s1) && !horizontal(s2)) {
    const facing = (s1 === "bottom" && b.y >= a.y) || (s1 === "top" && b.y <= a.y);
    if (facing || s1 === s2) {
      const my = s1 === s2 ? (s1 === "bottom" ? Math.max(a.y, b.y) : Math.min(a.y, b.y)) : (a.y + b.y) / 2;
      mid = [{ x: a.x, y: my }, { x: b.x, y: my }];
    } else {
      const mx = (a.x + b.x) / 2;
      mid = [{ x: mx, y: a.y }, { x: mx, y: b.y }];
    }
  } else if (horizontal(s1)) mid = [{ x: b.x, y: a.y }];
  else mid = [{ x: a.x, y: b.y }];
  const pts = [p1, a, ...mid, b, p2];
  // Drop repeated and collinear points.
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    const prev = out[out.length - 2];
    if (prev && last && ((Math.abs(prev.x - last.x) < 0.5 && Math.abs(last.x - p.x) < 0.5) || (Math.abs(prev.y - last.y) < 0.5 && Math.abs(last.y - p.y) < 0.5))) out[out.length - 1] = p;
    else out.push(p);
  }
  return out;
}

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

function roundedPolyline(pts: Pt[], radius = 10) {
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const r1 = Math.min(radius, dist(prev, cur) / 2), r2 = Math.min(radius, dist(cur, next) / 2);
    const l1 = dist(prev, cur) || 1, l2 = dist(cur, next) || 1;
    const a = { x: cur.x - ((cur.x - prev.x) / l1) * r1, y: cur.y - ((cur.y - prev.y) / l1) * r1 };
    const b = { x: cur.x + ((next.x - cur.x) / l2) * r2, y: cur.y + ((next.y - cur.y) / l2) * r2 };
    d += ` L${a.x},${a.y} Q${cur.x},${cur.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1];
  return `${d} L${last.x},${last.y}`;
}

function polylineMid(pts: Pt[]): Pt {
  const total = pts.slice(1).reduce((s, p, i) => s + dist(pts[i], p), 0);
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const seg = dist(pts[i - 1], pts[i]);
    if (seg >= left && seg > 0) return { x: pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * left) / seg, y: pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * left) / seg };
    left -= seg;
  }
  return pts[0];
}

export function routePath(style: EdgeStyle, p1: Pt, s1: Side, p2: Pt, s2: Side): { d: string; mid: Pt } {
  if (style === "straight") return { d: `M${p1.x},${p1.y} L${p2.x},${p2.y}`, mid: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 } };
  if (style === "curved") {
    const k = Math.max(40, dist(p1, p2) / 2.5);
    const c1 = offset(p1, s1, k), c2 = offset(p2, s2, k);
    const t = 0.5, u = 1 - t;
    const mid = {
      x: u * u * u * p1.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p2.x,
      y: u * u * u * p1.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p2.y,
    };
    return { d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`, mid };
  }
  const pts = elbowPoints(p1, s1, p2, s2);
  return { d: roundedPolyline(pts), mid: polylineMid(pts) };
}

export function edgeGeometry(edge: FlowEdge, byId: Map<string, FlowNode>) {
  const a = byId.get(edge.from), b = byId.get(edge.to);
  if (!a || !b) return null;
  const [autoA, autoB] = autoSides(a, b);
  const s1 = edge.fromSide ?? (edge.toSide ? sideToward(a, anchor(b, edge.toSide)) : autoA);
  const s2 = edge.toSide ?? (edge.fromSide ? sideToward(b, anchor(a, s1)) : autoB);
  return routePath(edge.style, anchor(a, s1), s1, anchor(b, s2), s2);
}

export function boundsOf(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x1 = Math.min(...boxes.map((b) => b.x)), y1 = Math.min(...boxes.map((b) => b.y));
  const x2 = Math.max(...boxes.map((b) => b.x + b.w)), y2 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export const contains = (outer: Box, inner: Box) => inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
export const intersects = (a: Box, b: Box) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
