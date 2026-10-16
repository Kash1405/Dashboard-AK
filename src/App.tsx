import { useEffect, useState, type ReactNode } from "react";

type Tab = "Overview" | "Focus" | "Investments" | "Mental Health";

const raceImages = [
  "https://images.unsplash.com/photo-1614949194403-9602bdc14a3a?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1400",
  "https://images.unsplash.com/photo-1699138346782-8a8b211c3da2?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1400",
  "https://images.unsplash.com/photo-1690984651796-6bbb102fbf30?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1400",
  "https://images.unsplash.com/photo-1632726144626-6f6a8876e35d?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1400",
];

function useStoredState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? JSON.parse(stored) as T : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue] as const;
}

const icons: Record<string, ReactNode> = {
  grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
  chart: <><path d="M4 19V9"/><path d="M10 19V5"/><path d="M16 19v-7"/><path d="M22 19H2"/></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5a5.5 5.5 0 0 0 1-8.9Z"/>,
  calendar: <><path d="M3 8h18"/><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4"/></>,
  bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  focus: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
  pill: <><path d="m10.5 20.5-7-7a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7Z"/><path d="m8 11 5-5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
};

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name]}
    </svg>
  );
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{children}</section>;
}

function PanelTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="panel-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function Sparkline({ positive = true, tall = false }: { positive?: boolean; tall?: boolean }) {
  const points = positive
    ? "0,43 14,39 26,41 40,28 54,32 69,19 81,24 96,9 110,13 124,4"
    : "0,8 13,12 25,9 39,21 51,18 67,33 80,28 94,42 109,36 124,47";
  return (
    <svg className={`spark ${positive ? "positive" : "negative"} ${tall ? "tall" : ""}`} viewBox="0 0 124 52" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={positive ? "upFill" : "downFill"} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity=".3"/>
          <stop offset="1" stopColor="currentColor" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`M${points} L124,52 L0,52 Z`} fill={`url(#${positive ? "upFill" : "downFill"})`} stroke="none"/>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2"/>
    </svg>
  );
}

function Header({ active, setActive }: { active: Tab; setActive: (tab: Tab) => void }) {
  return (
    <header className="topbar">
      <div className="brand" onClick={() => setActive("Overview")}>
        <div className="brand-mark"><span>11</span></div>
        <div><strong>APEX</strong><small>PERSONAL COMMAND</small></div>
      </div>
      <nav className="tabs" aria-label="Dashboard sections">
        {(["Overview", "Focus", "Investments", "Mental Health"] as Tab[]).map((tab) => (
          <button key={tab} className={active === tab ? "active" : ""} onClick={() => setActive(tab)}>
            <Icon name={tab === "Overview" ? "grid" : tab === "Focus" ? "focus" : tab === "Investments" ? "chart" : "heart"} />
            {tab}
          </button>
        ))}
      </nav>
      <div className="header-actions">
        <span className="sync-chip"><i/> Local autosave</span>
        <button className="icon-button" aria-label="Search"><Icon name="search"/></button>
        <button className="icon-button notification" aria-label="Notifications"><Icon name="bell"/></button>
        <div className="avatar">AS</div>
      </div>
    </header>
  );
}

const dailyTasks = [
  { text: "Morning training — Zone 2 cardio", done: true, meta: "06:30" },
  { text: "Review market before open", done: true, meta: "08:45" },
  { text: "Deep work sprint", done: false, meta: "10:00" },
  { text: "Evening journal & reset", done: false, meta: "21:30" },
];

const initialGoals = [
  { label: "Complete investment thesis", progress: 72, tag: "Q2" },
  { label: "Run a sub-45 min 10K", progress: 58, tag: "2025" },
  { label: "Read 24 books", progress: 42, tag: "10 / 24" },
];

