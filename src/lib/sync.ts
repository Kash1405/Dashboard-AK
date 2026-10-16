import { useEffect } from "react";
import type { CalEvent, DailyTask, FocusDraft, FocusLog, Goal, Note, Settings } from "./data";
import { googleClientId, isFresh, preloadGoogle, requestToken, revokeToken, type Token } from "./google";
import type { Holding, PortfolioSettings, PricePoint, Snapshot } from "./portfolio";
import { peekStored, setStored, subscribeAll, useStored } from "./store";
import { addDays, dateKey, uid } from "./utils";
import type { GoalRow, MealRow, MedRow, ScheduleRow, TrackerCategory, TrackerLog } from "./vault";

// Google Drive sync. Everything lives in the app's hidden appDataFolder (scope drive.appdata):
//   state.json   – current lists and settings, overwritten on change (~5–20 KB)
//   log-YYYY.json – dated history for one year; past years stop changing so are never re-uploaded
// Derived numbers (P/L, streaks, averages…) are never stored. Last write wins across devices.

const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const FILES_API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const VERSION = 1;
const DEBOUNCE_MS = 5000;
const RATING_ORDER = ["mood", "energy", "anxiety", "sleep", "focus", "motivation"] as const;

// Local keys whose changes trigger an upload. Everything else stays on this device
// (Finnhub key, market quotes, running timer, wellness draft, calculator, UI state, auth).
const SYNCED_KEYS = new Set([
  "settings", "daily.tasks", "daily.lastReset", "goals", "goals.table", "notes", "events",
  "portfolio.holdings", "portfolio.settings", "portfolio.snapshots", "focus.logs", "focus.draft",
  "wellness.entries", "wellness.medLog", "advisor.meds", "advisor.schedule", "advisor.meals",
  "advisor.tracker", "advisor.trackerLog", "advisor.mealLog",
]);

export type SyncState = "off" | "signed-out" | "syncing" | "synced" | "error";
export type SyncStatus = { state: SyncState; at: number; error: string };
type SyncMeta = { enabled: boolean; savedAt: number; hashes: Record<string, string>; fileIds: Record<string, string> };

const metaFallback: SyncMeta = { enabled: false, savedAt: 0, hashes: {}, fileIds: {} };
const statusFallback: SyncStatus = { state: "off", at: 0, error: "" };
export const useSyncStatus = () => useStored<SyncStatus>("~sync.status", statusFallback);
export const useSyncMeta = () => useStored<SyncMeta>("sync.meta", metaFallback);

const meta = () => peekStored<SyncMeta>("sync.meta") ?? metaFallback;
const setMeta = (patch: Partial<SyncMeta>) => setStored<SyncMeta>("sync.meta", (m) => ({ ...m, ...patch }), metaFallback);
const setStatus = (patch: Partial<SyncStatus>) => setStored<SyncStatus>("~sync.status", (s) => ({ ...s, ...patch }), statusFallback);

let token: Token | null = null;
let applying = false;
let timer: number | undefined;
let busy: Promise<void> | null = null;
let generation = 0; // bumped on sign-out so in-flight work stops uploading

// ---------- Serialising ----------

type StateFile = {
  v: number;
  settings?: Settings;
  daily: { lastReset?: string; tasks?: DailyTask[] };
  goals?: Goal[];
  goalsTable?: GoalRow[];
  notes?: Note[];
  events?: CalEvent[];
  portfolio: { currency?: string; holdings?: Omit<Holding, "history" | "updatedAt">[] };
  advisor: { meds?: MedRow[]; schedule?: ScheduleRow[]; meals?: MealRow[]; tracker?: TrackerCategory[] };
  focusDraft?: { task: string; description: string };
};

type LogFile = {
  v: number;
  year: number;
  focus: Omit<FocusLog, "id">[];
  wellness: Record<string, { r: number[]; text: string; savedAt: string }>;
  meds: Record<string, Record<string, string>>;
  portfolio: Record<string, number>;
  prices: Record<string, Record<string, number>>;
  tracker: Record<string, Record<string, 1 | [0 | 1, string]>>;
  meals: Record<string, string[]>;
};

type WellnessEntry = { date: string; ratings: Record<string, number>; text: string; savedAt: string };

