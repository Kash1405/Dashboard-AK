import { useEffect } from "react";
import LockScreen from "./components/LockScreen";
import SyncChip from "./components/SyncChip";
import { Icon } from "./components/ui";
import { legacyDefaultTasks, timerRemaining, useDailyReset, useDailyTasks, useFocusDraft, useFocusFlash, useFocusTimer, useSettings, type Tab } from "./lib/data";
import { useCompleteSession } from "./lib/focus";
import { hasToken, syncGoogle, useGcalSettings } from "./lib/gcal";
import { useDriveSync, useSyncMeta } from "./lib/sync";
import { refreshPortfolio, totals, useHoldings, usePortfolioSettings, useRefreshStatus, useSnapshots } from "./lib/portfolio";
import { useStored } from "./lib/store";
import { isOverdue, useGoalTable, useSchedule } from "./lib/vault";
import { dateKey, formatDuration, pad, playChime, useNow } from "./lib/utils";
import Advisor from "./tabs/Advisor";
import Focus from "./tabs/Focus";
import Goals from "./tabs/Goals";
import Investments from "./tabs/Investments";
import Overview from "./tabs/Overview";

const tabs: { tab: Tab; icon: string }[] = [
  { tab: "Overview", icon: "grid" },
  { tab: "Focus", icon: "focus" },
  { tab: "Goals", icon: "flag" },
  { tab: "Investments", icon: "chart" },
  { tab: "Advisor", icon: "heart" },
];

