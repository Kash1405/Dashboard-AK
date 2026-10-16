import { Fragment, useEffect, useMemo, useState } from "react";
import { Donut, Icon, Panel, PanelTitle, Sparkline } from "../components/ui";
import { cars } from "../lib/cars";
import { googleClientId, hasEnvClientId, useGoogleClientId } from "../lib/google";
import { authorize, createGoogleEvent, deleteGoogleEvent, disconnectGoogle, hasToken, preloadGoogle, syncGoogle, useGcalEvents, useGcalSettings, useGcalStatus } from "../lib/gcal";
import { currentBlock } from "../lib/schedule";
import { useSchedule } from "../lib/vault";
import { quotes, useDailyTasks, useEvents, useGoals, useNotes, useSettings, type Tab } from "../lib/data";
import { allocation, derive, totals, useHoldings, useMoney, useSnapshots, type Holding } from "../lib/portfolio";
import { addDays, atTime, dateKey, pad, parseDateKey, pct, relativeDay, submitOnEnter, timeLabel, uid, useNow } from "../lib/utils";


export default function Overview({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const now = useNow(1000);
  return (
    <main className="page">
      <Welcome now={now}/>
      <div className="overview-grid">
        <div className="main-column">
          <NextUp now={now}/>
          <RunPlan/>
        </div>
        <aside className="side-column">
          <CalendarPanel/>
          <NotesPanel/>
          <QuotePanel/>
        </aside>
      </div>
      <PortfolioSummary onNavigate={onNavigate}/>
    </main>
  );
}

function Welcome({ now }: { now: Date }) {
  const [settings, setSettings] = useSettings();
  const [editing, setEditing] = useState(false);
  const hour = now.getHours();
  const greeting = hour < 5 ? "Late night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()?.replace(/_/g, " ");
  return (
    <div className="welcome">
      <div>
        <p className="eyebrow red">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase()}</p>
        {editing ? (
          <form className="name-form" onSubmit={(event) => { event.preventDefault(); setEditing(false); }}>
            <input autoFocus value={settings.name} onChange={(event) => setSettings({ ...settings, name: event.target.value })} onBlur={() => setEditing(false)} placeholder="Your name" aria-label="Your name"/>
          </form>
        ) : (
          <h1>
            {greeting}{settings.name ? `, ${settings.name}` : ""}.
            <button className="inline-edit" onClick={() => setEditing(true)} aria-label="Edit your name" title="Edit your name"><Icon name="edit" size={16}/></button>
          </h1>
        )}
        <p>Everything you need for a fast, focused day.</p>
      </div>
      <div className="time-block">
        <strong>{pad(now.getHours())}:{pad(now.getMinutes())}<small>:{pad(now.getSeconds())}</small></strong>
        <span>{zone}</span>
      </div>
    </div>
  );
}

type Upcoming = { key: string; kind: "Calendar event" | "Daily task"; title: string; at: Date; allDay: boolean };

function useUpcoming(now: Date) {
  const [localEvents] = useEvents();
  const [googleEvents] = useGcalEvents();
  const [gcal] = useGcalSettings();
  const [tasks] = useDailyTasks();
  const events = useMemo(() => [...localEvents, ...(gcal.enabled ? googleEvents : [])], [localEvents, googleEvents, gcal.enabled]);
  const minute = Math.floor(now.getTime() / 60000);
  return useMemo(() => {
    const current = new Date();
    const today = dateKey(current);
    const items: Upcoming[] = [];
    for (const event of events) {
      if (event.date < today) continue;
      const at = atTime(event.date, event.time || undefined);
      if (event.time && at <= current) continue;
      items.push({ key: `e${event.id}`, kind: "Calendar event", title: event.title, at, allDay: !event.time });
    }
    for (const task of tasks) {
      if (!task.time) continue;
      let at = atTime(today, task.time);
      if (at <= current || task.done) at = addDays(at, 1);
      items.push({ key: `t${task.id}`, kind: "Daily task", title: task.text, at, allDay: false });
    }
    return items.sort((a, b) => a.at.getTime() - b.at.getTime());
    // Recompute once a minute, or whenever events/tasks change.
  }, [events, tasks, minute]);
}

