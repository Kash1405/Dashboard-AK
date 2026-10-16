import { currentBlock, toMinutes } from "../lib/schedule";
import { uid, useNow } from "../lib/utils";
import { useSchedule, type ScheduleRow } from "../lib/vault";
import EditableTable from "./EditableTable";
import { Panel, PanelTitle } from "./ui";

export default function ScheduleTable() {
  const now = useNow(30000);
  const [schedule, setSchedule] = useSchedule();
  const { current } = currentBlock(schedule, now);
  const sorted = [...schedule].sort((a, b) => (a.start || "99").localeCompare(b.start || "99"));
  const minutes = now.getHours() * 60 + now.getMinutes();
  const isPast = (row: ScheduleRow) => !!row.end && row !== current && toMinutes(row.end) <= minutes;
  const progress = current ? ((minutes - toMinutes(current.start)) / Math.max(toMinutes(current.end) - toMinutes(current.start), 1)) * 100 : 0;
  return (
    <Panel className="advisor-table">
      <PanelTitle eyebrow="DAILY SCHEDULE" title="Schedule" action={<span className="progress-label">Sorted by start time</span>}/>
      <EditableTable<ScheduleRow>
        rows={sorted}
        onChange={setSchedule}
        addLabel="Add time block"
        itemName={(row) => row.activity}
        rowClass={(row) => (row === current ? "row-now" : isPast(row) ? "row-past" : "")}
        newRow={() => ({ id: uid(), start: "", end: "", activity: "", description: "" })}
        columns={[
          { key: "start", label: "Start", kind: "time", width: "96px", render: (row) => <span className="cell-time">{row.start || "—"}{row === current && <em>NOW</em>}</span> },
          { key: "end", label: "End", kind: "time", width: "96px", render: (row) => <span className="cell-time">{row.end || "—"}</span> },
          { key: "activity", label: "Activity", width: "200px", render: (row) => (
            <>
              <strong className="cell-strong">{row.activity || "—"}</strong>
              {row === current && <i className="row-progress" title={`${Math.round(progress)}% through`}><b style={{ width: `${progress}%` }}/></i>}
            </>
          ) },
          { key: "description", label: "Description / reasoning", kind: "textarea" },
        ]}
      />
    </Panel>
  );
}
