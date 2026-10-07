"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDemoMode } from "@/lib/data";
import { MIN_PASSWORD } from "@/lib/password";
import { createClient } from "@/lib/supabase/server";

/** Adresa tohto nasadenia, odvodená z požiadavky — funguje lokálne aj na Verceli. */
async function siteOrigin() {
  const head = await headers();
  const host = head.get("host") ?? "localhost:3000";
  const proto = head.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    /*
     * Pri zlom hesle dôvod zámerne nešpecifikujeme, aby sa cez formulár nedalo
     * zisťovať, ktoré e-maily v klube existujú.
     *
     * Chybu spojenia však treba povedať nahlas. Ak je zle nastavená adresa
     * Supabase, zlyhá každé prihlásenie — a keby aj to hlásilo „nesprávne heslo“,
     * hľadá sa chyba hodiny v účtoch namiesto v konfigurácii. Presne to sa už raz
     * stalo. Podrobnosť ide len do logu servera, používateľ vidí, že ide o server.
     */
    const configProblem = error.status === undefined || error.status === 0 || error.status >= 500;
    if (configProblem) {
      console.error("[prihlasenie] Supabase je nedostupný:", error.message);
      redirect(
        "/prihlasenie?error=" +
          encodeURIComponent(
            "Server sa nevie spojiť s databázou. Skontroluj nastavenie SUPABASE_URL a SUPABASE_PUBLISHABLE_KEY.",
          ),
      );
    }
    redirect("/prihlasenie?error=" + encodeURIComponent("Nesprávny e-mail alebo heslo."));
  }

  redirect("/prehlad");
}

/**
 * Prihlásenie cez Google. Nový účet sa tým nezaloží — registrácia je v Supabase
 * vypnutá, takže prejde len Google účet s e-mailom, ktorý už v klube účet má
 * (Supabase ich spojí podľa overeného e-mailu).
 */
export async function signInWithGoogle() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${await siteOrigin()}/prihlasenie/google` },
  });

  if (error || !data.url) {
    console.error("[prihlasenie cez Google]", error?.message);
    redirect("/prihlasenie?error=" + encodeURIComponent("Prihlásenie cez Google teraz nefunguje. Použi e-mail a heslo."));
  }
  redirect(data.url);
}

export async function signOut() {
  if (!isDemoMode()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/prihlasenie");
}

/**
 * Pošle e-mail s odkazom na obnovu hesla.
 *
 * Odpoveď je vždy rovnaká, aj keď e-mail v klube neexistuje. Inak by sa cez
 * tento formulár dalo zisťovať, ktoré adresy majú v systéme účet.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const done =
    "/prihlasenie/zabudnute-heslo?success=" +
    encodeURIComponent("Ak taký účet existuje, poslali sme naň odkaz na zmenu hesla. Platí jednu hodinu.");

  if (!email) {
    redirect(
      "/prihlasenie/zabudnute-heslo?error=" + encodeURIComponent("Zadaj e-mail, ktorým sa prihlasuješ."),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await siteOrigin()}/prihlasenie/obnova`,
  });

  // Aj tu platí: chybu spojenia povieme nahlas, existenciu účtu neprezradíme.
  if (error && (error.status === undefined || error.status === 0 || error.status >= 500)) {
    console.error("[obnova hesla] Supabase je nedostupný:", error.message);
    redirect(
      "/prihlasenie/zabudnute-heslo?error=" +
        encodeURIComponent("Server sa nevie spojiť s databázou. Skús to o chvíľu znova."),
    );
  }

  redirect(done);
}

/**
 * Nastaví nové heslo. Beží až vtedy, keď odkaz z e-mailu vytvoril reláciu —
 * bez prihlásenia sa sem nedá dostať.
 */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const repeat = String(formData.get("password_repeat") ?? "");
  const fail = (message: string) =>
    redirect("/prihlasenie/nove-heslo?error=" + encodeURIComponent(message));

  if (password.length < MIN_PASSWORD) fail(`Heslo musí mať aspoň ${MIN_PASSWORD} znakov.`);
  if (password !== repeat) fail("Heslá sa nezhodujú.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(
      "/prihlasenie?error=" +
        encodeURIComponent("Odkaz na zmenu hesla vypršal. Vyžiadaj si nový."),
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) fail(error.message);

  redirect("/prehlad");
}