function NextUp({ now }: { now: Date }) {
  const upcoming = useUpcoming(now);
  const [image, setImage] = useState(0);
  useEffect(() => {
    const rotation = window.setInterval(() => setImage((current) => (current + 1) % cars.length), 7000);
    return () => window.clearInterval(rotation);
  }, []);
  const [schedule] = useSchedule();
  const block = currentBlock(schedule, now).current;
  const next = upcoming[0];
  const diff = next ? Math.max(0, next.at.getTime() - now.getTime()) : 0;
  const days = Math.floor(diff / 86400000);
  const units: [number, string][] = days > 0
    ? [[days, "DAYS"], [Math.floor(diff / 3600000) % 24, "HRS"], [Math.floor(diff / 60000) % 60, "MIN"]]
    : [[Math.floor(diff / 3600000), "HRS"], [Math.floor(diff / 60000) % 60, "MIN"], [Math.floor(diff / 1000) % 60, "SEC"]];

  return (
    <Panel className="hero-card">
      {cars.map((car, index) => (
        <img key={car.src} className={`hero-image ${index === image ? "active" : ""}`} src={car.src} alt="" aria-hidden="true" style={{ objectPosition: car.position }} loading={index < 2 ? "eager" : "lazy"}/>
      ))}
      <div className="hero-shade"/>
      <div className="hero-copy">
        {block && <span className="hero-now">ON TRACK NOW · <b>{block.activity}</b> until {block.end}</span>}
        <span className="live-pill"><i/> NEXT RACE · {next ? next.kind.toUpperCase() : "TRACK CLEAR"}</span>
        <h2>{next ? next.title : "Nothing on the grid"}</h2>
        <p>
          {next ? <>{relativeDay(next.at)} <span>·</span> {next.allDay ? "All day" : timeLabel(next.at)}</> : "Add a calendar event or a timed daily task to see it here."}
        </p>
      </div>
      {next && (
        <div className="countdown" aria-label="Countdown">
          {next.allDay && diff === 0 ? (
            <div><strong>TODAY</strong><span>ALL DAY</span></div>
          ) : (
            units.map(([value, label], index) => (
              <Fragment key={label}>
                {index > 0 && <b>:</b>}
                <div><strong>{pad(value)}</strong><span>{label}</span></div>
              </Fragment>
            ))
          )}
        </div>
      )}
      <div className="hero-dots">
        {cars.map((car, index) => <button key={car.src} className={image === index ? "active" : ""} onClick={() => setImage(index)} aria-label={`Show ${car.car}`}/>)}
      </div>
      <a className="hero-credit" href={cars[image].source} target="_blank" rel="noreferrer">{cars[image].car} · Photo: {cars[image].author}, {cars[image].license}</a>
    </Panel>
  );
}

