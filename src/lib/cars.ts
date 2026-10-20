import { useEffect } from "react";
import { setStored, useStored } from "./store";
import { dateKey } from "./utils";

// Photos from Wikimedia Commons, used under their licences (credit shown on the hero card).
const base = import.meta.env.BASE_URL;

export type Car = { src: string; car: string; author: string; license: string; source: string; position: string };

// Bundled with the site: the lock screen uses these, and the hero falls back to them offline.
export const cars: Car[] = [
  { src: "cars/mclaren-mp4-4.jpg", car: "McLaren MP4/4", author: "Nic Redhead", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:McLaren_MP4-4_at_Goodwood_2014_002.jpg", position: "center 55%" },
  { src: "cars/red-bull-rb19-sparks.jpg", car: "Red Bull RB19", author: "Lukas Raich", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:FIA_F1_Austria_2023_Nr._1_(3).jpg", position: "center 50%" },
  { src: "cars/red-bull-rb19-race.jpg", car: "Red Bull RB19 leading at the Red Bull Ring", author: "Lukas Raich", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:FIA_F1_Austria_2023_Race_(1).jpg", position: "center 60%" },
  { src: "cars/mercedes-w196.jpg", car: "Mercedes-Benz W196", author: "Iain A Wanless", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:Mercedes-Benz_W196_Stirling_Moss_at_Goodwood_2014_001.jpg", position: "center 55%" },
  { src: "cars/mercedes-300slr-722.jpg", car: "Mercedes-Benz 300 SLR “722”", author: "Edvvc from London, UK", license: "CC BY 2.0", source: "https://commons.wikimedia.org/wiki/File:1955_Mercedes-Benz_300_SLR_%27722%27_(19101281424).jpg", position: "center 75%" },
  { src: "cars/ferrari-330-p4.jpg", car: "Ferrari 330 P4", author: "Alexander Migl", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:Ferrari_(_REC_)_330P4_(1967)_Solitude_Revival_2022_1X7A0418.jpg", position: "center 55%" },
  { src: "cars/ferrari-f40-lm.jpg", car: "Ferrari F40 LM", author: "MrWalkr", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:1990_Ferrari_F40_LM_HCC25.jpg", position: "center 55%" },
  { src: "cars/lamborghini-miura.jpg", car: "Lamborghini Miura S", author: "MrWalkr", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:1968_Lamborghini_Miura_S_P400_FOS23.jpg", position: "center 55%" },
  { src: "cars/lamborghini-countach.jpg", car: "Lamborghini Countach LP5000 QV", author: "MrWalkr", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:1987_Lamborghini_Countach_LP5000_QV_FOS23.jpg", position: "center 55%" },
  { src: "cars/alfa-romeo-tipo-33.jpg", car: "Alfa Romeo Tipo 33/3", author: "Nic Redhead", license: "CC BY-SA 2.0", source: "https://commons.wikimedia.org/wiki/File:Alfa_Romeo_Tipo_33-3_at_Goodwood_2014_001.jpg", position: "center 60%" },
  { src: "cars/detomaso-pantera.jpg", car: "De Tomaso Pantera Group 4", author: "François de Dijon", license: "CC BY-SA 3.0", source: "https://commons.wikimedia.org/wiki/File:De_Tomaso_Pantera_Circuit_de_Prenois_01.JPG", position: "center 60%" },
  { src: "cars/ford-gt40.jpg", car: "Ford GT40", author: "Éric Manesse", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:IMG_6449-Ford_GT40_Mk1-Le_Mans_Classic_2018.jpg", position: "center 50%" },
  { src: "cars/le-mans-24h.jpg", car: "24 Hours of Le Mans", author: "350z33", license: "CC BY-SA 4.0", source: "https://commons.wikimedia.org/wiki/File:2023_24HoursofLeMans_start.jpg", position: "center 55%" },
].map((car) => ({ ...car, src: `${base}${car.src}` }));

// Senna's McLaren always leads the hero rotation; the rest is a fresh pick from Commons each day.
export const senna = cars[0];

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
// Classic, racing and supercar meetings with large galleries (about 2,300 photos in all).
const CATEGORIES = [
  "Automobiles at the Goodwood Festival of Speed 2023",
  "Automobiles at the Goodwood Festival of Speed 2014",
  "Goodwood Revival 2023",
  "Goodwood Revival 2022",
  "Solitude Revival 2022",
  "Solitude Revival 2019",
  "Le Mans Classic 2018",
  "Quality images of racing automobiles",
];
const DAILY_COUNT = 12;
// Close-ups, crowds and paperwork make poor hero shots.
const SKIP = /logo|badge|emblem|interior|cockpit|engine|motor\b|wheel|detail|steering|dashboard|tribüne|grandstand|crowd|spectator|poster|map|ticket|paddock|parc assistance|monument|sign\b|plaque|aircraft|plane|spitfire|hurricane|motorcycle|bike|costume|people|portrait|driver\b|pilot|little big/i;

type DailyCars = { day: string; cars: Car[] };
export const useDailyCarSet = () => useStored<DailyCars>("cars.daily", { day: "", cars: [] });

// Same seed on every device, so the whole day shows the same set everywhere.
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
function shuffle<T>(list: T[], random: () => number) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function commons<T>(params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams({ format: "json", formatversion: "2", origin: "*", ...params });
  const response = await fetch(`${COMMONS_API}?${query}`);
  if (!response.ok) throw new Error(`Commons ${response.status}`);
  return response.json() as Promise<T>;
}

const stripHtml = (html = "") => new DOMParser().parseFromString(html, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
// "1990 Ferrari F40 LM HCC25.jpg" → "1990 Ferrari F40 LM"
function carName(title: string) {
  return title
    .replace(/^File:/, "")
    .replace(/\.(jpe?g|png|webp|tiff?)$/i, "")
    .replace(/_/g, " ")
    .replace(/^(?:DSC|IMG|DSCF|DJI|P)[\w]*\d{3,}[-_ ]*/i, "")
    .replace(/\s*\((?:\d{6,}|\d{4}-\d{2}-\d{2}[^)]*)\)/g, "")
    .replace(/[\s-]+(?:\d{8}-)?(?:[A-Z]{2,4}\d{2}|[A-Z0-9]{2,5}[_ ]?\d{3,}|IMG[_ ]?\d+|DSC\w*|P\d{6,}|\d{3,})(?:-\S+)?$/g, "")
    .replace(/\s+(?:by|from)\s+\S.*$/i, "")
    .replace(/\s*-*\s*(?:at\s+)?(?:the\s+)?(?:Goodwood(?: Festival of Speed| Revival)?|Solitude Revival|Le Mans Classic)(?:\s+\d{4})?\b.*$/i, "")
    .replace(/\s+\d$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

type ImageInfo = { url: string; thumburl?: string; width: number; height: number; descriptionurl: string; extmetadata?: Record<string, { value: string } | undefined> };

async function pickDailyCars(day: string): Promise<Car[]> {
  const random = seeded(day);
  const categories = shuffle(CATEGORIES, random).slice(0, 3);
  const titles: string[] = [];
  for (const category of categories) {
    const data = await commons<{ query?: { categorymembers: { title: string }[] } }>({
      action: "query", list: "categorymembers", cmtitle: `Category:${category}`, cmtype: "file", cmlimit: "500",
    });
    titles.push(...(data.query?.categorymembers ?? []).map((m) => m.title).filter((t) => /\.(jpe?g|png|webp)$/i.test(t) && !SKIP.test(t)));
  }
  const candidates = shuffle([...new Set(titles)], random).slice(0, 40);
  if (!candidates.length) return [];
  const info = await commons<{ query?: { pages: { title: string; imageinfo?: ImageInfo[] }[] } }>({
    action: "query", prop: "imageinfo", titles: candidates.join("|"),
    iiprop: "url|size|extmetadata", iiurlwidth: "1920", iiextmetadatafilter: "Artist|LicenseShortName|ObjectName",
  });
  const byTitle = new Map((info.query?.pages ?? []).map((p) => [p.title, p.imageinfo?.[0]]));
  const picked: Car[] = [];
  for (const title of candidates) {
    const image = byTitle.get(title);
    // Wide, large photos only: the hero is a letterbox.
    if (!image || image.width < 1600 || image.width / image.height < 1.3) continue;
    const meta = image.extmetadata ?? {};
    picked.push({
      src: image.thumburl ?? image.url,
      car: carName(stripHtml(meta.ObjectName?.value) || title) || "Race car",
      author: stripHtml(meta.Artist?.value) || "Wikimedia Commons",
      license: stripHtml(meta.LicenseShortName?.value) || "see source",
      source: image.descriptionurl,
      position: "center 55%",
    });
    if (picked.length === DAILY_COUNT) break;
  }
  return picked;
}

let loading = "";

// The hero's photos for today: Senna first, then today's Commons pick (bundled photos if that fails).
export function useHeroCars(): Car[] {
  const [daily] = useDailyCarSet();
  const today = dateKey();
  useEffect(() => {
    if (daily.day === today || loading === today) return;
    loading = today;
    pickDailyCars(today)
      .then((list) => {
        if (list.length >= 4) setStored<DailyCars>("cars.daily", { day: today, cars: list });
      })
      .catch(() => undefined)
      .finally(() => {
        loading = "";
      });
  }, [daily.day, today]);
  const rest = daily.cars.length ? daily.cars : cars.slice(1);
  return [senna, ...rest];
}
