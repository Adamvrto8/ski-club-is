"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { requireAdmin } from "@/lib/data";
import { readContactInput } from "@/lib/contact-form";

export async function saveContact(formData: FormData) {
  const { repo } = await requireAdmin("/kontakty");
  const childId = String(formData.get("child_id") ?? "").trim();
  if (!childId) redirect("/kontakty/novy?error=" + encodeURIComponent("Vyberte člena."));

  try {
    await repo.saveContact(childId, readContactInput(formData));
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/kontakty/novy?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/kontakty");
  revalidatePath("/clenovia");
  redirect("/kontakty?success=" + encodeURIComponent("Kontakt bol uložený."));
}
