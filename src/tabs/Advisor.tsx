import { useEffect, useState } from "react";
import { Icon, Panel, PanelTitle } from "../components/ui";
import { useStored } from "../lib/store";
import { currentBlock } from "../lib/schedule";
import { addDays, dateKey, parseDateKey, relativeDay, timeLabel, uid, useNow } from "../lib/utils";
import {
  useMealLog, useMeals, useMedLog, useMeds, useSchedule, useTracker, useTrackerLog,
  type MealRow, type MedRow, type TrackerCategory,
} from "../lib/vault";

const ratingDefs = [
  { key: "mood", label: "Mood", hint: "How you feel overall", inverse: false },
  { key: "energy", label: "Energy", hint: "Physical & mental fuel", inverse: false },
  { key: "anxiety", label: "Anxiety", hint: "Lower is calmer", inverse: true },
  { key: "sleep", label: "Sleep", hint: "Quality of last night", inverse: false },
  { key: "focus", label: "Focus", hint: "Ability to concentrate", inverse: false },
  { key: "motivation", label: "Motivation", hint: "Drive to get going", inverse: false },
] as const;

type RatingKey = (typeof ratingDefs)[number]["key"];
type Ratings = Record<RatingKey, number>;
type Entry = { date: string; ratings: Ratings; text: string; savedAt: string };
type Draft = { date: string; ratings: Ratings; text: string; basedOn?: string }; // basedOn: savedAt of the entry it was loaded from

const defaultRatings: Ratings = { mood: 5, energy: 5, anxiety: 5, sleep: 5, focus: 5, motivation: 5 };
const prompts = ["One thing I'm grateful for:", "A small win today:", "What I need right now:", "Something I'm letting go of:"];

export default function Advisor() {
  const today = dateKey(useNow(60000));
  const [entries, setEntries] = useStored<Record<string, Entry>>("wellness.entries", {});
  const [draft, setDraft] = useStored<Draft>("wellness.draft", { date: today, ratings: defaultRatings, text: "" });
  const saved = entries[today];

  // Start a fresh check-in each day, and reload the form whenever today's saved entry changes
  // underneath it (synced in from Drive or another device), so the form never shows stale values.
  useEffect(() => {
    if (draft.date !== today || (saved?.savedAt ?? "") !== (draft.basedOn ?? "")) {
      setDraft({ date: today, ratings: saved?.ratings ?? defaultRatings, text: saved?.text ?? "", basedOn: saved?.savedAt });
    }
  }, [today, draft.date, draft.basedOn, saved, setDraft]);

  const dirty = !saved || saved.text !== draft.text.trim() || ratingDefs.some((r) => saved.ratings[r.key] !== draft.ratings[r.key]);
  const save = () => {
    const savedAt = new Date().toISOString();
    setDraft({ ...draft, basedOn: savedAt });
    setEntries({ ...entries, [today]: { date: today, ratings: draft.ratings, text: draft.text.trim(), savedAt } });
  };
  const addPrompt = (prompt: string) => setDraft({ ...draft, text: `${draft.text}${draft.text && !draft.text.endsWith("\n") ? "\n" : ""}${prompt} ` });
  const { current, longest } = streaks(entries, today);

  return (
    <main className="page advisor-page">
      <div className="welcome">
        <div><p className="eyebrow red">DRIVER WELLBEING</p><h1>Advisor.</h1><NowOnSchedule/></div>
        <div className="streak"><Icon name="bolt"/><div><strong>{current} day streak</strong><span>Longest: {longest} {longest === 1 ? "day" : "days"}</span></div></div>
      </div>

      <div className="wellness-grid">
        <div className="wellness-main">
          <Panel className="checkin-card">
            <PanelTitle eyebrow="DAILY CHECK-IN" title="How are you arriving today?" action={<span className="progress-label">1 = low · 10 = high</span>}/>
            <div className="ratings">
              {ratingDefs.map((r) => (
                <div className="rating" key={r.key}>
                  <div><strong>{r.label}</strong><span>{r.hint}</span><b className={tone(draft.ratings[r.key], r.inverse)}>{draft.ratings[r.key]}<small>/10</small></b></div>
                  <input type="range" min="1" max="10" value={draft.ratings[r.key]} aria-label={`${r.label} rating`} onChange={(event) => setDraft({ ...draft, ratings: { ...draft.ratings, [r.key]: Number(event.target.value) } })}/>
                </div>
              ))}
            </div>
            <label className="reflection-label" htmlFor="reflection">Reflection: what is taking up the most space in your mind?</label>
            <textarea id="reflection" className="reflection-input" value={draft.text} onChange={(event) => setDraft({ ...draft, text: event.target.value })} placeholder="Write freely. Only you can see this..."/>
            <div className="prompt-chips">{prompts.map((prompt) => <button key={prompt} onClick={() => addPrompt(prompt)}>+ {prompt.replace(":", "")}</button>)}</div>
            <div className="reflection-footer">
              <span>{saved ? (dirty ? "Unsaved changes" : `Saved at ${timeLabel(new Date(saved.savedAt))}`) : "Not saved yet today"} · {draft.text.trim() ? draft.text.trim().split(/\s+/).length : 0} words</span>
              <button className="primary-button" onClick={save} disabled={!dirty}>{saved ? "Update check-in" : "Save check-in"} <Icon name="check" size={14}/></button>
            </div>
          </Panel>

          <DailyTracker/>
          <PastReflections entries={entries} today={today}/>
        </div>

        <aside className="wellness-side">
          <TodaysMeds/>
          <MealPlan/>
          <Insights entries={entries} today={today}/>
          <p className="care-note">This is a personal journal, not medical advice. Follow your prescriber’s instructions, and if things feel heavy, reach out to a professional or someone you trust.</p>
        </aside>
      </div>
    </main>
  );
}