function Overview() {
  const [tasks, setTasks] = useStoredState("apex.tasks", dailyTasks);
  const [goals, setGoals] = useStoredState("apex.goals", initialGoals);
  const [note, setNote] = useStoredState("apex.notes", "Review NVDA earnings report\nBook Barcelona flights\nCall Dr. Harris at 4pm");
  const [newTask, setNewTask] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [heroImage, setHeroImage] = useState(0);
  const toggle = (index: number) => setTasks(tasks.map((task, i) => i === index ? { ...task, done: !task.done } : task));
  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks([...tasks, { text: newTask.trim(), done: false, meta: "Anytime" }]);
    setNewTask("");
  };
  const addGoal = () => {
    if (!newGoal.trim()) return;
    setGoals([...goals, { label: newGoal.trim(), progress: 0, tag: "NEW" }]);
    setNewGoal("");
  };
  useEffect(() => {
    const rotation = window.setInterval(() => setHeroImage((current) => (current + 1) % raceImages.length), 6000);
    return () => window.clearInterval(rotation);
  }, []);

  return (
    <main className="page">
      <div className="welcome">
        <div>
          <p className="eyebrow red">MONDAY, 16 JUNE</p>
          <h1>Good morning, Alex.</h1>
          <p>Everything you need for a fast, focused day.</p>
        </div>
        <div className="time-block"><strong>08:42</strong><span>London · 17°C</span></div>
      </div>

      <div className="overview-grid">
        <div className="main-column">
          <Panel className="hero-card">
            <img key={heroImage} className="hero-image" src={raceImages[heroImage]} alt="Formula race car speeding around a circuit"/>
            <div className="hero-shade"/>
            <div className="hero-copy">
              <span className="live-pill"><i/> NEXT UP · CALENDAR EVENT</span>
              <h2>Portfolio weekly review</h2>
              <p>Investment strategy <span>·</span> Today, 09:30</p>
            </div>
            <div className="countdown">
              <div><strong>00</strong><span>HRS</span></div><b>:</b>
              <div><strong>48</strong><span>MIN</span></div>
            </div>
            <div className="hero-dots">
              {raceImages.map((_, index) => <button key={index} className={heroImage === index ? "active" : ""} onClick={() => setHeroImage(index)} aria-label={`Show car background ${index + 1}`}/>)}
            </div>
          </Panel>

          <Panel>
            <PanelTitle eyebrow="01 / EXECUTION" title="Today’s Run Plan" action={<span className="progress-label">{tasks.filter(task => task.done).length} of {tasks.length} complete</span>}/>
            <div className="task-progress"><span style={{ width: `${tasks.length ? (tasks.filter(task => task.done).length / tasks.length) * 100 : 0}%` }}/></div>
            <div className="task-list">
              {tasks.map((task, index) => (
                <button className={`task-row ${task.done ? "done" : ""}`} key={task.text} onClick={() => toggle(index)}>
                  <span className="checkbox">{task.done && <Icon name="check" size={14}/>}</span>
                  <span className="task-name">{task.text}</span>
                  <time>{task.meta}</time>
                </button>
              ))}
            </div>
            <div className="quick-add">
              <input value={newTask} onChange={(event) => setNewTask(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addTask()} placeholder="Add a task..."/>
              <button onClick={addTask}><Icon name="plus" size={14}/> Add task</button>
            </div>
          </Panel>

          <Panel>
            <PanelTitle eyebrow="02 / LONG GAME" title="Overall Goals" action={<button className="text-button">View all <Icon name="arrow" size={14}/></button>}/>
            <div className="goals">
              {goals.map((goal, index) => (
                <div className="goal" key={goal.label}>
                  <div><strong>{goal.label}</strong><span>{goal.tag}</span></div>
                  <input className="goal-slider" type="range" min="0" max="100" value={goal.progress} aria-label={`${goal.label} progress`} onChange={(event) => setGoals(goals.map((item, itemIndex) => itemIndex === index ? {...item, progress: Number(event.target.value)} : item))}/>
                  <em>{goal.progress}%</em>
                </div>
              ))}
            </div>
            <div className="quick-add compact">
              <input value={newGoal} onChange={(event) => setNewGoal(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addGoal()} placeholder="Add a new goal..."/>
              <button onClick={addGoal}><Icon name="plus" size={14}/> Add goal</button>
            </div>
          </Panel>
        </div>

        <aside className="side-column">
          <Panel className="calendar-panel">
            <PanelTitle eyebrow="JUNE 2025" title="Calendar" action={<div className="month-arrows"><button>‹</button><button>›</button></div>}/>
            <div className="calendar">
              {["M","T","W","T","F","S","S"].map((day, i) => <b key={i}>{day}</b>)}
              {[...Array(30)].map((_, i) => {
                const day = i + 1;
                return <span key={day} className={`${day === 16 ? "today" : ""} ${[5, 12, 21, 27].includes(day) ? "event" : ""}`}>{day}</span>;
              })}
            </div>
            <div className="next-event"><i/><div><small>NEXT UP · 09:30</small><strong>Portfolio weekly review</strong></div><span>45m</span></div>
          </Panel>

          <Panel className="notes-panel">
            <PanelTitle eyebrow="QUICK CAPTURE" title="Pit Wall Notes" action={<button className="icon-button mini"><Icon name="plus" size={16}/></button>}/>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} aria-label="Quick notes"/>
            <small>Autosaved just now</small>
          </Panel>

          <Panel className="quote-panel">
            <span className="quote-mark">“</span>
            <blockquote>“To achieve anything in this game, you must be prepared to dabble on the boundary of disaster.”</blockquote>
            <p>— Stirling Moss</p>
          </Panel>
        </aside>
      </div>

      <PortfolioSummary/>
    </main>
  );
}

