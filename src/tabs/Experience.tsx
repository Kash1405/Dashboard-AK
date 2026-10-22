import { useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon, Panel, PanelTitle } from "../components/ui";
import { careerMonths, formatMonth, formatSpan, monthsBetween, splitLines, splitTags, useExperience, type ExpEntry, type ExpSection } from "../lib/experience";
import { uid } from "../lib/utils";

type Field = { key: keyof ExpEntry; label: string; kind?: "month" | "textarea"; hint?: string; wide?: boolean };

// What each section's editor asks for.
const FIELDS: Record<ExpSection, Field[]> = {
  Summary: [
    { key: "title", label: "Headline", wide: true },
    { key: "org", label: "Profile link", hint: "linkedin.com/in/…" },
    { key: "tags", label: "Focus areas", hint: "Comma-separated" },
    { key: "details", label: "Summary", kind: "textarea", wide: true },
  ],
  Role: [
    { key: "title", label: "Role" },
    { key: "org", label: "Company" },
    { key: "place", label: "Location" },
    { key: "tags", label: "Industries", hint: "Comma-separated" },
    { key: "start", label: "Start", kind: "month" },
    { key: "end", label: "End", kind: "month", hint: "Blank if current" },
    { key: "details", label: "Highlights", kind: "textarea", hint: "One per line · “Label: text” bolds the label", wide: true },
  ],
  Education: [
    { key: "title", label: "Degree / programme" },
    { key: "org", label: "Institution" },
    { key: "place", label: "Location" },
    { key: "start", label: "Start", kind: "month" },
    { key: "end", label: "End", kind: "month", hint: "Blank if current" },
    { key: "details", label: "Highlights", kind: "textarea", hint: "One per line · “Label: text” bolds the label", wide: true },
  ],
  Skill: [
    { key: "title", label: "Category" },
    { key: "tags", label: "Skills", hint: "Comma-separated", wide: true },
  ],
  Certification: [
    { key: "title", label: "Certification" },
    { key: "org", label: "Issuer" },
  ],
  Project: [
    { key: "title", label: "Project" },
    { key: "tags", label: "Tools", hint: "Comma-separated" },
    { key: "details", label: "Description", kind: "textarea", wide: true },
  ],
  Award: [
    { key: "title", label: "Result", hint: "Champion, Finalist…" },
    { key: "org", label: "Event" },
    { key: "start", label: "Year" },
    { key: "tags", label: "My role" },
    { key: "details", label: "What we built", kind: "textarea", wide: true },
  ],
  Beyond: [
    { key: "title", label: "Category" },
    { key: "tags", label: "Chips", hint: "Comma-separated, optional" },
    { key: "details", label: "List", kind: "textarea", hint: "One per line, optional", wide: true },
  ],
};

const blank = (section: ExpSection): ExpEntry => ({ id: uid(), section, title: "", org: "", place: "", start: "", end: "", tags: "", details: "" });
// Current first, then by most recent end date.
const byRecent = (a: ExpEntry, b: ExpEntry) => (b.end || "9999").localeCompare(a.end || "9999") || b.start.localeCompare(a.start);
const period = (e: ExpEntry) => (e.start ? `${formatMonth(e.start)} – ${e.end ? formatMonth(e.end) : "Present"}` : "");
const href = (link: string) => (/^https?:\/\//i.test(link) ? link : `https://${link}`);

// "Label (Domain): text" → bold label, domain chip, text.
function Bullet({ text }: { text: string }) {
  const m = /^([^:]{2,70}):\s+(.+)$/.exec(text);
  if (!m) return <li>{text}</li>;
  const domain = /^(.*?)\s*\(([^)]+)\)$/.exec(m[1]);
  return (
    <li>
      <b>{domain ? domain[1] : m[1]}</b>
      {domain && <span className="exp-domain">{domain[2]}</span>}
      {" "}{m[2]}
    </li>
  );
}

const Bullets = ({ text }: { text: string }) => {
  const items = splitLines(text);
  return items.length ? <ul className="exp-bullets">{items.map((line, i) => <Bullet key={i} text={line}/>)}</ul> : null;
};

const Chips = ({ tags, tone = "" }: { tags: string; tone?: string }) => {
  const items = splitTags(tags);
  return items.length ? <div className={`exp-chips ${tone}`}>{items.map((t) => <span key={t}>{t}</span>)}</div> : null;
};

