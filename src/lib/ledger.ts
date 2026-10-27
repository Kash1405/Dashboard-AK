import { getStored, peekStored, setStored, useStored } from "./store";
import type { Holding, PortfolioSettings, PricePoint, Snapshot } from "./portfolio";
import { uid } from "./utils";

// The "MAO Ledger" Google Sheet (in the Automated Equity Valuation via MAO folder) is written by
// the automated valuation runs. The dashboard reads it during Drive sync and treats it as the
// source of truth for positions, prices, history, cash and the morning briefing.
// Tabs read: Positions, Daily Prices, Portfolio History, Valuations, Briefings, Jim Notes and
// Dashboard Feed (JSON rows the 6 AM run writes: a portfolio summary and one research row per holding).

export const DEFAULT_LEDGER_ID = "1BCoX9__l-B67bXgk2OgBExZ8rd3-ueI8oftDGUGoE64";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const TABS = ["Positions", "Daily Prices", "Portfolio History", "Valuations", "Briefings", "Jim Notes", "Dashboard Feed"] as const;
const REFRESH_MS = 15 * 60 * 1000;

export type LedgerSettings = { id: string; enabled: boolean };
export type Valuation = { at: string; intrinsic: number; marginOfSafety: number | null; moat: string; moatScore: number; verdict: string };
export type JimNote = { d: string; action: string; score: string; note: string };
export type Briefing = { d: string; generatedAt: string; headline: string; winners: string; losers: string; body: string; link: string };
export type NavPoint = { d: string; nav: number; mv: number; basis: number; cash: number; dayPnl: number };
// Shapes written by mao/jobs/feed.py. Fields are read defensively in the UI; any may be missing.
export type FeedPosition = Record<string, number | string> & {
  Ticker: string; Name: string; Sector: string; returns?: { "1M"?: number | null; "3M"?: number | null; YTD?: number | null; "1Y"?: number | null; spark?: number[] };
  action?: string; score?: number;
};
export type FeedSlice = { label: string; value: number; pct: number };
export type FeedSummary = {
  as_of: string;
  totals: Record<string, number>;
  liquidity: Record<string, number> & { cash_accounts?: { account: string; currency: string; amount: number; usd: number }[] };
  allocation: Record<"sector" | "region" | "currency" | "position", FeedSlice[]>;
  positions: FeedPosition[];
  checks?: unknown;
  runs: Record<string, string | number>[];
};
export type FeedResearch = Record<string, any>;
export type Feed = { updated: string; summary: FeedSummary | null; research: Record<string, FeedResearch> };
export type LedgerData = {
  asOf: string;
  history?: NavPoint[];
  feed?: Feed;
  cash: number;
  nav: number;
  sectors: Record<string, string>;
  valuations: Record<string, Valuation>;
  notes: Record<string, JimNote>;
  briefing: Briefing | null;
};
export type LedgerStatus = { loading: boolean; error: string; at: number };

const settingsFallback: LedgerSettings = { id: DEFAULT_LEDGER_ID, enabled: true };
const statusFallback: LedgerStatus = { loading: false, error: "", at: 0 };

