"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MONTH_NAMES } from "@/lib/domain";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { sendPushSafely } from "@/lib/push";
import { requireAdmin, type ConfirmationInput, type MonthlyAmount } from "@/lib/data";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function money(value: string): number | null {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null;
}

/**
 * Vytvorí potvrdenia pre jedno alebo viac detí. Suma sa zadáva ručne
 * (spec: „Sumu chcem mať možnosť zadať manuálne“).
 *
 * Pri mesačnom režime appka podľa reálnej predlohy klubu tlačí rozpis súm
 * po jednotlivých mesiacoch (Január–December), nie len jednu celkovú sumu.
 */
export async function createConfirmations(formData: FormData) {
  const { repo } = await requireAdmin("/potvrdenia");

  const childIds = formData.getAll("child_ids").map(String).filter(Boolean);
  const expenseType = text(formData, "expense_type");
  const period = text(formData, "period");
  const requestedBy = text(formData, "requested_by");
  const mode = text(formData, "mode") === "monthly" ? "monthly" : "one_time";

  let amount: number | null;
  let monthlyBreakdown: MonthlyAmount[] | null = null;

  if (mode === "monthly") {
    monthlyBreakdown = MONTH_NAMES.map((month) => ({
      month,
      amount: money(text(formData, `month_${month}`)) ?? 0,
    })).filter((row) => row.amount > 0);
    amount = Math.round(monthlyBreakdown.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
    if (!monthlyBreakdown.length) {
      redirect("/potvrdenia?error=" + encodeURIComponent("Vyplňte aspoň jeden mesiac so sumou."));
    }
  } else {
    amount = money(text(formData, "amount"));
  }

  if (!childIds.length) redirect("/potvrdenia?error=" + encodeURIComponent("Vyberte aspoň jedno dieťa."));
  if (amount === null) redirect("/potvrdenia?error=" + encodeURIComponent("Zadajte platnú sumu."));
  if (!expenseType || !period) redirect("/potvrdenia?error=" + encodeURIComponent("Vyplňte druh výdavku aj obdobie."));
  if (!requestedBy) redirect("/potvrdenia?error=" + encodeURIComponent("Vyplňte, na žiadosť ktorého zákonného zástupcu sa doklad vystavuje."));

  let created = 0;
  try {
    const season = await repo.currentSeason();
    const inputs: ConfirmationInput[] = childIds.map((childId) => ({
      child_id: childId,
      season_id: season.id,
      mode,
      period,
      expense_type: expenseType,
      requested_by: requestedBy,
      monthly_breakdown: monthlyBreakdown,
      amount: amount as number,
    }));
    created = await repo.createConfirmations(inputs);
    if (created > 1) {
      await sendPushSafely(repo, {
        title: "Potvrdenia sú pripravené",
        body: `Vygenerovaných ${created} potvrdení o športovej činnosti za obdobie ${period}.`,
        url: "/potvrdenia",
        tag: "potvrdenia",
      });
    }
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/potvrdenia?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/potvrdenia");
  redirect("/potvrdenia?success=" + encodeURIComponent(`Vytvorených potvrdení: ${created}. Otvor ich a vytlač do PDF.`));
}

export async function deleteConfirmation(formData: FormData) {
  const { repo } = await requireAdmin("/potvrdenia");
  const id = String(formData.get("id") ?? "");

  try {
    await repo.deleteConfirmation(id);
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/potvrdenia?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/potvrdenia");
  redirect("/potvrdenia?success=" + encodeURIComponent("Potvrdenie bolo vymazané."));
}
