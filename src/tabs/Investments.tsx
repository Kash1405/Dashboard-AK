import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Icon, Panel, PanelTitle, Sparkline } from "../components/ui";
import { useStored } from "../lib/store";
import { useMoney } from "../lib/portfolio";
import {
  HOLDING_COLUMNS, ledgerIdFrom, ledgerUrl, queueRequest, quickQuote, saveLedgerInputs, useLedgerData, useLedgerSettings, useLedgerStatus,
  type Briefing, type CashInput, type FeedPosition, type FeedResearch, type FeedSummary, type HoldingInput, type JimNote, type LedgerRequest, type NavPoint, type QuickQuote,
} from "../lib/ledger";
import { runnerMessage, startRequests, useGithubSettings } from "../lib/maoJobs";
import { googleJson, refreshLedger, useSyncMeta } from "../lib/sync";
import { dateKey, downloadFile, parseDateKey, pct, timeLabel } from "../lib/utils";

// The Investments tab shows the MAO equity research system. Everything comes from the MAO Ledger
// sheet. Nothing runs on a timer: Refresh queues a run that updates prices, NAV history, the
// "Dashboard Feed" (research per holding) and desk notes; Generate briefing writes the briefing; and
// searching a stock queues its research. The page writes only the ledger's Holdings and Cash tabs and
// its Requests queue (see lib/maoJobs.ts).

type Money = ReturnType<typeof useMoney>;
type View = "Summary" | "Holdings" | "Research";
const views: { view: View; icon: string; blurb: string }[] = [
  { view: "Summary", icon: "grid", blurb: "Portfolio, liquidity and allocation" },
  { view: "Holdings", icon: "briefcase", blurb: "Positions, P&L and sizing" },
  { view: "Research", icon: "bulb", blurb: "Valuation, moat, sentiment and charts" },
];
const FOLDER_URL = "https://drive.google.com/drive/folders/18allYWNhv9ehaFGu2GIG8xliteo7DXzo";

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const fixed = (v: unknown, digits = 1, suffix = "") => (n(v) === null ? "—" : `${(v as number).toFixed(digits)}${suffix}`);
const signed = (v: unknown, digits = 1) => (n(v) === null ? "—" : pct(v as number, digits));
const tone = (v: unknown) => (n(v) === null || v === 0 ? "" : (v as number) > 0 ? "up" : "down");
const shortDate = (d: string) => parseDateKey(d).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const compact = (v: unknown) => (n(v) === null ? "—" : Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v as number));
const actionClass = (action?: string) => `action-badge ${(action || "").toLowerCase()}`;

export default function Investments() {
  const [view, setView] = useStored<View>("investments.view", "Summary");
  const [ledger] = useLedgerSettings();
  const [data] = useLedgerData();
  const [status] = useLedgerStatus();
  const [drive] = useSyncMeta();
  const [showSettings, setShowSettings] = useState(false);
  const [job, setJob] = useState<{ message: string; error?: boolean } | null>(null);
  const money = useMoney();
  const linked = ledger.enabled && !!ledger.id;
  const summary = data?.feed?.summary ?? null;
  const active: View = views.some((v) => v.view === view) ? view : "Summary";
  const pending = openRequests(data?.requests);

  // While anything is queued, re-read the ledger every 30 seconds so results appear by themselves.
  useEffect(() => {
    if (!pending.length) return;
    const timer = window.setInterval(() => refreshLedger(), 30_000);
    return () => window.clearInterval(timer);
  }, [pending.length]);
  useEffect(() => {
    if (!pending.length) setJob((j) => (j && !j.error ? null : j));
  }, [pending.length]);

  // Queue work in the ledger, then start whatever can run it (GitHub Actions or the local server).
  const request = async (type: "refresh" | "research" | "briefing", ticker: string, what: string) => {
    setJob({ message: "Adding the request to the ledger…" });
    try {
      await queueRequest(googleJson, type, ticker);
      setJob({ message: runnerMessage(await startRequests(), what) });
    } catch (error) {
      setJob({ error: true, message: error instanceof Error ? error.message : "Couldn't queue the request." });
    }
  };

  const updated = data?.feed?.updated ? new Date(data.feed.updated) : null;

  return (
    <main className="page">
      <div className="welcome">
        <div>
          <p className="eyebrow red">MAO · LONG-TERM VALUE RESEARCH</p>
          <h1>Investment Control.</h1>
          <p>Portfolio, holdings and research from the automated equity desk, updated when you press Refresh.</p>
        </div>
        <div className="welcome-actions">
          <button className="secondary-button" onClick={() => request("refresh", "", "Refresh started: prices, research and desk notes.")} disabled={!drive.enabled}
            title="Update prices, NAV history, research and desk notes, then reload the ledger">
            <Icon name="refresh" size={14}/> {pending.some((r) => r.type === "refresh") ? "Refreshing…" : "Refresh"}
          </button>
          <button className="primary-button" onClick={() => request("briefing", "", "Briefing requested.")} disabled={!drive.enabled}><Icon name="play" size={14}/> Generate briefing</button>
          <button className="icon-button" onClick={() => setShowSettings(!showSettings)} aria-label="Investment settings" title="Investment settings"><Icon name="key" size={15}/></button>
        </div>
      </div>

      {showSettings && <LedgerSettings onClose={() => setShowSettings(false)}/>}

      <p className={`status-line ${status.error || job?.error ? "error" : ""}`}>
        {job ? job.message
          : status.error ? <>{status.error} <button className="text-button" onClick={() => refreshLedger(true)}>Reconnect Google</button></>
          : !linked ? <>The MAO Ledger isn't linked. <button className="text-button" onClick={() => setShowSettings(true)}>Link it</button></>
          : !drive.enabled ? <>Connect Google to load the MAO Ledger. <button className="text-button" onClick={() => refreshLedger()}>Connect Google</button></>
          : pending.length ? `${pending.length} request${pending.length > 1 ? "s" : ""} waiting to run (${pending.map((r) => r.ticker || r.type).join(", ")}). Checking every 30 seconds.`
          : updated ? `Research updated ${updated.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} ${timeLabel(updated)}${status.at ? ` · ledger read ${timeLabel(new Date(status.at))}` : ""}`
          : "The ledger has no research feed yet. Press Refresh to build it."}
      </p>

      <nav className="inv-tabs" aria-label="Investment views">
        {views.map(({ view: v, icon, blurb }) => (
          <button key={v} className={active === v ? "active" : ""} onClick={() => setView(v)} aria-pressed={active === v}>
            <Icon name={icon} size={16}/><span><b>{v}</b><small>{blurb}</small></span>
          </button>
        ))}
      </nav>

      {!summary ? (
        <Panel className="inv-empty">
          <Icon name="chart" size={28}/>
          <p>{linked ? "Waiting for the first Dashboard Feed from the MAO Ledger." : "Link the MAO Ledger to see your portfolio."}</p>
        </Panel>
      ) : active === "Summary" ? (
        <SummaryView summary={summary} history={data?.history ?? []} briefing={data?.briefing ?? null} portfolioNote={data?.notes._PORTFOLIO} money={money}
          onGenerate={() => request("briefing", "", "Briefing requested.")} busy={!drive.enabled}/>
      ) : active === "Holdings" ? (
        <HoldingsView summary={summary} research={data?.feed?.research ?? {}} inputs={data?.inputs} money={money}
          onSaved={() => request("refresh", "", "Holdings saved.")}/>
      ) : (
        <ResearchView summary={summary} research={data?.feed?.research ?? {}} notes={data?.notes ?? {}} requests={data?.requests ?? []} money={money}
          onResearch={(ticker) => request("research", ticker, `${ticker} research requested.`)}/>
      )}
    </main>
  );
}

// Requests still waiting, ignoring any abandoned for more than a day.
const openRequests = (requests: LedgerRequest[] = []) =>
  requests.filter((r) => (r.status || "pending").toLowerCase() === "pending" && Date.now() - +new Date(r.at || 0) < 864e5);