export const useLedgerSettings = () => useStored<LedgerSettings>("ledger.settings", settingsFallback);
export const useLedgerData = () => useStored<LedgerData | null>("ledger.data", null);
export const useLedgerStatus = () => useStored<LedgerStatus>("~ledger.status", statusFallback);
export const ledgerUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}/edit`;

// Accepts a full Sheets link or a bare ID.
export const ledgerIdFrom = (text: string) => text.match(/\/d\/([\w-]{20,})/)?.[1] ?? text.trim();

let force = false;
// Read the ledger on the next sync even if it was read recently.
export const requestLedgerRefresh = () => {
  force = true;
};

type Row = Record<string, unknown>;
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());
const numOr = (v: unknown, fallback = 0) => {
  if (typeof v === "number") return v;
  const n = parseFloat(str(v).replace(/[,$%]/g, ""));
  return Number.isFinite(n) ? n : fallback;
};
const day = (v: unknown) => str(v).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
const round = (n: number, digits = 4) => Math.round(n * 10 ** digits) / 10 ** digits;

// Rows as objects keyed by lower-cased header, so column order in the sheet doesn't matter.
function objects(values: unknown[][] = []): Row[] {
  const [head = [], ...rows] = values;
  const keys = head.map((h) => str(h).toLowerCase());
  return rows.filter((r) => r.some((c) => str(c))).map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
}
// Latest row per ticker (rows are appended, so the last one wins).
function latestBy(rows: Row[], keep: (r: Row) => boolean = () => true) {
  const out = new Map<string, Row>();
  for (const r of rows) if (str(r.ticker) && keep(r)) out.set(str(r.ticker).toUpperCase(), r);
  return out;
}

export function shouldReadLedger(full: boolean) {
  const settings = getStored("ledger.settings", settingsFallback);
  if (!settings.enabled || !settings.id) return false;
  return force || full || Date.now() - getStored("~ledger.status", statusFallback).at > REFRESH_MS;
}

// fetchJson is sync.ts's authorised fetch, so the ledger rides on the Drive sign-in.
export async function readLedger(fetchJson: <T>(url: string) => Promise<T>) {
  const settings = getStored("ledger.settings", settingsFallback);
  force = false;
  setStored<LedgerStatus>("~ledger.status", (s) => ({ ...s, loading: true }), statusFallback);
  try {
    const get = (tabs: readonly string[]) => fetchJson<{ valueRanges: { values?: unknown[][] }[] }>(
      `${SHEETS_API}/${settings.id}/values:batchGet?${tabs.map((t) => `ranges=${encodeURIComponent(`'${t}'`)}`).join("&")}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    );
    // A ledger from before the feed existed has no "Dashboard Feed" tab, which fails the whole batch.
    const { valueRanges } = await get(TABS).catch((error) => {
      if ((error as { status?: number }).status === 400) return get(TABS.slice(0, -1));
      throw error;
    });
    const [positions, prices, history, valuations, briefings, jim, feed = []] = valueRanges.map((r) => objects(r.values));
    applyLedger({ positions, prices, history, valuations, briefings, jim, feed });
    setStored<LedgerStatus>("~ledger.status", { loading: false, error: "", at: Date.now() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read the MAO Ledger.";
    const status = (error as { status?: number }).status;
    const friendly =
      status === 403 && /scope/i.test(message) ? "Google needs permission to read the MAO Ledger. Click “Reconnect Google” below."
      : status === 403 || status === 404 ? "This Google account can't open the MAO Ledger. Check the link in Data settings."
      : message;
    setStored<LedgerStatus>("~ledger.status", { loading: false, error: friendly, at: Date.now() });
  }
}

