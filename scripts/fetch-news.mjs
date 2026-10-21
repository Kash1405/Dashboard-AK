// Builds public/news.json for the dashboard's Latest News carousel.
// Runs in the GitHub Pages workflow (every couple of hours and on each deploy), where RSS feeds
// can be read without the browser's cross-origin limits, so the site needs no news API or key.
// Usage: node scripts/fetch-news.mjs [output path]
//
// Aims for the day's biggest stories, not the newest: these feeds list stories in their editors'
// order of importance, so a story's place in its feed counts, and a story that several outlets
// are running counts for more. Soft pieces (live blogs, videos, opinion, quizzes) are left out.

import { writeFile } from "node:fs/promises";

// [topic, source, feed URL]. Every feed is read; the best stories win each topic's slots.
const FEEDS = [
  ["Top Stories", "BBC News", "https://feeds.bbci.co.uk/news/rss.xml"],
  ["Top Stories", "The New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"],
  ["World", "BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["World", "The New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml"],
  ["World", "The Guardian", "https://www.theguardian.com/world/rss"],
  ["Business", "BBC News", "https://feeds.bbci.co.uk/news/business/rss.xml"],
  ["Business", "The New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml"],
  ["Business", "The Guardian", "https://www.theguardian.com/uk/business/rss"],
  ["Technology", "BBC News", "https://feeds.bbci.co.uk/news/technology/rss.xml"],
  ["Technology", "The New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml"],
  ["Technology", "The Guardian", "https://www.theguardian.com/uk/technology/rss"],
  ["Science", "The New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/Science.xml"],
  ["Science", "The New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/Space.xml"],
  ["Science", "The Guardian", "https://www.theguardian.com/science/rss"],
  ["Science", "NPR", "https://feeds.npr.org/1007/rss.xml"],
  ["Sport", "BBC Sport", "https://feeds.bbci.co.uk/sport/rss.xml"],
  ["Sport", "The Guardian", "https://www.theguardian.com/uk/sport/rss"],
  ["Sport", "BBC Sport", "https://feeds.bbci.co.uk/sport/formula1/rss.xml"],
];

// How many stories each topic gets (about 20 in all).
const SLOTS = { "Top Stories": 4, World: 4, Business: 3, Technology: 4, Science: 3, Sport: 3 };
// Only a feed's first stories are the ones its editors are leading with.
const DEPTH = 12;
// Older stories have usually been overtaken (science moves slower).
const MAX_AGE_H = { Science: 96 };
const DEFAULT_MAX_AGE_H = 36;

// Soft or small pieces: live blogs, video, audio, opinion, galleries, quizzes, reviews, lifestyle,
// question-style explainers, Q&As, listicles and bylined analysis ("Chris Mason: ...").
const SOFT_URL = /\/(?:videos?|live|av|audio|sounds|programmes|podcasts?|commentisfree|opinion|crosswords|lifeandstyle|style|food|travel|fashion|well|gallery|picture|in-pictures|interactive|briefing|newsletters?)\//i;
const SOFT_HEADLINE = /^(?:watch|listen|quiz|video|in pictures|pictures|photos|live|opinion|letters?|review|podcast|the week in|what to watch|today in|morning|evening)\b|[–—-]\s*live$|\b(?:as it happened|live updates|quiz|crossword|newsletter|recipe|horoscope|puzzle|q&a)\b|\?|\b\d+ (?:tips|ways|things|reasons|questions)\b|^[A-Z][\w'’-]+ [A-Z][\w'’-]+: /i;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? m,
  );