function LedgerSettings({ onClose }: { onClose: () => void }) {
  const [ledger, setLedger] = useLedgerSettings();
  const [github, setGithub] = useGithubSettings();
  return (
    <>
    <Panel className="connect-panel">
      <div>
        <p className="eyebrow red">MAO LEDGER · GOOGLE SHEETS</p>
        <h2>Where the data comes from</h2>
        <p>
          The MAO Ledger in your Automated Equity Valuation folder is read when you open the dashboard, after you press Refresh, and while a request is running.
          Change holdings and cash in the ledger's Holdings and Cash tabs; the next update picks them up.
        </p>
      </div>
      <div className="connect-form">
        <label className="wide">Ledger link<input value={ledger.id} onChange={(event) => setLedger({ ...ledger, id: ledgerIdFrom(event.target.value) })} placeholder="Paste the MAO Ledger link" autoComplete="off"/></label>
        <div className="connect-buttons">
          <button className="primary-button" onClick={() => { setLedger({ ...ledger, enabled: true }); refreshLedger(); onClose(); }} disabled={!ledger.id}>Read ledger now</button>
          {ledger.id && <a className="text-button" href={ledgerUrl(ledger.id)} target="_blank" rel="noreferrer">Open ledger</a>}
          <a className="text-button" href={FOLDER_URL} target="_blank" rel="noreferrer">Open Drive folder</a>
        </div>
      </div>
    </Panel>
    <Panel className="connect-panel">
      <div>
        <p className="eyebrow red">GITHUB ACTIONS · OPTIONAL</p>
        <h2>Run requests right away</h2>
        <p>
          Refresh, briefings, holdings edits and stock searches are queued in the ledger and run by GitHub Actions; nothing runs on a timer.
          For them to run, paste a fine-grained GitHub token limited to the <b>{github.repo}</b> repository
          with only <b>Actions: read and write</b> permission. It's stored in this browser only; add it on each device you use.
        </p>
      </div>
      <div className="connect-form">
        <label className="wide">GitHub token<input type="password" value={github.token} onChange={(event) => setGithub({ ...github, token: event.target.value.trim() })} placeholder="github_pat_…" autoComplete="off"/></label>
        <div className="connect-buttons">
          <a className="text-button" href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noreferrer">Create a token</a>
          {github.token && <button className="secondary-button" onClick={() => setGithub({ ...github, token: "" })}>Remove token</button>}
          <button className="secondary-button" onClick={onClose}>Close</button>
        </div>
      </div>
    </Panel>
    </>
  );
}

/* ---------------------------------------------------------------- Summary */

const ranges: [string, number][] = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365], ["ALL", 100000]];

