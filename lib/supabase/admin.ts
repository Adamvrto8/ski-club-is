import { createClient } from "@supabase/supabase-js";

/**
 * Klient so `service_role` kľúčom — OBCHÁDZA Row Level Security.
 *
 * Používa sa výlučne pre naplánované úlohy, ktoré bežia bez prihláseného
 * používateľa (upozornenia na platby po splatnosti). Nikdy sa nesmie dostať
 * do prehliadača — žiadna premenná v tomto projekte nemá prefix `NEXT_PUBLIC_`,
 * takže Next nezabalí do klientskeho balíka ani jednu z nich.
 *
 * Vracia `null`, ak kľúč nie je nastavený — volajúci to musí ošetriť.
 */
export function createAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