export default function Experience() {
  const [entries, setEntries] = useExperience();
  const [editing, setEditing] = useState<{ draft: ExpEntry; isNew: boolean } | null>(null);

  const of = (section: ExpSection) => entries.filter((e) => e.section === section);
  const summary = of("Summary")[0];
  const roles = of("Role").sort(byRecent);
  const education = of("Education").sort(byRecent);
  const awards = of("Award").sort((a, b) => b.start.localeCompare(a.start));

  const months = careerMonths(roles);
  const industries = new Set(roles.flatMap((r) => splitTags(r.tags)));
  const skillCount = of("Skill").reduce((sum, s) => sum + splitTags(s.tags).length, 0);
  const stats = [
    { label: "Experience", value: months >= 12 ? (months / 12).toFixed(1) : String(months), unit: months >= 12 ? "yrs" : "mos" },
    { label: "Roles", value: roles.length, unit: `${new Set(roles.map((r) => r.org)).size} companies` },
    { label: "Industries", value: industries.size, unit: [...industries].slice(0, 3).join(" · ") },
    { label: "Skills", value: skillCount, unit: `${of("Certification").length} certifications` },
    { label: "Wins", value: awards.length, unit: "hackathons & awards" },
  ];

  const start = (entry: ExpEntry, isNew = false) => setEditing({ draft: { ...entry }, isNew });
  const save = () => {
    if (!editing) return;
    const { draft, isNew } = editing;
    setEntries(isNew ? [...entries, draft] : entries.map((e) => (e.id === draft.id ? draft : e)));
    setEditing(null);
  };
  const remove = (entry: ExpEntry) => {
    if (window.confirm(`Remove “${entry.title || entry.org || "this entry"}”?`)) setEntries(entries.filter((e) => e.id !== entry.id));
  };
  const add = (section: ExpSection) => start(blank(section), true);
  const addButton = (section: ExpSection, label: string) => (
    <button className="text-button strong" onClick={() => add(section)} disabled={!!editing}><Icon name="plus" size={14}/> {label}</button>
  );

  // Wraps an entry with hover edit/remove buttons, or swaps in the editor when it is being edited.
  const item = (entry: ExpEntry, children: ReactNode, className = "") =>
    editing?.draft.id === entry.id ? (
      <Editor key={entry.id} draft={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} onSave={save} onCancel={() => setEditing(null)}/>
    ) : (
      <div key={entry.id} className={`exp-item ${className}`} onDoubleClick={() => !editing && start(entry)}>
        {children}
        <span className="exp-actions">
          <button className="row-delete" onClick={() => start(entry)} disabled={!!editing} aria-label={`Edit ${entry.title}`}><Icon name="edit" size={14}/></button>
          <button className="row-delete" onClick={() => remove(entry)} aria-label={`Remove ${entry.title}`}><Icon name="trash" size={14}/></button>
        </span>
      </div>
    );
  const newEditor = (section: ExpSection) =>
    editing?.isNew && editing.draft.section === section && (
      <Editor draft={editing.draft} onChange={(draft) => setEditing({ ...editing, draft })} onSave={save} onCancel={() => setEditing(null)}/>
    );

  // Roles at the same company sit together, newest company first.
  const companies: { org: string; roles: ExpEntry[] }[] = [];
  for (const role of roles) {
    const group = companies.find((c) => c.org === role.org);
    if (group) group.roles.push(role);
    else companies.push({ org: role.org, roles: [role] });
  }

  return (
    <main className="page experience-page">
      <div className="welcome">
        <div><p className="eyebrow red">CAREER TELEMETRY</p><h1>Experience & Learning.</h1><p>Every season so far: where I've raced, what I've built, and what I picked up along the way.</p></div>
        <p className="exp-hint">Double-click any card, or use the pencil, to edit it.</p>
      </div>

      <div className="summary-strip exp-stats">
        {stats.map((s) => <div key={s.label}><span>{s.label}</span><strong>{s.value}</strong><em>{s.unit}</em></div>)}
      </div>

      <Panel className="exp-profile">
        {summary ? item(summary, (
          <div className="exp-profile-body">
            <div>
              <p className="eyebrow">DRIVER PROFILE</p>
              <h2>{summary.title || "Add a headline"}</h2>
              {summary.details && <p className="exp-summary">{summary.details}</p>}
            </div>
            <div className="exp-profile-side">
              <Chips tags={summary.tags} tone="red"/>
              {summary.org && <a className="exp-link" href={href(summary.org)} target="_blank" rel="noreferrer"><Icon name="external" size={14}/> {summary.org.replace(/^https?:\/\/(www\.)?/, "")}</a>}
            </div>
          </div>
        )) : newEditor("Summary") || <p className="empty">No profile yet. {addButton("Summary", "Add a profile")}</p>}
      </Panel>

      <div className="exp-grid">
        <div className="exp-main">
          <Panel>
            <PanelTitle eyebrow="01 / RACE HISTORY" title="Career Timeline" action={addButton("Role", "Add role")}/>
            {newEditor("Role")}
            <div className="exp-timeline">
              {companies.map((company) => (
                <div key={company.org} className="exp-company">
                  <div className="exp-company-head">
                    <h3>{company.org || "Company"}</h3>
                    <span>{company.roles[0].place}{company.roles.length > 1 && ` · ${formatSpan(careerMonths(company.roles))}`}</span>
                  </div>
                  {company.roles.map((role) => item(role, (
                    <>
                      <i className={`exp-dot ${role.end ? "" : "live"}`}/>
                      <div className="exp-role-head">
                        <strong>{role.title || "Role"}</strong>
                        <span>{period(role)}{role.start && <em> · {formatSpan(monthsBetween(role.start, role.end))}</em>}</span>
                      </div>
                      <Chips tags={role.tags}/>
                      <Bullets text={role.details}/>
                    </>
                  ), "exp-role"))}
                </div>
              ))}
              {!roles.length && !editing && <p className="empty">No roles yet.</p>}
            </div>
          </Panel>

          <Panel>
            <PanelTitle eyebrow="02 / GARAGE PROJECTS" title="Projects & Research" action={addButton("Project", "Add project")}/>
            {newEditor("Project")}
            <div className="exp-cards">
              {of("Project").map((p) => item(p, (
                <>
                  <strong>{p.title || "Project"}</strong>
                  {p.details && <p>{p.details}</p>}
                  <Chips tags={p.tags}/>
                </>
              ), "exp-card"))}
            </div>
          </Panel>
        </div>

        <div className="exp-side">
          <Panel>
            <PanelTitle eyebrow="03 / TRAINING" title="Education" action={addButton("Education", "Add")}/>
            {newEditor("Education")}
            {education.map((e) => item(e, (
              <>
                <div className="exp-role-head"><strong>{e.org || "Institution"}</strong><span>{period(e)}</span></div>
                <p className="exp-sub">{e.title}{e.place && ` · ${e.place}`}</p>
                <Bullets text={e.details}/>
              </>
            ), "exp-edu"))}
          </Panel>

          <Panel>
            <PanelTitle eyebrow="04 / TOOLKIT" title="Skills" action={addButton("Skill", "Add group")}/>
            {newEditor("Skill")}
            {of("Skill").map((s) => item(s, (
              <>
                <p className="exp-label">{s.title || "Skills"}</p>
                <Chips tags={s.tags}/>
              </>
            ), "exp-skill"))}
            <div className="exp-subhead"><p className="exp-label">Certifications</p>{addButton("Certification", "Add")}</div>
            {newEditor("Certification")}
            {of("Certification").map((c) => item(c, (
              <div className="exp-cert"><Icon name="check" size={14}/><div><strong>{c.title || "Certification"}</strong>{c.org && <span>{c.org}</span>}</div></div>
            )))}
          </Panel>

          <Panel>
            <PanelTitle eyebrow="05 / PODIUMS" title="Hackathons & Awards" action={addButton("Award", "Add")}/>
            {newEditor("Award")}
            {awards.map((a) => item(a, (
              <div className="exp-award">
                <b className="exp-p1">{/champion|winner|1st|first/i.test(a.title) ? "P1" : "★"}</b>
                <div>
                  <div className="exp-role-head"><strong>{a.org || "Event"}</strong><span>{a.start}</span></div>
                  <p className="exp-sub">{[a.title, a.tags].filter(Boolean).join(" · ")}</p>
                  {a.details && <p className="exp-note">{a.details}</p>}
                </div>
              </div>
            )))}
          </Panel>

          <Panel>
            <PanelTitle eyebrow="06 / OFF TRACK" title="Beyond Work" action={addButton("Beyond", "Add")}/>
            {newEditor("Beyond")}
            {of("Beyond").map((b) => item(b, (
              <>
                <p className="exp-label">{b.title || "More"}</p>
                <Chips tags={b.tags}/>
                {splitLines(b.details).length > 0 && <ul className="exp-plain">{splitLines(b.details).map((line, i) => <li key={i}>{line}</li>)}</ul>}
              </>
            ), "exp-skill"))}
          </Panel>
        </div>
      </div>
    </main>
  );
}