function buildState(): StateFile {
  const cutoff = dateKey(addDays(new Date(), -90));
  const holdings = peekStored<Holding[]>("portfolio.holdings");
  const draft = peekStored<FocusDraft>("focus.draft");
  return {
    v: VERSION,
    settings: peekStored("settings"),
    daily: { lastReset: peekStored("daily.lastReset"), tasks: peekStored("daily.tasks") },
    goals: peekStored("goals"),
    goalsTable: peekStored("goals.table"),
    notes: peekStored("notes"),
    events: peekStored<CalEvent[]>("events")?.filter((e) => e.date >= cutoff),
    portfolio: {
      currency: peekStored<PortfolioSettings>("portfolio.settings")?.currency,
      holdings: holdings?.map(({ history: _h, updatedAt: _u, ...rest }) => rest),
    },
    advisor: { meds: peekStored("advisor.meds"), schedule: peekStored("advisor.schedule"), meals: peekStored("advisor.meals"), tracker: peekStored("advisor.tracker") },
    focusDraft: draft ? { task: draft.task, description: draft.description } : undefined,
  };
}

const emptyLog = (year: number): LogFile => ({ v: VERSION, year, focus: [], wellness: {}, meds: {}, portfolio: {}, prices: {}, tracker: {}, meals: {} });

function buildLogs(): Record<string, LogFile> {
  const years: Record<string, LogFile> = {};
  const y = (date: string) => (years[date.slice(0, 4)] ??= emptyLog(Number(date.slice(0, 4))));

  for (const log of peekStored<FocusLog[]>("focus.logs") ?? []) {
    const { id: _id, ...rest } = log;
    y(dateKey(new Date(log.completedAt))).focus.push(rest);
  }
  for (const [d, e] of Object.entries(peekStored<Record<string, WellnessEntry>>("wellness.entries") ?? {})) {
    y(d).wellness[d] = { r: RATING_ORDER.map((k) => e.ratings[k] ?? 5), text: e.text, savedAt: e.savedAt };
  }
  for (const [d, m] of Object.entries(peekStored<Record<string, Record<string, string>>>("wellness.medLog") ?? {})) {
    if (Object.keys(m).length) y(d).meds[d] = m;
  }
  for (const s of peekStored<Snapshot[]>("portfolio.snapshots") ?? []) y(s.d).portfolio[s.d] = s.v;
  for (const h of peekStored<Holding[]>("portfolio.holdings") ?? []) {
    for (const p of h.history) (y(p.d).prices[h.symbol] ??= {})[p.d] = p.p;
  }
  for (const [d, items] of Object.entries(peekStored<TrackerLog>("advisor.trackerLog") ?? {})) {
    const compact: LogFile["tracker"][string] = {};
    for (const [id, v] of Object.entries(items)) if (v.done || v.note) compact[id] = v.note ? [v.done ? 1 : 0, v.note] : 1;
    if (Object.keys(compact).length) y(d).tracker[d] = compact;
  }
  for (const [d, m] of Object.entries(peekStored<Record<string, Record<string, boolean>>>("advisor.mealLog") ?? {})) {
    const ids = Object.keys(m).filter((id) => m[id]);
    if (ids.length) y(d).meals[d] = ids;
  }
  return years;
}

function buildFiles() {
  const files: Record<string, string> = { "state.json": JSON.stringify(buildState()) };
  for (const [year, log] of Object.entries(buildLogs())) files[`log-${year}.json`] = JSON.stringify(log);
  return files;
}