function RunPlan() {
  const [tasks, setTasks] = useDailyTasks();
  const [goals, setGoals] = useGoals();
  const [taskText, setTaskText] = useState("");
  const [taskTime, setTaskTime] = useState("");
  const [goalText, setGoalText] = useState("");
  const [goalTag, setGoalTag] = useState("");
  const doneCount = tasks.filter((task) => task.done).length;
  const sortedTasks = [...tasks].sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));

  const addTask = () => {
    if (!taskText.trim()) return;
    setTasks([...tasks, { id: uid(), text: taskText.trim(), time: taskTime, done: false }]);
    setTaskText("");
    setTaskTime("");
  };
  const addGoal = () => {
    if (!goalText.trim()) return;
    setGoals([...goals, { id: uid(), text: goalText.trim(), tag: goalTag.trim(), progress: 0, done: false }]);
    setGoalText("");
    setGoalTag("");
  };
  const toggleTask = (id: string) => setTasks(tasks.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
  const toggleGoal = (id: string) => setGoals(goals.map((goal) => (goal.id === id ? { ...goal, done: !goal.done, progress: goal.done ? goal.progress : 100 } : goal)));

  return (
    <Panel className="plan-panel">
      <PanelTitle eyebrow="01 / RUN PLAN" title="Tasks" action={<span className="progress-label">{doneCount} of {tasks.length} daily tasks done</span>}/>
      <div className="plan-grid">
        <section className="plan-section">
          <div className="subhead"><h3>Daily Tasks</h3><span>Checkboxes reset every morning</span></div>
          <div className="task-progress"><span style={{ width: `${tasks.length ? (doneCount / tasks.length) * 100 : 0}%` }}/></div>
          <div className="task-list">
            {sortedTasks.map((task) => (
              <div className={`task-row ${task.done ? "done" : ""}`} key={task.id}>
                <button className="checkbox" onClick={() => toggleTask(task.id)} aria-label={`${task.done ? "Uncheck" : "Check"} ${task.text}`}>{task.done && <Icon name="check" size={13}/>}</button>
                <span className="task-name" onClick={() => toggleTask(task.id)}>{task.text}</span>
                <time>{task.time || "Anytime"}</time>
                <button className="row-delete" onClick={() => setTasks(tasks.filter((item) => item.id !== task.id))} aria-label={`Delete ${task.text}`}><Icon name="x" size={13}/></button>
              </div>
            ))}
            {tasks.length === 0 && <p className="empty">No daily tasks yet. Add your routine below.</p>}
          </div>
          <form className="quick-add with-extra" onKeyDown={submitOnEnter} onSubmit={(event) => { event.preventDefault(); addTask(); }}>
            <input value={taskText} onChange={(event) => setTaskText(event.target.value)} placeholder="Add a daily task..." aria-label="New daily task"/>
            <input type="time" value={taskTime} onChange={(event) => setTaskTime(event.target.value)} aria-label="Time (optional)" title="Time (optional)"/>
            <button type="submit"><Icon name="plus" size={14}/> Add</button>
          </form>
        </section>

        <section className="plan-section">
          <div className="subhead"><h3>Overall Goals</h3><span>{goals.filter((goal) => goal.done).length} of {goals.length} achieved</span></div>
          <div className="goal-list">
            {goals.map((goal) => (
              <div className={`goal-row ${goal.done ? "done" : ""}`} key={goal.id}>
                <button className="checkbox" onClick={() => toggleGoal(goal.id)} aria-label={`${goal.done ? "Uncheck" : "Check"} ${goal.text}`}>{goal.done && <Icon name="check" size={13}/>}</button>
                <div className="goal-body">
                  <div className="goal-top"><span className="task-name" onClick={() => toggleGoal(goal.id)}>{goal.text}</span>{goal.tag && <em>{goal.tag}</em>}</div>
                  <div className="goal-progress">
                    <input className="goal-slider" type="range" min="0" max="100" step="5" value={goal.progress} aria-label={`${goal.text} progress`}
                      onChange={(event) => setGoals(goals.map((item) => (item.id === goal.id ? { ...item, progress: Number(event.target.value), done: Number(event.target.value) === 100 } : item)))}/>
                    <b>{goal.progress}%</b>
                  </div>
                </div>
                <button className="row-delete" onClick={() => setGoals(goals.filter((item) => item.id !== goal.id))} aria-label={`Delete ${goal.text}`}><Icon name="x" size={13}/></button>
              </div>
            ))}
            {goals.length === 0 && <p className="empty">No goals yet. What are you chasing this season?</p>}
          </div>
          <form className="quick-add with-extra" onKeyDown={submitOnEnter} onSubmit={(event) => { event.preventDefault(); addGoal(); }}>
            <input value={goalText} onChange={(event) => setGoalText(event.target.value)} placeholder="Add a long-term goal..." aria-label="New goal"/>
            <input className="tag-input" value={goalTag} onChange={(event) => setGoalTag(event.target.value)} placeholder="Tag / deadline" aria-label="Goal tag or deadline"/>
            <button type="submit"><Icon name="plus" size={14}/> Add</button>
          </form>
        </section>
      </div>
    </Panel>
  );
}

type AgendaEvent = { id: string; title: string; date: string; time: string; source: "local" | "google"; link?: string };

