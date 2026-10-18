import type { CalEvent, DailyTask, FocusDraft, FocusLog, Goal, Note, Settings } from "./data";
import type { Holding, PortfolioSettings, PricePoint, Snapshot } from "./portfolio";
import { peekStored, setStored } from "./store";
import { dateKey, uid } from "./utils";
import type { GoalRow, MealRow, MedRow, ScheduleRow, TrackerCategory, TrackerLog } from "./vault";

// One-time import from the old sync format (hidden appDataFolder: state.json + log-YYYY.json).
// Used only when the "Personal Dashboard" folder is first created, so a device with stale
// local data can't overwrite newer data another device had already backed up.

const RATING_ORDER = ["mood", "energy", "anxiety", "sleep", "focus", "motivation"] as const;
const FILES_API = "https://www.googleapis.com/drive/v3/files";

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

// ---------- Applying remote data ----------

function applyRemote(state: StateFile, logs: Record<string, LogFile>) {
  {
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
  }
}

type DriveFile = { id: string; name: string; appProperties?: { savedAt?: string } };

// Returns true when older-format data from Drive was newer than this device and was applied.
export async function importLegacy(accessToken: string, localSavedAt: number): Promise<boolean> {
  const get = async (url: string) => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!response.ok) throw new Error(`Google Drive error ${response.status}`);
    return response.json();
  };
  let files: DriveFile[];
  try {
    files = ((await get(`${FILES_API}?spaces=appDataFolder&pageSize=100&fields=files(id,name,appProperties)`)) as { files: DriveFile[] }).files;
  } catch {
    return false; // No access to the old folder: nothing to import.
  }
  const state = files.find((f) => f.name === "state.json");
  if (!state || Number(state.appProperties?.savedAt ?? 0) <= localSavedAt) return false;
  const logs: Record<string, LogFile> = {};
  for (const file of files) {
    const match = /^log-(\d{4})\.json$/.exec(file.name);
    if (match) logs[match[1]] = (await get(`${FILES_API}/${file.id}?alt=media`)) as LogFile;
  }
  applyRemote((await get(`${FILES_API}/${state.id}?alt=media`)) as StateFile, logs);
  return true;
}
