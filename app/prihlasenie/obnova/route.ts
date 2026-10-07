import { type EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Cieľ odkazu z e-mailu o obnove hesla.
 *
 * Supabase vie odkaz poslať v dvoch podobách a my zvládame obe:
 *  - `token_hash` + `type` — overí sa cez verifyOtp a funguje aj vtedy, keď si
 *    používateľ otvorí e-mail na inom zariadení, než odkiaľ o obnovu žiadal;
 *  - `code` — staršia podoba, ktorá vyžaduje ten istý prehliadač.
 *
 * Reláciu tu vytvárame v route handleri zámerne: iba ten smie zapisovať cookies.
 * Zo server component by sa prihlásenie ticho stratilo.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");

  /*
   * Adresu si skladáme z hlavičiek od proxy. Za Vercelom je `request.url`
   * vnútorná adresa, takže odkaz by viedol niekam, kam sa používateľ nedostane.
   */
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const expired = new URL("/prihlasenie", origin);
  expired.searchParams.set("error", "Odkaz na zmenu hesla je neplatný alebo vypršal. Vyžiadaj si nový.");

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) return Response.redirect(expired, 303);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return Response.redirect(expired, 303);
  } else {
    return Response.redirect(expired, 303);
  }

  return Response.redirect(new URL("/prihlasenie/nove-heslo", origin), 303);
}
