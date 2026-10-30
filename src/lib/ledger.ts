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
const BASE_TABS = ["Positions", "Daily Prices", "Portfolio History", "Valuations", "Briefings", "Jim Notes", "Holdings", "Cash"] as const;
// Newer tabs; an older ledger without them fails the whole batch, so they're read only when present.
const TABS = [...BASE_TABS, "Dashboard Feed", "Requests"] as const;

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
// The ledger's own input tabs, edited from the Holdings view.
export type HoldingInput = { Ticker: string; Name: string; Shares: number | string; "Avg Cost": number | string; Currency: string; Sector: string; Opened: string; Notes: string };
export type CashInput = { Account: string; Currency: string; Amount: number | string };
export type LedgerRequest = { at: string; type: string; ticker: string; status: string; detail: string };
export const HOLDING_COLUMNS = ["Ticker", "Name", "Shares", "Avg Cost", "Currency", "Sector", "Opened", "Notes"] as const;
export const CASH_COLUMNS = ["Account", "Currency", "Amount"] as const;
export type LedgerData = {
  asOf: string;
  history?: NavPoint[];
  feed?: Feed;
  inputs?: { holdings: HoldingInput[]; cash: CashInput[] };
  requests?: LedgerRequest[];
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
  return force || full; // no timed reads: opening the app, a manual sync, or a Refresh press
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
      if ((error as { status?: number }).status === 400) return get(BASE_TABS);
      throw error;
    });
    const [positions, prices, history, valuations, briefings, jim, holdingsTab, cashTab, feed = [], requests = []] = valueRanges.map((r) => objects(r.values));
    applyLedger({ positions, prices, history, valuations, briefings, jim, feed, holdingsTab, cashTab, requests });
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

function applyLedger(tabs: Record<"positions" | "prices" | "history" | "valuations" | "briefings" | "jim" | "feed" | "holdingsTab" | "cashTab" | "requests", Row[]>) {
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
    // objects() lower-cases headers; map back to the ledger's column names for editing.
    inputs: {
      holdings: tabs.holdingsTab.map((r) => Object.fromEntries(HOLDING_COLUMNS.map((c) => [c, r[c.toLowerCase()] ?? ""])) as HoldingInput),
      cash: tabs.cashTab.map((r) => Object.fromEntries(CASH_COLUMNS.map((c) => [c, r[c.toLowerCase()] ?? ""])) as CashInput),
    },
    requests: tabs.requests.slice(-30).map((r) => ({ at: str(r.timestamp), type: str(r.type), ticker: str(r.ticker).toUpperCase(), status: str(r.status), detail: str(r.detail) })),
    cash: last ? numOr(last["cash usd"]) : 0,
    nav: last ? numOr(last["nav usd"]) : 0,
    sectors,
    valuations,
    notes,
    briefing,
  });
}

// ---------- Writes (holdings edits and research requests) ----------

type Fetcher = <T>(url: string, init?: RequestInit) => Promise<T>;
const sendJson = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ledgerId = () => getStored("ledger.settings", settingsFallback).id;
const range = (tab: string, a1 = "") => encodeURIComponent(`'${tab}'${a1 ? `!${a1}` : ""}`);

async function ensureTab(fetchJson: Fetcher, tab: string) {
  const meta = await fetchJson<{ sheets: { properties: { title: string } }[] }>(`${SHEETS_API}/${ledgerId()}?fields=sheets.properties.title`);
  if (!meta.sheets.some((s) => s.properties.title === tab)) {
    await fetchJson(`${SHEETS_API}/${ledgerId()}:batchUpdate`, sendJson("POST", { requests: [{ addSheet: { properties: { title: tab } } }] }));
  }
}

// Replaces the Holdings and Cash tabs. Numbers stay numbers; text is written RAW so "0700.HK" isn't reinterpreted.
export async function saveLedgerInputs(fetchJson: Fetcher, holdings: HoldingInput[], cash: CashInput[]) {
  const cell = (v: unknown) => (typeof v === "number" ? v : String(v ?? "").trim());
  const num = (v: unknown) => (str(v) === "" ? "" : numOr(v));
  const holdingRows = holdings.map((h) => [str(h.Ticker).toUpperCase(), cell(h.Name), num(h.Shares), num(h["Avg Cost"]), str(h.Currency || "USD").toUpperCase(), cell(h.Sector), day(h.Opened) || str(h.Opened), cell(h.Notes)]);
  const cashRows = cash.map((c) => [cell(c.Account), str(c.Currency || "USD").toUpperCase(), numOr(c.Amount)]);
  await fetchJson(`${SHEETS_API}/${ledgerId()}/values:batchClear`, sendJson("POST", { ranges: ["'Holdings'!A2:Z", "'Cash'!A2:Z"] }));
  await fetchJson(`${SHEETS_API}/${ledgerId()}/values:batchUpdate`, sendJson("POST", {
    valueInputOption: "RAW",
    data: [
      { range: "'Holdings'!A1", values: [[...HOLDING_COLUMNS], ...holdingRows] },
      { range: "'Cash'!A1", values: [[...CASH_COLUMNS], ...cashRows] },
    ],
  }));
  setStored<LedgerData | null>("ledger.data", (d) => (d ? { ...d, inputs: { holdings, cash } } : d), null);
}

