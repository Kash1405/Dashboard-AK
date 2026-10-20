// Builds public/news.json for the dashboard's Latest News carousel.
// Runs in the GitHub Pages workflow (every couple of hours and on each deploy), where RSS feeds
// can be read without the browser's cross-origin limits, so the site needs no news API or key.
// Usage: node scripts/fetch-news.mjs [output path]

import { writeFile } from "node:fs/promises";

// [topic, source, feed URL, how many stories]. About 20 in all, spread across topics.
const FEEDS = [
  ["World", "Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", 1],
  ["World", "BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml", 1],
  ["Asia", "BBC News", "https://feeds.bbci.co.uk/news/world/asia/rss.xml", 1],
  ["Politics", "NPR", "https://feeds.npr.org/1014/rss.xml", 1],
  ["Politics", "The Guardian", "https://www.theguardian.com/politics/rss", 1],
  ["Business", "BBC News", "https://feeds.bbci.co.uk/news/business/rss.xml", 2],
  ["Technology", "The Guardian", "https://www.theguardian.com/technology/rss", 1],
  ["Technology", "BBC News", "https://feeds.bbci.co.uk/news/technology/rss.xml", 1],
  ["Science", "The Guardian", "https://www.theguardian.com/science/rss", 1],
  ["Science", "NPR", "https://feeds.npr.org/1007/rss.xml", 1],
  ["Environment", "The Guardian", "https://www.theguardian.com/environment/rss", 2],
  ["Health", "NPR", "https://feeds.npr.org/1128/rss.xml", 1],
  ["Health", "BBC News", "https://feeds.bbci.co.uk/news/health/rss.xml", 1],
  ["Sport", "BBC Sport", "https://feeds.bbci.co.uk/sport/rss.xml", 2],
  ["Space", "NASA", "https://www.nasa.gov/news-release/feed/", 1],
  ["Formula 1", "BBC Sport", "https://feeds.bbci.co.uk/sport/formula1/rss.xml", 1],
  ["Culture", "BBC News", "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", 1],
];

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

async function read([topic, source, url, count]) {
  const response = await fetch(url, { headers: { "User-Agent": "KASH-dashboard news builder (+https://github.com/Kash1405/Dashboard-AK)" }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${response.status}`);
  const xml = await response.text();
  const items = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(([item]) => {
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
  });
  return items
    .filter((i) => i.headline && /^https?:\/\//.test(i.url) && !/\/(?:videos?|live|av|audio|sounds|programmes)\//.test(i.url))
    .sort((a, b) => (b.published || "").localeCompare(a.published || ""))
    .slice(0, count + 3) // spares in case of duplicates
    .map((i, rank) => ({ ...i, rank, want: count }));
}

const results = await Promise.allSettled(FEEDS.map(read));
const seen = new Set();
const items = [];
results.forEach((result, i) => {
  if (result.status === "rejected") {
    console.warn(`Skipped ${FEEDS[i][1]} ${FEEDS[i][0]}: ${result.reason?.message ?? result.reason}`);
    return;
  }
  let taken = 0;
  for (const { rank, want, ...item } of result.value) {
    const key = item.headline.toLowerCase();
    if (taken === want || seen.has(item.url) || seen.has(key)) continue;
    seen.add(item.url);
    seen.add(key);
    items.push(item);
    taken++;
  }
});

if (items.length < 5) {
  console.error(`Only ${items.length} stories fetched; keeping the previous news.`);
  process.exit(1);
}
const out = process.argv[2] ?? "public/news.json";
await writeFile(out, JSON.stringify({ generatedAt: new Date().toISOString(), items }, null, 1));
console.log(`Wrote ${items.length} stories across ${new Set(items.map((i) => i.topic)).size} topics to ${out}`);
