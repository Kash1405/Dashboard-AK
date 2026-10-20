import { useState } from "react";
import EditableTable from "../components/EditableTable";
import { Panel, PanelTitle } from "../components/ui";
import { dateKey, parseDateKey, uid } from "../lib/utils";
import { useGoalTable, type GoalRow, type GoalStatus } from "../lib/vault";

const statuses: GoalStatus[] = ["Not Started", "In Progress", "Done", "On Hold", "Overdue"];
const statusClass = (status: string) => status.toLowerCase().replace(/\s+/g, "-");
const shortDate = (key?: string) => (key ? parseDateKey(key).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

export default function Goals() {
  const [rows, setRows] = useGoalTable();
  const [typeFilter, setTypeFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [query, setQuery] = useState("");

  const types = [...new Set(rows.map((row) => row.type).filter(Boolean))];
  const counts = Object.fromEntries(statuses.map((s) => [s, rows.filter((row) => row.status === s).length])) as Record<GoalStatus, number>;
  const progress = rows.length ? ((counts.Done + counts["In Progress"] * 0.5) / rows.length) * 100 : 0;
  const q = query.trim().toLowerCase();
  const visible = rows.filter((row) =>
    (typeFilter === "All" || row.type === typeFilter) &&
    (statusFilter === "All" || row.status === statusFilter) &&
    (!q || [row.skill, row.description, row.comments, row.type].some((text) => text.toLowerCase().includes(q))),
  );

  // Edits happen on the filtered view; merge them back into the full list in order.
  const applyVisible = (next: GoalRow[]) => {
    const nextById = new Map(next.map((row) => [row.id, row]));
    const kept = rows.filter((row) => !visible.some((v) => v.id === row.id) || nextById.has(row.id)).map((row) => nextById.get(row.id) ?? row);
    const added = next.filter((row) => !rows.some((r) => r.id === row.id));
    setRows([...kept, ...added]);
  };
  const cycleStatus = (row: GoalRow) => {
    const next = statuses[(statuses.indexOf(row.status) + 1) % statuses.length];
    setRows(rows.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
  };

  return (
    <main className="page">
      <div className="welcome">
        <div><p className="eyebrow red">CHAMPIONSHIP STANDINGS</p><h1>Goals & Skills.</h1><p>Everything you are building, in one season plan.</p></div>
      </div>

      <div className="goal-stats">
        <div><span>Season progress</span><strong>{progress.toFixed(0)}%</strong><i><b style={{ width: `${progress}%` }}/></i></div>
        {statuses.map((status) => (
          <button key={status} className={`goal-stat ${statusFilter === status ? "active" : ""}`} onClick={() => setStatusFilter(statusFilter === status ? "All" : status)}>
            <span>{status}</span><strong className={`tone-${statusClass(status)}`}>{counts[status]}</strong>
          </button>
        ))}
      </div>

      <Panel className="goals-table-panel">
        <PanelTitle eyebrow="SKILLS & GOALS" title={`${visible.length} of ${rows.length} items`} action={
          <input className="search-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search…" aria-label="Search goals"/>
        }/>
        <div className="filter-chips">
          {["All", ...types].map((type) => <button key={type} className={typeFilter === type ? "active" : ""} onClick={() => setTypeFilter(type)}>{type}</button>)}
          {statusFilter !== "All" && <button className="active" onClick={() => setStatusFilter("All")}>{statusFilter} ×</button>}
        </div>
        <EditableTable<GoalRow>
          rows={visible}
          onChange={applyVisible}
          addLabel="Add skill or goal"
          itemName={(row) => row.skill}
          numbered
          empty="No items match. Add one below."
          newRow={() => {
            setQuery("");
            return { id: uid(), type: typeFilter !== "All" ? typeFilter : "Hard Skill", skill: "", description: "", comments: "", start: dateKey(), end: "", status: statusFilter !== "All" ? (statusFilter as GoalStatus) : "Not Started" };
          }}
          columns={[
            { key: "type", label: "Type", width: "120px", suggestions: ["Soft Skill", "Hard Skill", "Hard Goal", ...types], render: (row) => <span className="type-tag">{row.type}</span> },
            { key: "skill", label: "Skill / Goal", width: "190px", render: (row) => <strong className="cell-strong">{row.skill || "—"}</strong> },
            { key: "description", label: "Description", kind: "textarea" },
            { key: "comments", label: "Comments", kind: "textarea" },
            { key: "start", label: "Start", kind: "date", width: "125px", render: (row) => <span className="cell-text">{shortDate(row.start)}</span> },
            { key: "end", label: "End", kind: "date", width: "125px", render: (row) => <span className="cell-text">{shortDate(row.end)}</span> },
            { key: "status", label: "Status", kind: "select", options: statuses, width: "130px", render: (row) => (
              <button className={`status-pill ${statusClass(row.status)}`} onClick={() => cycleStatus(row)} title="Click to change status">{row.status}</button>
            ) },
          ]}
        />
        <p className="table-hint">Double-click a row or use the pencil to edit. Click a status to cycle it.</p>
      </Panel>
    </main>
  );
}
