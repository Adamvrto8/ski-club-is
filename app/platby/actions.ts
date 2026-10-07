"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { requireAdmin, type PaymentInput } from "@/lib/data";
import { isTeam, monthlySchedule, today } from "@/lib/domain";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function money(formData: FormData, key: string) {
  const value = Number(text(formData, key).replace(",", "."));
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
}

function refresh() {
  revalidatePath("/platby");
  revalidatePath("/prehlad");
  revalidatePath("/clenovia");
  revalidatePath("/upomienky");
}

export async function saveCategory(formData: FormData) {
  const { repo } = await requireAdmin("/nastavenia");
  const name = text(formData, "name");
  const amount = money(formData, "base_amount");
  if (!name || amount === null) {
    redirect("/nastavenia?error=" + encodeURIComponent("Zadajte názov kategórie a platnú sumu."));
  }

  try {
    await repo.saveCategory({
      id: text(formData, "id") || undefined,
      name,
      base_amount: amount,
      eligible_for_confirmation: formData.get("eligible_for_confirmation") === "on",
    });
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/nastavenia?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/nastavenia");
  refresh();
  redirect("/nastavenia?success=" + encodeURIComponent(`Kategória „${name}“ bola uložená.`));
}

export async function deleteCategory(formData: FormData) {
  const { repo } = await requireAdmin("/nastavenia");
  const id = text(formData, "id");

  try {
    const payments = await repo.listPayments();
    if (payments.some((payment) => payment.category_id === id)) {
      redirect("/nastavenia?error=" + encodeURIComponent("Kategóriu nemožno vymazať, existujú na ňu naviazané platby."));
    }
    await repo.deleteCategory(id);
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/nastavenia?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/nastavenia");
  redirect("/nastavenia?success=" + encodeURIComponent("Kategória bola vymazaná."));
}

/**
 * Predpis platieb: pre každé vybrané dieťa vznikne samostatná platba.
 * Mesačný režim vytvorí jeden záznam na každý mesiac obdobia.
 */
export async function createPrescription(formData: FormData) {
  const { repo } = await requireAdmin("/platby");

  const categoryId = text(formData, "category_id");
  const amount = money(formData, "amount");
  const mode = text(formData, "mode") === "monthly" ? "monthly" : "one_time";
  const note = text(formData, "note");
  if (!categoryId || amount === null) {
    redirect("/platby?error=" + encodeURIComponent("Vyberte kategóriu a zadajte sumu."));
  }

  const teamFilter = text(formData, "team");
  const explicitIds = formData.getAll("child_ids").map(String).filter(Boolean);

  let created = 0;
  try {
    const children = await repo.listChildren();
    const season = await repo.currentSeason();

    const recipients = children.filter((child) => {
      if (!child.active) return false; // archív
      if (explicitIds.length) return explicitIds.includes(child.id);
      if (teamFilter && isTeam(teamFilter) && child.team !== teamFilter) return false;
      return true;
    });

    if (!recipients.length) {
      redirect("/platby?error=" + encodeURIComponent("Výberu nezodpovedá žiadne dieťa."));
    }

    const schedule =
      mode === "monthly"
        ? monthlySchedule(text(formData, "start_month") || today().slice(0, 7), Math.min(Number(text(formData, "months")) || 1, 12), Number(text(formData, "due_day")) || 15)
        : [{ period: text(formData, "period"), dueDate: text(formData, "due_date") || today() }];

    /*
     * Odpočet 2 %: dieťaťu sa zo sumy odpočíta 50 % z darov, ktoré mu boli priradené.
     * Pri mesačnom predpise odpočítame celú zľavu z prvého mesiaca a zvyšok prenášame ďalej,
     * aby celkový odpočet sedel a žiadna splátka nešla do mínusu.
     */
    const applyDiscount = formData.get("apply_tax_discount") === "on";
    const discountByChild = new Map<string, number>();
    if (applyDiscount) {
      for (const donation of await repo.listDonations()) {
        if (!donation.child_id) continue;
        const current = discountByChild.get(donation.child_id) ?? 0;
        discountByChild.set(donation.child_id, current + donation.amount / 2);
      }
    }

    const rows: PaymentInput[] = [];
    for (const child of recipients) {
      let remainingDiscount = Math.round((discountByChild.get(child.id) ?? 0) * 100) / 100;

      for (const slot of schedule) {
        const used = Math.min(remainingDiscount, amount);
        remainingDiscount = Math.round((remainingDiscount - used) * 100) / 100;
        const finalAmount = Math.round((amount - used) * 100) / 100;

        // Splátku plne pokrytú z 2 % rovno uzavrieme — rodič nemá čo platiť,
        // takže nesmie visieť medzi neuhradenými ani zachytávať bankové platby.
        const covered = finalAmount === 0 && used > 0;

        rows.push({
          child_id: child.id,
          category_id: categoryId,
          season_id: season.id,
          amount: finalAmount,
          due_date: slot.dueDate,
          paid: covered,
          paid_at: covered ? today() : null,
          period: slot.period,
          note: used > 0 ? [note, `odpočet 2 %: ${used.toFixed(2)} €`].filter(Boolean).join(" · ") : note,
        });
      }
    }

    created = await repo.createPayments(rows);
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/platby?error=" + encodeURIComponent(errorMessage(error)));
  }

  refresh();
  redirect("/platby?success=" + encodeURIComponent(`Predpis vytvorený: ${created} platieb.`));
}

export async function savePayment(formData: FormData) {
  const { repo } = await requireAdmin("/platby");
  const id = text(formData, "id");
  const amount = money(formData, "amount");
  const paid = formData.get("paid") === "on";
  if (!id || amount === null) redirect("/platby?error=" + encodeURIComponent("Zadajte platnú sumu."));

  try {
    await repo.updatePayment(id, {
      amount,
      due_date: text(formData, "due_date") || today(),
      period: text(formData, "period"),
      note: text(formData, "note"),
      paid,
      paid_at: paid ? text(formData, "paid_at") || today() : null,
    });
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/platby?error=" + encodeURIComponent(errorMessage(error)));
  }

  refresh();
  redirect("/platby?success=" + encodeURIComponent("Platba bola upravená."));
}

export async function bulkPayments(formData: FormData) {
  const { repo } = await requireAdmin("/platby");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const action = text(formData, "bulk_action");
  if (!ids.length) redirect("/platby?error=" + encodeURIComponent("Vyberte aspoň jednu platbu."));

  let message: string;
  try {
    if (action === "mark_paid") {
      message = `Označených ako zaplatené: ${await repo.setPaid(ids, true, today())}.`;
    } else if (action === "mark_unpaid") {
      message = `Vrátených medzi nezaplatené: ${await repo.setPaid(ids, false, null)}.`;
    } else if (action === "delete") {
      message = `Vymazaných platieb: ${await repo.deletePayments(ids)}.`;
    } else {
      redirect("/platby?error=" + encodeURIComponent("Neznáma hromadná akcia."));
    }
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/platby?error=" + encodeURIComponent(errorMessage(error)));
  }

  refresh();
  redirect("/platby?success=" + encodeURIComponent(message));
}
