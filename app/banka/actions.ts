"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, type BankTransactionInput } from "@/lib/data";
import { normalizeName } from "@/lib/attendance-import";
import { paymentStatus } from "@/lib/domain";
import { parseDate } from "@/lib/import-map";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { parseSpreadsheets } from "@/lib/parse-spreadsheet";

const MAX_BYTES = 10 * 1024 * 1024;

function pick(row: Record<string, string>, names: string[]) {
  for (const [key, value] of Object.entries(row)) {
    if (names.some((name) => normalizeName(key).includes(normalizeName(name)))) return value.trim();
  }
  return "";
}

/** Sumy vo výpise chodia ako „45,00“, „+45.00“ aj „1 234,50“. */
function parseAmount(value: string) {
  const cleaned = value.replace(/\s/g, "").replace(/[^\d,.-]/g, "").replace(",", ".");
  const amount = Number(cleaned);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : null;
}

/** Variabilný symbol môže byť vo vlastnom stĺpci alebo v texte platby. */
function extractVariableSymbol(row: Record<string, string>) {
  const direct = pick(row, ["variabilny symbol", "vs", "variabilny"]);
  const digits = direct.replace(/\D/g, "");
  if (digits) return digits;
  const text = Object.values(row).join(" ");
  return text.match(/\bVS[:\s]*(\d{3,10})\b/i)?.[1] ?? "";
}

/**
 * Import bankového výpisu a automatické spárovanie s predpísanými platbami.
 * Páruje sa podľa variabilného symbolu a sumy; nespárované riadky zostanú na kontrolu.
 */
export async function importBankStatement(formData: FormData) {
  const { repo } = await requireAdmin("/banka");
  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);

  if (!files.length) redirect("/banka?error=" + encodeURIComponent("Vyberte súbor s výpisom."));
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
    redirect("/banka?error=" + encodeURIComponent("Súbory majú spolu viac než 10 MB."));
  }

  let message: string;
  try {
    const { rows } = await parseSpreadsheets(files);
    if (!rows.length) redirect("/banka?error=" + encodeURIComponent("Vo výpise sa nenašli žiadne riadky."));

    const [children, payments, season] = await Promise.all([
      repo.listChildren(),
      repo.listPayments(),
      repo.currentSeason(),
    ]);

    const childByVs = new Map(children.map((child) => [String(child.variable_symbol), child.id]));

    const inputs: BankTransactionInput[] = [];
    let credits = 0;

    for (const row of rows) {
      const amount = parseAmount(pick(row, ["suma", "ciastka", "amount", "kredit"]));
      const bookedOn = parseDate(pick(row, ["datum", "date", "zauctovanie", "valuta"]));
      if (amount === null || !bookedOn) continue;
      // Odchádzajúce platby nás nezaujímajú, párujeme len príjmy.
      if (amount <= 0) continue;
      credits += 1;

      const variableSymbol = extractVariableSymbol(row);
      const counterparty = pick(row, ["protistrana", "partner", "nazov", "odosielatel"]);
      const note = pick(row, ["poznamka", "sprava pre prijemcu", "popis", "note"]);

      // Odtlačok riadku: rovnaký pohyb sa nezapočíta dvakrát ani pri opakovanom importe.
      const fingerprint = createHash("sha256")
        .update([bookedOn, amount.toFixed(2), variableSymbol, counterparty, note].join("|"))
        .digest("hex");

      inputs.push({
        season_id: season.id,
        booked_on: bookedOn,
        amount,
        variable_symbol: variableSymbol,
        counterparty,
        note,
        matched_payment_id: null,
        fingerprint,
      });
    }

    const stored = await repo.saveBankTransactions(inputs);

    // Párujeme len nezaplatené platby; najskôr tie s presne rovnakou sumou.
    const open = payments.filter((payment) => !payment.paid);
    const used = new Set<string>();
    let matchedCount = 0;
    const unmatched: string[] = [];

    for (const transaction of stored) {
      const childId = childByVs.get(transaction.variable_symbol);
      if (!childId) {
        unmatched.push(`${transaction.booked_on} · ${transaction.amount} € · VS ${transaction.variable_symbol || "?"}`);
        continue;
      }

      /*
       * Párujeme len na presnú sumu. Zámerne nepoužívame „najbližšiu“ platbu —
       * prevod na 5 € by inak uzavrel dlh 45 € a klub by prišiel o peniaze.
       * Čokoľvek iné nechávame na ručnú kontrolu.
       */
      const candidates = open
        .filter((payment) => payment.child_id === childId && !used.has(payment.id))
        .filter((payment) => Math.abs(payment.amount - transaction.amount) < 0.005)
        .sort((a, b) => a.due_date.localeCompare(b.due_date));

      const chosen = candidates[0];
      if (!chosen) {
        unmatched.push(`${transaction.booked_on} · ${transaction.amount} € · VS ${transaction.variable_symbol}`);
        continue;
      }

      used.add(chosen.id);
      await repo.setPaid([chosen.id], true, transaction.booked_on);
      matchedCount += 1;
    }

    const parts = [
      `${stored.length} nových pohybov z ${credits} príjmov`,
      `${matchedCount} spárovaných platieb`,
    ];
    if (inputs.length > stored.length) parts.push(`${inputs.length - stored.length} už bolo importovaných`);
    if (unmatched.length) parts.push(`nespárované: ${unmatched.length}`);
    message = `Import hotový — ${parts.join(" · ")}.`;
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/banka?error=" + encodeURIComponent(`Import zlyhal: ${errorMessage(error)}`));
  }

  revalidatePath("/banka");
  revalidatePath("/platby");
  revalidatePath("/prehlad");
  redirect("/banka?success=" + encodeURIComponent(message));
}

/** Ručné priradenie pohybu k platbe, keď automatika nenašla dvojicu. */
export async function matchManually(formData: FormData) {
  const { repo } = await requireAdmin("/banka");
  const paymentId = String(formData.get("payment_id") ?? "").trim();
  const paidOn = String(formData.get("paid_on") ?? "").trim();
  if (!paymentId) redirect("/banka?error=" + encodeURIComponent("Vyberte platbu."));

  try {
    const payments = await repo.listPayments();
    const payment = payments.find((entry) => entry.id === paymentId);
    if (!payment) redirect("/banka?error=" + encodeURIComponent("Platba neexistuje."));
    if (paymentStatus(payment.paid, payment.due_date).style === "paid") {
      redirect("/banka?error=" + encodeURIComponent("Táto platba je už označená ako zaplatená."));
    }
    await repo.setPaid([paymentId], true, paidOn || payment.due_date);
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/banka?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/banka");
  revalidatePath("/platby");
  redirect("/banka?success=" + encodeURIComponent("Platba bola označená ako zaplatená."));
}
