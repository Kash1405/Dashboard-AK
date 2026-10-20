import type { CalEvent, DailyTask, FocusLog, Goal, Note, QuickLink, Settings } from "./data";
import type { Holding, PortfolioSettings, PricePoint, Snapshot } from "./portfolio";
import { peekStored, setStored } from "./store";
import { pad, uid } from "./utils";
import type { GoalRow, GoalStatus, MealRow, MedRow, ScheduleRow, TrackerCategory, TrackerLog } from "./vault";

// How the dashboard maps onto the "Personal Dashboard" folder in Google Drive.
// Every input list is a tab in the "Dashboard Data" sheet, every dated history is a tab in
// "Dashboard Logs", and notes live in the "Notes" doc. Columns are matched by header name,
// so reordering columns or adding extra ones in Sheets is safe.

export type FileRole = "data" | "logs";
export type Cell = string | number | boolean;
export type Table = {
  file: FileRole;
  sheet: string;
  headers: string[];
  keys: string[]; // local store keys this tab is built from
  rows: () => Cell[][];
  apply: (rows: string[][]) => void;
};

const WELLNESS_KEYS = ["mood", "energy", "anxiety", "sleep", "focus", "motivation"] as const;
type WellnessEntry = { date: string; ratings: Record<string, number>; text: string; savedAt: string };

// ---------- Cell helpers (Sheets turns typed dates/times into serial numbers) ----------

