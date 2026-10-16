import { useMemo, useState, type ChangeEvent } from "react";
import { Icon, LineChart, Panel, PanelTitle, Sparkline } from "../components/ui";
import { useStored } from "../lib/store";
import {
  currencies, derive, fetchName, fetchQuote, pushHistory, refreshPortfolio, totals,
  useHoldings, useMarket, useMoney, usePortfolioSettings, useRefreshStatus, useSnapshots, type Holding,
} from "../lib/portfolio";
import { addDays, dateKey, downloadFile, num, parseDateKey, pct, timeLabel, uid } from "../lib/utils";

type Money = ReturnType<typeof useMoney>;
const ranges: [string, number][] = [["1W", 7], ["1M", 30], ["3M", 91], ["1Y", 365], ["ALL", 100000]];

export default function Investments() {
  const [holdings, setHoldings] = useHoldings();
  const [settings, setSettings] = usePortfolioSettings();
  const [market] = useMarket();
  const [snapshots] = useSnapshots();
  const [status] = useRefreshStatus();
  const money = useMoney();
  const [editing, setEditing] = useState<Holding | "new" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [range, setRange] = useState("3M");

  const t = totals(holdings);
  const rows = holdings.map((holding) => ({ holding, d: derive(holding) }));
  const selected = rows.find((row) => row.holding.id === selectedId) ?? rows[0];
  const days = ranges.find(([label]) => label === range)?.[1] ?? 91;
  const cutoff = dateKey(addDays(new Date(), -days));
  const series = snapshots.filter((s) => s.d >= cutoff);

  const saveHolding = (holding: Holding) => {
    setHoldings(holdings.some((h) => h.id === holding.id) ? holdings.map((h) => (h.id === holding.id ? holding : h)) : [...holdings, holding]);
    setSelectedId(holding.id);
    setEditing(null);
  };
  const removeHolding = (holding: Holding) => {
    if (window.confirm(`Remove ${holding.symbol} from your portfolio?`)) setHoldings(holdings.filter((h) => h.id !== holding.id));
  };
  const exportCsv = () => {
    const header = ["Symbol", "Name", "Shares", "Avg cost", "Price", "Prev close", "Market value", "P/L", "Intrinsic value", "Upside %", "Valuation"];
    const lines = rows.map(({ holding: h, d }) => [h.symbol, `"${h.name.replace(/"/g, "'")}"`, h.shares, h.avgCost, h.price, h.prevClose, d.value.toFixed(2), d.pl.toFixed(2), h.intrinsic || "", d.upside === null ? "" : d.upside.toFixed(2), d.status].join(","));
    downloadFile(`portfolio-${dateKey()}.csv`, [header.join(","), ...lines].join("\n"), "text/csv");
  };

  const showConnect = !settings.apiKey && !settings.hideConnect;

  return (
    <main className="page">
      <div className="welcome">
        <div><p className="eyebrow red">MARKET INTELLIGENCE</p><h1>Investment Control.</h1><p>Prices, positions, and intrinsic value in one view.</p></div>
        <div className="welcome-actions">
          {settings.apiKey && (
            <button className="secondary-button" onClick={() => refreshPortfolio()} disabled={status.loading}>
              <Icon name="refresh" size={14}/> {status.loading ? "Refreshing…" : "Refresh prices"}
            </button>
          )}
          <button className="secondary-button" onClick={() => setShowSettings(!showSettings)}><Icon name="key" size={14}/> Data settings</button>
          <button className="primary-button" onClick={() => setEditing(editing === "new" ? null : "new")}><Icon name="plus" size={16}/> Add stock</button>
        </div>
      </div>

      {(showSettings || showConnect) && (
        <Panel className="connect-panel">
          <div>
            <p className="eyebrow red">LIVE PRICES · OPTIONAL</p>
            <h2>Connect a free Finnhub key</h2>
            <p>
              Paste a free API key from <a href="https://finnhub.io/register" target="_blank" rel="noreferrer">finnhub.io</a> to pull live prices for US stocks and ETFs every 10 minutes.
              Without one, everything still works: enter and edit prices yourself. The key is stored only in this browser.
            </p>
          </div>
          <div className="connect-form">
            <label>API key<input type="password" value={settings.apiKey} onChange={(event) => setSettings({ ...settings, apiKey: event.target.value.trim() })} placeholder="Paste your Finnhub key" autoComplete="off"/></label>
            <label>Currency<select value={settings.currency} onChange={(event) => setSettings({ ...settings, currency: event.target.value })}>{currencies.map((c) => <option key={c}>{c}</option>)}</select></label>
            <div className="connect-buttons">
              {settings.apiKey && <button className="primary-button" onClick={() => { refreshPortfolio(); setShowSettings(false); }}>Save & refresh</button>}
              <button className="secondary-button" onClick={() => { setSettings({ ...settings, hideConnect: true }); setShowSettings(false); }}>{settings.apiKey ? "Close" : "Use manual prices"}</button>
            </div>
          </div>
        </Panel>
      )}

      {(status.error || status.at > 0) && settings.apiKey && (
        <p className={`status-line ${status.error ? "error" : ""}`}>
          {status.error || `Live prices updated ${timeLabel(new Date(status.at))}`}
        </p>
      )}

      {market.length > 0 && settings.apiKey && (
        <div className="market-strip">
          {market.map((m) => (
            <div key={m.symbol}><span>{m.label}</span><strong>{m.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</strong><em className={m.changePct >= 0 ? "up" : "down"}>{pct(m.changePct)}</em></div>
          ))}
        </div>
      )}

      {editing && (
        <PositionEditor key={editing === "new" ? "new" : editing.id} initial={editing === "new" ? null : editing} apiKey={settings.apiKey} onSave={saveHolding} onCancel={() => setEditing(null)}/>
      )}

      <div className="summary-strip">
        <div><span>Portfolio value</span><strong>{money(t.value)}</strong></div>
        <div><span>Today</span><strong className={t.dayChange >= 0 ? "up" : "down"}>{money(t.dayChange, { signed: true })}</strong><em className={t.dayChange >= 0 ? "up" : "down"}>{pct(t.dayPct)}</em></div>
        <div><span>Total P/L</span><strong className={t.pl >= 0 ? "up" : "down"}>{money(t.pl, { signed: true })}</strong><em className={t.pl >= 0 ? "up" : "down"}>{pct(t.plPct)}</em></div>
        <div><span>Invested</span><strong>{money(t.cost)}</strong></div>
        <div><span>Vs. intrinsic value</span><strong className={t.marginOfSafety === null ? "" : t.marginOfSafety >= 0 ? "up" : "down"}>{t.marginOfSafety === null ? "—" : pct(t.marginOfSafety, 1)}</strong><em>{t.marginOfSafety === null ? "add estimates" : t.marginOfSafety >= 0 ? "upside" : "downside"}</em></div>
      </div>

      <div className="investment-grid">
        <Panel className="performance-card">
          <PanelTitle eyebrow="PORTFOLIO PERFORMANCE" title={money(t.value)} action={<span className={t.pl >= 0 ? "gain" : "gain loss"}>{money(t.pl, { signed: true })} all time</span>}/>
          <div className="chart-toolbar">
            <span>Daily closing value, recorded automatically</span>
            <div>{ranges.map(([label]) => <button className={range === label ? "active" : ""} onClick={() => setRange(label)} key={label}>{label}</button>)}</div>
          </div>
          {series.length > 1 ? (
            <LineChart values={series.map((s) => s.v)} labels={series.map((s) => parseDateKey(s.d).toLocaleDateString(undefined, { day: "numeric", month: "short" }))} format={(n) => money(n, { digits: 0 })}/>
          ) : (
            <div className="chart-empty">
              <Icon name="chart" size={28}/>
              <p>The dashboard saves one value per day. Come back tomorrow and the line starts drawing itself{series.length === 1 ? ` (today: ${money(series[0].v)})` : ""}.</p>
            </div>
          )}
        </Panel>
        <ValuationRadar rows={rows} marginOfSafety={t.marginOfSafety}/>
      </div>

      <Panel className="holdings-panel">
        <PanelTitle eyebrow="HOLDINGS" title="Intrinsic Value Monitor" action={<button className="text-button" onClick={exportCsv} disabled={!holdings.length}><Icon name="download" size={14}/> Export CSV</button>}/>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Asset</th><th>Shares</th><th>Avg cost</th><th>Price</th><th>Today</th><th>Market value</th><th>Total P/L</th><th>Intrinsic</th><th>Upside</th><th>Valuation</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map(({ holding: h, d }) => (
                <tr key={h.id} className={selected?.holding.id === h.id ? "selected" : ""} onClick={() => setSelectedId(h.id)}>
                  <td><b>{h.symbol}</b><span>{h.name}</span></td>
                  <td>{h.shares.toLocaleString()}</td>
                  <td>{money(h.avgCost)}</td>
                  <td>{money(h.price)}</td>
                  <td className={d.dayPct > 0 ? "up" : d.dayPct < 0 ? "down" : ""}>{h.prevClose ? pct(d.dayPct) : "—"}</td>
                  <td>{money(d.value)}</td>
                  <td className={d.pl >= 0 ? "up" : "down"}>{money(d.pl, { signed: true })}<small>{pct(d.plPct, 1)}</small></td>
                  <td>{h.intrinsic ? money(h.intrinsic) : "—"}</td>
                  <td className={d.upside === null ? "" : d.upside >= 0 ? "up" : "down"}>{d.upside === null ? "—" : pct(d.upside, 1)}</td>
                  <td><em className={`status ${d.status.toLowerCase().replace(" ", "-")}`}>{d.status}</em></td>
                  <td className="row-actions">
                    <button className="row-delete" onClick={(event) => { event.stopPropagation(); setEditing(h); }} aria-label={`Edit ${h.symbol}`}><Icon name="edit" size={14}/></button>
                    <button className="row-delete" onClick={(event) => { event.stopPropagation(); removeHolding(h); }} aria-label={`Remove ${h.symbol}`}><Icon name="trash" size={14}/></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {holdings.length === 0 && <p className="empty padded">No positions yet. Use “Add stock” to build your portfolio.</p>}
        </div>
      </Panel>

      {selected && (
        <div className="detail-grid">
          <StockDetail holding={selected.holding} weight={t.value ? (selected.d.value / t.value) * 100 : 0} money={money} onEdit={() => setEditing(selected.holding)}/>
          <IntrinsicCalculator holding={selected.holding} money={money} onApply={(value) => saveHolding({ ...selected.holding, intrinsic: Math.round(value * 100) / 100 })}/>
        </div>
      )}
    </main>
  );
}

function ValuationRadar({ rows, marginOfSafety }: { rows: { holding: Holding; d: ReturnType<typeof derive> }[]; marginOfSafety: number | null }) {
  const score = marginOfSafety === null ? null : Math.max(0, Math.min(100, Math.round(50 + marginOfSafety * 1.5)));
  const total = rows.reduce((sum, row) => sum + row.d.value, 0) || 1;
  const share = (status: string) => (rows.filter((row) => row.d.status === status).reduce((sum, row) => sum + row.d.value, 0) / total) * 100;
  const bars: [string, number][] = [["Undervalued", share("Undervalued")], ["Fair value", share("Fair value")], ["Overvalued", share("Overvalued")], ["No estimate", share("No estimate")]];
  return (
    <Panel className="valuation-card">
      <PanelTitle eyebrow="VALUATION RADAR" title="Opportunity Score"/>
      <div className="score-ring" style={{ background: `conic-gradient(var(--red) 0 ${score ?? 0}%, #292b30 ${score ?? 0}%)` }}>
        <div><strong>{score ?? "—"}</strong><span>/ 100</span></div>
      </div>
      <p>
        {marginOfSafety === null
          ? "Add intrinsic value estimates to your holdings to score the portfolio."
          : <>Holdings with estimates trade <b>{Math.abs(marginOfSafety).toFixed(1)}% {marginOfSafety >= 0 ? "below" : "above"}</b> your intrinsic values.</>}
      </p>
      <div className="score-bars">
        {bars.map(([label, value]) => (
          <span key={label}>{label}<i><b style={{ width: `${value}%` }} className={label === "Undervalued" ? "good" : label === "Overvalued" ? "bad" : label === "No estimate" ? "none" : ""}/></i><em>{value.toFixed(0)}%</em></span>
        ))}
      </div>
      <small className="footnote">Share of portfolio value. Undervalued = 10%+ below intrinsic value.</small>
    </Panel>
  );
}

type Draft = { symbol: string; name: string; shares: string; avgCost: string; price: string; prevClose: string; intrinsic: string };

function PositionEditor({ initial, apiKey, onSave, onCancel }: { initial: Holding | null; apiKey: string; onSave: (h: Holding) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => ({
    symbol: initial?.symbol ?? "",
    name: initial?.name ?? "",
    shares: initial ? String(initial.shares) : "",
    avgCost: initial ? String(initial.avgCost) : "",
    price: initial ? String(initial.price) : "",
    prevClose: initial?.prevClose ? String(initial.prevClose) : "",
    intrinsic: initial?.intrinsic ? String(initial.intrinsic) : "",
  }));
  const [message, setMessage] = useState("");
  const set = (field: keyof Draft) => (event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, [field]: event.target.value });

  const lookup = async () => {
    const symbol = draft.symbol.trim().toUpperCase();
    if (!apiKey || !symbol || initial) return;
    setMessage("Looking up live price…");
    try {
      const [quote, name] = await Promise.all([fetchQuote(symbol, apiKey), fetchName(symbol, apiKey).catch(() => "")]);
      setDraft((current) => ({ ...current, price: current.price || String(quote.price), prevClose: current.prevClose || String(quote.prevClose), name: current.name || name }));
      setMessage(`Live price found: ${quote.price}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Lookup failed");
    }
  };

  const save = () => {
    const symbol = draft.symbol.trim().toUpperCase();
    const price = num(draft.price);
    const shares = num(draft.shares);
    if (!symbol) return setMessage("Enter a ticker symbol.");
    if (!(price > 0)) return setMessage("Enter the current market price.");
    if (!(shares > 0)) return setMessage("Enter how many shares you hold.");
    const avgCost = num(draft.avgCost) || price;
    onSave({
      id: initial?.id ?? uid(),
      symbol,
      name: draft.name.trim() || symbol,
      shares,
      avgCost,
      price,
      prevClose: num(draft.prevClose),
      intrinsic: num(draft.intrinsic),
      history: initial && initial.price === price ? initial.history : pushHistory(initial?.history ?? [], price),
      updatedAt: initial?.updatedAt,
    });
  };

  return (
    <Panel className="position-editor">
      <PanelTitle eyebrow={initial ? "EDIT POSITION" : "NEW POSITION"} title={initial ? `Edit ${initial.symbol}` : "Add a stock"} action={<button className="icon-button mini" onClick={onCancel} aria-label="Close"><Icon name="x" size={15}/></button>}/>
      <form className="editor-fields" onSubmit={(event) => { event.preventDefault(); save(); }}>
        <label>Symbol<input value={draft.symbol} onChange={set("symbol")} onBlur={lookup} placeholder="e.g. AMD" autoFocus={!initial}/></label>
        <label>Company<input value={draft.name} onChange={set("name")} placeholder="Company name"/></label>
        <label>Shares<input inputMode="decimal" value={draft.shares} onChange={set("shares")} placeholder="10"/></label>
        <label>Avg cost / share<input inputMode="decimal" value={draft.avgCost} onChange={set("avgCost")} placeholder="Defaults to price"/></label>
        <label>Market price<input inputMode="decimal" value={draft.price} onChange={set("price")} placeholder="125.40"/></label>
        <label>Previous close<input inputMode="decimal" value={draft.prevClose} onChange={set("prevClose")} placeholder="For day change"/></label>
        <label>Intrinsic value<input inputMode="decimal" value={draft.intrinsic} onChange={set("intrinsic")} placeholder="Your estimate"/></label>
        <div className="editor-buttons">
          <button type="submit" className="primary-button">{initial ? "Save changes" : "Add to portfolio"}</button>
          <button type="button" className="secondary-button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
      {message && <p className="editor-message">{message}</p>}
    </Panel>
  );
}

function StockDetail({ holding, weight, money, onEdit }: { holding: Holding; weight: number; money: Money; onEdit: () => void }) {
  const d = derive(holding);
  const marks = [
    { label: "Avg cost", value: holding.avgCost, cls: "cost" },
    { label: "Price", value: holding.price, cls: "price" },
    ...(holding.intrinsic ? [{ label: "Intrinsic", value: holding.intrinsic, cls: "intrinsic" }] : []),
  ];
  const lo = Math.min(...marks.map((m) => m.value)) * 0.9;
  const hi = Math.max(...marks.map((m) => m.value)) * 1.1;
  const pos = (value: number) => ((value - lo) / (hi - lo || 1)) * 100;
  const history = holding.history.map((point) => point.p);

  return (
    <Panel className="stock-detail">
      <PanelTitle eyebrow={holding.name.toUpperCase()} title={<>{holding.symbol} <span className="detail-price">{money(holding.price)}</span> <em className={d.dayPct >= 0 ? "up" : "down"}>{holding.prevClose ? pct(d.dayPct) : ""}</em></>}
        action={<button className="text-button" onClick={onEdit}><Icon name="edit" size={14}/> Edit</button>}/>
      <div className="detail-chart">
        {history.length > 1 ? <Sparkline values={history} tall/> : <p className="chart-note">Price history fills in each day the price is refreshed or edited.</p>}
      </div>
      <div className="price-ladder" aria-label="Average cost, price and intrinsic value compared">
        <i/>
        {marks.map((m) => (
          <span key={m.label} className={m.cls} style={{ left: `${pos(m.value)}%` }}><b>{m.label}</b>{money(m.value)}</span>
        ))}
      </div>
      <div className="detail-stats">
        <div><span>Shares</span><strong>{holding.shares.toLocaleString()}</strong></div>
        <div><span>Market value</span><strong>{money(d.value)}</strong></div>
        <div><span>Weight</span><strong>{weight.toFixed(1)}%</strong></div>
        <div><span>Total P/L</span><strong className={d.pl >= 0 ? "up" : "down"}>{money(d.pl, { signed: true })}</strong></div>
        <div><span>Margin of safety</span><strong className={d.upside === null ? "" : d.upside >= 0 ? "up" : "down"}>{d.upside === null ? "—" : pct(d.upside, 1)}</strong></div>
        <div><span>Last live update</span><strong>{holding.updatedAt ? `${new Date(holding.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })} ${timeLabel(new Date(holding.updatedAt))}` : "Manual"}</strong></div>
      </div>
    </Panel>
  );
}

type CalcInputs = { eps: string; growth: string; bondYield: string; discount: string; terminal: string; years: string };

function IntrinsicCalculator({ holding, money, onApply }: { holding: Holding; money: Money; onApply: (value: number) => void }) {
  const [method, setMethod] = useStored<"graham" | "dcf">("calc.method", "dcf");
  const [inputs, setInputs] = useStored<CalcInputs>("calc.inputs", { eps: "5.00", growth: "10", bondYield: "4.5", discount: "9", terminal: "3", years: "10" });
  const set = (field: keyof CalcInputs) => (event: ChangeEvent<HTMLInputElement>) => setInputs({ ...inputs, [field]: event.target.value });

  const value = useMemo(() => {
    const eps = num(inputs.eps);
    const g = num(inputs.growth) / 100;
    if (eps <= 0) return 0;
    if (method === "graham") {
      const y = num(inputs.bondYield);
      return y > 0 ? (eps * (8.5 + 2 * g * 100) * 4.4) / y : 0;
    }
    const r = num(inputs.discount) / 100;
    const tg = num(inputs.terminal) / 100;
    const years = Math.min(Math.max(Math.round(num(inputs.years)), 1), 30);
    if (r <= tg) return 0;
    let total = 0;
    let cash = eps;
    for (let year = 1; year <= years; year++) {
      cash *= 1 + g;
      total += cash / (1 + r) ** year;
    }
    total += (cash * (1 + tg)) / (r - tg) / (1 + r) ** years;
    return total;
  }, [inputs, method]);

  const upside = value && holding.price ? (value / holding.price - 1) * 100 : null;

  return (
    <Panel className="calculator">
      <PanelTitle eyebrow="INTRINSIC VALUE" title="Valuation Calculator" action={
        <div className="segmented">
          <button className={method === "dcf" ? "active" : ""} onClick={() => setMethod("dcf")}>DCF</button>
          <button className={method === "graham" ? "active" : ""} onClick={() => setMethod("graham")}>Graham</button>
        </div>
      }/>
      <div className="calc-fields">
        <label>{method === "dcf" ? "Free cash flow / share" : "EPS (trailing 12m)"}<input inputMode="decimal" value={inputs.eps} onChange={set("eps")}/></label>
        <label>Growth rate %<input inputMode="decimal" value={inputs.growth} onChange={set("growth")}/></label>
        {method === "dcf" ? (
          <>
            <label>Discount rate %<input inputMode="decimal" value={inputs.discount} onChange={set("discount")}/></label>
            <label>Terminal growth %<input inputMode="decimal" value={inputs.terminal} onChange={set("terminal")}/></label>
            <label>Years of growth<input inputMode="numeric" value={inputs.years} onChange={set("years")}/></label>
          </>
        ) : (
          <label>AAA bond yield %<input inputMode="decimal" value={inputs.bondYield} onChange={set("bondYield")}/></label>
        )}
      </div>
      <div className="calc-result">
        <div>
          <span>Estimated intrinsic value</span>
          <strong>{value ? money(value) : "—"}</strong>
          {upside !== null && <em className={upside >= 0 ? "up" : "down"}>{pct(upside, 1)} vs {holding.symbol} at {money(holding.price)}</em>}
        </div>
        <button className="primary-button" disabled={!value} onClick={() => onApply(value)}>Apply to {holding.symbol}</button>
      </div>
      <small className="footnote">
        {method === "dcf"
          ? "Discounts each year's cash flow plus a terminal value back to today."
          : "Benjamin Graham's revised formula: V = EPS × (8.5 + 2g) × 4.4 / Y."}{" "}
        Estimates only, not financial advice.
      </small>
    </Panel>
  );
}