function applyLedger(tabs: Record<"positions" | "prices" | "history" | "valuations" | "briefings" | "jim" | "feed", Row[]>) {
  // Price history per ticker from Daily Prices.
  const closes = new Map<string, PricePoint[]>();
  for (const r of tabs.prices) {
    const ticker = str(r.ticker).toUpperCase();
    const d = day(r.date);
    if (!ticker || !d) continue;
    closes.set(ticker, [...(closes.get(ticker) ?? []).filter((p) => p.d !== d), { d, p: round(numOr(r.close)) }]);
  }

  const vals = latestBy(tabs.valuations, (r) => numOr(r["intrinsic value"]) > 0 || !!str(r.verdict));
  const local = getStored<Holding[]>("portfolio.holdings", []);
  let asOf = "";
  const sectors: Record<string, string> = {};

  if (tabs.positions.length) {
    const holdings = tabs.positions.flatMap((r): Holding[] => {
      const symbol = str(r.ticker).toUpperCase();
      const shares = numOr(r.shares);
      if (!symbol || !(shares > 0)) return [];
      const fx = numOr(r["fx to usd"], 1) || 1; // ledger reports in USD; convert anything else
      const old = local.find((h) => h.symbol === symbol);
      const iv = numOr(vals.get(symbol)?.["intrinsic value"]);
      const merged = new Map((old?.history ?? []).map((p) => [p.d, p.p]));
      for (const p of closes.get(symbol) ?? []) merged.set(p.d, round(p.p * fx));
      if (str(r["as of"]) > asOf) asOf = str(r["as of"]);
      if (str(r.sector)) sectors[symbol] = str(r.sector);
      return [{
        id: old?.id ?? uid(),
        symbol,
        name: str(r.name) || old?.name || symbol,
        shares,
        avgCost: round(numOr(r["avg cost"]) * fx),
        price: round(numOr(r.price) * fx),
        prevClose: round(numOr(r["prev close"]) * fx),
        intrinsic: iv > 0 ? round(iv * fx, 2) : old?.intrinsic ?? 0, // keep a manual estimate when the ledger has none
        history: [...merged].map(([d, p]) => ({ d, p })).sort((a, b) => a.d.localeCompare(b.d)).slice(-400),
        updatedAt: str(r["as of"]) ? new Date(str(r["as of"])).toISOString() : old?.updatedAt,
      }];
    });
    setStored<Holding[]>("portfolio.holdings", holdings);
    // Ledger amounts are in US dollars.
    setStored<PortfolioSettings>("portfolio.settings", (s) => (s.currency === "USD" ? s : { ...s, currency: "USD" }), { apiKey: "", currency: "USD", hideConnect: false });
  }

  // Portfolio History drives the performance chart (market value of holdings, as the dashboard records it).
  const historyRows = tabs.history.filter((r) => day(r.date));
  if (historyRows.length) {
    const ledgerDays = new Map(historyRows.map((r) => [day(r.date), round(numOr(r["market value usd"]), 2)]));
    setStored<Snapshot[]>(
      "portfolio.snapshots",
      (prev) => [...prev.filter((s) => !ledgerDays.has(s.d)), ...[...ledgerDays].map(([d, v]) => ({ d, v }))].sort((a, b) => a.d.localeCompare(b.d)).slice(-1500),
      [],
    );
  }
  const last = historyRows[historyRows.length - 1];

  const valuations: Record<string, Valuation> = {};
  for (const [ticker, r] of vals) {
    const mos = str(r["margin of safety %"]);
    valuations[ticker] = {
      at: str(r.timestamp),
      intrinsic: numOr(r["intrinsic value"]),
      marginOfSafety: mos ? numOr(mos) : null,
      moat: str(r.moat),
      moatScore: numOr(r["moat score"]),
      verdict: str(r.verdict),
    };
  }
  const notes: Record<string, JimNote> = {};
  for (const [ticker, r] of latestBy(tabs.jim)) notes[ticker] = { d: day(r.date) || str(r.date), action: str(r.action), score: str(r.score), note: str(r.note) };

  const b = tabs.briefings.filter((r) => str(r.headline) || str(r.body)).pop();
  const briefing: Briefing | null = b
    ? { d: day(b.date) || str(b.date), generatedAt: str(b["generated at"]), headline: str(b.headline), winners: str(b.winners), losers: str(b.losers), body: str(b.body), link: str(b["doc link"]) }
    : peekStored<LedgerData>("ledger.data")?.briefing ?? null;

  const feed: Feed = { updated: "", summary: null, research: {} };
  for (const r of tabs.feed) {
    try {
      const key = str(r.key);
      const value = JSON.parse(str(r.json));
      if (str(r.updated) > feed.updated) feed.updated = str(r.updated);
      if (key === "summary") feed.summary = value;
      else if (key.startsWith("research:")) feed.research[key.slice(9).toUpperCase()] = value;
    } catch {
      // a half-written row; the next run replaces it
    }
  }
  const previous = peekStored<LedgerData>("ledger.data");

  setStored<LedgerData | null>("ledger.data", {
    asOf,
    history: historyRows.map((r) => ({
      d: day(r.date), nav: round(numOr(r["nav usd"]), 2), mv: round(numOr(r["market value usd"]), 2), basis: round(numOr(r["cost basis usd"]), 2),
      cash: round(numOr(r["cash usd"]), 2), dayPnl: round(numOr(r["day p&l usd"]), 2),
    })),
    feed: feed.summary || Object.keys(feed.research).length ? feed : previous?.feed,
    cash: last ? numOr(last["cash usd"]) : 0,
    nav: last ? numOr(last["nav usd"]) : 0,
    sectors,
    valuations,
    notes,
    briefing,
  });
}
