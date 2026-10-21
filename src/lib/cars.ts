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

// Senna's McLaren always leads the hero rotation; the rest is a fresh daily pick from the curated list below.
export const senna = cars[0];

const COMMONS_API = "https://commons.wikimedia.org/w/api.php";

// Hand-picked Wikimedia Commons photos (mostly Commons "Quality images"): wide, sharp, and with the
// whole car in frame, so they read well in the letterbox hero. [kind, caption, Commons file name].
type Kind = "classic" | "supercar" | "hypercar" | "f1" | "gt" | "prototype";
const CURATED: [Kind, string, string][] = [
  ["classic", "Bugatti Type 51", "Bugatti Type 51 Solitude Revival 2022 1X7A0225.jpg"],
  ["classic", "Cooper Monaco King Cobra", "1965 Cooper Monaco King Cobra Donington Park 2023 01.jpg"],
  ["classic", "Ford Capri 3100RS Group 2", "Ford Capri 3100RS Group 2 Dieter Glemser (1974) Solitude Revival 2022 1X7A0297.jpg"],
  ["classic", "Ferrari Dino 308 GT4", "Ferrari Dino 308 GT4 (1978) Solitude Revival 2022 1X7A0131.jpg"],
  ["classic", "Bugatti Type 57 Atalante", "Bugatti Type 57 Atalante 1937.jpg"],
  ["classic", "Lamborghini Miura P400 SV", "1971 Lamborghini Miura P400 SV.jpg"],
  ["classic", "Lamborghini Miura P400 S", "Lamborghini Miura P400 S Classic-Days 2022 DSC 0086.jpg"],
  ["classic", "Lamborghini Countach LP400 Periscopio", "Lamborghini Countach LP400 Periscopio (1976) Auto Zuerich 2021 IMG 0460.jpg"],
  ["classic", "Jaguar D-Type", "Jaguar D-type Paris 2010.jpg"],
  ["classic", "Jaguar E-Type Series 1", "Jaguar E-Type Series 1 3.8 Litre 1961.jpg"],
  ["classic", "Mercedes-Benz 300 SL Gullwing", "Mercedes-Benz W198 300 SL Gullwing Genf 2019 1Y7A4987.jpg"],
  ["classic", "AC Cobra", "AC Cobra Fia Roadster (1964) Solitude Revival 2022 1X7A0085.jpg"],
  ["classic", "Shelby Cobra Daytona Coupe", "Shelby Cobra Daytona Coupe (1965) Solitude Revival 2022 1X7A0004.jpg"],
  ["classic", "Lancia Stratos HF", "Lancia Stratos HF Classic-Gala 2022 1X7A0375.jpg"],
  ["supercar", "Ferrari F40", "1990 Ferrari F40 front.jpg"],
  ["supercar", "Ferrari F50", "1997 Ferrari F50 front.jpg"],
  ["supercar", "Enzo Ferrari", "2004 Enzo Ferrari.jpg"],
  ["supercar", "McLaren F1", "1996 McLaren F1 Chassis No 63 6.1 Front.jpg"],
  ["supercar", "Ferrari Daytona SP3", "2024 Ferrari Daytona SP3 rear.jpg"],
  ["supercar", "Lamborghini Countach LPI 800-4", "Lamborghini Countach LPI 800-4 IMG 8009.jpg"],
  ["supercar", "Lamborghini Aventador SVJ Roadster", "Lamborghini Aventador SVJ Roadster IMG 9580.jpg"],
  ["hypercar", "Ferrari LaFerrari", "Ferrari LaFerrari GIMS 2024 1X7A2272.jpg"],
  ["hypercar", "McLaren P1", "2014 McLaren P1 3.8.jpg"],
  ["hypercar", "McLaren P1 GTR", "McLaren P1 GTR of Mike Whiddett at the 2026 Adelaide Motorsport Festival (DSCF2539).jpg"],
  ["hypercar", "McLaren Senna GTR", "McLaren Senna GTR, Geneva International Motor Show 2018, Le Grand-Saconnex (1X7A0425).jpg"],
  ["hypercar", "Porsche 918 Spyder", "2015 Porsche 918 Spyder 4.6.jpg"],
  ["hypercar", "Bugatti Chiron", "Bugatti Chiron 110 Ans, GIMS 2019, Le Grand-Saconnex (GIMS9979).jpg"],
  ["hypercar", "Koenigsegg Jesko", "Koenigsegg Jesko, GIMS 2019, Le Grand-Saconnex (GIMS1047).jpg"],
  ["hypercar", "Aston Martin Valkyrie", "Aston Martin Valkyrie GIMS 2024 1X7A2266.jpg"],
  ["hypercar", "Mercedes-AMG One", "Mercedes-AMG Project One, Frankfurt (1Y7A3473).jpg"],
  ["hypercar", "Rimac Nevera R", "Rimac Nevera R Auto Zuerich 2024 DSC 6342.jpg"],
  ["f1", "Cooper T53", "1961 Cooper T53 Donington Park 2023 01.jpg"],
  ["f1", "2010 Malaysian Grand Prix start", "2010 Malaysian GP opening lap.jpg"],
  ["f1", "2015 Malaysian Grand Prix start", "2015 Malaysian GP opening lap.jpg"],
  ["f1", "Ferrari SF-24, Dutch Grand Prix", "2024-08-25 Motorsport, Formel 1, Großer Preis der Niederlande 2024 STP 3912 by Stepro.jpg"],
  ["f1", "Mercedes W15, Dutch Grand Prix", "2024-08-24 Motorsport, Formel 1, Großer Preis der Niederlande 2024 STP 3369 by Stepro.jpg"],
  ["f1", "Ferrari SF-24, Dutch Grand Prix", "2024-08-24 Motorsport, Formel 1, Großer Preis der Niederlande 2024 STP 3412 by Stepro.jpg"],
  ["f1", "Red Bull RB20, Dutch Grand Prix", "2024-08-24 Motorsport, Formel 1, Großer Preis der Niederlande 2024 STP 3422 by Stepro.jpg"],
  ["f1", "Kick Sauber C44, Dutch Grand Prix", "2024-08-25 Motorsport, Formel 1, Großer Preis der Niederlande 2024 STP 3883 by Stepro.jpg"],
  ["f1", "Mercedes W15 throwing sparks, Zandvoort", "2024-08-25 Motorsport, Formel 1, Großer Preis der Niederlande 2024 STP 3829 by Stepro.jpg"],
  ["f1", "Ferrari SF-24, Zandvoort", "2024-08-25 Motorsport, Formel 1, Großer Preis der Niederlande 2024 STP 3895 by Stepro.jpg"],
  ["gt", "McLaren F1 GTR Longtail", "McLaren F1 GTR Longtail GIMS 2024 1X7A2265.jpg"],
  ["gt", "Ferrari 296 GT3, DTM Oschersleben", "2023-05-26 Motorsport, DTM, Oschersleben 1DX 4359 by Stepro.jpg"],
  ["gt", "Lamborghini Huracán GT3, DTM Oschersleben", "2023-05-28 Motorsport, DTM, Oschersleben 1DX 5148 by Stepro.jpg"],
  ["gt", "Ferrari 296 GT3, DTM Hockenheim", "2023-10-22 Motorsport, DTM, Finale Hockenheimring 2023 1DX 4333.jpg"],
  ["gt", "Ferrari 296 GT3", "Ferrari 296 GT3 of LM Corsa.jpg"],
  ["gt", "Lamborghini Gallardo Super Trofeo", "Lamborghini Super Trofeo 99 2010 amk.JPG"],
  ["gt", "Porsche 911 GT3 Cup, Anderstorp", "Johan Löfqvist Carrera GT Cup Anderstorp 2012.jpg"],
  ["gt", "GT World Challenge, Magny-Cours", "2022 GT World Challenge Europe Magny-Cours (52126832427).png"],
  ["gt", "Mercedes-AMG GT3", "2022 Mercedes-AMG GT3 DK Engineering.jpg"],
  ["gt", "Mercedes-AMG GT3, Rolex 24", "2018 Rolex 24 (40371258995).jpg"],
  ["prototype", "Le Mans prototype at Solitude Revival", "24 Hours of Le Mans race cars Solitude Revival 2022 1X7A0114.jpg"],
  ["prototype", "Lola T70 Mk3B", "1969 Lola T70 MK3B Donington Park 2023 01.jpg"],
  ["prototype", "Porsche 917/20 “Pink Pig”", "Porsche 917, 70 Years Porsche Sports Car, Berlin (1X7A3912).jpg"],
  ["prototype", "Porsche 917", "Porsche 917 Classic-Days 2022 IMG 6984.jpg"],
  ["prototype", "Ford GT40", "Ford GT40 (1966) Solitude Revival 2022 1X7A0005.jpg"],
  ["prototype", "Peugeot 908", "2011 Peugeot 908 Donington Park 2023 01.jpg"],
  ["prototype", "Porsche 919 Hybrid", "Porshe919hybrid 20141012.JPG"],
  ["prototype", "Porsche 962C Group C", "Paris - Bonhams 2014 - Brun Porsche 962C Group C Sports Prototype - 1964 - 001.jpg"],
  ["prototype", "Porsche 962", "Porsche 962 1X7A0035.jpg"],
  ["prototype", "Porsche 963, 6 Hours of Spa", "2023 6 Hours of Spa-Francorchamps Porsche Penske Motorsport Porsche 963 No.5 (DSC03039).jpg"],
  ["prototype", "Hertz Team Jota Porsche 963, Spa", "2024 6 Hours of Spa-Francorchamps Hertz Team Jota Porsche 963 No.12 (DSC05510).jpg"],
  ["prototype", "Porsche 963 at Le Mans", "Porsche 963 - Feipe Nasr, Mathieu Jaminet & Nick Tandy exits Dunlop Chicane at the 2023 Le Mans (53367108765).jpg"],
  ["prototype", "24 Hours of Le Mans 2024", "2024 24 Hours of Le Mans (54093434927).jpg"],
  ["prototype", "Porsche race car line-up", "Line-Up (54062686635).jpg"],
  ["prototype", "Cadillac V-LMDh, Daytona", "2023 Cadillac V-LMDh Daytona (cropped).jpg"],
  ["prototype", "Cadillac V-Series.R, 6 Hours of Spa", "2023 6 Hours of Spa-Francorchamps Cadillac Racing Cadillac V-Series.R No.3 (DSC07010).jpg"],
  ["prototype", "Whelen Cadillac V-Series.R", "Whelen Cadillac Racing - Cadillac V-Series.R -311 (53814572907).jpg"],
  ["prototype", "Porsche 963 at Sebring by night", "WEC Sebring 2023 -i---i- (53910560355).jpg"],
  ["prototype", "Porsche 919 Hybrid", "Porsche 919 Hybrid (2016) (55083142340).jpg"],
  ["prototype", "Audi R18 e-tron quattro", "Audi R18 e-tron quattro 2026-08.jpg"],
  ["prototype", "Toyota TS050 Hybrid", "Goodwood Festival of Speed 2019 (48242846566).jpg"],
];
const DAILY_COUNT = 12;

