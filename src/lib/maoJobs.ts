import { getStored, useStored } from "./store";

// Starting MAO jobs from a static page. Requests sit in the ledger's Requests tab; something has
// to run them (nothing runs on a timer):
//   1. GitHub Actions, if a GitHub token is saved in this browser (runs in about a minute), or
//   2. the MAO server on this Mac, if it happens to be running.
// With neither, the request waits in the ledger until one of them runs.

export type GithubSettings = { token: string; repo: string };
const githubFallback: GithubSettings = { token: "", repo: "Kash1405/Automated-Equity-Valuation-MAO" };
export const useGithubSettings = () => useStored<GithubSettings>("investments.github", githubFallback);
export const MAO_SERVER = "http://127.0.0.1:8765";
const WORKFLOW = "scheduled-jobs.yml";

export type Runner = "github" | "local" | "queued";

async function localServerUp() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1500);
  try {
    return (await fetch(`${MAO_SERVER}/api/status`, { signal: controller.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Kicks off processing of the Requests queue. Never throws for "nobody to run it": that's "queued".
export async function startRequests(): Promise<Runner> {
  const { token, repo } = getStored("investments.github", githubFallback);
  if (token) {
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { job: "requests" } }),
    });
    if (response.ok) return "github";
    const body = await response.json().catch(() => ({}));
    throw new Error(`GitHub refused to start the job (${response.status}${body.message ? `: ${body.message}` : ""}). Check the token in Investments settings.`);
  }
  if (await localServerUp()) {
    void fetch(`${MAO_SERVER}/api/jobs/requests`, { method: "POST" }).catch(() => undefined); // runs for a minute or so
    return "local";
  }
  return "queued";
}

export const runnerMessage = (runner: Runner, what: string) =>
  runner === "github" ? `${what} GitHub Actions is running it now; results appear in a minute or two.`
  : runner === "local" ? `${what} The MAO server on this Mac is running it now.`
  : `${what} It's queued, but nothing can run it yet: add a GitHub token in Investments settings (key icon), or start the MAO server on this Mac.`;