function tone(value: number, inverse: boolean) {
  const v = inverse ? 11 - value : value;
  return v >= 7 ? "good" : v <= 3 ? "low" : "";
}

function streaks(entries: Record<string, Entry>, today: string) {
  let current = 0;
  let day = entries[today] ? parseDateKey(today) : addDays(parseDateKey(today), -1);
  while (entries[dateKey(day)]) {
    current++;
    day = addDays(day, -1);
  }
  const dates = Object.keys(entries).sort();
  let longest = 0;
  let run = 0;
  dates.forEach((d, i) => {
    run = i > 0 && dateKey(addDays(parseDateKey(dates[i - 1]), 1)) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return { current, longest };
}

// ---------- Schedule ----------

function NowOnSchedule() {
  const now = useNow(30000);
  const [schedule] = useSchedule();
  const { current, next } = currentBlock(schedule, now);
  if (!schedule.length) return <span>Take two minutes. There are no wrong answers.</span>;
  return (
    <span className="now-line">
      {current ? <>Now: <b>{current.activity}</b> until {current.end}</> : "Between blocks"}
      {next && next !== current && <> · Next: {next.activity} at {next.start}</>}
    </span>
  );
}

// ---------- Meals ----------

function MealPlan() {
  const today = dateKey();
  const [meals, setMeals] = useMeals();
  const [log, setLog] = useMealLog();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const eaten = log[today] ?? {};
  const toggle = (id: string) => setLog({ ...log, [today]: { ...eaten, [id]: !eaten[id] } });
  const update = (id: string, patch: Partial<MealRow>) => setMeals(meals.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const count = meals.filter((meal) => eaten[meal.id]).length;
  return (
    <Panel className="compact-card">
      <PanelTitle eyebrow={`NUTRITION · ${count}/${meals.length} TODAY`} title="Meal plan" action={<EditToggle editing={editing} onToggle={() => setEditing(!editing)}/>}/>
      <div className="compact-list">
        {meals.map((meal) => editing ? (
          <div className="compact-edit" key={meal.id}>
            <input value={meal.meal} onChange={(e) => update(meal.id, { meal: e.target.value })} placeholder="Meal" aria-label="Meal name"/>
            <textarea value={meal.details} onChange={(e) => update(meal.id, { details: e.target.value })} placeholder="Details" aria-label="Meal details" rows={2}/>
            <button className="row-delete" onClick={() => window.confirm(`Remove “${meal.meal || "this meal"}”?`) && setMeals(meals.filter((m) => m.id !== meal.id))} aria-label={`Remove ${meal.meal}`}><Icon name="trash" size={13}/></button>
          </div>
        ) : (
          <div className={`compact-row ${eaten[meal.id] ? "done" : ""}`} key={meal.id}>
            <button className="checkbox" onClick={() => toggle(meal.id)} aria-label={`Mark ${meal.meal} ${eaten[meal.id] ? "not eaten" : "eaten"}`}>{eaten[meal.id] && <Icon name="check" size={12}/>}</button>
            <div onClick={() => setOpen(open === meal.id ? null : meal.id)}>
              <strong>{meal.meal}</strong>
              <span className={open === meal.id ? "open" : ""}>{meal.details}</span>
            </div>
          </div>
        ))}
        {meals.length === 0 && <p className="empty">No meals yet.</p>}
      </div>
      {editing && <button className="table-add small" onClick={() => setMeals([...meals, { id: uid(), meal: "", details: "" }])}><Icon name="plus" size={13}/> Add meal</button>}
    </Panel>
  );
}

function EditToggle({ editing, onToggle }: { editing: boolean; onToggle: () => void }) {
  return <button className={`text-button ${editing ? "strong" : ""}`} onClick={onToggle}><Icon name={editing ? "check" : "edit"} size={14}/> {editing ? "Done" : "Edit"}</button>;
}

// ---------- Medication ----------

function TodaysMeds() {
  const today = dateKey();
  const [meds, setMeds] = useMeds();
  const [log, setLog] = useMedLog();
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const takenToday = log[today] ?? {};
  const sorted = editing ? meds : [...meds].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  const toggleTaken = (id: string) => {
    const day = { ...takenToday };
    if (day[id]) delete day[id];
    else day[id] = timeLabel(new Date());
    setLog({ ...log, [today]: day });
  };
  const update = (id: string, patch: Partial<MedRow>) => setMeds(meds.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  let expected = 0;
  let taken = 0;
  for (let i = 1; i <= 7; i++) {
    const day = dateKey(addDays(new Date(), -i));
    if (!log[day]) continue; // only count days the tracker was used
    for (const med of meds) {
      expected++;
      if (log[day][med.id]) taken++;
    }
  }
  const adherence = expected ? Math.round((taken / expected) * 100) : null;

  return (
    <Panel className="medication-card">
      <PanelTitle eyebrow={`MEDICATION · ${Object.keys(takenToday).length}/${meds.length} TAKEN`} title="Today’s doses" action={<EditToggle editing={editing} onToggle={() => setEditing(!editing)}/>}/>
      <div className="med-list">
        {sorted.map((med) => editing ? (
          <div className="med-edit" key={med.id}>
            <input value={med.name} onChange={(e) => update(med.id, { name: e.target.value })} placeholder="Medication" aria-label="Medication name"/>
            <input value={med.dose} onChange={(e) => update(med.id, { dose: e.target.value })} placeholder="Dose" aria-label="Dose"/>
            <input type="time" value={med.time} onChange={(e) => update(med.id, { time: e.target.value })} aria-label="Time"/>
            <button className="row-delete" onClick={() => window.confirm(`Remove ${med.name || "this medication"}?`) && setMeds(meds.filter((m) => m.id !== med.id))} aria-label={`Remove ${med.name}`}><Icon name="trash" size={13}/></button>
            <textarea value={med.role} onChange={(e) => update(med.id, { role: e.target.value })} placeholder="What it is for" aria-label="Purpose" rows={2}/>
            <textarea value={med.sideEffects} onChange={(e) => update(med.id, { sideEffects: e.target.value })} placeholder="Common side effects" aria-label="Side effects" rows={2}/>
          </div>
        ) : (
          <div className={`med ${takenToday[med.id] ? "taken" : ""}`} key={med.id}>
            <div className="med-icon"><Icon name="pill" size={16}/></div>
            <div className="med-info" onClick={() => setOpen(open === med.id ? null : med.id)} title="Show details">
              <strong>{med.name}</strong>
              <span>{[med.dose, med.time].filter(Boolean).join(" · ") || "No details"}</span>
              {open === med.id && (med.role || med.sideEffects) && (
                <p className="med-details">{med.role && <><b>For:</b> {med.role}<br/></>}{med.sideEffects && <><b>Side effects:</b> {med.sideEffects}</>}</p>
              )}
            </div>
            <div className="med-actions">
              {takenToday[med.id]
                ? <button className="taken-button" onClick={() => toggleTaken(med.id)} title="Click to undo"><Icon name="check" size={13}/> {takenToday[med.id]}</button>
                : <button onClick={() => toggleTaken(med.id)}>Taken</button>}
            </div>
          </div>
        ))}
        {meds.length === 0 && <p className="empty">No medication listed. Use Edit to add some.</p>}
      </div>
      {editing && <button className="table-add small" onClick={() => setMeds([...meds, { id: uid(), name: "", dose: "", role: "", sideEffects: "", time: "" }])}><Icon name="plus" size={13}/> Add medication</button>}
      {!editing && meds.length > 0 && (
        <div className="adherence">
          <span>7 DAY ADHERENCE <b>{adherence === null ? "—" : `${adherence}%`}</b></span>
          <i><b style={{ width: `${adherence ?? 0}%` }}/></i>
        </div>
      )}
    </Panel>
  );
}

// ---------- Daily tracker ----------

function DailyTracker() {
  const today = dateKey();
  const [day, setDay] = useState(today);
  const [categories, setCategories] = useTracker();
  const [log, setLog] = useTrackerLog();
  const [editing, setEditing] = useState(false);
  const entry = log[day] ?? {};

  const setItem = (id: string, patch: Partial<{ done: boolean; note: string }>) => {
    const current = entry[id] ?? { done: false, note: "" };
    setLog({ ...log, [day]: { ...entry, [id]: { ...current, ...patch } } });
  };
  const updateCategory = (id: string, change: (c: TrackerCategory) => TrackerCategory) => setCategories(categories.map((c) => (c.id === id ? change(c) : c)));
  const shift = (n: number) => {
    const next = dateKey(addDays(parseDateKey(day), n));
    if (next <= today) setDay(next);
  };
  const history = Array.from({ length: 14 }, (_, i) => dateKey(addDays(parseDateKey(today), i - 13)));
  // A domain counts as done for the day as soon as any one of its items is ticked.
  const domainDone = (date: string, category: TrackerCategory) => category.items.some((item) => log[date]?.[item.id]?.done);
  const total = categories.length;
  const done = categories.filter((c) => domainDone(day, c)).length;

  return (
    <Panel className="tracker-card">
      <PanelTitle eyebrow="DAILY TRACKER" title="Learning · Work · Health" action={
        <div className="tracker-head">
          <div className="month-arrows">
            <button onClick={() => shift(-1)} aria-label="Previous day">‹</button>
            <button className="today-button" onClick={() => setDay(today)}>{relativeDay(parseDateKey(day))}</button>
            <button onClick={() => shift(1)} aria-label="Next day" disabled={day === today}>›</button>
          </div>
          <button className={`text-button ${editing ? "strong" : ""}`} onClick={() => setEditing(!editing)}><Icon name={editing ? "check" : "edit"} size={14}/> {editing ? "Done" : "Edit items"}</button>
        </div>
      }/>
      <div className={`tracker-total ${total && done === total ? "all" : ""}`}><span>{done} of {total} domains</span><i><b style={{ width: `${total ? (done / total) * 100 : 0}%` }}/></i></div>
      <div className="tracker-grid">
        {categories.map((category) => {
          const complete = domainDone(day, category);
          return (
            <div className={`tracker-cat ${complete ? "complete" : ""}`} key={category.id}>
              <div className="tracker-cat-head">
                {editing
                  ? <input value={category.name} onChange={(e) => updateCategory(category.id, (c) => ({ ...c, name: e.target.value }))} aria-label="Category name"/>
                  : <h3>{category.name}</h3>}
                {!editing && <span className="domain-badge">{complete ? <><Icon name="check" size={12}/> Done</> : "—"}</span>}
                {editing && <button className="row-delete" onClick={() => window.confirm(`Remove the “${category.name}” category?`) && setCategories(categories.filter((c) => c.id !== category.id))} aria-label={`Remove ${category.name}`}><Icon name="trash" size={13}/></button>}
              </div>
              {category.items.map((item) => {
                const state = entry[item.id] ?? { done: false, note: "" };
                return (
                  <div className={`tracker-item ${state.done ? "done" : ""}`} key={item.id}>
                    {editing ? (
                      <>
                        <input className="item-name" value={item.label} aria-label="Item name" onChange={(e) => updateCategory(category.id, (c) => ({ ...c, items: c.items.map((it) => (it.id === item.id ? { ...it, label: e.target.value } : it)) }))}/>
                        <button className="row-delete" onClick={() => updateCategory(category.id, (c) => ({ ...c, items: c.items.filter((it) => it.id !== item.id) }))} aria-label={`Remove ${item.label}`}><Icon name="x" size={13}/></button>
                      </>
                    ) : (
                      <>
                        <button className="checkbox" onClick={() => setItem(item.id, { done: !state.done })} aria-label={`${state.done ? "Uncheck" : "Check"} ${item.label}`}>{state.done && <Icon name="check" size={12}/>}</button>
                        <span className="task-name" onClick={() => setItem(item.id, { done: !state.done })}>{item.label}</span>
                        <input className="item-note" value={state.note} onChange={(e) => setItem(item.id, { note: e.target.value })} placeholder="note / hrs" aria-label={`${item.label} note`}/>
                      </>
                    )}
                  </div>
                );
              })}
              {editing && <button className="table-add small" onClick={() => updateCategory(category.id, (c) => ({ ...c, items: [...c.items, { id: uid(), label: "New item" }] }))}><Icon name="plus" size={13}/> Add item</button>}
            </div>
          );
        })}
      </div>
      {editing && <button className="table-add" onClick={() => setCategories([...categories, { id: uid(), name: "New category", items: [] }])}><Icon name="plus" size={14}/> Add category</button>}
      {!editing && categories.length > 0 && (
        <div className="tracker-history" aria-label="Last 14 days">
          <div className="history-row labels"><span/>{history.map((d) => <em key={d} className={d === day ? "sel" : ""}>{parseDateKey(d).getDate()}</em>)}</div>
          {categories.map((category) => (
            <div className="history-row" key={category.id}>
              <span>{category.name}</span>
              {history.map((d) => {
                const ok = domainDone(d, category);
                return <button key={d} onClick={() => setDay(d)} title={`${d}: ${ok ? "done" : "not done"}`} className={`${d === day ? "sel" : ""} ${ok ? "ok" : ""}`}/>;
              })}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

// ---------- Insights & history ----------

function Insights({ entries, today }: { entries: Record<string, Entry>; today: string }) {
  const week = Array.from({ length: 7 }, (_, i) => dateKey(addDays(parseDateKey(today), i - 6)));
  const avg = (days: string[]) => {
    const values = days.map((d) => entries[d]?.ratings.mood).filter((v): v is number => v !== undefined);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };
  const thisWeek = avg(week);
  const lastWeek = avg(Array.from({ length: 7 }, (_, i) => dateKey(addDays(parseDateKey(today), i - 13))));
  const all = Object.values(entries);
  const goodSleep = all.filter((e) => e.ratings.sleep >= 7);
  const poorSleep = all.filter((e) => e.ratings.sleep < 7);
  const mean = (list: Entry[]) => list.reduce((sum, e) => sum + e.ratings.mood, 0) / list.length;
  let insight = "Check in for a few days to unlock patterns in your data.";
  if (goodSleep.length >= 2 && poorSleep.length >= 2) {
    const delta = mean(goodSleep) - mean(poorSleep);
    insight = Math.abs(delta) < 0.5 ? "Your mood looks steady regardless of sleep quality." : `Your mood averages ${Math.abs(delta).toFixed(1)} points ${delta > 0 ? "higher" : "lower"} after good sleep (7+).`;
  } else if (all.length >= 3) {
    const best = ratingDefs.filter((r) => !r.inverse).map((r) => ({ r, v: all.reduce((s, e) => s + e.ratings[r.key], 0) / all.length })).sort((a, b) => b.v - a.v)[0];
    insight = `Your strongest area lately is ${best.r.label.toLowerCase()} (avg ${best.v.toFixed(1)}/10).`;
  }

  return (
    <Panel className="insight-card">
      <PanelTitle eyebrow="7 DAY INSIGHT" title="Your Pattern"/>
      <div className="insight-stat">
        <strong>{thisWeek === null ? "—" : thisWeek.toFixed(1)}</strong>
        <span>
          Average mood this week
          {thisWeek !== null && lastWeek !== null && <b className={thisWeek >= lastWeek ? "up" : "down"}> ({thisWeek >= lastWeek ? "+" : "−"}{Math.abs(thisWeek - lastWeek).toFixed(1)} vs last week)</b>}
        </span>
      </div>
      <div className="mood-bars">
        {week.map((d) => {
          const mood = entries[d]?.ratings.mood;
          return (
            <div key={d} title={mood ? `Mood ${mood}/10` : "No check-in"}>
              <em>{mood ?? ""}</em>
              <i style={{ height: `${(mood ?? 0) * 10}%` }} className={mood ? "" : "missing"}/>
              <span>{parseDateKey(d).toLocaleDateString(undefined, { weekday: "narrow" })}</span>
            </div>
          );
        })}
      </div>
      <p><i/> {insight}</p>
    </Panel>
  );
}

function PastReflections({ entries, today }: { entries: Record<string, Entry>; today: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const past = Object.values(entries).filter((e) => e.date !== today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (!past.length) return null;
  return (
    <Panel className="history-card">
      <PanelTitle eyebrow="JOURNAL" title="Previous check-ins"/>
      <div className="history-list">
        {past.map((entry) => (
          <button className={`history-item ${open === entry.date ? "open" : ""}`} key={entry.date} onClick={() => setOpen(open === entry.date ? null : entry.date)}>
            <div className="history-top">
              <strong>{relativeDay(parseDateKey(entry.date))}</strong>
              <span>{ratingDefs.map((r) => `${r.label} ${entry.ratings[r.key]}`).join(" · ")}</span>
            </div>
            <p>{entry.text || "No written reflection."}</p>
          </button>
        ))}
      </div>
    </Panel>
  );
}
