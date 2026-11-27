import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { Icon, Panel, PanelTitle } from "./ui";
import { useStored } from "../lib/store";
import { daysBetween, orderRows, shiftKey, useTimelineHidden, useTimelineItems, useTimelineOrder, weekLabel, weekStart, type TimelineRow } from "../lib/timeline";
import { addDays, dateKey, parseDateKey, uid } from "../lib/utils";
import { useGoalTable, type GoalStatus } from "../lib/vault";

const DAY = 18; // px per day; a week column is 126px
const WEEK = DAY * 7;
const statuses: GoalStatus[] = ["Not Started", "In Progress", "Done", "On Hold", "Overdue"];
const statusClass = (status: string) => status.toLowerCase().replace(/\s+/g, "-");
const shortDate = (key: string) => (key ? parseDateKey(key).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

type Patch = Partial<Pick<TimelineRow, "title" | "tag" | "start" | "end" | "status" | "notes">>;
type Draft = Pick<TimelineRow, "kind" | "title" | "tag" | "start" | "end" | "status" | "notes"> & { id: string; isNew: boolean };
type BarDrag = { id: string; mode: "move" | "start" | "end"; x: number; start: string; end: string; delta: number };

// A bar needs at least one date; with only one, it spans that single day.
function span(row: Pick<TimelineRow, "start" | "end">) {
  const start = row.start || row.end;
  const end = row.end || row.start;
  if (!start) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

const shownStatus = (row: TimelineRow, today: string): GoalStatus => (row.status !== "Done" && row.end && row.end < today ? "Overdue" : row.status);

export default function GoalTimeline() {
  const [goals, setGoals] = useGoalTable();
  const [items, setItems] = useTimelineItems();
  const [order, setOrder] = useTimelineOrder();
  const [hidden, setHidden] = useTimelineHidden();
  const [filter, setFilter] = useStored<"all" | "goal" | "item">("timeline.filter", "all");
  const [showDone, setShowDone] = useStored("timeline.showDone", true);
  const [showHidden, setShowHidden] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [bar, setBar] = useState<BarDrag | null>(null);
  const [rowDrag, setRowDrag] = useState<{ id: string; over: string | null; below: boolean } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const today = dateKey();

  const rows = orderRows(order, goals, items);
  const hiddenSet = new Set(hidden);
  const doneCount = rows.filter((row) => row.status === "Done").length;
  const visible = rows.filter((row) =>
    (filter === "all" || row.kind === filter) && (showDone || row.status !== "Done") && (showHidden || !hiddenSet.has(row.id)),
  );

  // Range: two weeks back to four months ahead, stretched to fit every dated row (up to a year back).
  const thisWeek = weekStart(new Date());
  let first = addDays(thisWeek, -14);
  let last = addDays(thisWeek, 7 * 16);
  for (const row of rows) {
    const s = span(row);
    if (!s) continue;
    const a = weekStart(parseDateKey(s.start));
    const b = parseDateKey(s.end);
    if (a < first) first = a;
    if (b > last) last = b;
  }
  const floor = addDays(thisWeek, -7 * 52);
  if (first < floor) first = floor;
  const rangeStart = dateKey(first);
  const weekCount = Math.ceil((last.getTime() - first.getTime()) / (7 * 86400000)) + 3;
  const weeks = Array.from({ length: weekCount }, (_, i) => addDays(first, i * 7));
  const width = weekCount * WEEK;
  const todayX = daysBetween(rangeStart, today) * DAY;

  const scrollToToday = (smooth = true) => scroller.current?.scrollTo({ left: Math.max(0, todayX - WEEK * 2), behavior: smooth ? "smooth" : "auto" });
  useEffect(() => {
    scrollToToday(false);
    // Only on first open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Edits (goal rows write straight to the Goal Plan, so the Goals tab sees them) ----------
  const update = (row: Pick<TimelineRow, "id" | "kind">, patch: Patch) => {
    // Moving an overdue row's end into the future puts it back in progress.
    const fix = (status: GoalStatus, end?: string) => (status === "Overdue" && end && end >= today ? "In Progress" : status);
    if (row.kind === "goal") {
      setGoals(goals.map((g) => {
        if (g.id !== row.id) return g;
        const end = patch.end ?? g.end;
        return { ...g, skill: patch.title ?? g.skill, type: patch.tag ?? g.type, description: patch.notes ?? g.description, start: patch.start ?? g.start, end, status: fix(patch.status ?? g.status, patch.end) };
      }));
    } else {
      setItems(items.map((i) => {
        if (i.id !== row.id) return i;
        const end = patch.end ?? i.end;
        return { ...i, title: patch.title ?? i.title, notes: patch.notes ?? i.notes, start: patch.start ?? i.start, end, status: fix(patch.status ?? i.status, patch.end) };
      }));
    }
  };

  const ids = rows.map((row) => row.id);
  const moveBefore = (id: string, targetId: string, after: boolean) => {
    if (id === targetId) return;
    const rest = ids.filter((x) => x !== id);
    const at = rest.indexOf(targetId) + (after ? 1 : 0);
    setOrder([...rest.slice(0, at), id, ...rest.slice(at)]);
  };
  const nudge = (row: TimelineRow, dir: -1 | 1) => {
    const neighbour = visible[visible.indexOf(row) + dir];
    if (neighbour) moveBefore(row.id, neighbour.id, dir === 1);
  };
  const toTop = (row: TimelineRow) => setOrder([row.id, ...ids.filter((x) => x !== row.id)]);

  const toggleHidden = (id: string) => setHidden(hiddenSet.has(id) ? hidden.filter((x) => x !== id) : [...hidden, id]);

  const openNew = () => {
    const start = dateKey(thisWeek);
    setDraft({ id: uid(), isNew: true, kind: "item", title: "", tag: "Timeline", start, end: shiftKey(start, 6), status: "Not Started", notes: "" });
  };
  const saveDraft = () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return;
    const s = span(draft);
    const dates = { start: s?.start ?? "", end: s?.end ?? "" };
    if (draft.isNew) {
      setItems([...items, { id: draft.id, title, ...dates, status: draft.status, notes: draft.notes }]);
      setOrder([draft.id, ...ids]); // new items start at the top
    } else {
      update(draft, { title, tag: draft.tag, notes: draft.notes, status: draft.status, ...dates });
    }
    setDraft(null);
  };
  const deleteItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
    setOrder(order.filter((x) => x !== id));
    setDraft(null);
  };

  // ---------- Bar dragging: move the whole bar, or pull either end; snaps to days ----------
  const onBarDown = (event: PointerEvent, row: TimelineRow, mode: BarDrag["mode"]) => {
    const s = span(row);
    if (!s || event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setBar({ id: row.id, mode, x: event.clientX, start: s.start, end: s.end, delta: 0 });
  };
  const onBarMove = (event: PointerEvent) => {
    if (!bar) return;
    const delta = Math.round((event.clientX - bar.x) / DAY);
    if (delta !== bar.delta) setBar({ ...bar, delta });
  };
  const preview = (b: BarDrag) => {
    const len = daysBetween(b.start, b.end);
    if (b.mode === "move") return { start: shiftKey(b.start, b.delta), end: shiftKey(b.end, b.delta) };
    if (b.mode === "start") return { start: shiftKey(b.start, Math.min(b.delta, len)), end: b.end };
    return { start: b.start, end: shiftKey(b.end, Math.max(b.delta, -len)) };
  };
  const onBarUp = (row: TimelineRow) => {
    if (!bar) return;
    if (bar.delta !== 0) update(row, preview(bar));
    else if (bar.mode === "move") edit(row);
    setBar(null);
  };
  const edit = (row: TimelineRow) => setDraft({ ...row, isNew: false });

  // Clicking the empty track of an undated row schedules it for that week.
  const onTrackClick = (event: MouseEvent, row: TimelineRow) => {
    if (span(row)) return;
    const x = event.clientX - (event.currentTarget as HTMLElement).getBoundingClientRect().left;
    const start = shiftKey(rangeStart, Math.floor(x / WEEK) * 7);
    update(row, { start, end: shiftKey(start, 6) });
  };

  // ---------- Row reordering: drag the grip (pointer events, so it works with touch too) ----------
  const onGripDown = (event: PointerEvent, id: string) => {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setRowDrag({ id, over: null, below: false });
  };
  const onGripMove = (event: PointerEvent) => {
    if (!rowDrag) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-row-id]");
    const over = target?.dataset.rowId ?? null;
    const box = target?.getBoundingClientRect();
    const below = !!box && event.clientY > box.top + box.height / 2;
    if (over !== rowDrag.over || below !== rowDrag.below) setRowDrag({ ...rowDrag, over, below });
  };
  const onGripUp = () => {
    if (rowDrag?.over && rowDrag.over !== rowDrag.id) moveBefore(rowDrag.id, rowDrag.over, rowDrag.below);
    setRowDrag(null);
  };

  return (
    <>
      <Panel className="timeline-panel">
        <PanelTitle eyebrow="SEASON CALENDAR" title="Timeline" action={
          <div className="tl-actions">
            <button className="secondary-button" onClick={() => scrollToToday()}>This week</button>
            <button className="primary-button" onClick={openNew}><Icon name="plus" size={14}/> Add item</button>
          </div>
        }/>
        <div className="filter-chips tl-filters">
          {([["all", "All"], ["goal", "Goals"], ["item", "My items"]] as const).map(([key, label]) => (
            <button key={key} className={filter === key ? "active" : ""} onClick={() => setFilter(key)}>{label}</button>
          ))}
          <span className="tl-filter-gap"/>
          {doneCount > 0 && <button className={showDone ? "" : "active"} onClick={() => setShowDone(!showDone)} aria-pressed={!showDone}>{showDone ? `Hide ${doneCount} done` : `Show ${doneCount} done`}</button>}
          {hidden.length > 0 && <button className={showHidden ? "active" : ""} onClick={() => setShowHidden(!showHidden)} aria-pressed={showHidden}>{showHidden ? "Hide hidden rows" : `Show ${hidden.filter((id) => ids.includes(id)).length} hidden`}</button>}
        </div>

        <div className="tl-scroll" ref={scroller}>
          <div className="tl-grid" style={{ width: 300 + width }}>
            <div className="tl-row tl-head">
              <div className="tl-label tl-head-label">Goal / item <span>drag ⋮⋮ to reorder</span></div>
              <div className="tl-weeks" style={{ width }}>
                {weeks.map((week, i) => {
                  const showMonth = i === 0 || week.getMonth() !== weeks[i - 1].getMonth();
                  const current = dateKey(week) === dateKey(thisWeek);
                  return (
                    <div key={i} className={`tl-week ${current ? "current" : ""}`} style={{ width: WEEK }}>
                      <b>{showMonth ? week.toLocaleDateString(undefined, { month: "short", year: "numeric" }).toUpperCase() : " "}</b>
                      <span>{weekLabel(week)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {visible.map((row, index) => {
              const live = bar?.id === row.id ? preview(bar) : span(row);
              const status = shownStatus(row, today);
              const isHidden = hiddenSet.has(row.id);
              const over = rowDrag && rowDrag.over === row.id && rowDrag.id !== row.id;
              const below = over && rowDrag!.below;
              return (
                <div key={row.id} data-row-id={row.id} className={`tl-row ${isHidden ? "is-hidden" : ""} ${rowDrag?.id === row.id ? "dragging" : ""} ${over ? (below ? "drop-below" : "drop-above") : ""}`}>
                  <div className="tl-label">
                    <span className="tl-grip" onPointerDown={(event) => onGripDown(event, row.id)} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={() => setRowDrag(null)} title="Drag to reorder"><Icon name="grip" size={14}/></span>
                    <button className="tl-title" onClick={() => edit(row)} title="Edit">
                      <strong>{row.title || "Untitled"}</strong>
                      <small><em className={row.kind === "item" ? "mine" : ""}>{row.kind === "goal" ? row.tag || "Goal" : "My item"}</em>{live ? `${shortDate(live.start)} → ${shortDate(live.end)}` : "Unscheduled"}</small>
                    </button>
                    <span className="tl-row-actions">
                      <button className="icon-mini" onClick={() => toTop(row)} title="Move to top" aria-label={`Move ${row.title} to top`} disabled={index === 0}><Icon name="top" size={14}/></button>
                      <button className="icon-mini" onClick={() => nudge(row, -1)} title="Move up" aria-label={`Move ${row.title} up`} disabled={index === 0}><Icon name="up" size={14}/></button>
                      <button className="icon-mini" onClick={() => nudge(row, 1)} title="Move down" aria-label={`Move ${row.title} down`} disabled={index === visible.length - 1}><Icon name="down" size={14}/></button>
                    </span>
                  </div>
                  <div className={`tl-track ${live ? "" : "empty"}`} style={{ width, backgroundSize: `${WEEK}px 100%` }} onClick={(event) => onTrackClick(event, row)} title={live ? undefined : "Click a week to schedule"}>
                    <i className="tl-today" style={{ left: todayX }}/>
                    {live && (
                      <div className={`tl-bar ${statusClass(status)} ${row.kind === "item" ? "mine" : ""} ${bar?.id === row.id ? "active" : ""}`}
                        style={{ left: daysBetween(rangeStart, live.start) * DAY, width: (daysBetween(live.start, live.end) + 1) * DAY }}
                        onPointerDown={(event) => onBarDown(event, row, "move")} onPointerMove={onBarMove} onPointerUp={() => onBarUp(row)} onPointerCancel={() => setBar(null)}
                        title={`${row.title} · ${shortDate(live.start)} → ${shortDate(live.end)} · ${status}\nDrag to move, pull the ends to resize, click to edit`}>
                        <span className="tl-handle start" onPointerDown={(event) => onBarDown(event, row, "start")} onPointerMove={onBarMove} onPointerUp={() => onBarUp(row)}/>
                        <span className="tl-bar-text">{row.title || "Untitled"}</span>
                        <span className="tl-handle end" onPointerDown={(event) => onBarDown(event, row, "end")} onPointerMove={onBarMove} onPointerUp={() => onBarUp(row)}/>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {visible.length === 0 && <p className="empty padded">{rows.length ? "Nothing matches these filters." : "No goals or items yet. Add an item, or add goals on the Goals tab."}</p>}
          </div>
        </div>
        <p className="table-hint">Goal rows are the same as the table below, so edits show in both. Drag a bar to move it, pull its ends to change dates, click it to edit. Click an empty row to schedule it. Weeks run Sunday to Saturday.</p>
      </Panel>

      {draft && (
        <div className="tl-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDraft(null); }}>
          <form className="tl-dialog" onSubmit={(event) => { event.preventDefault(); saveDraft(); }} onKeyDown={(event) => { if (event.key === "Escape") setDraft(null); }}>
            <p className="eyebrow red">{draft.isNew ? "NEW TIMELINE ITEM" : draft.kind === "goal" ? "GOAL · ALSO ON THE GOALS TAB" : "TIMELINE ITEM"}</p>
            <label>Title<input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What are you working on?"/></label>
            {draft.kind === "goal" && <label>Type<input value={draft.tag} onChange={(event) => setDraft({ ...draft, tag: event.target.value })}/></label>}
            <div className="tl-dialog-pair">
              <label>Start<input type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })}/></label>
              <label>End<input type="date" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })}/></label>
            </div>
            <label>Status
              <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as GoalStatus })}>
                {statuses.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label>{draft.kind === "goal" ? "Description" : "Notes"}<textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })}/></label>
            <div className="tl-dialog-actions">
              {!draft.isNew && draft.kind === "item" && <button type="button" className="text-button danger" onClick={() => deleteItem(draft.id)}><Icon name="trash" size={14}/> Delete</button>}
              {!draft.isNew && draft.kind === "goal" && <button type="button" className="text-button" onClick={() => { toggleHidden(draft.id); setDraft(null); }}>{hiddenSet.has(draft.id) ? "Show on timeline" : "Hide from timeline"}</button>}
              <span/>
              <button type="button" className="secondary-button" onClick={() => setDraft(null)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={!draft.title.trim()}>Save</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