// Cheap 53-bit string hash; only used to skip uploading unchanged files.
function hash(text: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// ---------- Applying remote data ----------

function applyRemote(state: StateFile, logs: Record<string, LogFile>) {
  applying = true;
  try {
    const remoteYears = new Set(Object.keys(logs));
    const keepLocal = (date: string) => !remoteYears.has(date.slice(0, 4));
    const set = <T,>(key: string, value: T | undefined) => {
      if (value !== undefined) setStored(key, value);
    };

    set("settings", state.settings);
    set("daily.lastReset", state.daily?.lastReset);
    set("daily.tasks", state.daily?.tasks);
    set("goals", state.goals);
    set("goals.table", state.goalsTable);
    set("notes", state.notes);
    set("events", state.events);
    set("advisor.meds", state.advisor?.meds);
    set("advisor.schedule", state.advisor?.schedule);
    set("advisor.meals", state.advisor?.meals);
    set("advisor.tracker", state.advisor?.tracker);
    if (state.focusDraft) setStored<FocusDraft>("focus.draft", (d) => ({ ...d, ...state.focusDraft }), { task: "", description: "", linkedTaskId: "" });
    if (state.portfolio?.currency) setStored<PortfolioSettings>("portfolio.settings", (s) => ({ ...s, currency: state.portfolio.currency! }), { apiKey: "", currency: "USD", hideConnect: false });

    const logList = Object.values(logs);
    const mergeDated = <T,>(key: string, pick: (log: LogFile) => Record<string, T>, decode: (date: string, value: T) => unknown) => {
      const local = peekStored<Record<string, unknown>>(key) ?? {};
      const next: Record<string, unknown> = Object.fromEntries(Object.entries(local).filter(([d]) => keepLocal(d)));
      for (const log of logList) for (const [d, v] of Object.entries(pick(log))) next[d] = decode(d, v);
      setStored(key, next);
    };

    const localFocus = (peekStored<FocusLog[]>("focus.logs") ?? []).filter((l) => keepLocal(dateKey(new Date(l.completedAt))));
    const remoteFocus = logList.flatMap((log) => log.focus.map((l) => ({ id: uid(), ...l })));
    setStored("focus.logs", [...localFocus, ...remoteFocus].sort((a, b) => b.completedAt.localeCompare(a.completedAt)));

    mergeDated("wellness.entries", (l) => l.wellness, (date, w) => ({ date, ratings: Object.fromEntries(RATING_ORDER.map((k, i) => [k, w.r[i] ?? 5])), text: w.text, savedAt: w.savedAt }));
    mergeDated("wellness.medLog", (l) => l.meds, (_d, m) => m);
    mergeDated("advisor.trackerLog", (l) => l.tracker, (_d, items) => Object.fromEntries(Object.entries(items).map(([id, v]) => [id, v === 1 ? { done: true, note: "" } : { done: v[0] === 1, note: v[1] }])));
    mergeDated("advisor.mealLog", (l) => l.meals, (_d, ids) => Object.fromEntries(ids.map((id) => [id, true])));

    const localSnaps = (peekStored<Snapshot[]>("portfolio.snapshots") ?? []).filter((s) => keepLocal(s.d));
    const remoteSnaps = logList.flatMap((log) => Object.entries(log.portfolio).map(([d, v]) => ({ d, v })));
    setStored("portfolio.snapshots", [...localSnaps, ...remoteSnaps].sort((a, b) => a.d.localeCompare(b.d)));

    if (state.portfolio?.holdings) {
      const localHoldings = peekStored<Holding[]>("portfolio.holdings") ?? [];
      const history = (symbol: string): PricePoint[] => {
        const local = localHoldings.find((h) => h.symbol === symbol)?.history.filter((p) => keepLocal(p.d)) ?? [];
        const remote = logList.flatMap((log) => Object.entries(log.prices[symbol] ?? {}).map(([d, p]) => ({ d, p })));
        return [...local, ...remote].sort((a, b) => a.d.localeCompare(b.d));
      };
      setStored("portfolio.holdings", state.portfolio.holdings.map((h) => ({ ...h, history: history(h.symbol) })));
    }
  } finally {
    applying = false;
  }
}

// ---------- Drive REST ----------

type DriveFile = { id: string; name: string; appProperties?: { savedAt?: string } };

async function drive(url: string, init: RequestInit = {}) {
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token!.value}`, ...(init.headers ?? {}) } });
  if (response.status === 401) {
    token = null;
    throw new Error("Google session expired. Click “Sign in”.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `Google Drive error ${response.status}`);
  }
  return response;
}

async function listFiles() {
  const response = await drive(`${FILES_API}?spaces=appDataFolder&pageSize=100&fields=files(id,name,appProperties)`);
  const { files } = (await response.json()) as { files: DriveFile[] };
  const byName = Object.fromEntries(files.map((f) => [f.name, f]));
  setMeta({ fileIds: Object.fromEntries(files.map((f) => [f.name, f.id])) });
  return byName;
}

async function download<T>(id: string): Promise<T> {
  return (await drive(`${FILES_API}/${id}?alt=media`)).json() as Promise<T>;
}

async function upload(name: string, content: string, savedAt: number, keepalive = false, gen = generation) {
  if (gen !== generation) throw new Error("Signed out.");
  const id = meta().fileIds[name];
  const boundary = `apex${Math.random().toString(36).slice(2)}`;
  const metadata = id ? { appProperties: { savedAt: String(savedAt) } } : { name, parents: ["appDataFolder"], appProperties: { savedAt: String(savedAt) } };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  const response = await drive(id ? `${UPLOAD_API}/${id}?uploadType=multipart&fields=id` : `${UPLOAD_API}?uploadType=multipart&fields=id`, {
    method: id ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
    keepalive,
  });
  if (!id) {
    const created = (await response.json()) as { id: string };
    setMeta({ fileIds: { ...meta().fileIds, [name]: created.id } });
  }
}

// ---------- Sync operations ----------

function exclusive(task: () => Promise<void>) {
  const run = (busy ?? Promise.resolve()).then(task, task);
  busy = run.catch(() => undefined).finally(() => {
    if (busy === run) busy = null;
  });
  return run;
}

async function ensureToken(interactive: boolean) {
  if (isFresh(token)) return;
  token = await requestToken(SCOPE, interactive && !meta().enabled ? "consent" : "");
}

async function pullThenPush() {
  setStatus({ state: "syncing", error: "" });
  const files = await listFiles();
  const remoteSavedAt = Number(files["state.json"]?.appProperties?.savedAt ?? 0);
  if (files["state.json"] && remoteSavedAt > meta().savedAt) {
    // Drive is newer: replace local copies with it.
    const state = await download<StateFile>(files["state.json"].id);
    const logs: Record<string, LogFile> = {};
    for (const file of Object.values(files)) {
      const match = /^log-(\d{4})\.json$/.exec(file.name);
      if (match) logs[match[1]] = await download<LogFile>(file.id);
    }
    applyRemote(state, logs);
    const built = buildFiles();
    setMeta({ savedAt: remoteSavedAt, hashes: Object.fromEntries(Object.entries(built).map(([n, c]) => [n, hash(c)])) });
  } else {
    await pushChanged(false);
  }
  setStatus({ state: "synced", at: Date.now(), error: "" });
}

async function pushChanged(keepalive: boolean) {
  const built = buildFiles();
  const hashes = meta().hashes;
  const changed = Object.keys(built).filter((name) => name !== "state.json" && hashes[name] !== hash(built[name]));
  const stateChanged = hashes["state.json"] !== hash(built["state.json"]);
  if (!changed.length && !stateChanged) return;
  const savedAt = Math.max(meta().savedAt, 1);
  const gen = generation;
  for (const name of changed) await upload(name, built[name], savedAt, keepalive, gen);
  // state.json carries the savedAt other devices compare against, so it goes up whenever anything changed.
  await upload("state.json", built["state.json"], savedAt, keepalive, gen);
  setMeta({ savedAt, hashes: Object.fromEntries(Object.entries(built).map(([n, c]) => [n, hash(c)])) });
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : "Sync failed.";
  if (!isFresh(token)) setStatus({ state: "signed-out", error: message });
  else setStatus({ state: "error", error: message });
}

export function syncNow(interactive = false) {
  return exclusive(async () => {
    try {
      await ensureToken(interactive);
      await pullThenPush();
    } catch (error) {
      fail(error);
    }
  });
}

// From a click: first-ever sign-in uploads what is already on this device.
export function signIn() {
  setMeta({ enabled: true });
  return syncNow(true);
}

export function signOut() {
  generation++;
  if (token) revokeToken(token.value);
  token = null;
  window.clearTimeout(timer);
  setMeta({ enabled: false, hashes: {}, fileIds: {} });
  setStatus({ state: googleClientId() ? "signed-out" : "off", error: "" });
}

function schedulePush() {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = undefined;
    if (!meta().enabled) return;
    if (!isFresh(token)) {
      setStatus({ state: "signed-out", error: "Changes are saved here and will upload when you sign in." });
      return;
    }
    syncNow(false);
  }, DEBOUNCE_MS);
}

function flush() {
  if (timer === undefined || !meta().enabled || !isFresh(token)) return;
  window.clearTimeout(timer);
  timer = undefined;
  // Upload straight away (keepalive lets the request finish if the tab is closing).
  // If a sync is already running it will pick up these changes.
  if (!busy) exclusive(() => pushChanged(true)).catch(() => undefined);
}

// Mount once (in App, after unlock): watches local changes and keeps Drive in step.
export function useDriveSync(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const unsubscribe = subscribeAll((key) => {
      if (applying || !SYNCED_KEYS.has(key)) return;
      setMeta({ savedAt: Date.now() });
      if (meta().enabled) schedulePush();
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    if (googleClientId()) {
      setStatus({ state: meta().enabled ? "signed-out" : "off" });
      preloadGoogle()
        .then(() => {
          // Try a silent sign-in; browsers may block it, in which case the chip offers "Sign in".
          if (meta().enabled) syncNow(false);
        })
        .catch(() => undefined);
    }
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
    };
  }, [active]);
}
