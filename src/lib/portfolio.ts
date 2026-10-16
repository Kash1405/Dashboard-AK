import { useCallback } from "react";
import { getStored, setStored, useStored } from "./store";
import { dateKey, uid } from "./utils";

export type PricePoint = { d: string; p: number };
export type Holding = {
  id: string;
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  price: number;
  prevClose: number;
  intrinsic: number;
  history: PricePoint[];
  updatedAt?: string;
};
export type Snapshot = { d: string; v: number };
export type MarketQuote = { symbol: string; label: string; price: number; changePct: number };
export type PortfolioSettings = { apiKey: string; currency: string; hideConnect: boolean };
export type RefreshStatus = { loading: boolean; error: string; at: number };

const today = dateKey();
const sampleHoldings: Holding[] = [
  { id: uid(), symbol: "NVDA", name: "NVIDIA Corp.", shares: 20, avgCost: 98, price: 141.97, prevClose: 135.44, intrinsic: 158.4, history: [{ d: today, p: 141.97 }] },
  { id: uid(), symbol: "MSFT", name: "Microsoft", shares: 8, avgCost: 380, price: 449.28, prevClose: 443.78, intrinsic: 472, history: [{ d: today, p: 449.28 }] },
  { id: uid(), symbol: "AAPL", name: "Apple Inc.", shares: 15, avgCost: 170, price: 195.1, prevClose: 194.28, intrinsic: 186.2, history: [{ d: today, p: 195.1 }] },
  { id: uid(), symbol: "TSLA", name: "Tesla Inc.", shares: 6, avgCost: 350, price: 322.05, prevClose: 332.63, intrinsic: 246.5, history: [{ d: today, p: 322.05 }] },
];

const settingsFallback: PortfolioSettings = { apiKey: "", currency: "USD", hideConnect: false };
const statusFallback: RefreshStatus = { loading: false, error: "", at: 0 };

export const useHoldings = () => useStored<Holding[]>("portfolio.holdings", sampleHoldings);
export const useSnapshots = () => useStored<Snapshot[]>("portfolio.snapshots", []);
export const usePortfolioSettings = () => useStored<PortfolioSettings>("portfolio.settings", settingsFallback);
export const useMarket = () => useStored<MarketQuote[]>("portfolio.market", []);
export const useRefreshStatus = () => useStored<RefreshStatus>("~portfolio.status", statusFallback);

export const currencies = ["USD", "INR", "GBP", "EUR", "CAD", "AUD", "JPY"];