function PortfolioSummary() {
  const movers = [
    { ticker: "NVDA", name: "NVIDIA", price: "$141.97", move: "+4.82%", up: true },
    { ticker: "MSFT", name: "Microsoft", price: "$449.28", move: "+1.24%", up: true },
    { ticker: "TSLA", name: "Tesla", price: "$322.05", move: "−3.18%", up: false },
    { ticker: "NKE", name: "Nike", price: "$61.73", move: "−2.06%", up: false },
  ];
  return (
    <Panel className="portfolio-panel">
      <PanelTitle eyebrow="03 / MY PORTFOLIO" title="Market Position" action={<button className="primary-button">Open portfolio <Icon name="arrow" size={15}/></button>}/>
      <div className="portfolio-grid">
        <div className="portfolio-value">
          <small>TOTAL BALANCE</small><strong>$184,290.42</strong>
          <span className="gain">+$2,841.30 <i>+1.57%</i> today</span>
          <div className="big-chart"><Sparkline positive tall/></div>
          <div className="chart-periods"><b>1D</b><span>1W</span><span>1M</span><span>3M</span><span>1Y</span></div>
        </div>
        <div className="allocation">
          <small>ALLOCATION</small>
          <div className="donut"><div><strong>+18.4%</strong><span>ALL TIME</span></div></div>
          <div className="legend"><span><i className="l1"/>Equities <b>62%</b></span><span><i className="l2"/>ETFs <b>24%</b></span><span><i className="l3"/>Cash <b>14%</b></span></div>
        </div>
        <div className="movers">
          <div className="movers-head"><small>TOP MOVERS</small><span>PRICE / DAY</span></div>
          {movers.map((item) => (
            <div className="mover" key={item.ticker}>
              <b>{item.ticker}</b><span>{item.name}</span><Sparkline positive={item.up}/><strong>{item.price}</strong><em className={item.up ? "up" : "down"}>{item.move}</em>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

type FocusLog = {
  task: string;
  description: string;
  duration: string;
  completed: string;
};

const initialFocusLog: FocusLog[] = [
  { task: "Review NVIDIA earnings", description: "Updated valuation model and key assumptions.", duration: "42m 18s", completed: "Today · 07:54" },
  { task: "Write investment memo", description: "Completed competitive advantage section.", duration: "55m 03s", completed: "Yesterday · 16:20" },
  { task: "Quarterly goal review", description: "Reprioritized fitness and reading targets.", duration: "28m 46s", completed: "14 Jun · 10:12" },
];

function Focus() {
  const [taskName, setTaskName] = useStoredState("apex.focus.task", "Complete investment thesis");
  const [description, setDescription] = useStoredState("apex.focus.description", "Finish the risk assessment and update the intrinsic value model.");
  const [duration, setDuration] = useState(25 * 60);
  const [remaining, setRemaining] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useStoredState("apex.focus.logs", initialFocusLog);

  useEffect(() => {
    if (!running || remaining <= 0) return;
    const timer = window.setInterval(() => setRemaining((current) => current - 1), 1000);
    return () => window.clearInterval(timer);
  }, [running, remaining]);

  useEffect(() => {
    if (remaining === 0) setRunning(false);
  }, [remaining]);

  const minutes = Math.floor(remaining / 60).toString().padStart(2, "0");
  const seconds = (remaining % 60).toString().padStart(2, "0");
  const elapsed = duration - remaining;
  const progress = Math.max(0, Math.min(100, (elapsed / duration) * 100));

  const selectDuration = (minutesToSet: number) => {
    setRunning(false);
    setDuration(minutesToSet * 60);
    setRemaining(minutesToSet * 60);
  };

  const completeSession = () => {
    if (!taskName.trim()) return;
    const loggedSeconds = Math.max(elapsed, 1);
    const loggedMinutes = Math.floor(loggedSeconds / 60);
    const leftoverSeconds = (loggedSeconds % 60).toString().padStart(2, "0");
    setLogs([
      {
        task: taskName.trim(),
        description: description.trim() || "Focused work session",
        duration: `${loggedMinutes}m ${leftoverSeconds}s`,
        completed: `Today · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      },
      ...logs,
    ]);
    setRunning(false);
    setRemaining(duration);
  };

  return (
    <main className="page focus-page">
      <div className="welcome">
        <div><p className="eyebrow red">DEEP WORK MODE</p><h1>Focus Control.</h1><p>One objective. One timer. No noise.</p></div>
        <div className="focus-status"><i className={running ? "running" : ""}/><span>{running ? "Session in progress" : "Ready for session"}</span></div>
      </div>

      <div className="focus-grid">
        <Panel className="timer-panel">
          <PanelTitle eyebrow="SESSION TIMER" title="Current Stint"/>
          <div className="timer-dial" style={{ background: `conic-gradient(var(--red) ${progress}%, #24262b ${progress}% 100%)` }}>
            <div>
              <span>TIME REMAINING</span>
              <strong>{minutes}:{seconds}</strong>
              <em>{running ? "STAY ON TRACK" : elapsed > 0 ? "SESSION PAUSED" : "READY"}</em>
            </div>
          </div>
          <div className="timer-presets">
            {[25, 45, 60, 90].map((preset) => (
              <button key={preset} className={duration === preset * 60 ? "active" : ""} onClick={() => selectDuration(preset)}>{preset} MIN</button>
            ))}
          </div>
          <div className="timer-actions">
            <button className="secondary-button" onClick={() => { setRunning(false); setRemaining(duration); }}>Reset</button>
            <button className="primary-button timer-start" onClick={() => setRunning(!running)}>{running ? "Pause session" : "Start session"}</button>
          </div>
        </Panel>

        <Panel className="focus-details">
          <PanelTitle eyebrow="ACTIVE OBJECTIVE" title="What are you working on?"/>
          <label htmlFor="focus-name">Task name</label>
          <input id="focus-name" value={taskName} onChange={(event) => setTaskName(event.target.value)} placeholder="Name this focus session"/>
          <label htmlFor="focus-description">Description</label>
          <textarea id="focus-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Define what done looks like..."/>
          <div className="focus-tip">
            <Icon name="bolt" size={17}/>
            <div><strong>Race engineer tip</strong><span>Keep the objective specific enough to finish in one stint.</span></div>
          </div>
          <button className="complete-button" onClick={completeSession}><Icon name="check" size={16}/> Complete & log session</button>
        </Panel>
      </div>

      <Panel className="focus-log">
        <PanelTitle eyebrow="SESSION HISTORY" title="Completed Task Log" action={<span className="log-count">{logs.length} sessions recorded</span>}/>
        <div className="log-table">
          <div className="log-header"><span>Task</span><span>Session notes</span><span>Time taken</span><span>Completed</span></div>
          {logs.map((log, index) => (
            <div className="log-row" key={`${log.task}-${index}`}>
              <div className="log-task"><i><Icon name="check" size={12}/></i><strong>{log.task}</strong></div>
              <p>{log.description}</p>
              <b>{log.duration}</b>
              <time>{log.completed}</time>
            </div>
          ))}
        </div>
      </Panel>
    </main>
  );
}

const initialStocks = [
  { symbol: "NVDA", company: "NVIDIA Corp.", price: "$141.97", value: "$158.40", upside: "+11.57%", status: "Undervalued", day: "+4.82%" },
  { symbol: "MSFT", company: "Microsoft", price: "$449.28", value: "$472.00", upside: "+5.05%", status: "Fair Value", day: "+1.24%" },
  { symbol: "AAPL", company: "Apple Inc.", price: "$195.10", value: "$186.20", upside: "−4.56%", status: "Overvalued", day: "+0.42%" },
  { symbol: "AMZN", company: "Amazon", price: "$212.33", value: "$238.00", upside: "+12.09%", status: "Undervalued", day: "−0.38%" },
  { symbol: "TSLA", company: "Tesla Inc.", price: "$322.05", value: "$246.50", upside: "−23.46%", status: "Overvalued", day: "−3.18%" },
];

function Investments() {
  const [range, setRange] = useState("1M");
  const [stocks, setStocks] = useStoredState("apex.portfolio", initialStocks);
  const [showAdd, setShowAdd] = useState(false);
  const [newPosition, setNewPosition] = useState({ symbol: "", company: "", price: "", value: "" });
  const addPosition = () => {
    if (!newPosition.symbol.trim() || !newPosition.price.trim()) return;
    setStocks([...stocks, {
      symbol: newPosition.symbol.trim().toUpperCase(),
      company: newPosition.company.trim() || "New position",
      price: newPosition.price.startsWith("$") ? newPosition.price : `$${newPosition.price}`,
      value: newPosition.value ? (newPosition.value.startsWith("$") ? newPosition.value : `$${newPosition.value}`) : "—",
      upside: "—",
      status: "Fair Value",
      day: "0.00%",
    }]);
    setNewPosition({ symbol: "", company: "", price: "", value: "" });
    setShowAdd(false);
  };
  return (
    <main className="page">
      <div className="welcome">
        <div><p className="eyebrow red">MARKET INTELLIGENCE</p><h1>Investment Control.</h1><p>Prices, positions, and intrinsic value in one view.</p></div>
        <button className="primary-button" onClick={() => setShowAdd(!showAdd)}><Icon name="plus" size={16}/> Add position</button>
      </div>
      <div className="market-strip">
        {[["S&P 500","5,982.14","+0.84%"],["NASDAQ","19,546.27","+1.12%"],["FTSE 100","8,847.03","−0.12%"],["BTC / USD","104,281","+2.04%"]].map((market) => (
          <div key={market[0]}><span>{market[0]}</span><strong>{market[1]}</strong><em className={market[2].startsWith("+") ? "up" : "down"}>{market[2]}</em></div>
        ))}
      </div>
      {showAdd && (
        <Panel className="position-editor">
          <div><label>Symbol</label><input value={newPosition.symbol} onChange={event => setNewPosition({...newPosition, symbol: event.target.value})} placeholder="e.g. AMD"/></div>
          <div><label>Company</label><input value={newPosition.company} onChange={event => setNewPosition({...newPosition, company: event.target.value})} placeholder="Company name"/></div>
          <div><label>Market price</label><input value={newPosition.price} onChange={event => setNewPosition({...newPosition, price: event.target.value})} placeholder="125.40"/></div>
          <div><label>Intrinsic value</label><input value={newPosition.value} onChange={event => setNewPosition({...newPosition, value: event.target.value})} placeholder="148.00"/></div>
          <button className="primary-button" onClick={addPosition}>Save position</button>
        </Panel>
      )}
      <div className="investment-grid">
        <Panel className="performance-card">
          <PanelTitle eyebrow="PORTFOLIO PERFORMANCE" title="$184,290.42" action={<span className="gain">+$12,490.18 YTD</span>}/>
          <div className="chart-toolbar"><span>Net deposits <b>$155,000</b></span><div>{["1D","1W","1M","3M","1Y"].map(r => <button className={range === r ? "active" : ""} onClick={() => setRange(r)} key={r}>{r}</button>)}</div></div>
          <svg className="performance-chart" viewBox="0 0 700 230" preserveAspectRatio="none" aria-label="Portfolio performance chart">
            <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2382b" stopOpacity=".3"/><stop offset="1" stopColor="#f2382b" stopOpacity="0"/></linearGradient></defs>
            {[30,80,130,180,225].map(y => <line key={y} x1="0" y1={y} x2="700" y2={y} stroke="#2a2c31" strokeWidth="1"/>)}
            <path d="M0 188 C55 182,65 147,120 158 S200 122,245 138 S312 95,360 109 S435 58,486 78 S558 55,610 61 S660 29,700 35 L700 230 L0 230Z" fill="url(#chartFill)"/>
            <path d="M0 188 C55 182,65 147,120 158 S200 122,245 138 S312 95,360 109 S435 58,486 78 S558 55,610 61 S660 29,700 35" fill="none" stroke="#f2382b" strokeWidth="3"/>
          </svg>
        </Panel>
        <Panel className="valuation-card">
          <PanelTitle eyebrow="VALUATION RADAR" title="Opportunity Score"/>
          <div className="score-ring"><div><strong>74</strong><span>/ 100</span></div></div>
          <p>Your portfolio is trading <b>8.2% below</b> estimated intrinsic value.</p>
          <div className="score-bars"><span>Quality <i><b style={{width:"86%"}}/></i><em>86</em></span><span>Value <i><b style={{width:"74%"}}/></i><em>74</em></span><span>Momentum <i><b style={{width:"68%"}}/></i><em>68</em></span></div>
        </Panel>
      </div>
      <Panel className="holdings-panel">
        <PanelTitle eyebrow="LIVE HOLDINGS" title="Intrinsic Value Monitor" action={<button className="text-button">Export data <Icon name="arrow" size={14}/></button>}/>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Asset</th><th>Market price</th><th>Intrinsic value</th><th>Upside</th><th>Valuation</th><th>Today</th><th></th></tr></thead>
            <tbody>{stocks.map(stock => (
              <tr key={`${stock.symbol}-${stock.company}`}><td><b>{stock.symbol}</b><span>{stock.company}</span></td><td>{stock.price}</td><td>{stock.value}</td><td className={stock.upside.startsWith("+") ? "up" : stock.upside.startsWith("−") ? "down" : ""}>{stock.upside}</td><td><em className={`status ${stock.status.toLowerCase().replace(" ","-")}`}>{stock.status}</em></td><td className={stock.day.startsWith("+") ? "up" : stock.day.startsWith("−") ? "down" : ""}>{stock.day}</td><td><button className="row-delete" onClick={() => setStocks(stocks.filter(item => item !== stock))} aria-label={`Remove ${stock.symbol}`}>×</button></td></tr>
            ))}</tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}

function MentalHealth() {
  const [ratings, setRatings] = useStoredState("apex.wellness.ratings", { Mood: 7, Energy: 6, Anxiety: 3, Focus: 8 });
  const [reflection, setReflection] = useStoredState("apex.wellness.reflection", "");
  return (
    <main className="page">
      <div className="welcome">
        <div><p className="eyebrow red">DRIVER WELLBEING</p><h1>Mental Health Advisor.</h1><p>A private space to check in, reflect, and stay on track.</p></div>
        <div className="streak"><Icon name="bolt"/><div><strong>12 day streak</strong><span>Longest: 28 days</span></div></div>
      </div>
      <div className="wellness-banner">
        <div><p className="eyebrow">TODAY’S BRIEFING</p><h2>How are you arriving today?</h2><span>Take two minutes. There are no wrong answers.</span></div>
        <div className="breath"><i/><span>Pause · Breathe · Notice</span></div>
      </div>
      <div className="wellness-grid">
        <Panel className="checkin-card">
          <PanelTitle eyebrow="DAILY CHECK-IN" title="Telemetry for the mind"/>
          <div className="ratings">
            {Object.entries(ratings).map(([label, value]) => (
              <div className="rating" key={label}>
                <div><strong>{label}</strong><span>{label === "Anxiety" ? "Low is good" : "How it feels"}</span><b>{value}<small>/10</small></b></div>
                <input type="range" min="1" max="10" value={value} onChange={e => setRatings({...ratings, [label]: Number(e.target.value)})} aria-label={`${label} rating`}/>
                <div className="range-labels"><span>1</span><span>10</span></div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel className="medication-card">
          <PanelTitle eyebrow="MEDICATION" title="Today’s Schedule" action={<button className="icon-button mini"><Icon name="plus" size={16}/></button>}/>
          <div className="med-list">
            <div className="med taken"><div className="med-icon"><Icon name="pill"/></div><div><strong>Sertraline</strong><span>50mg · with breakfast</span></div><em><Icon name="check" size={14}/> Taken 08:10</em></div>
            <div className="med"><div className="med-icon"><Icon name="pill"/></div><div><strong>Vitamin D3</strong><span>2000 IU · with food</span></div><button>Mark taken</button></div>
            <div className="med"><div className="med-icon"><Icon name="pill"/></div><div><strong>Magnesium</strong><span>200mg · before bed</span></div><time>21:30</time></div>
          </div>
          <div className="adherence"><span>30 DAY ADHERENCE <b>94%</b></span><i><b/></i><small>2 doses missed this month</small></div>
        </Panel>
        <Panel className="reflection-card">
          <PanelTitle eyebrow="DAILY REFLECTION" title="Clear the mental track"/>
          <label>What is taking up the most space in your mind today?</label>
          <textarea value={reflection} onChange={e => setReflection(e.target.value)} placeholder="Write freely. This is only for you..."/>
          <div className="prompt-chips"><button>One thing I’m grateful for</button><button>A small win</button><button>What I need</button></div>
          <div className="reflection-footer"><span>{reflection.length} characters</span><button className="primary-button">Save reflection <Icon name="arrow" size={14}/></button></div>
        </Panel>
        <Panel className="insight-card">
          <PanelTitle eyebrow="7 DAY INSIGHT" title="Your Pattern"/>
          <div className="insight-stat"><strong>+14%</strong><span>Average mood vs. last week</span></div>
          <div className="mood-bars">{[52,68,61,74,83,76,70].map((h,i)=><div key={i}><i style={{height:`${h}%`}}/><span>{["M","T","W","T","F","S","S"][i]}</span></div>)}</div>
          <p><i/> Your mood tends to improve on days with morning exercise.</p>
        </Panel>
      </div>
    </main>
  );
}

export default function App() {
  const [active, setActive] = useState<Tab>("Overview");
  return (
    <div className="app-shell">
      <Header active={active} setActive={setActive}/>
      {active === "Overview" && <Overview/>}
      {active === "Focus" && <Focus/>}
      {active === "Investments" && <Investments/>}
      {active === "Mental Health" && <MentalHealth/>}
      <footer><span>APEX COMMAND · PRIVATE DASHBOARD</span><span>Systems nominal <i/></span></footer>
    </div>
  );
}
