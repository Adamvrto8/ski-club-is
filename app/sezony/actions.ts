"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/data";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveSeason(formData: FormData) {
  const { repo } = await requireAdmin("/sezony");
  const name = text(formData, "name");
  const startsOn = text(formData, "starts_on");
  const endsOn = text(formData, "ends_on");

  if (!name || !startsOn || !endsOn) {
    redirect("/sezony?error=" + encodeURIComponent("Vyplňte názov aj obdobie sezóny."));
  }
  if (endsOn < startsOn) {
    redirect("/sezony?error=" + encodeURIComponent("Koniec sezóny nemôže byť skôr než jej začiatok."));
  }

  try {
    await repo.saveSeason({ id: text(formData, "id") || undefined, name, starts_on: startsOn, ends_on: endsOn });
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/sezony?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/sezony");
  redirect("/sezony?success=" + encodeURIComponent(`Sezóna „${name}“ bola uložená.`));
}

/**
 * Prepnutie aktuálnej sezóny. Členovia a inventár zostávajú, nové platby,
 * výpožičky, dochádzka a akcie sa už viažu na novú sezónu.
 */
export async function switchSeason(formData: FormData) {
  const { repo } = await requireAdmin("/sezony");
  const id = text(formData, "id");
  if (!id) redirect("/sezony?error=" + encodeURIComponent("Vyberte sezónu."));

  let name = "";
  try {
    const seasons = await repo.listSeasons();
    name = seasons.find((season) => season.id === id)?.name ?? "";
    await repo.setCurrentSeason(id);
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/sezony?error=" + encodeURIComponent(errorMessage(error)));
  }

  // Sezóna ovplyvňuje takmer každú stránku.
  for (const path of ["/sezony", "/prehlad", "/platby", "/potvrdenia", "/dochadzka", "/pozicovna", "/akcie", "/banka", "/dve-percenta"]) {
    revalidatePath(path);
  }
  redirect("/sezony?success=" + encodeURIComponent(`Aktuálnou sezónou je teraz ${name}.`));
}
