import type Anthropic from "@anthropic-ai/sdk";
import { peekStored, setStored, useStored } from "./store";
import { dateKey } from "./utils";

// Latest news, picked and summarised by Claude using its web search tool.
// Runs straight from the browser with the user's own Anthropic API key, which stays on this
// device ("auth." keys are never synced or put in backups). The feed itself is cached locally.

export type NewsItem = { headline: string; highlight: string; source: string; url: string; topic: string; published: string };
export type NewsFeed = { items: NewsItem[]; fetchedAt: number };
export type NewsStatus = { busy: boolean; error: string };

const MODEL = "claude-opus-5-5";
export const AUTO_REFRESH_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_TOPICS = "World, Business & markets, Technology, Formula 1";

export const useNewsKey = () => useStored<string>("auth.anthropicKey", "");
export const useNewsTopics = () => useStored<string>("news.topics", DEFAULT_TOPICS);
export const useNewsFeed = () => useStored<NewsFeed>("news.feed", { items: [], fetchedAt: 0 });
export const useNewsStatus = () => useStored<NewsStatus>("~news.status", { busy: false, error: "" });

const setStatus = (status: NewsStatus) => setStored<NewsStatus>("~news.status", status);

function prompt(topics: string) {
  return `Today is ${dateKey()}. Search the web for the most important news of the last 24 hours on these topics: ${topics}.

Pick 8 to 10 stories in total, spread across the topics, favouring significant developments over minor ones. Use reputable outlets and link each story to the specific article you read, never a homepage. Only use URLs that appeared in your search results.

For each story write a one-line headline in your own words and a highlight: two sentences on what happened and why it matters.

Finish your reply with only a JSON array in a \`\`\`json code block, newest first, where each item is:
{"headline": string, "highlight": string, "source": "publication name", "url": "article URL", "topic": "one of the topics above", "published": "YYYY-MM-DD or empty if unknown"}`;
}

function parseItems(text: string): NewsItem[] {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].pop()?.[1];
  const raw = fenced ?? text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Couldn't read the news reply. Try refreshing again.");
  }
  if (!Array.isArray(data)) throw new Error("Couldn't read the news reply. Try refreshing again.");
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return data
    .map((d: Record<string, unknown>) => ({ headline: str(d.headline), highlight: str(d.highlight), source: str(d.source), url: str(d.url), topic: str(d.topic), published: str(d.published) }))
    .filter((item) => item.headline && /^https?:\/\//.test(item.url));
}

let running: Promise<void> | null = null;

export function refreshNews() {
  if (running) return running;
  const apiKey = peekStored<string>("auth.anthropicKey")?.trim();
  if (!apiKey) {
    setStatus({ busy: false, error: "Add your Anthropic API key to load the news." });
    return Promise.resolve();
  }
  const topics = peekStored<string>("news.topics")?.trim() || DEFAULT_TOPICS;
  setStatus({ busy: true, error: "" });
  running = (async () => {
    try {
      const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
      const client = new AnthropicClient({ apiKey, dangerouslyAllowBrowser: true });
      const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt(topics) }];
      // Web search can pause a long turn; send it back to let Claude carry on.
      for (let turn = 0; turn < 4; turn++) {
        const response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
          tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
          messages,
        });
        if (response.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: response.content });
          continue;
        }
        if (response.stop_reason === "refusal") throw new Error("Claude declined this request. Try different topics.");
        const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
        const items = parseItems(text);
        if (!items.length) throw new Error("No stories came back. Try refreshing again.");
        setStored<NewsFeed>("news.feed", { items, fetchedAt: Date.now() });
        setStatus({ busy: false, error: "" });
        return;
      }
      throw new Error("The news search took too long. Try again.");
    } catch (error) {
      const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
      const message =
        error instanceof AnthropicClient.AuthenticationError ? "Anthropic rejected the API key." :
        error instanceof AnthropicClient.RateLimitError ? "Rate limited by Anthropic. Try again in a minute." :
        error instanceof AnthropicClient.APIError ? `Anthropic error${error.status ? ` ${error.status}` : ""}: ${error.message}` :
        error instanceof Error ? error.message : "Couldn't load the news.";
      setStatus({ busy: false, error: message });
    } finally {
      running = null;
    }
  })();
  return running;
}