function Header({ active, setActive, onLock }: { active: Tab; setActive: (tab: Tab) => void; onLock: () => void }) {
  const now = useNow(1000);
  const [settings] = useSettings();
  const [timer] = useFocusTimer();
  const remaining = timerRemaining(timer, now.getTime());
  const initials = settings.name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AK";

  return (
    <header className="topbar">
      <div className="brand" onClick={() => setActive("Overview")}>
        <div className="brand-mark"><span>12</span></div>
        <div><strong>KASH</strong><small>PERSONAL COMMAND</small></div>
      </div>
      <nav className="tabs" aria-label="Dashboard sections">
        {tabs.map(({ tab, icon }) => (
          <button key={tab} className={active === tab ? "active" : ""} onClick={() => setActive(tab)}>
            <Icon name={icon}/>
            {tab}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        {timer.endsAt !== null && active !== "Focus" && (
          <button className="timer-chip" onClick={() => setActive("Focus")}><i/>{pad(Math.floor(remaining / 60))}:{pad(remaining % 60)}</button>
        )}
        <SyncChip/>
        <button className="icon-button" onClick={onLock} aria-label="Lock the dashboard" title="Lock"><Icon name="lock"/></button>
        <div className="avatar" title={settings.name || "Set your name on the Overview tab"}>{initials}</div>
      </div>
    </header>
  );
}

// Background jobs that must keep running whichever tab is open.
function useBackgroundJobs() {
  const now = useNow(1000);
  const today = dateKey(now);
  const [timer] = useFocusTimer();
  const [draft] = useFocusDraft();
  const [, setFlash] = useFocusFlash();
  const complete = useCompleteSession();
  const [lastReset, setLastReset] = useDailyReset();
  const [tasks, setTasks] = useDailyTasks();
  const [schedule] = useSchedule();
  const [goalRows, setGoalRows] = useGoalTable();
  const [holdings] = useHoldings();
  const [, setSnapshots] = useSnapshots();
  const [portfolio] = usePortfolioSettings();
  const [status] = useRefreshStatus();
  const [gcal] = useGcalSettings();

  // Focus timer finished: log it, chime, and show a message.
  useEffect(() => {
    if (timer.endsAt !== null && now.getTime() >= timer.endsAt) {
      complete(timer.duration);
      playChime();
      setFlash(`Stint complete: “${draft.task.trim() || "Untitled session"}” logged (${formatDuration(timer.duration)}).`);
    }
  });

  // Tab title shows the running timer.
  const remaining = timerRemaining(timer, now.getTime());
  useEffect(() => {
    document.title = timer.endsAt !== null ? `▶ ${pad(Math.floor(remaining / 60))}:${pad(remaining % 60)} · Focus` : "KASH · Personal Command";
  }, [timer.endsAt, remaining]);

  // New day: untick only the tasks fetched from the Daily Schedule. Tasks added by hand stay as they are until closed.
  useEffect(() => {
    if (lastReset !== today) {
      setTasks((list) => list.map((task) => (task.scheduleId ? { ...task, done: false } : task)));
      setLastReset(today);
    }
  }, [today, lastReset, setTasks, setLastReset]);

  // Mirror the Daily Schedule's activities and times into the daily tasks; drop the old starter tasks.
  useEffect(() => {
    const rows = schedule.filter((row) => row.activity.trim());
    const next = [
      ...tasks.filter((task) => (task.scheduleId ? rows.some((row) => row.id === task.scheduleId) : !legacyDefaultTasks.includes(task.text))),
      ...rows.filter((row) => !tasks.some((task) => task.scheduleId === row.id)).map((row) => ({ id: `s-${row.id}`, text: row.activity.trim(), time: row.start, done: false, scheduleId: row.id })),
    ].map((task) => {
      const row = task.scheduleId ? rows.find((r) => r.id === task.scheduleId) : undefined;
      return row && (task.text !== row.activity.trim() || task.time !== row.start) ? { ...task, text: row.activity.trim(), time: row.start } : task;
    });
    if (next.length !== tasks.length || next.some((task, i) => task !== tasks[i])) setTasks(next);
  }, [schedule, tasks, setTasks]);

  // Goals past their end date that are not done become Overdue.
  useEffect(() => {
    if (goalRows.some((row) => row.status !== "Overdue" && isOverdue(row, today))) {
      setGoalRows(goalRows.map((row) => (row.status !== "Overdue" && isOverdue(row, today) ? { ...row, status: "Overdue" } : row)));
    }
  }, [goalRows, today, setGoalRows]);

  // Record one portfolio value per day for the performance chart.
  useEffect(() => {
    if (!holdings.length) return;
    const value = Math.round(totals(holdings).value * 100) / 100;
    setSnapshots((snapshots) => {
      const existing = snapshots.find((s) => s.d === today);
      if (existing?.v === value) return snapshots;
      return [...snapshots.filter((s) => s.d !== today), { d: today, v: value }].sort((a, b) => a.d.localeCompare(b.d)).slice(-1500);
    });
  }, [holdings, today, setSnapshots]);

  // Live prices every 10 minutes when a key is set.
  const minute = Math.floor(now.getTime() / 60000);
  useEffect(() => {
    if (portfolio.apiKey && !status.loading && Date.now() - status.at > 10 * 60 * 1000) refreshPortfolio();
  }, [portfolio.apiKey, minute, status.loading, status.at]);

  // Keep Google Calendar fresh while the sign-in token is valid (about an hour per sign-in).
  useEffect(() => {
    if (gcal.enabled && hasToken() && Date.now() - gcal.lastSync > 5 * 60 * 1000) syncGoogle().catch(() => undefined);
  }, [gcal.enabled, gcal.lastSync, minute]);
}

const SESSION_DAYS = 30;

export default function App() {
  const [stored, setActive] = useStored<Tab>("ui.tab", "Overview");
  const [authUntil, setAuthUntil] = useStored<number>("auth.until", 0);
  const [session, setSession] = useStored<boolean>("~auth.session", false);
  const active: Tab = tabs.some((t) => t.tab === stored) ? stored : "Overview";
  const unlocked = session || authUntil > Date.now();
  useBackgroundJobs();
  useDriveSync(unlocked);
  const [driveMeta] = useSyncMeta();
  const driveOn = driveMeta.enabled;
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [active]);

  if (!unlocked) {
    return (
      <LockScreen onUnlock={(remember) => {
        setSession(true);
        setAuthUntil(remember ? Date.now() + SESSION_DAYS * 86400000 : 0);
      }}/>
    );
  }

  const lock = () => {
    setAuthUntil(0);
    setSession(false);
  };

  return (
    <div className="app-shell">
      <Header active={active} setActive={setActive} onLock={lock}/>
      {active === "Overview" && <Overview onNavigate={setActive}/>}
      {active === "Focus" && <Focus/>}
      {active === "Goals" && <Goals/>}
      {active === "Investments" && <Investments/>}
      {active === "Advisor" && <Advisor/>}
      <footer><span>KASH COMMAND · PRIVATE DASHBOARD</span><span>{driveOn ? "Source of truth: Google Drive › Personal Dashboard" : "Saved in this browser · connect Google Drive to sync"} <i/></span></footer>
    </div>
  );
}