export const cellText = (v: unknown) => (typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v === null || v === undefined ? "" : String(v));
const n = (s: string) => {
  const parsed = parseFloat(s.replace(/[^0-9.eE-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const yes = (s: string) => /^(true|yes|y|1|x|✓|✔|done)$/i.test(s.trim());
const isSerial = (s: string) => /^\d+(\.\d+)?$/.test(s);
const fromSerial = (s: string) => new Date(Math.round((Number(s) - 25569) * 86400000));
function date(s: string) {
  if (isSerial(s) && Number(s) > 20000) {
    const d = fromSerial(s);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return s.trim().slice(0, 10);
}
function time(s: string) {
  if (isSerial(s) && Number(s) < 1) {
    const mins = Math.round(Number(s) * 1440);
    return `${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)}`;
  }
  const m = /^(\d{1,2}):(\d{2})/.exec(s.trim());
  return m ? `${pad(Number(m[1]))}:${m[2]}` : s.trim();
}
function dateTime(s: string) {
  if (isSerial(s) && Number(s) > 20000) {
    const d = fromSerial(s);
    return new Date(d.getTime() + d.getTimezoneOffset() * 60000).toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

const get = <T,>(key: string, fallback: T) => peekStored<T>(key) ?? fallback;
const byDateDesc = <T extends Cell[]>(rows: T[]) => rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));

// ---------- Dashboard Data ----------

const settingsTable: Table = {
  file: "data",
  sheet: "Settings",
  headers: ["Setting", "Value"],
  keys: ["settings", "portfolio.settings", "daily.lastReset"],
  rows: () => [
    ["Name", get<Settings>("settings", { name: "" }).name],
    ["Currency", get<Partial<PortfolioSettings>>("portfolio.settings", {}).currency ?? "USD"],
    ["Daily tasks last reset", get("daily.lastReset", "")],
  ],
  apply: (rows) => {
    const value = (label: string) => rows.find((r) => r[0].trim().toLowerCase() === label.toLowerCase())?.[1];
    const name = value("Name");
    const currency = value("Currency");
    const reset = value("Daily tasks last reset");
    if (name !== undefined) setStored<Settings>("settings", (s) => ({ ...s, name }), { name: "" });
    if (currency) setStored<PortfolioSettings>("portfolio.settings", (s) => ({ ...s, currency: currency.trim().toUpperCase() }), { apiKey: "", currency: "USD", hideConnect: false });
    if (reset) setStored("daily.lastReset", date(reset));
  },
};

// A plain list keyed by an ID column; rows added in Sheets without an ID get one.
function listTable<T extends { id: string }>(file: FileRole, sheet: string, key: string, columns: [string, (item: T) => Cell, (s: string) => Partial<T>][]): Table {
  return {
    file,
    sheet,
    headers: ["ID", ...columns.map(([h]) => h)],
    keys: [key],
    rows: () => get<T[]>(key, []).map((item) => [item.id, ...columns.map(([, out]) => out(item))]),
    apply: (rows) => {
      const items = rows
        .filter((r) => r.slice(1).some((c) => c.trim()))
        .map((r) => Object.assign({ id: r[0].trim() || uid() }, ...columns.map(([, , parse], i) => parse(r[i + 1] ?? ""))) as T);
      setStored(key, items);
    },
  };
}

const tasksTable = listTable<DailyTask>("data", "Daily Tasks", "daily.tasks", [
  ["Task", (t) => t.text, (s) => ({ text: s })],
  ["Time", (t) => t.time, (s) => ({ time: time(s) })],
  ["Done", (t) => t.done, (s) => ({ done: yes(s) })],
  ["Schedule ID", (t) => t.scheduleId ?? "", (s) => ({ scheduleId: s.trim() || undefined })],
]);

const goalsTable = listTable<Goal>("data", "Goals", "goals", [
  ["Goal", (g) => g.text, (s) => ({ text: s })],
  ["Tag", (g) => g.tag, (s) => ({ tag: s })],
  ["Progress %", (g) => g.progress, (s) => ({ progress: Math.max(0, Math.min(100, Math.round(n(s) <= 1 && s.includes(".") ? n(s) * 100 : n(s)))) })],
  ["Done", (g) => g.done, (s) => ({ done: yes(s) })],
]);

const statuses: GoalStatus[] = ["Not Started", "In Progress", "Done", "On Hold", "Overdue"];
const goalPlanTable = listTable<GoalRow>("data", "Goal Plan", "goals.table", [
  ["Type", (g) => g.type, (s) => ({ type: s })],
  ["Skill", (g) => g.skill, (s) => ({ skill: s })],
  ["Description", (g) => g.description, (s) => ({ description: s })],
  ["Comments", (g) => g.comments, (s) => ({ comments: s })],
  ["Start Date", (g) => g.start ?? "", (s) => ({ start: s.trim() ? date(s) : "" })],
  ["End Date", (g) => g.end ?? "", (s) => ({ end: s.trim() ? date(s) : "" })],
  ["Status", (g) => g.status, (s) => ({ status: statuses.find((x) => x.toLowerCase() === s.trim().toLowerCase()) ?? "Not Started" })],
]);

const eventsTable = listTable<CalEvent>("data", "Calendar Events", "events", [
  ["Date", (e) => e.date, (s) => ({ date: date(s) })],
  ["Time", (e) => e.time, (s) => ({ time: time(s) })],
  ["Title", (e) => e.title, (s) => ({ title: s })],
]);

const linksTable = listTable<QuickLink>("data", "Links", "links", [
  ["Name", (l) => l.name, (s) => ({ name: s.trim() })],
  ["URL", (l) => l.url, (s) => ({ url: s.trim() })],
]);

const holdingsTable: Table = {
  file: "data",
  sheet: "Holdings",
  headers: ["ID", "Symbol", "Name", "Shares", "Avg Cost", "Price", "Prev Close", "Intrinsic Value", "Updated At"],
  keys: ["portfolio.holdings"],
  rows: () => get<Holding[]>("portfolio.holdings", []).map((h) => [h.id, h.symbol, h.name, h.shares, h.avgCost, h.price, h.prevClose, h.intrinsic, h.updatedAt ?? ""]),
  apply: (rows) => {
    const local = get<Holding[]>("portfolio.holdings", []);
    setStored<Holding[]>(
      "portfolio.holdings",
      rows
        .filter((r) => r[1]?.trim())
        .map((r) => {
          const symbol = r[1].trim().toUpperCase();
          return {
            id: r[0].trim() || uid(),
            symbol,
            name: r[2] ?? "",
            shares: n(r[3] ?? ""),
            avgCost: n(r[4] ?? ""),
            price: n(r[5] ?? ""),
            prevClose: n(r[6] ?? ""),
            intrinsic: n(r[7] ?? ""),
            updatedAt: r[8] || undefined,
            history: local.find((h) => h.symbol === symbol)?.history ?? [],
          };
        }),
    );
  },
};

const medsTable = listTable<MedRow>("data", "Medications", "advisor.meds", [
  ["Name", (m) => m.name, (s) => ({ name: s })],
  ["Dose", (m) => m.dose, (s) => ({ dose: s })],
  ["Role", (m) => m.role, (s) => ({ role: s })],
  ["Side Effects", (m) => m.sideEffects, (s) => ({ sideEffects: s })],
  ["Time", (m) => m.time, (s) => ({ time: time(s) })],
]);

const scheduleTable = listTable<ScheduleRow>("data", "Daily Schedule", "advisor.schedule", [
  ["Start", (r) => r.start, (s) => ({ start: time(s) })],
  ["End", (r) => r.end, (s) => ({ end: time(s) })],
  ["Activity", (r) => r.activity, (s) => ({ activity: s })],
  ["Description", (r) => r.description, (s) => ({ description: s })],
]);

const mealsTable = listTable<MealRow>("data", "Meal Plan", "advisor.meals", [
  ["Meal", (m) => m.meal, (s) => ({ meal: s })],
  ["Details", (m) => m.details, (s) => ({ details: s })],
]);

const trackerTable: Table = {
  file: "data",
  sheet: "Habit Tracker",
  headers: ["Category ID", "Category", "Item ID", "Item"],
  keys: ["advisor.tracker"],
  rows: () => get<TrackerCategory[]>("advisor.tracker", []).flatMap((c) => (c.items.length ? c.items.map((i) => [c.id, c.name, i.id, i.label]) : [[c.id, c.name, "", ""]])),
  apply: (rows) => {
    const categories: TrackerCategory[] = [];
    for (const r of rows) {
      const name = r[1]?.trim();
      if (!name) continue;
      let cat = categories.find((c) => (r[0].trim() ? c.id === r[0].trim() : c.name === name));
      if (!cat) categories.push((cat = { id: r[0].trim() || uid(), name, items: [] }));
      if (r[3]?.trim()) cat.items.push({ id: r[2].trim() || uid(), label: r[3].trim() });
    }
    setStored("advisor.tracker", categories);
  },
};

// ---------- Dashboard Logs ----------

const focusTable: Table = {
  file: "logs",
  sheet: "Focus Sessions",
  headers: ["Completed At", "Task", "Description", "Minutes", "ID"],
  keys: ["focus.logs"],
  rows: () => byDateDesc(get<FocusLog[]>("focus.logs", []).map((l) => [l.completedAt, l.task, l.description, Math.round((l.seconds / 60) * 100) / 100, l.id])),
  apply: (rows) =>
    setStored<FocusLog[]>(
      "focus.logs",
      rows
        .filter((r) => r[0]?.trim())
        .map((r) => ({ completedAt: dateTime(r[0]), task: r[1] ?? "", description: r[2] ?? "", seconds: Math.round(n(r[3] ?? "") * 60), id: r[4]?.trim() || uid() }))
        .sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    ),
};

const wellnessTable: Table = {
  file: "logs",
  sheet: "Wellness Check-ins",
  headers: ["Date", "Mood", "Energy", "Anxiety", "Sleep", "Focus", "Motivation", "Reflection", "Saved At"],
  keys: ["wellness.entries"],
  rows: () => byDateDesc(Object.values(get<Record<string, WellnessEntry>>("wellness.entries", {})).map((e) => [e.date, ...WELLNESS_KEYS.map((k) => e.ratings[k] ?? 5), e.text, e.savedAt])),
  apply: (rows) => {
    const entries: Record<string, WellnessEntry> = {};
    for (const r of rows) {
      const d = date(r[0] ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      entries[d] = {
        date: d,
        ratings: Object.fromEntries(WELLNESS_KEYS.map((k, i) => [k, Math.max(1, Math.min(10, Math.round(n(r[i + 1] ?? "5") || 5)))])),
        text: r[7] ?? "",
        savedAt: r[8] ? dateTime(r[8]) : `${d}T12:00:00.000Z`,
      };
    }
    setStored("wellness.entries", entries);
  },
};

// Date → { id → value } logs, one row per entry. The name column is for reading only.
function datedTable(sheet: string, key: string, headers: string[], label: (id: string) => string, toCells: (v: unknown) => Cell[], fromCells: (r: string[]) => unknown): Table {
  return {
    file: "logs",
    sheet,
    headers,
    keys: [key],
    rows: () => byDateDesc(Object.entries(get<Record<string, Record<string, unknown>>>(key, {})).flatMap(([d, items]) => Object.entries(items).map(([id, v]) => [d, id, label(id), ...toCells(v)]))),
    apply: (rows) => {
      const log: Record<string, Record<string, unknown>> = {};
      for (const r of rows) {
        const d = date(r[0] ?? "");
        const id = r[1]?.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !id) continue;
        (log[d] ??= {})[id] = fromCells(r.slice(3));
      }
      setStored(key, log);
    },
  };
}

const medName = (id: string) => get<MedRow[]>("advisor.meds", []).find((m) => m.id === id)?.name ?? "";
const mealName = (id: string) => get<MealRow[]>("advisor.meals", []).find((m) => m.id === id)?.meal ?? "";
const itemName = (id: string) => get<TrackerCategory[]>("advisor.tracker", []).flatMap((c) => c.items).find((i) => i.id === id)?.label ?? "";

const medLogTable = datedTable("Medication Log", "wellness.medLog", ["Date", "Medication ID", "Medication", "Taken At"], medName, (v) => [String(v)], (r) => time(r[0] ?? "") || "—");
const habitLogTable = datedTable("Habit Log", "advisor.trackerLog", ["Date", "Item ID", "Item", "Done", "Note"], itemName,
  (v) => {
    const e = v as TrackerLog[string][string];
    return [e.done, e.note];
  },
  (r) => ({ done: yes(r[0] ?? ""), note: r[1] ?? "" }));
const mealLogTable = datedTable("Meal Log", "advisor.mealLog", ["Date", "Meal ID", "Meal", "Eaten"], mealName, (v) => [Boolean(v)], (r) => yes(r[0] ?? "TRUE") || !r[0]);

const snapshotsTable: Table = {
  file: "logs",
  sheet: "Portfolio Value",
  headers: ["Date", "Value"],
  keys: ["portfolio.snapshots"],
  rows: () => byDateDesc(get<Snapshot[]>("portfolio.snapshots", []).map((s) => [s.d, s.v])),
  apply: (rows) => setStored<Snapshot[]>("portfolio.snapshots", rows.filter((r) => r[0]?.trim()).map((r) => ({ d: date(r[0]), v: n(r[1] ?? "") })).sort((a, b) => a.d.localeCompare(b.d))),
};

const pricesTable: Table = {
  file: "logs",
  sheet: "Price History",
  headers: ["Date", "Symbol", "Price"],
  keys: ["portfolio.holdings"],
  rows: () => byDateDesc(get<Holding[]>("portfolio.holdings", []).flatMap((h) => h.history.map((p) => [p.d, h.symbol, p.p]))),
  apply: (rows) => {
    const bySymbol: Record<string, PricePoint[]> = {};
    for (const r of rows) if (r[0]?.trim() && r[1]?.trim()) (bySymbol[r[1].trim().toUpperCase()] ??= []).push({ d: date(r[0]), p: n(r[2] ?? "") });
    setStored<Holding[]>("portfolio.holdings", (list) => list.map((h) => ({ ...h, history: (bySymbol[h.symbol] ?? []).sort((a, b) => a.d.localeCompare(b.d)) })), []);
  },
};

// Order matters when applying: Holdings before Price History.
export const TABLES: Table[] = [
  settingsTable, linksTable, tasksTable, goalsTable, goalPlanTable, eventsTable, holdingsTable, medsTable, scheduleTable, mealsTable, trackerTable,
  focusTable, wellnessTable, medLogTable, habitLogTable, mealLogTable, snapshotsTable, pricesTable,
];

// ---------- Notes doc ----------
// Each note starts with a heading line "— 2026-10-18 10:21 —"; anything above the first one is ignored.

const NOTE_HEAD = /^[—–-]+\s*(\d{4}-\d{2}-\d{2})(?:[ T,]+(\d{1,2}:\d{2}))?\s*[—–-]+$/;
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const noteRows = (): string[][] => get<Note[]>("notes", []).map((note) => [stamp(note.createdAt), note.text.trim()]);

export function notesHtml() {
  const body = get<Note[]>("notes", [])
    .map((note) => `<p><b>— ${stamp(note.createdAt)} —</b></p>${note.text.trim().split("\n").map((line) => `<p>${escapeHtml(line) || "&nbsp;"}</p>`).join("")}<p></p>`)
    .join("");
  return `<html><body><h1>Notes</h1><p><i>Kept in sync with your dashboard. Start a new note with a line like “— 2026-10-18 09:30 —”; it appears on the dashboard at the next sync.</i></p><p></p>${body}</body></html>`;
}

export function parseNotes(text: string): string[][] {
  const rows: string[][] = [];
  let current: { head: string; lines: string[] } | null = null;
  const close = () => {
    if (current) rows.push([current.head, current.lines.join("\n").replace(/ /g, " ").trim()]);
  };
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = NOTE_HEAD.exec(raw.trim());
    if (m) {
      close();
      current = { head: `${m[1]} ${m[2] ? time(m[2]) : "00:00"}`, lines: [] };
    } else if (current) current.lines.push(raw);
  }
  close();
  return rows.filter((r) => r[1]);
}

export function applyNotes(rows: string[][]) {
  const local = get<Note[]>("notes", []);
  setStored<Note[]>(
    "notes",
    rows.map(([head, text]) => {
      const same = local.find((note) => stamp(note.createdAt) === head && note.text.trim() === text);
      if (same) return same;
      const [d, t] = head.split(" ");
      const [y, mo, da] = d.split("-").map(Number);
      const [h, mi] = (t ?? "00:00").split(":").map(Number);
      return { id: uid(), text, createdAt: new Date(y, mo - 1, da, h, mi).toISOString() };
    }),
  );
}