function CalendarPanel() {
  const [localEvents, setLocalEvents] = useEvents();
  const [googleEvents] = useGcalEvents();
  const [gcal] = useGcalSettings();
  const [gstatus] = useGcalStatus();
  const [storedClientId, setClientId] = useGoogleClientId();
  const clientId = googleClientId() || storedClientId;
  const today = dateKey();
  const [selected, setSelected] = useState(today);
  const [view, setView] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [message, setMessage] = useState("");
  const year = view.getFullYear();
  const month = view.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const events: AgendaEvent[] = [
    ...localEvents.map((e) => ({ ...e, source: "local" as const })),
    ...(gcal.enabled ? googleEvents.map((e) => ({ ...e, source: "google" as const })) : []),
  ];
  const eventDays = new Set(events.map((event) => event.date));
  const dayEvents = events.filter((event) => event.date === selected).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const live = gcal.enabled && gstatus.authed;

  useEffect(() => {
    if (clientId) preloadGoogle().catch(() => undefined);
  }, [clientId]);

  const report = (error: unknown) => setMessage(error instanceof Error ? error.message : "Something went wrong.");
  // Gets a token if needed. Call only from a click handler so Google's popup is allowed.
  const ensureGoogle = async () => {
    if (!hasToken()) await authorize();
  };

  const connect = async () => {
    setMessage("");
    try {
      await ensureGoogle();
      await syncGoogle();
      setShowSetup(false);
    } catch (error) {
      report(error);
    }
  };

  const addEvent = async () => {
    if (!title.trim()) return;
    setMessage("");
    const name = title.trim();
    if (gcal.enabled) {
      try {
        await ensureGoogle();
        await createGoogleEvent(name, selected, time);
      } catch (error) {
        report(error);
        return;
      }
    } else {
      setLocalEvents([...localEvents, { id: uid(), title: name, date: selected, time }]);
    }
    setTitle("");
    setTime("");
  };

  const removeEvent = async (event: AgendaEvent) => {
    if (event.source === "local") {
      setLocalEvents(localEvents.filter((item) => item.id !== event.id));
      return;
    }
    if (!window.confirm(`Delete “${event.title}” from your Google Calendar?`)) return;
    try {
      await ensureGoogle();
      await deleteGoogleEvent(event.id);
    } catch (error) {
      report(error);
    }
  };

  const goToday = () => {
    setView(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
    setSelected(today);
  };

  return (
    <Panel className="calendar-panel">
      <PanelTitle
        eyebrow={view.toLocaleDateString(undefined, { month: "long", year: "numeric" }).toUpperCase()}
        title="Calendar"
        action={
          <div className="month-arrows">
            <button onClick={() => setView(new Date(year, month - 1, 1))} aria-label="Previous month">‹</button>
            <button className="today-button" onClick={goToday}>Today</button>
            <button onClick={() => setView(new Date(year, month + 1, 1))} aria-label="Next month">›</button>
          </div>
        }
      />
      <div className="gcal-bar">
        {gcal.enabled ? (
          <>
            <span className={`gcal-dot ${live ? "on" : ""}`}/>
            <span>{live ? "Google Calendar linked" : "Google Calendar: reconnect to sync"}{gcal.lastSync ? ` · synced ${timeLabel(new Date(gcal.lastSync))}` : ""}</span>
            <button className="text-button strong" onClick={connect} disabled={gstatus.busy}><Icon name="refresh" size={13}/> {gstatus.busy ? "Syncing…" : "Sync"}</button>
            <button className="text-button" onClick={() => setShowSetup(!showSetup)}>Settings</button>
          </>
        ) : (
          <>
            <span className="gcal-dot"/>
            <span>Local calendar</span>
            <button className="text-button strong" onClick={() => setShowSetup(!showSetup)}>Link Google Calendar</button>
          </>
        )}
      </div>
      {showSetup && (
        <div className="gcal-setup">
          {!hasEnvClientId() && <label>Google OAuth Client ID<input value={clientId} onChange={(event) => setClientId(event.target.value.trim())} placeholder="xxxxxxxx.apps.googleusercontent.com" autoComplete="off"/></label>}
          <details>
            <summary>How to get a Client ID (one-time, ~5 minutes; the same ID also powers Drive sync)</summary>
            <ol>
              <li>Open <a href="https://console.cloud.google.com/apis/library/calendar-json.googleapis.com" target="_blank" rel="noreferrer">Google Cloud Console</a>, create a project, and enable the <b>Google Calendar API</b> and <b>Google Drive API</b>.</li>
              <li>Under <b>OAuth consent screen</b>, choose External, fill in the app name, and add your own Google account as a <b>test user</b>.</li>
              <li>Under <b>Credentials → Create credentials → OAuth client ID</b>, pick <b>Web application</b>.</li>
              <li>In <b>Authorised JavaScript origins</b>, add <code>{window.location.origin}</code> (and your published dashboard address).</li>
              <li>Copy the Client ID into the box above, then click Connect.</li>
            </ol>
          </details>
          <div className="gcal-actions">
            <button className="primary-button" onClick={connect} disabled={!clientId || gstatus.busy}>{gcal.enabled ? "Reconnect & sync" : "Connect"}</button>
            {gcal.enabled && <button className="secondary-button" onClick={() => { disconnectGoogle(); setShowSetup(false); }}>Unlink</button>}
          </div>
        </div>
      )}
      {(message || gstatus.error) && <p className="gcal-error">{message || gstatus.error}</p>}
      <div className="calendar">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => <b key={i}>{day}</b>)}
        {Array.from({ length: offset }, (_, i) => <span key={`blank${i}`}/>)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const key = `${year}-${pad(month + 1)}-${pad(i + 1)}`;
          const classes = [key === today && "today", key === selected && "selected", eventDays.has(key) && "event"].filter(Boolean).join(" ");
          return <button key={key} className={classes} onClick={() => setSelected(key)} aria-label={`${key}${eventDays.has(key) ? ", has events" : ""}`}>{i + 1}</button>;
        })}
      </div>
      <div className="agenda">
        <div className="agenda-head"><small>{relativeDay(parseDateKey(selected)).toUpperCase()}</small><span>{dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}</span></div>
        {dayEvents.map((event) => (
          <div className={`agenda-item ${event.source}`} key={`${event.source}${event.id}`}>
            <i/>
            <div>
              <strong>{event.link ? <a href={event.link} target="_blank" rel="noreferrer">{event.title}</a> : event.title}</strong>
              <span>{event.time || "All day"}{event.source === "google" ? " · Google" : ""}</span>
            </div>
            <button className="row-delete" onClick={() => removeEvent(event)} aria-label={`Delete ${event.title}`}><Icon name="x" size={13}/></button>
          </div>
        ))}
        {dayEvents.length === 0 && <p className="empty">Nothing scheduled. Add an event for this day.</p>}
        <form className="quick-add with-extra" onKeyDown={submitOnEnter} onSubmit={(event) => { event.preventDefault(); addEvent(); }}>
          <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={gcal.enabled ? "New Google event..." : "New event..."} aria-label="New event title"/>
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Event time (optional)" title="Leave empty for all day"/>
          <button type="submit"><Icon name="plus" size={14}/> Add</button>
        </form>
      </div>
    </Panel>
  );
}

