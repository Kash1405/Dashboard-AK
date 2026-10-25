import { useEffect, useState, type KeyboardEvent } from "react";
import { Icon, Panel, PanelTitle } from "./ui";
import { useStored } from "../lib/store";
import { DIFFICULTIES, PEERS, boxOf, colOf, generate, rowOf, type Difficulty } from "../lib/sudoku";
import { formatDuration, pad, useNow } from "../lib/utils";

const MAX_MISTAKES = 3;
const MAX_HINTS = 3;

type Game = {
  difficulty: Difficulty;
  puzzle: number[];
  solution: number[];
  values: number[];
  notes: number[]; // bitmask of pencil marks per cell
  mistakes: number;
  hints: number;
  elapsed: number; // seconds banked before `since`
  since: number | null; // when the clock last resumed, null while stopped
  paused: boolean;
  status: "playing" | "won" | "lost";
};

type Stats = Record<Difficulty, { won: number; best: number | null }>;

const emptyStats: Stats = { easy: { won: 0, best: null }, medium: { won: 0, best: null }, hard: { won: 0, best: null }, expert: { won: 0, best: null } };

function newGame(difficulty: Difficulty): Game {
  const { puzzle, solution } = generate(difficulty);
  return { difficulty, puzzle, solution, values: puzzle.slice(), notes: new Array(81).fill(0), mistakes: 0, hints: 0, elapsed: 0, since: Date.now(), paused: false, status: "playing" };
}

