import { useEffect, useRef, useState } from "react";
import { googleClientId, hasEnvClientId, preloadGoogle, useGoogleClientId } from "../lib/google";
import { signIn, signOut, syncNow, useSyncMeta, useSyncStatus } from "../lib/sync";
import { timeLabel } from "../lib/utils";
import { Icon } from "./ui";

export default function SyncChip() {
  const [status] = useSyncStatus();
  const [meta] = useSyncMeta();
  const [stored, setClientId] = useGoogleClientId();
  const clientId = googleClientId() || stored;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    if (clientId) preloadGoogle().catch(() => undefined);
    const close = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, clientId]);

  const state = clientId && meta.enabled ? status.state : "off";
  const label =
    state === "syncing" ? "Syncing…" :
    state === "synced" ? `Synced ${timeLabel(new Date(status.at))}` :
    state === "error" ? "Sync error" :
    state === "signed-out" ? "Signed out" : "Cloud sync off";

  return (
    <div className="sync-wrap" ref={box}>
      <button className={`sync-chip-btn ${state}`} onClick={() => setOpen(!open)} title={status.error || "Google Drive sync"}>
        <i/>{label}
      </button>
      {open && (
        <div className="sync-pop">
          <p className="eyebrow red">GOOGLE DRIVE SYNC</p>
          {status.error && <p className="sync-error">{status.error}</p>}
          {meta.enabled && clientId ? (
            <>
              <p className="sync-copy">Your data is kept in a private, hidden app folder in your Google Drive and synced between your devices. Your Finnhub key and the encrypted login never leave this browser.</p>
              <div className="sync-buttons">
                {state === "signed-out" || state === "error"
                  ? <button className="primary-button" onClick={() => signIn()}>Sign in</button>
                  : <button className="primary-button" onClick={() => syncNow(true)} disabled={state === "syncing"}><Icon name="refresh" size={14}/> Sync now</button>}
                <button className="secondary-button" onClick={() => signOut()}>Sign out</button>
              </div>
            </>
          ) : (
            <>
              <p className="sync-copy">Back up and sync everything across your devices using a private, hidden folder in your own Google Drive. Nothing is stored anywhere else.</p>
              {!hasEnvClientId() && (
                <label className="sync-field">Google OAuth Client ID
                  <input value={stored} onChange={(event) => setClientId(event.target.value.trim())} placeholder="xxxxxxxx.apps.googleusercontent.com" autoComplete="off"/>
                </label>
              )}
              <details className="sync-steps">
                <summary>How to get a Client ID (one-time, ~5 minutes)</summary>
                <ol>
                  <li>Go to <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud Console</a> and create a project (e.g. “KASH Dashboard”).</li>
                  <li>In <b>APIs &amp; Services → Library</b>, enable <b>Google Drive API</b> (and <b>Google Calendar API</b> if you want the calendar link).</li>
                  <li>In <b>OAuth consent screen</b>: User type <b>External</b>, add an app name and your email, leave it in <b>Testing</b>, and add your own Gmail under <b>Test users</b>.</li>
                  <li>In <b>Credentials → Create credentials → OAuth client ID</b>: type <b>Web application</b>. Under <b>Authorised JavaScript origins</b> add <code>{window.location.origin}</code> and <code>https://kash1405.github.io</code>.</li>
                  <li>Copy the Client ID here and click <b>Sign in with Google</b>. Google will warn the app is unverified; that is expected for your own test app.</li>
                </ol>
              </details>
              <div className="sync-buttons">
                <button className="primary-button" onClick={() => signIn()} disabled={!clientId}>Sign in with Google</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