function Editor({ draft, onChange, onSave, onCancel }: { draft: ExpEntry; onChange: (draft: ExpEntry) => void; onSave: () => void; onCancel: () => void }) {
  const keys = (event: KeyboardEvent, multiline: boolean) => {
    if (event.key === "Escape") onCancel();
    if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      onSave();
    }
  };
  return (
    <div className="exp-editor">
      {FIELDS[draft.section].map((field, i) => (
        <label key={field.key} className={field.wide || field.kind === "textarea" ? "wide" : ""}>
          <span>{field.label}{field.hint && <small> · {field.hint}</small>}</span>
          {field.kind === "textarea" ? (
            <textarea value={draft[field.key]} rows={Math.min(10, Math.max(3, draft[field.key].split("\n").length + 1))} autoFocus={i === 0}
              onChange={(e) => onChange({ ...draft, [field.key]: e.target.value })} onKeyDown={(e) => keys(e, true)}/>
          ) : (
            <input type={field.kind ?? "text"} value={draft[field.key]} autoFocus={i === 0}
              onChange={(e) => onChange({ ...draft, [field.key]: e.target.value })} onKeyDown={(e) => keys(e, false)}/>
          )}
        </label>
      ))}
      <div className="exp-editor-buttons">
        <button className="primary-button" onClick={onSave}><Icon name="check" size={14}/> Save</button>
        <button className="secondary-button" onClick={onCancel}>Cancel</button>
        <small>Enter saves · ⌘/Ctrl+Enter in long fields · Esc cancels</small>
      </div>
    </div>
  );
}