function NotesPanel() {
  const [notes, setNotes] = useNotes();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const addNote = () => {
    if (!draft.trim()) return;
    setNotes([{ id: uid(), text: draft.trim(), createdAt: new Date().toISOString() }, ...notes]);
    setDraft("");
  };
  const startEdit = (id: string, text: string) => {
    setEditingId(id);
    setEditText(text);
  };
  const saveEdit = () => {
    if (editText.trim()) setNotes(notes.map((note) => (note.id === editingId ? { ...note, text: editText.trim() } : note)));
    setEditingId(null);
  };

  return (
    <Panel className="notes-panel">
      <PanelTitle eyebrow="QUICK CAPTURE" title="Pit Wall Notes" action={<span className="progress-label">{notes.length} {notes.length === 1 ? "note" : "notes"}</span>}/>
      <textarea value={draft} onChange={(event) => setDraft(event.target.value)} aria-label="New note" placeholder="Jot something down... (⌘/Ctrl + Enter to save)"
        onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); addNote(); } }}/>
      <div className="notes-actions"><button className="primary-button" onClick={addNote} disabled={!draft.trim()}><Icon name="plus" size={14}/> Add note</button></div>
      <div className="note-list">
        {notes.map((note) => (
          <article className="note" key={note.id}>
            {editingId === note.id ? (
              <>
                <textarea autoFocus value={editText} onChange={(event) => setEditText(event.target.value)} aria-label="Edit note"
                  onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) saveEdit(); if (event.key === "Escape") setEditingId(null); }}/>
                <div className="note-foot"><span/><span><button className="text-button" onClick={() => setEditingId(null)}>Cancel</button><button className="text-button strong" onClick={saveEdit}>Save</button></span></div>
              </>
            ) : (
              <>
                <p onDoubleClick={() => startEdit(note.id, note.text)}>{note.text}</p>
                <div className="note-foot">
                  <time>{relativeDay(new Date(note.createdAt))} · {timeLabel(new Date(note.createdAt))}</time>
                  <span>
                    <button className="icon-mini" onClick={() => startEdit(note.id, note.text)} aria-label="Edit note"><Icon name="edit" size={13}/></button>
                    <button className="icon-mini" onClick={() => setNotes(notes.filter((item) => item.id !== note.id))} aria-label="Delete note"><Icon name="trash" size={13}/></button>
                  </span>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </Panel>
  );
}

