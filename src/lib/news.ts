import { setStored, useStored } from "./store";

// Latest news from public RSS feeds (BBC, The Guardian, NPR, Al Jazeera, NASA). The site's
// GitHub workflow gathers about 20 stories across topics into news.json every 2 hours
// (scripts/fetch-news.mjs), so the dashboard needs no news API or key.

export type NewsItem = { topic: string; source: string; headline: string; summary: string; url: string; image: string; published: string };
export type NewsFeed = { items: NewsItem[]; generatedAt: string };
export type NewsStatus = { busy: boolean; error: string; checkedAt: number };

export const RECHECK_MS = 30 * 60 * 1000;

export const useNewsFeed = () => useStored<NewsFeed>("news.feed", { items: [], generatedAt: "" });
export const useNewsStatus = () => useStored<NewsStatus>("~news.status", { busy: false, error: "", checkedAt: 0 });

const setStatus = (patch: Partial<NewsStatus>) => setStored<NewsStatus>("~news.status", (s) => ({ ...s, ...patch }), { busy: false, error: "", checkedAt: 0 });

let running: Promise<void> | null = null;

export function refreshNews() {
  if (running) return running;
  setStatus({ busy: true, error: "" });
  running = (async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}news.json?t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "No news yet. It appears after the site's next deploy." : `Couldn't load the news (${response.status}).`);
      const feed = (await response.json()) as NewsFeed;
      if (!Array.isArray(feed.items)) throw new Error("The news file is not in the expected format.");
      setStored<NewsFeed>("news.feed", feed);
      setStatus({ busy: false, checkedAt: Date.now() });
    } catch (error) {
      setStatus({ busy: false, checkedAt: Date.now(), error: error instanceof Error ? error.message : "Couldn't load the news." });
    } finally {
      running = null;
    }
  })();
  return running;
}

// The earlier AI version kept an Anthropic key in this browser; it is no longer used.
try {
  window.localStorage.removeItem("apex2.auth.anthropicKey");
  window.localStorage.removeItem("apex2.news.topics");
} catch {
  // Storage blocked: nothing to clean up.
}