type DailyCars = { day: string; cars: Car[] };
export const useDailyCarSet = () => useStored<DailyCars>("cars.curated", { day: "", cars: [] });

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

type ImageInfo = { url: string; thumburl?: string; descriptionurl: string; extmetadata?: Record<string, { value: string } | undefined> };

// Today's set: a seeded shuffle, dealt round-robin across kinds so every day mixes classics,
// supercars, hypercars, F1, GT and prototypes.
async function pickDailyCars(day: string): Promise<Car[]> {
  const random = seeded(day);
  const byKind = new Map<Kind, [Kind, string, string][]>();
  for (const entry of shuffle(CURATED, random)) byKind.set(entry[0], [...(byKind.get(entry[0]) ?? []), entry]);
  const piles = shuffle([...byKind.values()], random);
  const chosen: [Kind, string, string][] = [];
  for (let round = 0; chosen.length < DAILY_COUNT && piles.some((pile) => pile.length > round); round++) {
    for (const pile of piles) if (pile[round] && chosen.length < DAILY_COUNT) chosen.push(pile[round]);
  }
  const info = await commons<{ query?: { normalized?: { from: string; to: string }[]; pages: { title: string; imageinfo?: ImageInfo[] }[] } }>({
    action: "query", prop: "imageinfo", titles: chosen.map(([, , file]) => `File:${file}`).join("|"),
    iiprop: "url|extmetadata", iiurlwidth: "1920", iiextmetadatafilter: "Artist|LicenseShortName",
  });
  const normalized = new Map((info.query?.normalized ?? []).map((n) => [n.from, n.to]));
  const byTitle = new Map((info.query?.pages ?? []).map((p) => [p.title, p.imageinfo?.[0]]));
  return chosen.flatMap(([, car, file]) => {
    const image = byTitle.get(normalized.get(`File:${file}`) ?? `File:${file}`);
    if (!image) return [];
    const meta = image.extmetadata ?? {};
    return [{
      src: image.thumburl ?? image.url,
      car,
      author: stripHtml(meta.Artist?.value) || "Wikimedia Commons",
      license: stripHtml(meta.LicenseShortName?.value) || "see source",
      source: image.descriptionurl,
      position: "center 55%",
    }];
  });
}

let loading = "";

// The hero's photos for today: Senna first, then today's curated pick (bundled photos if that fails).
export function useHeroCars(): Car[] {
  const [daily] = useDailyCarSet();
  const today = dateKey();
  useEffect(() => {
    if (daily.day === today || loading === today) return;
    loading = today;
    pickDailyCars(today)
      .then((list) => {
        if (list.length >= 4) setStored<DailyCars>("cars.curated", { day: today, cars: list });
      })
      .catch(() => undefined)
      .finally(() => {
        loading = "";
      });
  }, [daily.day, today]);
  const rest = daily.cars.length ? daily.cars : cars.slice(1);
  return [senna, ...rest];
}

// Earlier versions kept a random Commons pick under this key; it is no longer used.
try {
  window.localStorage.removeItem("apex2.cars.daily");
} catch {
  // Storage blocked: nothing to clean up.
}
