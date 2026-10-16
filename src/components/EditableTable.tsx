import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "./ui";

export type Column<T> = {
  key: keyof T & string;
  label: string;
  kind?: "text" | "textarea" | "select" | "time";
  options?: string[];
  suggestions?: string[];
  width?: string;
  render?: (row: T) => ReactNode;
};

type Props<T extends { id: string }> = {
  columns: Column<T>[];
  rows: T[];
  onChange: (rows: T[]) => void;
  newRow: () => T;
  addLabel: string;
  itemName: (row: T) => string;
  leading?: { label: string; render: (row: T) => ReactNode };
  numbered?: boolean;
  rowClass?: (row: T) => string;
  empty?: string;
};

export default function EditableTable<T extends { id: string }>({ columns, rows, onChange, newRow, addLabel, itemName, leading, numbered, rowClass, empty }: Props<T>) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const [isNew, setIsNew] = useState(false);

  const startEdit = (row: T) => {
    setEditingId(row.id);
    setDraft({ ...row });
    setIsNew(false);
  };
  const add = () => {
    const row = newRow();
    onChange([...rows, row]);
    setEditingId(row.id);
    setDraft(row);
    setIsNew(true);
  };
  const cancel = () => {
    if (isNew && editingId) onChange(rows.filter((row) => row.id !== editingId));
    setEditingId(null);
    setDraft(null);
  };
  const save = () => {
    if (draft) onChange(rows.map((row) => (row.id === draft.id ? draft : row)));
    setEditingId(null);
    setDraft(null);
  };
  const remove = (row: T) => {
    if (window.confirm(`Remove “${itemName(row) || "this row"}”?`)) onChange(rows.filter((item) => item.id !== row.id));
  };
  const listId = (key: string) => `suggest-${key}`;

  return (
    <div className="edit-table">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {numbered && <th className="num">#</th>}
              {leading && <th className="lead">{leading.label}</th>}
              {columns.map((column) => <th key={column.key} style={column.width ? { width: column.width } : undefined}>{column.label}</th>)}
              <th className="actions"/>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const editing = editingId === row.id && draft;
              return (
                <tr key={row.id} className={`${editing ? "editing" : ""} ${rowClass?.(row) ?? ""}`} onDoubleClick={() => !editing && startEdit(row)}>
                  {numbered && <td className="num">{index + 1}</td>}
                  {leading && <td className="lead">{leading.render(row)}</td>}
                  {columns.map((column) => (
                    <td key={column.key}>
                      {editing ? (
                        <Field column={column} value={String(draft[column.key] ?? "")} listId={listId(column.key)} autoFocus={column === columns[0]}
                          onChange={(value) => setDraft({ ...draft, [column.key]: value })}
                          onEnter={save} onEscape={cancel}/>
                      ) : column.render ? column.render(row) : <span className="cell-text">{String(row[column.key] ?? "") || "—"}</span>}
                    </td>
                  ))}
                  <td className="actions">
                    {editing ? (
                      <span>
                        <button className="row-save" onClick={save} aria-label="Save row"><Icon name="check" size={14}/></button>
                        <button className="row-delete" onClick={cancel} aria-label="Cancel editing"><Icon name="x" size={14}/></button>
                      </span>
                    ) : (
                      <span>
                        <button className="row-delete" onClick={() => startEdit(row)} aria-label={`Edit ${itemName(row)}`}><Icon name="edit" size={14}/></button>
                        <button className="row-delete" onClick={() => remove(row)} aria-label={`Remove ${itemName(row)}`}><Icon name="trash" size={14}/></button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="empty padded">{empty ?? "Nothing here yet."}</p>}
      </div>
      {columns.filter((column) => column.suggestions).map((column) => (
        <datalist key={column.key} id={listId(column.key)}>{[...new Set(column.suggestions)].map((s) => <option key={s} value={s}/>)}</datalist>
      ))}
      <button className="table-add" onClick={add} disabled={!!editingId}><Icon name="plus" size={14}/> {addLabel}</button>
    </div>
  );
}

function Field<T>({ column, value, listId, autoFocus, onChange, onEnter, onEscape }: { column: Column<T>; value: string; listId: string; autoFocus: boolean; onChange: (v: string) => void; onEnter: () => void; onEscape: () => void }) {
  const keys = (event: KeyboardEvent) => {
    if (event.key === "Escape") onEscape();
    if (event.key === "Enter" && (column.kind !== "textarea" || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onEnter();
    }
  };
  if (column.kind === "textarea") return <textarea value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={keys} aria-label={column.label} rows={3} autoFocus={autoFocus}/>;
  if (column.kind === "select") return (
    <select value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={keys} aria-label={column.label} autoFocus={autoFocus}>
      {column.options!.map((option) => <option key={option}>{option}</option>)}
    </select>
  );
  return <input type={column.kind === "time" ? "time" : "text"} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={keys} aria-label={column.label} list={column.suggestions ? listId : undefined} autoFocus={autoFocus}/>;
}
