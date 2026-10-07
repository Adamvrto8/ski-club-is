import { redirect } from "next/navigation";
import { createClient } from "../supabase/server";
import { LocalRepo } from "./local";
import { SupabaseRepo } from "./supabase";
import type { Repo } from "./types";

export * from "./types";

/** Vývojový náhľad bez Supabase. V produkcii musí byť vypnutý. */
export function isDemoMode() {
  const demo = process.env.DEMO_MODE === "true";
  /*
   * Poistka proti nasadeniu s omylom zapnutým náhľadom. Náhľad zapisuje do súboru
   * data/local-store.json, ktorý na hostingu neprežije ani jednu požiadavku — dáta
   * klubu by ticho mizli. Radšej hlučná chyba pri štarte než tichá strata údajov.
   */
  if (demo && process.env.VERCEL) {
    throw new Error(
      "DEMO_MODE=true na hostingu. Vývojový náhľad ukladá dáta do súboru, " +
        "ktorý sa na Vercele zahadzuje. Nastav DEMO_MODE=false a nasaď znova.",
    );
  }
  return demo;
}

export type Session = {
  repo: Repo;
  role: "admin" | "coach";
  demo: boolean;
  /** Id prihláseného používateľa; vo vývojovom náhľade zástupná hodnota. */
  userId: string;
};

/**
 * Jediný vstupný bod pre stránky a server actions. V produkcii vyžaduje prihlásenie —
 * neprihlásený používateľ končí na prihlasovacej obrazovke.
 */
export async function getSession(): Promise<Session> {
  if (isDemoMode()) {
    return { repo: new LocalRepo(), role: "admin", demo: true, userId: "local-admin" };
  }

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/prihlasenie");

  const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = profile?.role === "admin" ? "admin" : "coach";
  return { repo: new SupabaseRepo(db, role === "admin", user.id), role, demo: false, userId: user.id };
}

/** Pre akcie, ktoré smie robiť iba admin. */
export async function requireAdmin(redirectTo: string): Promise<Session> {
  const session = await getSession();
  if (session.role !== "admin") {
    redirect(`${redirectTo}?error=${encodeURIComponent("Na túto akciu nemáte oprávnenie.")}`);
  }
  return session;
}