export function useMoney() {
  const [settings] = usePortfolioSettings();
  return useCallback(
    (value: number, opts: { signed?: boolean; digits?: number } = {}) => {
      const digits = opts.digits ?? 2;
      const text = Math.abs(value).toLocaleString(undefined, { style: "currency", currency: settings.currency || "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
      if (opts.signed) return `${value >= 0 ? "+" : "−"}${text}`;
      return value < 0 ? `−${text}` : text;
    },
    [settings.currency],
  );
}

export type Valuation = "Undervalued" | "Fair value" | "Overvalued" | "No estimate";

export function derive(h: Holding) {
  const value = h.shares * h.price;
  const cost = h.shares * h.avgCost;
  const pl = value - cost;
  const plPct = cost ? (pl / cost) * 100 : 0;
  const dayChange = h.prevClose ? (h.price - h.prevClose) * h.shares : 0;
  const dayPct = h.prevClose ? (h.price / h.prevClose - 1) * 100 : 0;
  const upside = h.intrinsic && h.price ? (h.intrinsic / h.price - 1) * 100 : null;
  const status: Valuation = upside === null ? "No estimate" : upside > 10 ? "Undervalued" : upside < -10 ? "Overvalued" : "Fair value";
  return { value, cost, pl, plPct, dayChange, dayPct, upside, status };
}

export function totals(holdings: Holding[]) {
  let value = 0, cost = 0, dayChange = 0, prevValue = 0, ivValue = 0, ivPrice = 0;
  for (const h of holdings) {
    const d = derive(h);
    value += d.value;
    cost += d.cost;
    dayChange += d.dayChange;
    prevValue += h.prevClose ? h.prevClose * h.shares : d.value;
    if (h.intrinsic) {
      ivValue += h.intrinsic * h.shares;
      ivPrice += d.value;
    }
  }
  const pl = value - cost;
  return {
    value,
    cost,
    pl,
    plPct: cost ? (pl / cost) * 100 : 0,
    dayChange,
    dayPct: prevValue ? (dayChange / prevValue) * 100 : 0,
    marginOfSafety: ivPrice ? (ivValue / ivPrice - 1) * 100 : null,
  };
}

export function pushHistory(history: PricePoint[], price: number) {
  const d = dateKey();
  return [...history.filter((point) => point.d !== d), { d, p: price }].slice(-400);
}

export const palette = ["#f2382b", "#d7d7d0", "#45d39f", "#f5a524", "#5b8def", "#8b5cf6", "#3a3c42"];

export function allocation(holdings: Holding[], max = 5) {
  const rows = holdings.map((h) => ({ label: h.symbol, value: h.shares * h.price })).sort((a, b) => b.value - a.value);
  const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;
  const top = rows.slice(0, max);
  const rest = rows.slice(max).reduce((sum, row) => sum + row.value, 0);
  if (rest > 0) top.push({ label: "Other", value: rest });
  return top.map((row, i) => ({ ...row, share: (row.value / total) * 100, color: row.label === "Other" ? palette[6] : palette[i % 6] }));
}

// Finnhub (free key at finnhub.io) allows browser requests; Yahoo Finance does not.
async function finnhub<T>(path: string, key: string): Promise<T> {
  const response = await fetch(`https://finnhub.io/api/v1/${path}${path.includes("?") ? "&" : "?"}token=${encodeURIComponent(key)}`);
  if (response.status === 401 || response.status === 403) throw new Error("Finnhub rejected the API key.");
  if (response.status === 429) throw new Error("Finnhub rate limit hit, try again in a minute.");
  if (!response.ok) throw new Error(`Finnhub error ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchQuote(symbol: string, key: string) {
  const q = await finnhub<{ c: number; pc: number; dp: number }>(`quote?symbol=${encodeURIComponent(symbol)}`, key);
  if (!q || !q.c) throw new Error(`No live quote for ${symbol}`);
  return { price: q.c, prevClose: q.pc, changePct: q.dp ?? 0 };
}

export async function fetchName(symbol: string, key: string) {
  const profile = await finnhub<{ name?: string }>(`stock/profile2?symbol=${encodeURIComponent(symbol)}`, key);
  return profile?.name ?? "";
}

const marketSymbols = [
  { symbol: "SPY", label: "S&P 500 · SPY" },
  { symbol: "QQQ", label: "NASDAQ 100 · QQQ" },
  { symbol: "DIA", label: "DOW 30 · DIA" },
  { symbol: "BINANCE:BTCUSDT", label: "BTC / USDT" },
];

export async function refreshPortfolio() {
  const settings = getStored("portfolio.settings", settingsFallback);
  if (!settings.apiKey) return;
  setStored<RefreshStatus>("~portfolio.status", (s) => ({ ...s, loading: true, error: "" }), statusFallback);
  const holdings = getStored<Holding[]>("portfolio.holdings", sampleHoldings);
  const symbols = [...new Set(holdings.map((h) => h.symbol))];
  const [holdingResults, marketResults] = await Promise.all([
    Promise.allSettled(symbols.map((symbol) => fetchQuote(symbol, settings.apiKey))),
    Promise.allSettled(marketSymbols.map((m) => fetchQuote(m.symbol, settings.apiKey))),
  ]);
  const quotes = new Map<string, { price: number; prevClose: number }>();
  const failed: string[] = [];
  holdingResults.forEach((result, i) => (result.status === "fulfilled" ? quotes.set(symbols[i], result.value) : failed.push(symbols[i])));
  const firstError = [...holdingResults, ...marketResults].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;

  setStored<Holding[]>(
    "portfolio.holdings",
    (current) =>
      current.map((h) => {
        const q = quotes.get(h.symbol);
        return q ? { ...h, price: q.price, prevClose: q.prevClose, history: pushHistory(h.history, q.price), updatedAt: new Date().toISOString() } : h;
      }),
    sampleHoldings,
  );
  const market = marketResults.flatMap((result, i) => (result.status === "fulfilled" ? [{ ...marketSymbols[i], price: result.value.price, changePct: result.value.changePct }] : []));
  if (market.length) setStored("portfolio.market", market);

  const keyError = firstError && String(firstError.reason?.message ?? "").includes("API key");
  const error = keyError ? String(firstError.reason.message) : failed.length ? `No live quote for ${failed.join(", ")}. Check the symbols, or edit those prices manually.` : firstError ? String(firstError.reason?.message ?? "") : "";
  setStored<RefreshStatus>("~portfolio.status", { loading: false, error, at: Date.now() });
}