const text = (s = "") => decode(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const tag = (xml, name) => text(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i").exec(xml)?.[1]);

function image(xml) {
  const urls = [...xml.matchAll(/<(?:media:content|media:thumbnail|enclosure)\b([^>]*)>/gi)]
    .map(([, attrs]) => ({ url: /url="([^"]+)"/.exec(attrs)?.[1], width: Number(/width="(\d+)"/.exec(attrs)?.[1] ?? 0), type: /type="([^"]+)"/.exec(attrs)?.[1] ?? "image" }))
    .filter((m) => m.url && m.type.startsWith("image"));
  urls.sort((a, b) => b.width - a.width);
  const url = urls[0]?.url ? decode(urls[0].url) : "";
  // BBC thumbnails come at 240px; their image service serves the same picture larger.
  return url.replace(/ichef\.bbci\.co\.uk\/(?:news|ace\/standard)\/\d+\//, "ichef.bbci.co.uk/news/640/");
}

const clip = (s, max) => (s.length > max ? `${s.slice(0, s.lastIndexOf(" ", max)).replace(/[,;:.\s]+$/, "")}…` : s);

// The words that say what a story is about, for spotting the same story at different outlets.
const STOP = new Set(
  "about above after again against also amid among another around back been before being below between both but came come could days does down during each even every first from have here into just last like made make many more most much must need news next only other over people said says should since some still such take than that their them then there these they this those three through told under until very want week were what when where which while will with would year years your know first second third four five could after says report reports amid".split(" "),
);
const words = (s) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[’']s\b/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w))
      .map((w) => (w.length > 5 ? w.replace(/(?:ing|ed|es|s)$/, "") : w)),
  );
const shared = (a, b) => [...a].filter((w) => b.has(w)).length;
// Same story if the headlines share a key word and the headline + summary share a few.
const sameStory = (a, b) => shared(a.titleWords, b.titleWords) >= 1 && shared(a.allWords, b.allWords) >= 3;

async function read([topic, source, url], feed) {
  const response = await fetch(url, { headers: { "User-Agent": "KASH-dashboard news builder (+https://github.com/Kash1405/Dashboard-AK)" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${response.status}`);
  const xml = await response.text();
  const now = Date.now();
  const maxAge = (MAX_AGE_H[topic] ?? DEFAULT_MAX_AGE_H) * 3600 * 1000;
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)]
    .map(([item]) => {
      const published = new Date(tag(item, "pubDate") || tag(item, "dc:date"));
      return {
        topic,
        source,
        headline: tag(item, "title"),
        summary: clip(tag(item, "description"), 260),
        url: tag(item, "link") || /<link[^>]*href="([^"]+)"/.exec(item)?.[1] || "",
        image: image(item),
        published: Number.isNaN(published.getTime()) ? "" : published.toISOString(),
      };
    })
    .filter((i) => i.headline && /^https?:\/\//.test(i.url))
    .slice(0, DEPTH)
    .map((i, rank) => ({ ...i, rank, feed }))
    .filter((i) => !SOFT_URL.test(i.url) && !SOFT_HEADLINE.test(i.headline))
    .filter((i) => !i.published || now - Date.parse(i.published) < maxAge);
}

const results = await Promise.allSettled(FEEDS.map((feed, i) => read(feed, i)));
const pool = [];
results.forEach((result, i) => {
  if (result.status === "rejected") console.warn(`Skipped ${FEEDS[i][1]} ${FEEDS[i][0]}: ${result.reason?.message ?? result.reason}`);
  else pool.push(...result.value);
});
for (const item of pool) {
  item.titleWords = words(item.headline);
  item.allWords = words(`${item.headline} ${item.summary}`);
}

// Score: lead stories score highest, and each other outlet carrying the story adds to it.
for (const item of pool) {
  const outlets = new Set(pool.filter((other) => other.feed !== item.feed && sameStory(item, other)).map((other) => other.source));
  outlets.delete(item.source);
  item.coverage = outlets.size + 1;
  item.score = 10 / (item.rank + 2) + 2.5 * outlets.size + (item.image ? 0.3 : 0);
}

// Fill each topic's slots with its best stories, never the same story twice.
const picked = [];
const ranked = [...pool].sort((a, b) => b.score - a.score);
for (const [topic, slots] of Object.entries(SLOTS)) {
  for (const item of ranked) {
    if (picked.filter((p) => p.topic === topic).length === slots) break;
    if (item.topic !== topic || picked.some((p) => p.url === item.url || p.headline.toLowerCase() === item.headline.toLowerCase() || sameStory(p, item))) continue;
    picked.push(item);
  }
}

if (picked.length < 5) {
  console.error(`Only ${picked.length} stories fetched; keeping the previous news.`);
  process.exit(1);
}
const items = picked
  .sort((a, b) => b.score - a.score)
  .map(({ topic, source, headline, summary, url, image, published, coverage }) => ({ topic, source, headline, summary, url, image, published, coverage }));
const out = process.argv[2] ?? "public/news.json";
await writeFile(out, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 1));
console.log(`Wrote ${items.length} stories across ${new Set(items.map((i) => i.topic)).size} topics to ${out}`);
