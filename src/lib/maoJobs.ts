import { useEffect, useState } from "react";

// Starting MAO jobs from a static page. Requests sit in the ledger's Requests tab, and the MAO server
// on this Mac runs them, with Claude Code writing the desk notes and briefing. So the Investments page
// works only while Claude is running here: the server is up, the Claude desktop app is open and its
// Claude Code is signed in. Nothing runs on a timer.

export const MAO_SERVER = "http://127.0.0.1:8765";
const CHECK_MS = 15_000;

export type ClaudeState = "checking" | "ready" | "not-ready" | "offline";
export type ClaudeStatus = { state: ClaudeState; detail: string; running: boolean };

async function readStatus(): Promise<ClaudeStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const response = await fetch(`${MAO_SERVER}/api/status`, { signal: controller.signal });
    if (!response.ok) return { state: "offline", detail: `The MAO server answered ${response.status}.`, running: false };
    const body = await response.json();
    const code = body?.claude_code as { ready?: boolean; detail?: string } | undefined;
    if (!code) return { state: "not-ready", detail: "The MAO server on this Mac is out of date. Restart it to pick up the Claude check.", running: false };
    return { state: code.ready ? "ready" : "not-ready", detail: code.detail ?? "", running: !!body?.requests?.running };
  } catch {
    return { state: "offline", detail: "The MAO server isn't running on this Mac.", running: false };
  } finally {
    clearTimeout(timer);
  }
}

// Checks the local server while the page is open (and whenever the tab comes back into view).
export function useClaudeStatus() {
  const [status, setStatus] = useState<ClaudeStatus>({ state: "checking", detail: "", running: false });
  useEffect(() => {
    let live = true;
    const check = () => {
      if (document.visibilityState === "visible") readStatus().then((s) => live && setStatus(s));
    };
    check();
    const timer = window.setInterval(check, CHECK_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      live = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return status;
}

// Asks the MAO server to run the Requests queue now. Throws when Claude isn't running.
export async function startRequests() {
  let response: Response;
  try {
    response = await fetch(`${MAO_SERVER}/api/jobs/requests`, { method: "POST" });
  } catch {
    throw new Error("The request is saved in the ledger, but the MAO server on this Mac isn't reachable, so nothing ran.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`The request is saved in the ledger, but it didn't run: ${body?.detail ?? `server error ${response.status}`}`);
  }
}

export const runnerMessage = (what: string) => `${what} Claude is running it on this Mac; results appear here when it finishes.`;