function SummaryView({ summary, history, briefing, portfolioNote, money, onGenerate, busy }: {
  summary: FeedSummary; history: NavPoint[]; briefing: Briefing | null; portfolioNote?: JimNote; money: Money; onGenerate: () => void; busy: boolean;
}) {
  const t = summary.totals;
  const liq = summary.liquidity;
  const movers = [...summary.positions].sort((a, b) => Math.abs(Number(b["Day Change %"]) || 0) - Math.abs(Number(a["Day Change %"]) || 0));
  return (
    <>
      <div className="summary-strip six">
        <div><span>Net asset value</span><strong>{money(t.nav)}</strong></div>
        <div><span>Today</span><strong className={tone(t.day_pnl)}>{money(t.day_pnl, { signed: true })}</strong><em className={tone(t.day_pnl)}>{signed(t.day_pnl_pct, 2)}</em></div>
        <div><span>Unrealized P&L</span><strong className={tone(t.unrealized_pnl)}>{money(t.unrealized_pnl, { signed: true })}</strong><em className={tone(t.unrealized_pnl)}>{signed(t.unrealized_pnl_pct)}</em></div>
        <div><span>Invested</span><strong>{money(t.cost_basis)}</strong><em>{money(t.market_value)} now</em></div>
        <div><span>Cash</span><strong>{money(t.cash)}</strong><em>{fixed(liq.cash_pct, 1, "%")} of NAV</em></div>
        <div><span>Positions</span><strong>{t.positions}</strong><em>{fixed(liq.effective_positions, 1)} effective</em></div>
      </div>

      <div className="inv-grid wide-left">
        <NavPanel history={history} money={money}/>
        <AllocationPanel summary={summary} money={money}/>
      </div>

      <BriefingPanel briefing={briefing} onGenerate={onGenerate} busy={busy}/>

      <div className="inv-grid three">
        <Panel>
          <PanelTitle eyebrow="LIQUIDITY" title="Cash & concentration"/>
          <div className="stat-list">
            <Stat label="Cash share of NAV" value={fixed(liq.cash_pct, 1, "%")}/>
            <Stat label="Sellable within 1 day" value={fixed(liq.liquid_1d_pct, 0, "%")} hint="At 10% of average daily volume"/>
            <Stat label="Largest position" value={fixed(liq.largest_position_pct, 1, "%")} warn={(n(liq.largest_position_pct) ?? 0) > 15} hint="Desk limit 15%"/>
            <Stat label="Effective positions" value={fixed(liq.effective_positions, 1)} hint={`HHI ${fixed(liq.hhi, 2)}`}/>
          </div>
          {!!liq.cash_accounts?.length && (
            <div className="mini-table">
              {liq.cash_accounts.map((a) => <div key={a.account}><span>{a.account}</span><b>{a.currency} {Number(a.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></div>)}
            </div>
          )}
        </Panel>
        <Panel>
          <PanelTitle eyebrow="LAST SESSION" title="Movers"/>
          <div className="mover-list">
            {movers.map((p) => (
              <div key={p.Ticker}>
                <span><b>{p.Ticker}</b><small>{p.Name}</small></span>
                <Sparkline values={p.returns?.spark?.slice(-20) ?? [0, 0]} positive={(Number(p["Day Change %"]) || 0) >= 0}/>
                <em className={tone(p["Day Change %"])}>{signed(p["Day Change %"], 2)}<small>{money(Number(p["Day P&L USD"]) || 0, { signed: true })}</small></em>
              </div>
            ))}
          </div>
        </Panel>
        <Panel>
          <PanelTitle eyebrow="AUTOMATION" title="Recent runs"/>
          <div className="run-list">
            {summary.runs.slice(0, 7).map((r, i) => (
              <div key={i} className={r.Status === "ok" ? "" : "failed"}>
                <i/><span><b>{String(r.Job).replace(/_/g, " ")}</b><small>{String(r.Detail || "")}</small></span>
                <em>{r.Timestamp ? `${new Date(String(r.Timestamp)).toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${timeLabel(new Date(String(r.Timestamp)))}` : ""}</em>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      {portfolioNote?.note && (
        <Panel className="desk-note">
          <PanelTitle eyebrow={`DESK NOTE · PORTFOLIO · ${portfolioNote.d}`} title="What the desk is watching"/>
          <Markdown text={portfolioNote.note}/>
        </Panel>
      )}
    </>
  );
}

function NavPanel({ history, money }: { history: NavPoint[]; money: Money }) {
  const [range, setRange] = useStored("investments.range", "3M");
  const days = ranges.find(([label]) => label === range)?.[1] ?? 91;
  const cutoff = dateKey(new Date(Date.now() - days * 864e5));
  const points = history.filter((p) => p.d >= cutoff);
  const first = points[0];
  const last = points[points.length - 1];
  const change = first && last ? last.nav - first.nav : 0;
  return (
    <Panel className="nav-panel">
      <PanelTitle eyebrow="NET ASSET VALUE" title={last ? money(last.nav) : "—"}
        action={first && last ? <span className={change >= 0 ? "gain" : "gain loss"}>{money(change, { signed: true })} · {range}</span> : undefined}/>
      <div className="chart-toolbar">
        <span>Holdings plus cash, daily close</span>
        <div>{ranges.map(([label]) => <button className={range === label ? "active" : ""} onClick={() => setRange(label)} key={label}>{label}</button>)}</div>
      </div>
      {points.length > 1 ? (
        <SeriesChart dates={points.map((p) => p.d)} height={240} format={(v) => money(v, { digits: 0 })}
          series={[
            { label: "NAV", color: "var(--green)", values: points.map((p) => p.nav), area: true },
            { label: "Money put in (cost + cash)", color: "#7d8088", values: points.map((p) => p.basis + p.cash), dashed: true },
          ]}/>
      ) : <p className="chart-note">NAV history appears after the first morning update.</p>}
    </Panel>
  );
}

function AllocationPanel({ summary, money }: { summary: FeedSummary; money: Money }) {
  const [by, setBy] = useStored<"sector" | "region" | "currency" | "position">("investments.allocation", "sector");
  const slices = summary.allocation[by] ?? [];
  const max = Math.max(...slices.map((s) => s.pct), 1);
  return (
    <Panel>
      <PanelTitle eyebrow="ALLOCATION" title="Where the money is" action={
        <div className="segmented">
          {(["sector", "region", "currency", "position"] as const).map((k) => <button key={k} className={by === k ? "active" : ""} onClick={() => setBy(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}
        </div>
      }/>
      <div className="alloc-bars">
        {slices.map((s) => (
          <div key={s.label} title={`${s.label}: ${money(s.value)} (${s.pct.toFixed(1)}%)`}>
            <span>{s.label}</span>
            <i><b style={{ width: `${(s.pct / max) * 100}%` }} className={s.label === "Cash" ? "cash" : ""}/></i>
            <em>{s.pct.toFixed(1)}%<small>{money(s.value, { digits: 0 })}</small></em>
          </div>
        ))}
      </div>
      <small className="footnote">Share of NAV{by === "sector" ? ", cash included" : ""}. Desk limits: 15% per name, 35% per sector.</small>
    </Panel>
  );
}

// The ledger writes briefings as Markdown; this renders headings, bullets and bold.
function BriefingPanel({ briefing, onGenerate, busy }: { briefing: Briefing | null; onGenerate: () => void; busy: boolean }) {
  const [open, setOpen] = useStored("ledger.briefingOpen", false);
  const generated = briefing?.generatedAt ? new Date(briefing.generatedAt) : null;
  const body = briefing ? briefing.body.split("\n").filter((l) => !l.startsWith("# ") && l.replace(/\*/g, "").trim() !== briefing.headline).join("\n") : "";
  return (
    <Panel className="briefing-panel">
      <PanelTitle
        eyebrow={briefing ? `MORNING BRIEFING · ${parseDateKey(briefing.d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}${generated && !isNaN(+generated) ? ` · ${timeLabel(generated)}` : ""}` : "MORNING BRIEFING"}
        title={briefing?.headline || "No briefing yet"}
        action={
          <div className="panel-actions">
            {briefing?.link && <a className="text-button" href={briefing.link} target="_blank" rel="noreferrer"><Icon name="external" size={14}/> Open doc</a>}
            <button className="secondary-button" onClick={onGenerate} disabled={busy}><Icon name="play" size={13}/> Generate</button>
          </div>
        }/>
      {briefing ? (
        <>
          <div className="briefing-movers">
            {briefing.winners && <div><span>Winners</span><p className="up">{briefing.winners}</p></div>}
            {briefing.losers && <div><span>Losers</span><p className="down">{briefing.losers}</p></div>}
          </div>
          {open && <div className="briefing-body"><Markdown text={body}/></div>}
          <button className="text-button" onClick={() => setOpen(!open)}>{open ? "Hide full briefing" : "Read full briefing"}</button>
        </>
      ) : <p className="chart-note">No briefing yet. Press Generate to write one.</p>}
    </Panel>
  );
}

/* ---------------------------------------------------------------- Holdings */

function HoldingsView({ summary, research, inputs, money, onSaved }: {
  summary: FeedSummary; research: Record<string, FeedResearch>; inputs?: { holdings: HoldingInput[]; cash: CashInput[] }; money: Money; onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useStored<string>("investments.holding", "");
  const positions = summary.positions;
  const current = positions.find((p) => p.Ticker === selected) ?? positions[0];
  const v = (p: FeedPosition, key: string) => Number(p[key]) || 0;

  const exportCsv = () => {
    const cols = ["Ticker", "Name", "Sector", "Currency", "Shares", "Avg Cost", "Price", "Market Value USD", "Cost Basis USD", "Unrealized P&L USD", "Unrealized P&L %", "Day Change %", "Weight %"];
    const lines = positions.map((p) => [...cols.map((c) => `"${String(p[c] ?? "").replace(/"/g, "'")}"`), p.returns?.["1M"] ?? "", p.returns?.["3M"] ?? "", p.returns?.YTD ?? "", p.returns?.["1Y"] ?? "", p.action ?? ""].join(","));
    downloadFile(`holdings-${dateKey()}.csv`, [[...cols, "1M %", "3M %", "YTD %", "1Y %", "House view"].join(","), ...lines].join("\n"), "text/csv");
  };

  return (
    <>
      <Panel className="holdings-panel">
        <PanelTitle eyebrow="HOLDINGS" title="Positions & sizing" action={
          <div className="panel-actions">
            <button className="text-button" onClick={exportCsv}><Icon name="download" size={14}/> Export CSV</button>
            <button className="secondary-button" onClick={() => setEditing(!editing)}><Icon name="edit" size={13}/> {editing ? "Close editor" : "Edit holdings"}</button>
          </div>
        }/>
        {editing && <HoldingsEditor inputs={inputs} positions={summary.positions} onDone={() => { setEditing(false); onSaved(); }}/>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Asset</th><th>Shares</th><th>Avg cost</th><th>Price</th><th>Today</th><th>Market value</th><th>Weight</th><th>Unrealized P&L</th><th>1M</th><th>3M</th><th>YTD</th><th>1Y</th><th>60 days</th><th>House view</th></tr>
            </thead>
            <tbody>
              {positions.map((p) => {
                const ccy = String(p.Currency || "USD");
                const native = (x: number) => (ccy === "USD" ? money(x) : `${ccy} ${x.toFixed(2)}`);
                return (
                  <tr key={p.Ticker} className={current?.Ticker === p.Ticker ? "selected" : ""} onClick={() => setSelected(p.Ticker)}>
                    <td><b>{p.Ticker}</b><span>{p.Name} · {p.Sector}</span></td>
                    <td>{v(p, "Shares").toLocaleString()}</td>
                    <td>{native(v(p, "Avg Cost"))}</td>
                    <td>{native(v(p, "Price"))}</td>
                    <td className={tone(p["Day Change %"])}>{signed(p["Day Change %"], 2)}</td>
                    <td>{money(v(p, "Market Value USD"))}</td>
                    <td className={v(p, "Weight %") > 15 ? "warn" : ""}>{v(p, "Weight %").toFixed(1)}%</td>
                    <td className={tone(p["Unrealized P&L USD"])}>{money(v(p, "Unrealized P&L USD"), { signed: true })}<small>{signed(p["Unrealized P&L %"])}</small></td>
                    {(["1M", "3M", "YTD", "1Y"] as const).map((k) => <td key={k} className={tone(p.returns?.[k])}>{signed(p.returns?.[k])}</td>)}
                    <td className="spark-cell"><Sparkline values={p.returns?.spark ?? [0, 0]}/></td>
                    <td>{p.action ? <em className={actionClass(p.action)}>{p.action}</em> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td><b>Total</b><span>{positions.length} positions + cash {money(summary.totals.cash)}</span></td>
                <td/><td/><td/>
                <td className={tone(summary.totals.day_pnl)}>{signed(summary.totals.day_pnl_pct, 2)}</td>
                <td>{money(summary.totals.market_value)}</td>
                <td>{(100 - (n(summary.liquidity.cash_pct) ?? 0)).toFixed(1)}%</td>
                <td className={tone(summary.totals.unrealized_pnl)}>{money(summary.totals.unrealized_pnl, { signed: true })}<small>{signed(summary.totals.unrealized_pnl_pct)}</small></td>
                <td colSpan={6}/>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      {current && <PositionDetail position={current} research={research[current.Ticker]} money={money}/>}
    </>
  );
}

const currencyOptions = ["USD", "HKD", "GBP", "EUR", "JPY", "CAD", "AUD", "SGD", "CNY", "INR"];
const blankHolding = (): HoldingInput => ({ Ticker: "", Name: "", Shares: "", "Avg Cost": "", Currency: "USD", Sector: "", Opened: dateKey(), Notes: "" });

// Edits the ledger's Holdings and Cash tabs (the inputs every MAO job reads), then queues a refresh.
function HoldingsEditor({ inputs, positions, onDone }: { inputs?: { holdings: HoldingInput[]; cash: CashInput[] }; positions: FeedPosition[]; onDone: () => void }) {
  const [rows, setRows] = useState<HoldingInput[]>(() =>
    inputs?.holdings.length ? inputs.holdings.map((h) => ({ ...h, Opened: String(h.Opened || "").slice(0, 10) }))
    : positions.map((p) => ({ Ticker: p.Ticker, Name: p.Name, Shares: Number(p.Shares) || "", "Avg Cost": Number(p["Avg Cost"]) || "", Currency: String(p.Currency || "USD"), Sector: p.Sector, Opened: String(p.Opened || ""), Notes: "" })));
  const [cash, setCash] = useState<CashInput[]>(() => inputs?.cash.length ? inputs.cash : [{ Account: "Brokerage USD", Currency: "USD", Amount: 0 }]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const setRow = (i: number, key: keyof HoldingInput, value: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [key]: key === "Ticker" ? value.toUpperCase() : value } : r)));
  const setCashRow = (i: number, key: keyof CashInput, value: string) => setCash(cash.map((c, j) => (j === i ? { ...c, [key]: value } : c)));

  const save = async () => {
    const kept = rows.filter((r) => String(r.Ticker).trim());
    const problem = kept.map((r) => {
      const t = String(r.Ticker).trim();
      if (!/^[A-Z0-9][A-Z0-9.\-^=]{0,14}$/.test(t)) return `“${t}” isn't a ticker. Use Yahoo-style symbols, e.g. AAPL, BRK-B or 0700.HK.`;
      if (!(Number(r.Shares) > 0)) return `${t}: enter how many shares you hold.`;
      if (!(Number(r["Avg Cost"]) >= 0) || String(r["Avg Cost"]).trim() === "") return `${t}: enter the average cost per share.`;
      return "";
    }).find(Boolean) || (new Set(kept.map((r) => r.Ticker)).size < kept.length ? "Each ticker can appear only once." : "")
      || (cash.some((c) => String(c.Amount).trim() !== "" && !Number.isFinite(Number(c.Amount))) ? "Cash amounts must be numbers." : "");
    if (problem) return setMessage(problem);
    setSaving(true);
    setMessage("Saving to the MAO Ledger…");
    try {
      await saveLedgerInputs(googleJson, kept.map((r) => ({ ...r, Shares: Number(r.Shares), "Avg Cost": Number(r["Avg Cost"]) })), cash.filter((c) => String(c.Account).trim()).map((c) => ({ ...c, Amount: Number(c.Amount) || 0 })));
      onDone();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't save to the ledger.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="holdings-editor">
      <p className="chart-note">Edits go straight to the ledger's Holdings and Cash tabs. Prices, P&L and research are then recalculated by the next MAO run. Use Yahoo-style tickers (AAPL, BRK-B, 0700.HK) and the currency the stock trades in.</p>
      <div className="table-wrap">
        <table className="edit-table">
          <thead><tr>{HOLDING_COLUMNS.map((c) => <th key={c}>{c}</th>)}<th/></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><input value={r.Ticker} onChange={(e) => setRow(i, "Ticker", e.target.value)} placeholder="AAPL" aria-label="Ticker"/></td>
                <td><input value={r.Name} onChange={(e) => setRow(i, "Name", e.target.value)} placeholder="Company" aria-label="Name"/></td>
                <td><input inputMode="decimal" value={r.Shares} onChange={(e) => setRow(i, "Shares", e.target.value)} placeholder="10" aria-label="Shares"/></td>
                <td><input inputMode="decimal" value={r["Avg Cost"]} onChange={(e) => setRow(i, "Avg Cost", e.target.value)} placeholder="125.40" aria-label="Average cost"/></td>
                <td><select value={r.Currency || "USD"} onChange={(e) => setRow(i, "Currency", e.target.value)} aria-label="Currency">{[...new Set([...currencyOptions, String(r.Currency || "USD")])].map((c) => <option key={c}>{c}</option>)}</select></td>
                <td><input value={r.Sector} onChange={(e) => setRow(i, "Sector", e.target.value)} placeholder="Technology" aria-label="Sector"/></td>
                <td><input type="date" value={String(r.Opened || "").slice(0, 10)} onChange={(e) => setRow(i, "Opened", e.target.value)} aria-label="Opened"/></td>
                <td><input value={r.Notes} onChange={(e) => setRow(i, "Notes", e.target.value)} aria-label="Notes"/></td>
                <td className="row-actions"><button className="row-delete" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.Ticker || "row"}`}><Icon name="trash" size={14}/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="text-button" onClick={() => setRows([...rows, blankHolding()])}><Icon name="plus" size={14}/> Add holding</button>

      <h3 className="editor-heading">Cash</h3>
      <div className="cash-edit">
        {cash.map((c, i) => (
          <div key={i}>
            <input value={c.Account} onChange={(e) => setCashRow(i, "Account", e.target.value)} placeholder="Account" aria-label="Cash account"/>
            <select value={c.Currency || "USD"} onChange={(e) => setCashRow(i, "Currency", e.target.value)} aria-label="Cash currency">{[...new Set([...currencyOptions, String(c.Currency || "USD")])].map((x) => <option key={x}>{x}</option>)}</select>
            <input inputMode="decimal" value={c.Amount} onChange={(e) => setCashRow(i, "Amount", e.target.value)} placeholder="0" aria-label="Cash amount"/>
            <button className="row-delete" onClick={() => setCash(cash.filter((_, j) => j !== i))} aria-label={`Remove ${c.Account || "cash account"}`}><Icon name="trash" size={14}/></button>
          </div>
        ))}
        <button className="text-button" onClick={() => setCash([...cash, { Account: "", Currency: "USD", Amount: "" }])}><Icon name="plus" size={14}/> Add cash account</button>
      </div>

      <div className="editor-buttons">
        <button className="primary-button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save & recalculate"}</button>
        {message && <span className="editor-message">{message}</span>}
      </div>
    </div>
  );
}

function PositionDetail({ position: p, research, money }: { position: FeedPosition; research?: FeedResearch; money: Money }) {
  const chart = research?.chart;
  const ccy = String(p.Currency || "USD");
  const avg = Number(p["Avg Cost"]) || 0;
  const opened = chart?.d ? (chart.d as string[]).findIndex((d) => d >= String(p.Opened || "")) : -1;
  const since = opened > 0 ? opened : 0;
  const dates: string[] = chart?.d?.slice(since) ?? [];
  const closes: (number | null)[] = chart?.close?.slice(since) ?? [];
  const units = (x: number) => (ccy === "USD" ? money(x) : `${ccy} ${x.toFixed(2)}`);
  const levels = research?.house_view?.levels;
  const fair = n(levels?.fair_value);
  return (
    <div className="inv-grid wide-left">
      <Panel>
        <PanelTitle eyebrow={`${p.Name} · ${p.Sector}`.toUpperCase()} title={<>{p.Ticker} <span className="detail-price">{units(Number(p.Price) || 0)}</span></>}
          action={<span className={Number(p["Unrealized P&L USD"]) >= 0 ? "gain" : "gain loss"}>{money(Number(p["Unrealized P&L USD"]) || 0, { signed: true })} unrealized</span>}/>
        {dates.length > 1 ? (
          <SeriesChart dates={dates} height={220} format={units}
            series={[{ label: "Price", color: "#e6e7ea", values: closes, area: true }]}
            refs={[{ label: "Avg cost", value: avg, color: "var(--amber)" }, ...(fair !== null ? [{ label: "Fair value", value: fair, color: "#5b9cf5" }] : [])]}/>
        ) : <p className="chart-note">The price chart appears after the next morning update.</p>}
        <small className="footnote">{p.Opened ? `Since the position opened on ${shortDate(String(p.Opened))}. ` : ""}Dashed lines: your average cost{fair !== null ? " and the DCF fair value" : ""}.</small>
      </Panel>
      <Panel>
        <PanelTitle eyebrow="POSITION" title="Sizing & cost"/>
        <div className="stat-list">
          <Stat label="Shares" value={(Number(p.Shares) || 0).toLocaleString()}/>
          <Stat label="Average cost" value={units(avg)}/>
          <Stat label="Cost basis" value={money(Number(p["Cost Basis USD"]) || 0)}/>
          <Stat label="Market value" value={money(Number(p["Market Value USD"]) || 0)}/>
          <Stat label="Weight of NAV" value={fixed(p["Weight %"], 1, "%")} warn={(Number(p["Weight %"]) || 0) > 15} hint="Desk limit 15%"/>
          <Stat label="Daily volatility" value={fixed(p["Daily Vol %"], 2, "%")} hint="Standard deviation, last 60 days"/>
          <Stat label="Opened" value={p.Opened ? shortDate(String(p.Opened)) : "—"}/>
          {research?.house_view && <Stat label="House view" value={<em className={actionClass(research.house_view.action)}>{research.house_view.action} · {fixed(research.house_view.score, 0)}</em>}/>}
        </div>
        {!!research?.house_view?.notes?.length && <ul className="note-list">{(research.house_view.notes as string[]).map((note, i) => <li key={i}>{note}</li>)}</ul>}
      </Panel>
    </div>
  );
}

/* ---------------------------------------------------------------- Research */

const chartRanges: [string, number][] = [["3M", 63], ["6M", 126], ["1Y", 260]];

type Ticker = [symbol: string, name: string];
let tickerList: Promise<Ticker[]> | null = null;
// About 10,000 US listings (SEC) plus large Hong Kong names; loaded on first search only.
const loadTickers = () => (tickerList ??= fetch(`${import.meta.env.BASE_URL}tickers.json`).then((r) => r.json() as Promise<Ticker[]>).catch(() => []));

function ResearchView({ summary, research, notes, requests, money, onResearch }: {
  summary: FeedSummary; research: Record<string, FeedResearch>; notes: Record<string, JimNote>; requests: LedgerRequest[]; money: Money; onResearch: (ticker: string) => void;
}) {
  const held = summary.positions.map((p) => p.Ticker);
  const searched = Object.keys(research).filter((t) => !held.includes(t));
  const [recent, setRecent] = useStored<string[]>("investments.searched", []);
  const lookups = [...new Set([...recent, ...searched])].filter((t) => !held.includes(t)).slice(0, 12);
  const [selected, setSelected] = useStored<string>("investments.research", "");
  const ticker = selected || held.find((t) => research[t]) || "";
  const r = ticker ? research[ticker] : undefined;

  const open = (t: string) => {
    const symbol = t.trim().toUpperCase();
    if (!symbol) return;
    setSelected(symbol);
    if (!held.includes(symbol)) setRecent([symbol, ...recent.filter((x) => x !== symbol)].slice(0, 12));
  };
  // A search runs the full analysis right away (or re-runs it), unless it's already queued.
  const search = (t: string) => {
    const symbol = t.trim().toUpperCase();
    if (!symbol) return;
    open(symbol);
    if (!openRequests(requests).some((q) => q.type === "research" && q.ticker === symbol)) onResearch(symbol);
  };
  const forget = (t: string) => {
    setRecent(recent.filter((x) => x !== t));
    if (selected === t) setSelected("");
  };

  const chip = (tk: string, removable = false) => {
    const action = research[tk]?.house_view?.action;
    const waiting = !research[tk] && requests.some((q) => q.ticker === tk && (q.status || "pending") === "pending");
    return (
      <span key={tk} className={`chip-wrap ${tk === ticker ? "active" : ""}`}>
        <button role="tab" aria-selected={tk === ticker} onClick={() => open(tk)}>
          <b>{tk}</b>{action ? <em className={actionClass(action)}>{action}</em> : waiting ? <em className="action-badge">Queued</em> : null}
        </button>
        {removable && <button className="chip-x" onClick={() => forget(tk)} aria-label={`Remove ${tk} from searches`}><Icon name="x" size={12}/></button>}
      </span>
    );
  };

  return (
    <>
      <StockSearch onPick={search}/>
      <div className="ticker-chips" role="tablist" aria-label="Stocks">
        <span className="chip-label">Holdings</span>
        {held.map((tk) => chip(tk))}
        {!!lookups.length && <span className="chip-label">Searched</span>}
        {lookups.map((tk) => chip(tk, recent.includes(tk)))}
      </div>
      {!ticker ? <Panel className="inv-empty"><p>Search for a stock above, or wait for the feed to load.</p></Panel>
        : r ? <ResearchDetail ticker={ticker} r={r} note={notes[ticker]} money={money}/>
        : <PendingResearch key={ticker} ticker={ticker} request={[...requests].reverse().find((q) => q.ticker === ticker)} money={money} onResearch={() => onResearch(ticker)}/>}
    </>
  );
}

function StockSearch({ onPick }: { onPick: (ticker: string) => void }) {
  const [query, setQuery] = useState("");
  const [list, setList] = useState<Ticker[]>([]);
  const [focus, setFocus] = useState(-1);
  const q = query.trim().toUpperCase();
  const matches = q.length < 1 ? [] : [
    ...list.filter(([t]) => t === q),
    ...list.filter(([t, name]) => t !== q && (t.startsWith(q) || name.toUpperCase().includes(q))),
  ].slice(0, 8);
  const pick = (t: string) => {
    onPick(t);
    setQuery("");
    setFocus(-1);
  };
  return (
    <form className="stock-search" role="search" onSubmit={(event) => { event.preventDefault(); if (q) pick(focus >= 0 && matches[focus] ? matches[focus][0] : matches[0]?.[0] === q || !matches.length ? q : matches[0][0]); }}>
      <Icon name="focus" size={16}/>
      <input value={query} onFocus={() => loadTickers().then(setList)} onChange={(event) => { setQuery(event.target.value); setFocus(-1); if (!list.length) loadTickers().then(setList); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); setFocus(Math.min(focus + 1, matches.length - 1)); }
          if (event.key === "ArrowUp") { event.preventDefault(); setFocus(Math.max(focus - 1, -1)); }
          if (event.key === "Escape") setQuery("");
        }}
        placeholder="Search any stock by ticker or company, e.g. AMD, Costco, 0700.HK" aria-label="Search stocks" autoComplete="off"
        role="combobox" aria-expanded={matches.length > 0} aria-controls="stock-suggestions"/>
      <button type="submit" className="primary-button" disabled={!q}>Research</button>
      {matches.length > 0 && (
        <ul id="stock-suggestions" role="listbox">
          {matches.map(([t, name], i) => (
            <li key={t} role="option" aria-selected={i === focus} className={i === focus ? "focused" : ""} onMouseDown={(event) => { event.preventDefault(); pick(t); }}>
              <b>{t}</b><span>{name}</span>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

// A stock with no research row yet: an instant quote from Google Finance, and full research on request.
function PendingResearch({ ticker, request, money, onResearch }: { ticker: string; request?: LedgerRequest; money: Money; onResearch: () => void }) {
  const [quotes, setQuotes] = useStored<Record<string, QuickQuote>>("investments.quotes", {});
  const [state, setState] = useState<"idle" | "loading" | "missing" | "error">("idle");
  const [error, setError] = useState("");
  const quote = quotes[ticker];
  const status = (request?.status || "").toLowerCase();

  useEffect(() => {
    if (quote && Date.now() - quote.at < 10 * 60_000) return;
    let live = true;
    setState("loading");
    quickQuote(googleJson, ticker)
      .then((q) => {
        if (!live) return;
        if (q) setQuotes((all) => ({ ...Object.fromEntries(Object.entries(all).slice(-20)), [ticker]: q }));
        setState(q ? "idle" : "missing");
      })
      .catch((e) => { if (live) { setError(e instanceof Error ? e.message : "Quote failed."); setState("error"); } });
    return () => { live = false; };
  }, [ticker]);

  const px = (v: number | null) => (v === null ? "—" : quote?.currency && quote.currency !== "USD" ? `${quote.currency} ${v.toFixed(2)}` : money(v));
  return (
    <div className="inv-grid wide-left">
      <Panel>
        <PanelTitle eyebrow={`QUICK QUOTE · GOOGLE FINANCE${quote ? ` · ${timeLabel(new Date(quote.at))}` : ""}`} title={quote ? <>{quote.name} <span className="detail-price">{ticker}</span></> : ticker}/>
        {state === "loading" && !quote ? <p className="chart-note">Looking up {ticker}…</p>
          : state === "error" && !quote ? <p className="chart-note">{error}</p>
          : state === "missing" && !quote ? <p className="chart-note">Google Finance doesn't recognise {ticker}. Check the symbol; non-US stocks need an exchange suffix such as 0700.HK or VOD.L.</p>
          : quote ? (
            <>
              <div className="quote-hero"><strong>{px(quote.price)}</strong>{quote.changePct !== null && <em className={tone(quote.changePct)}>{pct(quote.changePct, 2)} today</em>}</div>
              <div className="stat-list">
                <Stat label="Market cap" value={quote.marketCap === null ? "—" : `${quote.currency || "USD"} ${compact(quote.marketCap)}`}/>
                <Stat label="P/E" value={fixed(quote.pe, 1)}/>
                <Stat label="EPS" value={fixed(quote.eps, 2)}/>
                <Stat label="52-week range" value={`${px(quote.low52)} – ${px(quote.high52)}`}/>
                <Stat label="Volume" value={compact(quote.volume)}/>
              </div>
            </>
          ) : null}
      </Panel>
      <Panel>
        <PanelTitle eyebrow="FULL RESEARCH" title="DCF, moat, sentiment & charts"/>
        {status === "pending" ? <p className="chart-note">Queued {request?.at ? `at ${timeLabel(new Date(request.at))}` : ""}. This page checks every 30 seconds and shows the research as soon as it's in the ledger.</p>
          : status === "error" ? <p className="chart-note warn">The last attempt failed: {request?.detail || "unknown error"}.</p>
          : status === "done" ? <p className="chart-note">Research finished. Press Refresh if it hasn't appeared yet.</p>
          : <p className="chart-note">The MAO desk runs the same analysis as for your holdings: a two-stage DCF, moat and stability scores, management sentiment from filings, technicals and a house view. It takes a minute or two once it starts.</p>}
        {status !== "pending" && <button className="primary-button research-go" onClick={onResearch}><Icon name="play" size={13}/> {status === "error" ? "Try again" : "Run full research"}</button>}
      </Panel>
    </div>
  );
}

function ResearchDetail({ ticker, r, note, money }: { ticker: string; r: FeedResearch; note?: JimNote; money: Money }) {
  const t = r.technicals ?? {};
  const dcf = r.fundamentals?.dcf ?? {};
  const moat = r.fundamentals?.moat ?? {};
  const hv = r.house_view ?? {};
  const ccy = String(t.currency || dcf.currency || "USD");
  const px = (x: unknown) => (n(x) === null ? "—" : ccy === "USD" ? money(x as number) : `${ccy} ${(x as number).toFixed(2)}`);
  const ratio = (x: unknown, digits = 1) => (n(x) === null ? "—" : pct((x as number) * 100, digits));

  return (
    <>
      <div className="research-head">
        <div>
          <p className="eyebrow">{[t.sector, t.industry].filter(Boolean).join(" · ").toUpperCase()}</p>
          <h2>{t.name || ticker} <span>{ticker}</span></h2>
        </div>
        <div className="research-price">
          <strong>{px(t.price)}</strong>
          <em className={tone(t.change_1d)}>{ratio(t.change_1d, 2)} today</em>
        </div>
        <div className="research-verdict">
          <span>House view</span>
          <em className={actionClass(hv.action)}>{hv.action || "—"}</em>
          <b>{fixed(hv.score, 0)}<small>/100</small></b>
        </div>
      </div>

      <div className="inv-grid wide-left">
        <PricePanel chart={r.chart} format={px} levels={hv.levels}/>
        <Panel>
          <PanelTitle eyebrow="TECHNICALS" title={<>Score {fixed(t.technical_score, 0)}<small className="title-small">/100</small></>}/>
          <div className="stat-list">
            <Stat label="RSI (14)" value={fixed(t.rsi14, 0)} hint={n(t.rsi14) === null ? "" : t.rsi14 > 70 ? "Overbought" : t.rsi14 < 30 ? "Oversold" : "Neutral"}/>
            <Stat label="MACD vs signal" value={n(t.macd) === null ? "—" : `${t.macd.toFixed(2)} / ${fixed(t.macd_signal, 2)}`} hint={n(t.macd) !== null && n(t.macd_signal) !== null ? (t.macd > t.macd_signal ? "Above signal" : "Below signal") : ""}/>
            <Stat label="50 / 200-day average" value={`${px(t.sma50)} / ${px(t.sma200)}`}/>
            <Stat label="52-week range" value={`${px(t.low_52w)} – ${px(t.high_52w)}`}/>
            <Stat label="Volatility (annual)" value={n(t.volatility_ann) === null ? "—" : `${(t.volatility_ann * 100).toFixed(0)}%`}/>
            <Stat label="Max drawdown" value={n(t.max_drawdown) === null ? "—" : `${(t.max_drawdown * 100).toFixed(0)}%`}/>
            <Stat label="Return 3M · 1Y" value={<><span className={tone(t.return_3m)}>{ratio(t.return_3m)}</span> · <span className={tone(t.return_1y)}>{ratio(t.return_1y)}</span></>}/>
          </div>
          {!!t.signals?.length && <ul className="note-list">{(t.signals as string[]).map((sig, i) => <li key={i}>{sig}</li>)}</ul>}
        </Panel>
      </div>

      <div className="inv-grid three">
        <DcfPanel dcf={dcf} format={px}/>
        <HouseViewPanel hv={hv} format={px}/>
        <Panel>
          <PanelTitle eyebrow="FUNDAMENTALS" title="Snapshot"/>
          <div className="stat-list">
            <Stat label="Market cap" value={n(t.market_cap) === null ? "—" : `${ccy} ${compact(t.market_cap)}`}/>
            <Stat label="P/E trailing" value={fixed(t.pe, 1)}/>
            <Stat label="P/E forward" value={fixed(t.forward_pe, 1)}/>
            <Stat label="Dividend yield" value={fixed(t.dividend_yield, 2, "%")}/>
            <Stat label="Stability score" value={fixed(moat.stability_score, 0)} hint={n(moat.stability_detail?.beta) !== null ? `Beta ${fixed(moat.stability_detail.beta, 2)}` : ""}/>
          </div>
        </Panel>
      </div>

      <div className="inv-grid two">
        <MoatPanel moat={moat}/>
        <SentimentPanel s={r.sentiment ?? {}}/>
      </div>

      <div className="inv-grid two">
        <Panel className="desk-note">
          <PanelTitle eyebrow={note ? `DESK NOTE · ${note.d}` : "DESK NOTE"} title={note?.action ? `${note.action}${note.score ? ` · ${Number(note.score).toFixed(0)}` : ""}` : "Analyst view"}/>
          {note?.note ? <Markdown text={note.note}/> : <p className="chart-note">Desk notes are written each time you press Refresh.</p>}
        </Panel>
        <Panel>
          <PanelTitle eyebrow="NEWS" title="Recent headlines"/>
          <div className="news-list">
            {((r.news ?? []) as { title: string; publisher?: string; url?: string; date?: string }[]).map((item, i) => (
              <a key={i} href={item.url} target="_blank" rel="noreferrer">
                <b>{item.title.replace(/ - [^-]+$/, "")}</b>
                <small>{[item.publisher, item.date && !isNaN(+new Date(item.date)) ? new Date(item.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""].filter(Boolean).join(" · ")}</small>
              </a>
            ))}
            {!r.news?.length && <p className="chart-note">No recent headlines.</p>}
          </div>
        </Panel>
      </div>
      <small className="footnote research-foot">Model output from the MAO research desk, updated daily. Not financial advice.</small>
    </>
  );
}

function PricePanel({ chart, format, levels }: { chart?: FeedResearch; format: (v: unknown) => string; levels?: Record<string, number> }) {
  const [range, setRange] = useStored("investments.chartRange", "1Y");
  if (!chart?.d?.length) return <Panel><PanelTitle eyebrow="PRICE" title="Chart"/><p className="chart-note">{chart?.error || "No chart data in the feed yet."}</p></Panel>;
  const days = chartRanges.find(([label]) => label === range)?.[1] ?? 260;
  const cut = (k: string) => (chart[k] as (number | null)[]).slice(-days);
  const dates = (chart.d as string[]).slice(-days);
  const buy = n(levels?.buy_below);
  return (
    <Panel>
      <PanelTitle eyebrow="PRICE · DAILY CLOSE" title="Trend" action={<div className="segmented">{chartRanges.map(([label]) => <button key={label} className={range === label ? "active" : ""} onClick={() => setRange(label)}>{label}</button>)}</div>}/>
      <SeriesChart dates={dates} height={240} format={(v) => format(v)}
        series={[
          { label: "Close", color: "#e6e7ea", values: cut("close") },
          { label: "50-day average", color: "var(--amber)", values: cut("sma50") },
          { label: "200-day average", color: "#5b9cf5", values: cut("sma200") },
        ]}
        refs={buy !== null && buy > Math.min(...(cut("close").filter((v) => v !== null) as number[])) * 0.85 ? [{ label: "Buy below", value: buy, color: "var(--green)" }] : []}/>
      <p className="mini-label">RSI (14) · 30 oversold, 70 overbought</p>
      <SeriesChart dates={dates} height={64} format={(v) => v.toFixed(0)} fixedRange={[0, 100]} compactAxis
        series={[{ label: "RSI", color: "#b58cf0", values: cut("rsi") }]}
        refs={[{ label: "70", value: 70, color: "#5a5c62" }, { label: "30", value: 30, color: "#5a5c62" }]}/>
    </Panel>
  );
}

function DcfPanel({ dcf, format }: { dcf: FeedResearch; format: (v: unknown) => string }) {
  if (!dcf.ok) return <Panel><PanelTitle eyebrow="DCF VALUATION" title="Not available"/><p className="chart-note">{dcf.reason || "Free-cash-flow data was missing."}</p></Panel>;
  const sc = dcf.scenarios ?? {};
  const marks = ([
    { label: "Bear", value: sc.bear }, { label: "Base", value: sc.base ?? dcf.intrinsic_value }, { label: "Bull", value: sc.bull }, { label: "Price", value: dcf.price },
  ] as { label: string; value: unknown }[]).filter((m) => n(m.value) !== null) as { label: string; value: number }[];
  const lo = Math.min(...marks.map((m) => m.value)) * 0.92;
  const hi = Math.max(...marks.map((m) => m.value)) * 1.05;
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  const mos = n(dcf.margin_of_safety);
  const pctOf = (x: unknown, digits: number) => (n(x) === null ? "—" : `${((x as number) * 100).toFixed(digits)}%`);
  return (
    <Panel>
      <PanelTitle eyebrow="DCF VALUATION" title={format(dcf.intrinsic_value)} action={mos !== null ? <span className={mos >= 0 ? "gain" : "gain loss"}>{pct(mos * 100, 0)} margin</span> : undefined}/>
      {dcf.financial && <p className="caveat">Financial company: free cash flow is distorted by lending or float, so this DCF is for reference only and is left out of the house view.</p>}
      <div className="scenario-ladder" aria-label="Bear, base and bull values against the price">
        {n(sc.bear) !== null && n(sc.bull) !== null && <i style={{ left: `${pos(sc.bear)}%`, right: `${100 - pos(sc.bull)}%` }}/>}
        {marks.map((m) => <span key={m.label} className={m.label.toLowerCase()} style={{ left: `${pos(m.value)}%` }}><b>{m.label}</b>{format(m.value)}</span>)}
      </div>
      <div className="stat-list">
        <Stat label="Discount rate (WACC)" value={pctOf(dcf.wacc, 1)}/>
        <Stat label="Growth, years 1–5" value={pctOf(dcf.stage1_growth, 1)} hint="Fades to terminal over years 6–10"/>
        <Stat label="Terminal growth" value={pctOf(dcf.terminal_growth, 1)}/>
        <Stat label="Terminal value share" value={pctOf(dcf.terminal_share, 0)} warn={(n(dcf.terminal_share) ?? 0) > 0.75}/>
      </div>
      {!!dcf.caveats?.length && <ul className="note-list">{(dcf.caveats as string[]).map((c, i) => <li key={i}>{c}</li>)}</ul>}
    </Panel>
  );
}

const componentLabels: Record<string, string> = { valuation: "Valuation", moat: "Moat", stability: "Stability", sentiment: "Sentiment", technical: "Technical" };
const componentWeights: Record<string, number> = { valuation: 35, moat: 20, stability: 10, sentiment: 15, technical: 20 };

function HouseViewPanel({ hv, format }: { hv: FeedResearch; format: (v: unknown) => string }) {
  const comps = Object.entries(hv.components ?? {}).filter(([, v]) => n(v) !== null) as [string, number][];
  const lv = hv.levels;
  return (
    <Panel>
      <PanelTitle eyebrow="HOUSE VIEW" title={<em className={`${actionClass(hv.action)} big`}>{hv.action || "—"}</em>} action={<span className="score-pill">{fixed(hv.score, 0)}<small>/100</small></span>}/>
      <div className="factor-list tight">
        {comps.map(([k, v]) => (
          <div key={k}>
            <span><b>{componentLabels[k] ?? k}</b><small>{componentWeights[k] ? `${componentWeights[k]}% weight` : ""}</small></span>
            <i><b style={{ width: `${Math.max(0, Math.min(100, v))}%` }} className={v >= 60 ? "good" : v < 40 ? "bad" : ""}/></i>
            <em>{v.toFixed(0)}</em>
          </div>
        ))}
      </div>
      {lv && (n(lv.buy_below) !== null || n(lv.trim_above) !== null) ? (
        <div className="levels">
          <div><span>Buy below</span><b className="up">{format(lv.buy_below)}</b></div>
          <div><span>Fair value</span><b>{format(lv.fair_value)}</b></div>
          <div><span>Trim above</span><b className="down">{format(lv.trim_above)}</b></div>
        </div>
      ) : <p className="chart-note">No price levels: the DCF isn't used for this company.</p>}
      <small className="footnote">Buy ≥ 68 · Accumulate ≥ 58 · Hold ≥ 45 · Trim ≥ 35 · else Sell.</small>
    </Panel>
  );
}

function MoatPanel({ moat }: { moat: FeedResearch }) {
  const factors = (moat.factors ?? []) as { factor: string; score: number; detail: string }[];
  return (
    <Panel>
      <PanelTitle eyebrow="ECONOMIC MOAT" title={`${moat.moat_rating || "—"} moat`} action={<span className="score-pill">{fixed(moat.moat_score, 0)}<small>/100</small></span>}/>
      <div className="factor-list">
        {factors.map((f) => (
          <div key={f.factor}>
            <span><b>{f.factor}</b><small>{f.detail}</small></span>
            <i><b style={{ width: `${Math.max(0, Math.min(100, f.score))}%` }} className={f.score >= 60 ? "good" : f.score < 40 ? "bad" : ""}/></i>
            <em>{f.score.toFixed(0)}</em>
          </div>
        ))}
        {!factors.length && <p className="chart-note">No moat factors were computed.</p>}
      </div>
    </Panel>
  );
}

function SentimentPanel({ s }: { s: FeedResearch }) {
  const docs = (s.documents ?? []) as FeedResearch[];
  return (
    <Panel>
      <PanelTitle eyebrow="MANAGEMENT SENTIMENT" title={s.label || "—"} action={<span className="score-pill">{fixed(s.management_confidence, 0)}<small>/100</small></span>}/>
      {docs.length ? (
        <div className="doc-list">
          {docs.map((d, i) => (
            <div key={i}>
              <div className="doc-head">
                <b>{d.source}</b><small>{d.date || ""}{n(d.words) !== null ? ` · ${compact(d.words)} words` : ""}</small>
                <span>Confidence <b>{fixed(d.confidence, 0)}</b></span>
                <span>Tone <b className={tone(d.net_tone)}>{fixed(d.net_tone, 2)}</b></span>
                {n(d.confidence_change) !== null && <span>vs prior year <b className={tone(d.confidence_change)}>{d.confidence_change > 0 ? "+" : ""}{d.confidence_change.toFixed(1)}</b></span>}
              </div>
              {d.evidence?.positive?.[0] && <p className="quote up-quote">“{String(d.evidence.positive[0]).slice(0, 220)}”</p>}
              {d.evidence?.negative?.[0] && <p className="quote down-quote">“{String(d.evidence.negative[0]).slice(0, 220)}”</p>}
            </div>
          ))}
        </div>
      ) : <p className="chart-note">{s.reason || "No filings or news were scored."}</p>}
      <small className="footnote">Lexicon read of 10-K MD&A, earnings releases and news. 50 is neutral.</small>
    </Panel>
  );
}

/* ---------------------------------------------------------------- shared */

function Stat({ label, value, hint, warn }: { label: string; value: ReactNode; hint?: string; warn?: boolean }) {
  return (
    <div className="stat-row">
      <span>{label}{hint && <small>{hint}</small>}</span>
      <b className={warn ? "warn" : ""}>{value}</b>
    </div>
  );
}

function Markdown({ text }: { text: string }) {
  const bold = (line: string) => line.replace(/<[^>]*>/g, "").split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={blocks.length}>{list.map((item, i) => <li key={i}>{bold(item)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (/^[-*] /.test(line)) { list.push(line.slice(2)); continue; }
    flush();
    if (line.startsWith("#")) blocks.push(<h3 key={blocks.length}>{line.replace(/^#+\s*/, "")}</h3>);
    else blocks.push(<p key={blocks.length}>{bold(line)}</p>);
  }
  flush();
  return <div className="markdown">{blocks}</div>;
}

type Series = { label: string; color: string; values: (number | null)[]; area?: boolean; dashed?: boolean };

// Line chart with a hover crosshair and tooltip; gaps (null) break the line.
function SeriesChart({ dates, series, refs = [], format, height = 220, fixedRange, compactAxis = false }: {
  dates: string[]; series: Series[]; refs?: { label: string; value: number; color: string }[]; format: (v: number) => string; height?: number;
  fixedRange?: [number, number]; compactAxis?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const W = 700;
  const all = [...series.flatMap((s) => s.values.filter((v): v is number => v !== null)), ...refs.map((r) => r.value)];
  let [lo, hi] = fixedRange ?? [Math.min(...all), Math.max(...all)];
  if (!fixedRange) {
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.08;
    lo -= pad;
    hi += pad;
  }
  const x = (i: number) => (i / Math.max(dates.length - 1, 1)) * W;
  const y = (v: number) => height - ((v - lo) / (hi - lo || 1)) * height;
  const path = (values: (number | null)[]) => {
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) { pen = false; return; }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const move = (event: PointerEvent) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    setHover(Math.max(0, Math.min(dates.length - 1, Math.round(((event.clientX - rect.left) / rect.width) * (dates.length - 1)))));
  };
  const left = hover === null ? 0 : (hover / Math.max(dates.length - 1, 1)) * 100;
  const shown = refs.filter((r) => r.value >= lo && r.value <= hi);
  const at = (s: Series) => (hover === null ? null : s.values[hover] ?? null);
  return (
    <div className={`series-chart ${compactAxis ? "compact" : ""}`}>
      {!compactAxis && series.length > 1 && (
        <div className="chart-legend">{series.map((s) => <span key={s.label}><i style={{ background: s.color }} className={s.dashed ? "dashed" : ""}/>{s.label}</span>)}</div>
      )}
      <div className="chart-body">
        <div className="chart-axis"><span>{format(hi)}</span><span>{format(lo)}</span></div>
        <div className="chart-plot" ref={box} onPointerMove={move} onPointerLeave={() => setHover(null)} style={{ height }}>
          <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${series.map((s) => s.label).join(", ")} over time`}>
            {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={height * f} y2={height * f} stroke="var(--line)" vectorEffect="non-scaling-stroke"/>)}
            {shown.map((r) => <line key={r.label} x1="0" x2={W} y1={y(r.value)} y2={y(r.value)} stroke={r.color} strokeDasharray="5 5" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>)}
            {series.filter((s) => s.area).map((s) => {
              const start = s.values.findIndex((v) => v !== null);
              return <path key={`${s.label}-area`} d={`${path(s.values)}L${x(s.values.length - 1)},${height}L${x(Math.max(start, 0))},${height}Z`} fill={s.color} opacity=".08"/>;
            })}
            {series.map((s) => <path key={s.label} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeDasharray={s.dashed ? "6 5" : undefined} vectorEffect="non-scaling-stroke"/>)}
          </svg>
          {!compactAxis && shown.map((r) => (
            <span key={r.label} className="ref-label" style={{ top: `${(y(r.value) / height) * 100}%`, color: r.color }}>{r.label} {format(r.value)}</span>
          ))}
          {hover !== null && (
            <>
              <div className="crosshair" style={{ left: `${left}%` }}/>
              {series.map((s) => at(s) !== null && <i key={s.label} className="hover-dot" style={{ left: `${left}%`, top: `${(y(at(s)!) / height) * 100}%`, background: s.color }}/>)}
              <div className={`chart-tip ${left > 60 ? "flip" : ""}`} style={{ left: `${left}%` }}>
                <small>{shortDate(dates[hover])}</small>
                {series.map((s) => at(s) !== null && <span key={s.label}><i style={{ background: s.color }}/>{s.label}<b>{format(at(s)!)}</b></span>)}
              </div>
            </>
          )}
        </div>
      </div>
      {!compactAxis && <div className="chart-dates"><span>{shortDate(dates[0])}</span><span>{shortDate(dates[dates.length - 1])}</span></div>}
    </div>
  );
}