function QuotePanel() {
  // A random quote every 5 hours (seeded by the 5-hour slot, so it stays put until the slot changes).
  // "Next quote" jumps to another random one. The Overview re-renders every second, so it rolls over on its own.
  const slot = Math.floor(Date.now() / (5 * 60 * 60 * 1000));
  const [picked, setPicked] = useState<{ slot: number; index: number } | null>(null);
  const seeded = Math.imul(slot ^ 0x9e3779b9, 2654435761) >>> 0;
  const index = picked?.slot === slot ? picked.index : seeded % quotes.length;
  const quote = quotes[index];
  const next = () => {
    let i = index;
    while (i === index && quotes.length > 1) i = Math.floor(Math.random() * quotes.length);
    setPicked({ slot, index: i });
  };
  return (
    <Panel className="quote-panel">
      <span className="quote-mark">“</span>
      <blockquote>“{quote.text}”</blockquote>
      <div className="quote-foot">
        <p>— {quote.by}</p>
        <button className="text-button" onClick={next}>Next quote <Icon name="arrow" size={13}/></button>
      </div>
    </Panel>
  );
}

function PortfolioSummary({ onNavigate }: { onNavigate: (tab: Tab) => void }) {
  const [holdings] = useHoldings();
  const [snapshots] = useSnapshots();
  const money = useMoney();
  const t = totals(holdings);
  const rows = holdings.map((holding) => ({ holding, d: derive(holding) })).sort((a, b) => b.d.plPct - a.d.plPct);
  const winners = rows.filter((row) => row.d.plPct >= 0).slice(0, 3);
  const losers = [...rows].reverse().filter((row) => row.d.plPct < 0).slice(0, 3);
  const chart = snapshots.slice(-90).map((s) => s.v);
  const segments = allocation(holdings);

  return (
    <Panel className="portfolio-panel">
      <PanelTitle eyebrow="02 / MY PORTFOLIO" title="Market Position" action={<button className="primary-button" onClick={() => onNavigate("Investments")}>Manage stocks <Icon name="arrow" size={15}/></button>}/>
      {holdings.length === 0 ? (
        <p className="empty">No stocks yet. <button className="text-button strong" onClick={() => onNavigate("Investments")}>Add your first position →</button></p>
      ) : (
        <div className="portfolio-grid">
          <div className="portfolio-value">
            <small>TOTAL VALUE</small>
            <strong>{money(t.value)}</strong>
            <span className={t.dayChange >= 0 ? "gain" : "gain loss"}>{money(t.dayChange, { signed: true })} <i>{pct(t.dayPct)}</i> today</span>
            <div className="stat-pair">
              <span>Total P/L <b className={t.pl >= 0 ? "up" : "down"}>{money(t.pl, { signed: true })} ({pct(t.plPct, 1)})</b></span>
              <span>Invested <b>{money(t.cost, { digits: 0 })}</b></span>
            </div>
            <div className="big-chart">
              {chart.length > 1 ? <Sparkline values={chart} tall/> : <p className="chart-note">Your value chart builds up as the dashboard records one point per day.</p>}
            </div>
          </div>
          <div className="allocation">
            <small>ALLOCATION</small>
            <Donut segments={segments}><strong>{holdings.length}</strong><span>HOLDINGS</span></Donut>
            <div className="legend">
              {segments.map((s) => <span key={s.label}><i style={{ background: s.color }}/>{s.label}<b>{s.share.toFixed(0)}%</b></span>)}
            </div>
          </div>
          <div className="movers">
            <MoverList title="TOP WINNERS" rows={winners} money={money}/>
            <MoverList title="TOP LOSERS" rows={losers} money={money}/>
          </div>
        </div>
      )}
    </Panel>
  );
}

function MoverList({ title, rows, money }: { title: string; rows: { holding: Holding; d: ReturnType<typeof derive> }[]; money: ReturnType<typeof useMoney> }) {
  return (
    <div className="mover-group">
      <div className="movers-head"><small>{title}</small><span>PRICE · TOTAL RETURN</span></div>
      {rows.map(({ holding, d }) => (
        <div className="mover" key={holding.id}>
          <b>{holding.symbol}</b>
          <span>{holding.name}</span>
          <Sparkline values={holding.history.map((point) => point.p)} positive={d.plPct >= 0}/>
          <strong>{money(holding.price)}</strong>
          <em className={d.plPct >= 0 ? "up" : "down"}>{pct(d.plPct, 1)}</em>
        </div>
      ))}
      {rows.length === 0 && <p className="empty small">None right now.</p>}
    </div>
  );
}
