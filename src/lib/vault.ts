import { hasStored, setStored, useStored } from "./store";
import { VAULT } from "./vault.data";

export type GoalStatus = "Not Started" | "In Progress" | "Done" | "On Hold";
export type GoalRow = { id: string; type: string; skill: string; description: string; comments: string; status: GoalStatus };
export type ScheduleRow = { id: string; start: string; end: string; activity: string; description: string };
export type MealRow = { id: string; meal: string; details: string };
export type MedRow = { id: string; name: string; dose: string; role: string; sideEffects: string; time: string };
export type TrackerItem = { id: string; label: string };
export type TrackerCategory = { id: string; name: string; items: TrackerItem[] };
export type TrackerLog = Record<string, Record<string, { done: boolean; note: string }>>;

type VaultData = { goals: GoalRow[]; schedule: ScheduleRow[]; meals: MealRow[]; meds: MedRow[]; tracker: TrackerCategory[] };

export const useGoalTable = () => useStored<GoalRow[]>("goals.table", []);
export const useSchedule = () => useStored<ScheduleRow[]>("advisor.schedule", []);
export const useMeals = () => useStored<MealRow[]>("advisor.meals", []);
export const useMealLog = () => useStored<Record<string, Record<string, boolean>>>("advisor.mealLog", {});
export const useMeds = () => useStored<MedRow[]>("advisor.meds", []);
export const useMedLog = () => useStored<Record<string, Record<string, string>>>("wellness.medLog", {});
export const useTracker = () => useStored<TrackerCategory[]>("advisor.tracker", []);
export const useTrackerLog = () => useStored<TrackerLog>("advisor.trackerLog", {});

const b64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// The personal seed data ships encrypted; the password is the only key. A wrong password fails decryption.
export async function openVault(password: string): Promise<VaultData> {
  if (!window.crypto?.subtle) throw new Error("This page must be opened over https (or localhost) to sign in.");
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64(VAULT.salt), iterations: VAULT.iterations, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(VAULT.iv) }, key, b64(VAULT.data));
    return JSON.parse(new TextDecoder().decode(plain)) as VaultData;
  } catch {
    throw new Error("Wrong password.");
  }
}

// First sign-in on a device: copy the seed data into storage. Never overwrites edits.
export function seedFromVault(data: VaultData) {
  const seeds: [string, unknown][] = [
    ["goals.table", data.goals],
    ["advisor.schedule", data.schedule],
    ["advisor.meals", data.meals],
    ["advisor.meds", data.meds],
    ["advisor.tracker", data.tracker],
  ];
  for (const [key, value] of seeds) if (!hasStored(key)) setStored(key, value);
}
