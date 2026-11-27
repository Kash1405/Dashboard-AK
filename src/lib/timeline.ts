import { useStored } from "./store";
import { addDays, dateKey, parseDateKey } from "./utils";
import type { GoalRow, GoalStatus } from "./vault";

// The Timeline shows every Goal Plan row (the same data the Goals tab edits, so changes show in both)
// plus items that only live on the timeline. Row order and hidden goals are kept separately.
export type TimelineItem = { id: string; title: string; start: string; end: string; status: GoalStatus; notes: string };

export const TIMELINE_ITEMS = "timeline.items";
export const TIMELINE_ORDER = "timeline.order";
export const TIMELINE_HIDDEN = "timeline.hidden";

export const useTimelineItems = () => useStored<TimelineItem[]>(TIMELINE_ITEMS, []);
export const useTimelineOrder = () => useStored<string[]>(TIMELINE_ORDER, []);
export const useTimelineHidden = () => useStored<string[]>(TIMELINE_HIDDEN, []);

export type TimelineRow = {
  id: string;
  kind: "goal" | "item";
  title: string;
  tag: string;
  start: string;
  end: string;
  status: GoalStatus;
  notes: string;
};

export const goalToRow = (g: GoalRow): TimelineRow => ({ id: g.id, kind: "goal", title: g.skill, tag: g.type, start: g.start ?? "", end: g.end ?? "", status: g.status, notes: g.description });
export const itemToRow = (i: TimelineItem): TimelineRow => ({ id: i.id, kind: "item", title: i.title, tag: "Timeline", start: i.start, end: i.end, status: i.status, notes: i.notes });

// Saved order first; anything new (a goal added on the Goals tab, say) joins at the bottom.
export function orderRows(order: string[], goals: GoalRow[], items: TimelineItem[]): TimelineRow[] {
  const all = [...goals.map(goalToRow), ...items.map(itemToRow)];
  const byId = new Map(all.map((row) => [row.id, row]));
  const placed = order.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    byId.delete(id);
    return [row];
  });
  return [...placed, ...byId.values()];
}

// Weeks run Sunday to Saturday.
export const weekStart = (date: Date) => addDays(new Date(date.getFullYear(), date.getMonth(), date.getDate()), -date.getDay());
export const daysBetween = (a: string, b: string) => Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86400000);
export const shiftKey = (key: string, days: number) => dateKey(addDays(parseDateKey(key), days));
const md = (d: Date) => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
export const weekLabel = (start: Date) => `${md(start)} – ${md(addDays(start, 6))}`;