const bank = (game: Game, at = Date.now()): Game => (game.since === null ? game : { ...game, elapsed: game.elapsed + Math.round((at - game.since) / 1000), since: null });
const clockLabel = (seconds: number) => `${seconds >= 3600 ? `${Math.floor(seconds / 3600)}:` : ""}${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;

export default function Sudoku() {
  const [game, setGame] = useStored<Game | null>("sudoku.game", null);
  const [stats, setStats] = useStored<Stats>("sudoku.stats", emptyStats);
  const [selected, setSelected] = useState<number | null>(null);
  const [noteMode, setNoteMode] = useState(false);
  const [history, setHistory] = useState<{ values: number[]; notes: number[] }[]>([]);
  const now = useNow(1000);

  // Only count time while the board is on screen.
  useEffect(() => {
    const resume = () => setGame((g) => (g && g.status === "playing" && !g.paused && g.since === null ? { ...g, since: Date.now() } : g));
    const stop = () => setGame((g) => (g ? bank(g) : g));
    const onVisibility = () => (document.hidden ? stop() : resume());
    resume();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [setGame]);

  const start = (difficulty: Difficulty) => {
    setGame(newGame(difficulty));
    setHistory([]);
    setSelected(null);
    setNoteMode(false);
  };

  if (!game) {
    return (
      <Panel className="sudoku-panel">
        <PanelTitle eyebrow="PIT STOP" title="Sudoku"/>
        <p className="sudoku-intro">A fresh, randomly generated puzzle with exactly one solution. Pick a difficulty to start.</p>
        <div className="sudoku-levels">
          {DIFFICULTIES.map((d) => <button key={d.id} className="secondary-button" onClick={() => start(d.id)}>{d.label}</button>)}
        </div>
      </Panel>
    );
  }

  const playing = game.status === "playing" && !game.paused;
  const seconds = game.elapsed + (game.since !== null ? Math.max(0, Math.round((now.getTime() - game.since) / 1000)) : 0);
  const selValue = selected !== null ? game.values[selected] : 0;
  const remaining = (d: number) => 9 - game.values.filter((v, i) => v === d && v === game.solution[i]).length;
  const label = DIFFICULTIES.find((d) => d.id === game.difficulty)?.label ?? game.difficulty;

  const remember = () => setHistory((h) => [...h.slice(-99), { values: game.values, notes: game.notes }]);

  const place = (index: number, digit: number) => {
    if (!playing || game.puzzle[index] || game.values[index] === game.solution[index]) return;
    if (noteMode) {
      if (game.values[index]) return;
      remember();
      const notes = game.notes.slice();
      notes[index] ^= 1 << digit;
      setGame({ ...game, notes });
      return;
    }
    if (game.values[index] === digit) return;
    remember();
    const values = game.values.slice();
    const notes = game.notes.slice();
    values[index] = digit;
    notes[index] = 0;
    const correct = digit === game.solution[index];
    if (correct) for (const p of PEERS[index]) notes[p] &= ~(1 << digit);
    const mistakes = game.mistakes + (correct ? 0 : 1);
    let next: Game = { ...game, values, notes, mistakes };
    if (mistakes >= MAX_MISTAKES) next = { ...bank(next), status: "lost" };
    else if (values.every((v, i) => v === game.solution[i])) next = finish(next);
    setGame(next);
  };

  const finish = (g: Game): Game => {
    const done = bank(g);
    const prev = stats[g.difficulty] ?? { won: 0, best: null };
    setStats({ ...stats, [g.difficulty]: { won: prev.won + 1, best: prev.best === null ? done.elapsed : Math.min(prev.best, done.elapsed) } });
    return { ...done, status: "won" };
  };

  const erase = () => {
    if (!playing || selected === null || game.puzzle[selected] || game.values[selected] === game.solution[selected]) return;
    if (!game.values[selected] && !game.notes[selected]) return;
    remember();
    const values = game.values.slice();
    const notes = game.notes.slice();
    values[selected] = 0;
    notes[selected] = 0;
    setGame({ ...game, values, notes });
  };

  const undo = () => {
    const last = history[history.length - 1];
    if (!playing || !last) return;
    setHistory(history.slice(0, -1));
    setGame({ ...game, values: last.values, notes: last.notes });
  };

  const hint = () => {
    if (!playing || game.hints >= MAX_HINTS) return;
    const open = (i: number) => game.values[i] !== game.solution[i];
    const target = selected !== null && open(selected) ? selected : game.values.findIndex((_, i) => open(i));
    if (target < 0) return;
    remember();
    const values = game.values.slice();
    const notes = game.notes.slice();
    values[target] = game.solution[target];
    notes[target] = 0;
    for (const p of PEERS[target]) notes[p] &= ~(1 << values[target]);
    setSelected(target);
    let next: Game = { ...game, values, notes, hints: game.hints + 1 };
    if (values.every((v, i) => v === game.solution[i])) next = finish(next);
    setGame(next);
  };

  const togglePause = () => {
    if (game.status !== "playing") return;
    setGame(game.paused ? { ...game, paused: false, since: Date.now() } : { ...bank(game), paused: true });
  };

  const restart = () => {
    setGame({ ...game, values: game.puzzle.slice(), notes: new Array(81).fill(0), mistakes: 0, hints: 0, elapsed: 0, since: Date.now(), paused: false, status: "playing" });
    setHistory([]);
    setSelected(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.target instanceof HTMLSelectElement) return;
    const key = event.key;
    if ((event.metaKey || event.ctrlKey) && key.toLowerCase() === "z") { event.preventDefault(); undo(); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (/^[1-9]$/.test(key) && selected !== null) { event.preventDefault(); place(selected, Number(key)); return; }
    if (key === "Backspace" || key === "Delete" || key === "0") { event.preventDefault(); erase(); return; }
    if (key === "n" || key === "N") { setNoteMode((m) => !m); return; }
    const moves: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (moves[key]) {
      event.preventDefault();
      const from = selected ?? 40;
      const r = (rowOf(from) + moves[key][0] + 9) % 9;
      const c = (colOf(from) + moves[key][1] + 9) % 9;
      setSelected(r * 9 + c);
      (event.currentTarget.querySelector(`[data-cell="${r * 9 + c}"]`) as HTMLElement | null)?.focus();
    }
  };

  return (
    <Panel className="sudoku-panel">
      <PanelTitle eyebrow="PIT STOP" title="Sudoku" action={
        <div className="sudoku-levels compact">
          {DIFFICULTIES.map((d) => (
            <button key={d.id} className={game.difficulty === d.id ? "active" : ""} onClick={() => (game.status !== "playing" || game.values.every((v, i) => v === game.puzzle[i]) || window.confirm(`Start a new ${d.label} puzzle? This one will be lost.`)) && start(d.id)}>{d.label}</button>
          ))}
        </div>
      }/>
      <div className="sudoku-layout" onKeyDown={onKeyDown}>
        <div className="sudoku-board-wrap">
          <div className={`sudoku-board ${playing ? "" : "inactive"}`} role="grid" aria-label={`${label} sudoku`}>
            {game.values.map((value, i) => {
              const given = game.puzzle[i] !== 0;
              const wrong = !given && value !== 0 && value !== game.solution[i];
              const related = selected !== null && i !== selected && (rowOf(i) === rowOf(selected) || colOf(i) === colOf(selected) || boxOf(i) === boxOf(selected));
              const same = selValue !== 0 && value === selValue && i !== selected;
              const classes = ["sudoku-cell", given ? "given" : "", wrong ? "wrong" : "", related ? "related" : "", same ? "same" : "", i === selected ? "selected" : "", colOf(i) % 3 === 2 && colOf(i) !== 8 ? "edge-r" : "", rowOf(i) % 3 === 2 && rowOf(i) !== 8 ? "edge-b" : ""].filter(Boolean).join(" ");
              return (
                <button key={i} data-cell={i} className={classes} onClick={() => setSelected(i)} aria-label={`Row ${rowOf(i) + 1}, column ${colOf(i) + 1}${value ? `, ${value}` : ", empty"}`}>
                  {!(game.paused && game.status === "playing") && (value ? value : game.notes[i] ? (
                    <span className="sudoku-notes">{Array.from({ length: 9 }, (_, k) => <i key={k}>{game.notes[i] & (1 << (k + 1)) ? k + 1 : ""}</i>)}</span>
                  ) : null)}
                </button>
              );
            })}
          </div>
          {game.paused && game.status === "playing" && (
            <div className="sudoku-overlay"><strong>Paused</strong><button className="primary-button" onClick={togglePause}><Icon name="play" size={14}/> Resume</button></div>
          )}
          {game.status === "won" && (
            <div className="sudoku-overlay won">
              <p className="eyebrow">CHEQUERED FLAG</p>
              <strong>Solved in {clockLabel(game.elapsed)}</strong>
              <span>{label} · {game.mistakes} mistake{game.mistakes === 1 ? "" : "s"} · {game.hints} hint{game.hints === 1 ? "" : "s"}{stats[game.difficulty]?.best === game.elapsed ? " · New best!" : ""}</span>
              <button className="primary-button" onClick={() => start(game.difficulty)}>New {label} puzzle</button>
            </div>
          )}
          {game.status === "lost" && (
            <div className="sudoku-overlay lost">
              <p className="eyebrow red">RETIRED</p>
              <strong>{MAX_MISTAKES} mistakes</strong>
              <span>That's the limit for this puzzle.</span>
              <div className="sudoku-overlay-actions">
                <button className="secondary-button" onClick={restart}>Try again</button>
                <button className="primary-button" onClick={() => start(game.difficulty)}>New puzzle</button>
              </div>
            </div>
          )}
        </div>

        <div className="sudoku-side">
          <div className="sudoku-stats">
            <div><span>Difficulty</span><b>{label}</b></div>
            <div><span>Mistakes</span><b className={game.mistakes ? "red-text" : ""}>{game.mistakes}/{MAX_MISTAKES}</b></div>
            <div>
              <span>Time</span>
              <b className="sudoku-clock">{clockLabel(seconds)}
                {game.status === "playing" && <button className="icon-mini" onClick={togglePause} aria-label={game.paused ? "Resume" : "Pause"}><Icon name={game.paused ? "play" : "pause"} size={12}/></button>}
              </b>
            </div>
          </div>

          <div className="sudoku-tools">
            <button onClick={undo} disabled={!playing || history.length === 0}><Icon name="undo" size={20}/><span>Undo</span></button>
            <button onClick={erase} disabled={!playing || selected === null}><Icon name="eraser" size={20}/><span>Erase</span></button>
            <button className={noteMode ? "on" : ""} onClick={() => setNoteMode(!noteMode)} disabled={!playing} aria-pressed={noteMode}><Icon name="edit" size={20}/><span>Notes <em>{noteMode ? "ON" : "OFF"}</em></span></button>
            <button onClick={hint} disabled={!playing || game.hints >= MAX_HINTS}><Icon name="bulb" size={20}/><span>Hint <em>{MAX_HINTS - game.hints}</em></span></button>
          </div>

          <div className="sudoku-pad">
            {Array.from({ length: 9 }, (_, k) => k + 1).map((d) => {
              const left = remaining(d);
              return (
                <button key={d} onClick={() => selected !== null && place(selected, d)} disabled={!playing || left === 0} aria-label={`Enter ${d}`}>
                  {d}<small>{left}</small>
                </button>
              );
            })}
          </div>

          <button className="primary-button sudoku-new" onClick={() => (game.status !== "playing" || window.confirm("Start a new puzzle? This one will be lost.")) && start(game.difficulty)}>
            <Icon name="refresh" size={14}/> New game
          </button>
          <p className="sudoku-best">
            Best {label}: <b>{stats[game.difficulty]?.best != null ? formatDuration(stats[game.difficulty].best!) : "—"}</b> · Solved <b>{stats[game.difficulty]?.won ?? 0}</b>
          </p>
          <p className="sudoku-keys">Keys: 1–9 to fill · arrows to move · N notes · ⌫ erase · ⌘Z undo</p>
        </div>
      </div>
    </Panel>
  );
}
