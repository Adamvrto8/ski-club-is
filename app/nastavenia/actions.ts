"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { requireAdmin } from "@/lib/data";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function saveClubSettings(formData: FormData) {
  const { repo } = await requireAdmin("/nastavenia");
  const officialName = text(formData, "official_name");
  if (!officialName) redirect("/nastavenia?error=" + encodeURIComponent("Oficiálny názov klubu je povinný."));

  try {
    await repo.saveClubSettings({
      official_name: officialName,
      address: text(formData, "address"),
      ico: text(formData, "ico"),
      // Medzery necháme — IBAN sa v tomto tvare tlačí na potvrdeniach aj kopíruje rodičom.
      iban: text(formData, "iban").toUpperCase().replace(/\s+/g, " ").trim(),
      statutory_representative: text(formData, "statutory_representative"),
      phone: text(formData, "phone"),
      account_holder_name: text(formData, "account_holder_name"),
      registry_note: text(formData, "registry_note"),
    });
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/nastavenia?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/nastavenia");
  revalidatePath("/potvrdenia");
  redirect("/nastavenia?success=" + encodeURIComponent("Údaje klubu boli uložené."));
}