// Adds a row to the Requests tab; GitHub Actions (or the local MAO server) picks it up.
export async function queueRequest(fetchJson: Fetcher, type: "refresh" | "research" | "briefing", ticker = "") {
  await ensureTab(fetchJson, "Requests");
  const at = new Date().toISOString();
  const row = [at, type, ticker.toUpperCase(), "pending", ""];
  const existing = await fetchJson<{ values?: unknown[][] }>(`${SHEETS_API}/${ledgerId()}/values/${range("Requests", "A1:E1")}`);
  if (!existing.values?.length) {
    await fetchJson(`${SHEETS_API}/${ledgerId()}/values/${range("Requests", "A1")}?valueInputOption=RAW`, sendJson("PUT", { values: [["Timestamp", "Type", "Ticker", "Status", "Detail"]] }));
  }
  await fetchJson(`${SHEETS_API}/${ledgerId()}/values/${range("Requests", "A1")}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, sendJson("POST", { values: [row] }));
  const request: LedgerRequest = { at, type, ticker: ticker.toUpperCase(), status: "pending", detail: "" };
  setStored<LedgerData | null>("ledger.data", (d) => (d ? { ...d, requests: [...(d.requests ?? []), request] } : d), null);
  return request;
}

// Yahoo-style tickers (what MAO uses) to Google Finance symbols.
export function googleSymbol(ticker: string) {
  const t = ticker.trim().toUpperCase();
  const [base, suffix] = t.includes(".") ? [t.slice(0, t.lastIndexOf(".")), t.slice(t.lastIndexOf(".") + 1)] : [t, ""];
  const exchanges: Record<string, string> = { HK: "HKG", L: "LON", T: "TYO", TO: "TSE", AX: "ASX", SS: "SHA", SZ: "SHE", NS: "NSE", BO: "BOM", SI: "SGX", DE: "ETR", PA: "EPA", AS: "AMS" };
  if (suffix && exchanges[suffix]) return `${exchanges[suffix]}:${suffix === "HK" ? base.padStart(4, "0") : base}`;
  return t.replace(/-/g, ".");
}

export type QuickQuote = {
  ticker: string; name: string; price: number | null; changePct: number | null; currency: string; marketCap: number | null;
  pe: number | null; eps: number | null; high52: number | null; low52: number | null; volume: number | null; at: number;
};
const QUOTE_FIELDS = ["name", "price", "changepct", "currency", "marketcap", "pe", "eps", "high52", "low52", "volume"] as const;

// An instant quote without any server: GOOGLEFINANCE formulas in a "Lookup" tab, recalculated by Google.
export async function quickQuote(fetchJson: Fetcher, ticker: string): Promise<QuickQuote | null> {
  await ensureTab(fetchJson, "Lookup");
  const symbol = googleSymbol(ticker).replace(/"/g, "");
  await fetchJson(`${SHEETS_API}/${ledgerId()}/values/${range("Lookup", "A1")}?valueInputOption=USER_ENTERED`, sendJson("PUT", {
    values: [["Symbol", ...QUOTE_FIELDS], [symbol, ...QUOTE_FIELDS.map((f) => `=IFERROR(GOOGLEFINANCE($A$2,"${f}"),"")`)]],
  }));
  for (let attempt = 0; attempt < 6; attempt++) {
    const { values } = await fetchJson<{ values?: unknown[][] }>(`${SHEETS_API}/${ledgerId()}/values/${range("Lookup", "A2:K2")}?valueRenderOption=UNFORMATTED_VALUE`);
    const row = values?.[0] ?? [];
    const loading = row.some((v) => /loading/i.test(str(v)));
    if (!loading && row.length > 1) {
      const get = (f: (typeof QUOTE_FIELDS)[number]) => row[1 + QUOTE_FIELDS.indexOf(f)];
      const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      if (n(get("price")) === null) return null;
      return {
        ticker: ticker.toUpperCase(), name: str(get("name")) || ticker.toUpperCase(), price: n(get("price")), changePct: n(get("changepct")), currency: str(get("currency")),
        marketCap: n(get("marketcap")), pe: n(get("pe")), eps: n(get("eps")), high52: n(get("high52")), low52: n(get("low52")), volume: n(get("volume")), at: Date.now(),
      };
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return null;
}
