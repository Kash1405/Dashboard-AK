import { useState } from "react";
import { Icon, Panel, PanelTitle } from "./ui";
import { dateKey, pad, parseDateKey, useNow } from "../lib/utils";
import type { GoalRow } from "../lib/vault";

type Draft = { id: string; skill: string; end: string };

// A deadline counts down to the very end of its day.
const deadlineOf = (key: string) => {
  const date = parseDateKey(key);
  date.setHours(23, 59, 59, 999);
  return date;
};
const longDate = (key: string) => parseDateKey(key).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const COLLAPSED = 8;

export default function GoalCountdowns({ rows, setRows }: { rows: GoalRow[]; setRows: (rows: GoalRow[]) => void }) {
  const now = useNow(1000);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const editing = drafts !== null;

  const dated = rows
    .filter((row) => row.end)
    .sort((a, b) => Number(a.status === "Done") - Number(b.status === "Done") || a.end!.localeCompare(b.end!));
  const undated = rows.filter((row) => !row.end);

  const startEditing = () => setDrafts(dated.map((row) => ({ id: row.id, skill: row.skill, end: row.end! })));
  const updateDraft = (id: string, patch: Partial<Draft>) => setDrafts((list) => list!.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const addDraft = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (row) setDrafts((list) => [...list!, { id: row.id, skill: row.skill, end: dateKey() }]);
  };
  const save = () => {
    const byId = new Map(drafts!.map((d) => [d.id, d]));
    setRows(rows.map((row) => {
      const draft = byId.get(row.id);
      if (draft) return { ...row, skill: draft.skill.trim() || row.skill, end: draft.end || "" };
      // Was on the board when editing began but was removed from the drafts → clear its deadline.
      return dated.some((d) => d.id === row.id) ? { ...row, end: "" } : row;
    }));
    setDrafts(null);
  };

  const action = editing ? (
    <div className="panel-actions">
      <button className="secondary-button" onClick={() => setDrafts(null)}>Cancel</button>
      <button className="primary-button" onClick={save}><Icon name="check" size={15}/>Save all</button>
    </div>
  ) : (
    <button className="secondary-button" onClick={startEditing}><Icon name="edit" size={15}/>Edit countdowns</button>
  );

  if (!editing && dated.length === 0) {
    return (
      <Panel className="countdown-panel">
        <PanelTitle eyebrow="RACE CLOCK" title="Deadlines" action={action}/>
        <p className="table-hint">No goals have an end date yet. Set one with “Edit countdowns” or in the table below.</p>
      </Panel>
    );
  }

  if (editing) {
    const draftIds = new Set(drafts.map((d) => d.id));
    const addable = undated.concat(dated.filter((row) => !draftIds.has(row.id))).filter((row) => !draftIds.has(row.id));
    return (
      <Panel className="countdown-panel">
        <PanelTitle eyebrow="RACE CLOCK" title={`Editing ${drafts.length} countdown${drafts.length === 1 ? "" : "s"}`} action={action}/>
        <div className="countdown-grid">
          {drafts.map((draft) => (
            <div key={draft.id} className="countdown-card editing">
              <label>Goal<input value={draft.skill} onChange={(e) => updateDraft(draft.id, { skill: e.target.value })} aria-label="Goal name"/></label>
              <label>Deadline<input type="date" value={draft.end} onChange={(e) => updateDraft(draft.id, { end: e.target.value })} aria-label={`Deadline for ${draft.skill}`}/></label>
              <button className="text-button" onClick={() => setDrafts((list) => list!.filter((d) => d.id !== draft.id))}><Icon name="x" size={13}/>Remove countdown</button>
            </div>
          ))}
        </div>
        {addable.length > 0 && (
          <select className="countdown-add" value="" onChange={(e) => e.target.value && addDraft(e.target.value)} aria-label="Add a countdown for a goal">
            <option value="">+ Add a countdown for another goal…</option>
            {addable.map((row) => <option key={row.id} value={row.id}>{row.skill || "Untitled"}</option>)}
          </select>
        )}
        <p className="table-hint">Removing a countdown clears that goal's end date. Nothing changes until you press Save all.</p>
      </Panel>
    );
  }

  const shown = showAll ? dated : dated.slice(0, COLLAPSED);
  return (
    <Panel className="countdown-panel">
      <PanelTitle eyebrow="RACE CLOCK" title={`${dated.length} deadline${dated.length === 1 ? "" : "s"}`} action={action}/>
      <div className="countdown-grid">
        {shown.map((row) => {
          const deadline = deadlineOf(row.end!);
          const ms = deadline.getTime() - now.getTime();
          const done = row.status === "Done";
          const past = ms < 0;
          const abs = Math.abs(ms);
          const days = Math.floor(abs / 86_400_000);
          const hrs = Math.floor((abs % 86_400_000) / 3_600_000);
          const mins = Math.floor((abs % 3_600_000) / 60_000);
          const secs = Math.floor((abs % 60_000) / 1000);
          const tone = done ? "done" : past ? "late" : days < 7 ? "urgent" : days < 30 ? "soon" : "calm";
          const start = row.start ? parseDateKey(row.start).getTime() : null;
          const elapsed = start !== null && deadline.getTime() > start ? Math.min(100, Math.max(0, ((now.getTime() - start) / (deadline.getTime() - start)) * 100)) : null;
          return (
            <div key={row.id} className={`countdown-card ${tone}`}>
              <div className="countdown-head"><span className="type-tag">{row.type}</span><small>{done ? "Completed" : past ? "Overdue" : "Due"} · {longDate(row.end!)}</small></div>
              <strong className="countdown-name" title={row.description || row.skill}>{row.skill || "Untitled"}</strong>
              {done ? (
                <div className="countdown-clock"><b>✓</b><span>Done</span></div>
              ) : (
                <div className="countdown-clock" aria-label={`${past ? "Overdue by" : "Due in"} ${days} days ${hrs} hours ${mins} minutes`}>
                  {past && <em>−</em>}<b>{days}</b><span>d</span><b>{pad(hrs)}</b><span>h</span><b>{pad(mins)}</b><span>m</span><b>{pad(secs)}</b><span>s</span>
                </div>
              )}
              {elapsed !== null && !done && <i className="countdown-bar" title={`${elapsed.toFixed(0)}% of the time window used`}><b style={{ width: `${elapsed}%` }}/></i>}
            </div>
          );
        })}
      </div>
      {dated.length > COLLAPSED && (
        <button className="text-button countdown-more" onClick={() => setShowAll(!showAll)}>{showAll ? "Show fewer" : `Show all ${dated.length}`}</button>
      )}
    </Panel>
  );
}
