import { useState } from "react";
import { cars } from "../lib/cars";
import { openVault, seedFromVault } from "../lib/vault";
import { Icon } from "./ui";

export default function LockScreen({ onUnlock }: { onUnlock: (remember: boolean) => void }) {
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState(0);
  const [car] = useState(() => cars[Math.floor(Math.random() * cars.length)]);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await openVault(password);
      seedFromVault(data);
      onUnlock(remember);
    } catch (err) {
      const next = failures + 1;
      setFailures(next);
      // Slow down repeated guesses.
      await new Promise((resolve) => window.setTimeout(resolve, Math.min(next, 6) * 600));
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setPassword("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lock-screen">
      <img src={car.src} alt="" aria-hidden="true" style={{ objectPosition: car.position }}/>
      <div className="lock-shade"/>
      <form className={`lock-card ${error ? "shake" : ""}`} key={failures} onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="brand">
          <div className="brand-mark"><span>12</span></div>
          <div><strong>KASH</strong><small>PERSONAL COMMAND</small></div>
        </div>
        <p className="eyebrow red">PIT LANE CLOSED</p>
        <h1>Driver sign-in</h1>
        <p className="lock-copy">This dashboard is private. Enter your password to unlock it.</p>
        <label htmlFor="lock-password">Password</label>
        <input id="lock-password" type="password" inputMode="numeric" autoComplete="current-password" autoFocus value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy}/>
        <label className="lock-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)}/> Keep me signed in on this device for 30 days</label>
        {error && <p className="lock-error">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy || !password}>{busy ? "Checking…" : <>Unlock <Icon name="arrow" size={15}/></>}</button>
      </form>
      <small className="lock-credit">{car.car} · Photo: {car.author}, {car.license}</small>
    </div>
  );
}
