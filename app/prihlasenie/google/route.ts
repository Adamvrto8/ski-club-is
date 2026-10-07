import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Sem Google (cez Supabase) vráti používateľa po prihlásení.
 *
 * Reláciu vytvárame v route handleri zámerne: iba ten smie zapisovať cookies.
 * Adresu skladáme z hlavičiek od proxy — za Vercelom je `request.url` vnútorná.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const failed = (message: string) => {
    const target = new URL("/prihlasenie", origin);
    target.searchParams.set("error", message);
    return Response.redirect(target, 303);
  };

  /*
   * Supabase vracia chybu v parametroch. Najčastejšia: Google účet, ktorého
   * e-mail v klube účet nemá — registrácia je vypnutá, tak ho odmietne.
   */
  const reason = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  if (reason) {
    console.error("[prihlasenie cez Google] odmietnuté:", reason);
    return failed(
      /signup/i.test(reason)
        ? "Tento Google účet nemá prístup do appky. Prihlás sa Google účtom s e-mailom, ktorý ti klub zaregistroval."
        : // Dôvod od Supabase je technický, ale bez neho sa chyba v nastavení nedá nájsť.
          `Prihlásenie cez Google sa nepodarilo (${reason.slice(0, 160)}). Skús to znova alebo použi e-mail a heslo.`,
    );
  }

  const code = url.searchParams.get("code");
  if (!code) return failed("Prihlásenie cez Google sa nepodarilo. Skús to znova.");

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[prihlasenie cez Google] výmena kódu:", error.message);
    return failed("Prihlásenie cez Google vypršalo. Skús to znova v tom istom prehliadači.");
  }

  return Response.redirect(new URL("/prehlad", origin), 303);
}
