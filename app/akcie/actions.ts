"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, type EventParticipantInput } from "@/lib/data";
import { membersToRegister, today } from "@/lib/domain";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { parseSpreadsheets } from "@/lib/parse-spreadsheet";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function money(formData: FormData, key: string) {
  const raw = text(formData, key).replace(",", ".");
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : 0;
}

function count(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

export async function saveEvent(formData: FormData) {
  const { repo } = await requireAdmin("/akcie");
  const id = text(formData, "id");
  const name = text(formData, "name");
  const startsOn = text(formData, "starts_on") || today();
  const endsOn = text(formData, "ends_on") || startsOn;

  if (!name) redirect("/akcie?error=" + encodeURIComponent("Zadajte názov akcie."));
  if (endsOn < startsOn) redirect("/akcie?error=" + encodeURIComponent("Dátum do nemôže byť skôr než dátum od."));

  let eventId = id;
  try {
    const season = await repo.currentSeason();
    let variableSymbol = text(formData, "variable_symbol");

    if (!variableSymbol) {
      // Predvolený VS akcie: rok + poradové číslo v rámci roka.
      const events = await repo.listEvents();
      const year = startsOn.slice(0, 4);
      const order = events.filter((event) => event.starts_on.startsWith(year)).length + 1;
      variableSymbol = `${year}${String(order).padStart(3, "0")}`;
    }

    const saved = await repo.saveEvent({
      id: id || undefined,
      season_id: season.id,
      name,
      place: text(formData, "place"),
      starts_on: startsOn,
      ends_on: endsOn,
      event_type: text(formData, "event_type"),
      variable_symbol: variableSymbol,
      note: text(formData, "note"),
    });
    eventId = saved.id;
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/akcie?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/akcie");
  revalidatePath(`/akcie/${eventId}`);
  redirect(`/akcie/${eventId}?success=` + encodeURIComponent(`Akcia „${name}“ bola uložená.`));
}

export async function deleteEvent(formData: FormData) {
  const { repo } = await requireAdmin("/akcie");
  const id = text(formData, "id");

  try {
    await repo.deleteEvent(id);
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/akcie?error=" + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath("/akcie");
  redirect("/akcie?success=" + encodeURIComponent("Akcia bola vymazaná aj s účastníkmi."));
}

/** Pridá účastníka — buď existujúceho člena, alebo ručný rodinný záznam. */
export async function saveParticipant(formData: FormData) {
  const { repo } = await requireAdmin("/akcie");
  const eventId = text(formData, "event_id");
  const participantId = text(formData, "id");
  const childId = text(formData, "child_id") || null;
  let familyName = text(formData, "family_name");

  if (!eventId) redirect("/akcie?error=" + encodeURIComponent("Chýba akcia."));

  try {
    if (childId && !familyName) {
      const child = (await repo.listChildren()).find((entry) => entry.id === childId);
      if (child) familyName = `${child.last_name} ${child.first_name}`;
    }
    if (!familyName) {
      redirect(`/akcie/${eventId}?error=` + encodeURIComponent("Zadajte meno rodiny alebo vyberte člena."));
    }

    const input: EventParticipantInput = {
      event_id: eventId,
      child_id: childId,
      family_name: familyName,
      children_count: childId ? Math.max(1, count(formData, "children_count")) : count(formData, "children_count"),
      adults_count: count(formData, "adults_count"),
      deposit: money(formData, "deposit"),
      deposit_paid: formData.get("deposit_paid") === "on",
      balance: money(formData, "balance"),
      balance_paid: formData.get("balance_paid") === "on",
      note: text(formData, "note"),
    };
    await repo.saveParticipant(participantId ? { ...input, id: participantId } : input);
  } catch (error) {
    rethrowControlFlow(error);
    redirect(`/akcie/${eventId}?error=` + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath(`/akcie/${eventId}`);
  redirect(`/akcie/${eventId}?success=` + encodeURIComponent("Účastník bol uložený."));
}

/**
 * Hromadné prihlásenie na akciu: zo zaškrtnutých členov spraví účastníkov.
 * Sumy nechávame na nule — štartovné sa dopĺňa až keď je známe. Kto už na
 * akcii je, toho preskočíme, nech sa opakovaným kliknutím nerobia duplicity.
 */
export async function addParticipants(formData: FormData) {
  const { repo } = await requireAdmin("/akcie");
  const eventId = text(formData, "event_id");
  const childIds = formData.getAll("child_ids").map(String).filter(Boolean);

  if (!eventId) redirect("/akcie?error=" + encodeURIComponent("Chýba akcia."));
  if (!childIds.length) {
    redirect(`/akcie/${eventId}?error=` + encodeURIComponent("Vyberte aspoň jedného člena."));
  }

  let added = 0;
  try {
    const [children, participants] = await Promise.all([repo.listChildren(), repo.listParticipants()]);
    const toAdd = membersToRegister(
      childIds,
      children,
      participants.filter((row) => row.event_id === eventId).map((row) => row.child_id),
    );

    // ponytail: jeden zápis na dieťa — pri desiatkach členov stačí, na stovky by sa hodil hromadný insert v Repo.
    await Promise.all(
      toAdd.map((child) =>
        repo.saveParticipant({
          event_id: eventId,
          child_id: child.id,
          family_name: `${child.last_name} ${child.first_name}`,
          children_count: 1,
          adults_count: 0,
          deposit: 0,
          deposit_paid: false,
          balance: 0,
          balance_paid: false,
          note: "",
        }),
      ),
    );
    added = toAdd.length;
  } catch (error) {
    rethrowControlFlow(error);
    redirect(`/akcie/${eventId}?error=` + encodeURIComponent(errorMessage(error)));
  }

  const skipped = childIds.length - added;
  const message = skipped
    ? `Prihlásených: ${added}. Už prihlásených sme preskočili: ${skipped}.`
    : `Prihlásených: ${added}.`;

  revalidatePath(`/akcie/${eventId}`);
  redirect(`/akcie/${eventId}?success=` + encodeURIComponent(message));
}

export async function bulkParticipants(formData: FormData) {
  const { repo } = await requireAdmin("/akcie");
  const eventId = text(formData, "event_id");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const action = text(formData, "bulk_action");

  if (!ids.length) redirect(`/akcie/${eventId}?error=` + encodeURIComponent("Vyberte aspoň jedného účastníka."));

  let message: string;
  try {
    if (action === "deposit_paid") {
      message = `Záloha označená ako zaplatená u ${await repo.updateParticipants(ids, { deposit_paid: true })} rodín.`;
    } else if (action === "balance_paid") {
      message = `Doplatok označený ako zaplatený u ${await repo.updateParticipants(ids, { balance_paid: true })} rodín.`;
    } else if (action === "unpaid") {
      const changed = await repo.updateParticipants(ids, { deposit_paid: false, balance_paid: false });
      message = `Vrátených medzi nezaplatené: ${changed}.`;
    } else if (action === "delete") {
      message = `Vymazaných účastníkov: ${await repo.deleteParticipants(ids)}.`;
    } else {
      redirect(`/akcie/${eventId}?error=` + encodeURIComponent("Neznáma hromadná akcia."));
    }
  } catch (error) {
    rethrowControlFlow(error);
    redirect(`/akcie/${eventId}?error=` + encodeURIComponent(errorMessage(error)));
  }

  revalidatePath(`/akcie/${eventId}`);
  redirect(`/akcie/${eventId}?success=` + encodeURIComponent(message));
}

const MAX_BYTES = 10 * 1024 * 1024;

function pick(row: Record<string, string>, names: string[]) {
  const normalize = (value: string) =>
    value.trim().toLocaleLowerCase("sk").normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [key, value] of Object.entries(row)) {
    if (names.some((name) => normalize(key).includes(normalize(name)))) return value.trim();
  }
  return "";
}

/** Počet mien v bunke typu „Eva, Jakub“ alebo „Eva a Jakub“. */
function countNames(value: string) {
  if (!value.trim()) return 0;
  return value.split(/[,;]| a /i).map((part) => part.trim()).filter(Boolean).length;
}

/**
 * Import prihlášok z Google Forms. Hárok má typicky meno rodiny,
 * mená detí, mená dospelých a poznámku.
 */
export async function importParticipants(formData: FormData) {
  const { repo } = await requireAdmin("/akcie");
  const eventId = text(formData, "event_id");
  const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);

  if (!eventId) redirect("/akcie?error=" + encodeURIComponent("Chýba akcia."));
  if (!files.length) redirect(`/akcie/${eventId}?error=` + encodeURIComponent("Vyberte súbor s prihláškami."));
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
    redirect(`/akcie/${eventId}?error=` + encodeURIComponent("Súbory majú spolu viac než 10 MB."));
  }

  let message: string;
  try {
    const { rows } = await parseSpreadsheets(files);
    const existing = (await repo.listParticipants()).filter((entry) => entry.event_id === eventId);
    const taken = new Set(existing.map((entry) => entry.family_name.trim().toLocaleLowerCase("sk")));

    let created = 0;
    let skipped = 0;

    for (const row of rows) {
      const familyName = pick(row, ["rodina", "meno rodiny", "priezvisko", "family"]);
      const childNames = pick(row, ["deti", "mena deti", "dieta", "children"]);
      const adultNames = pick(row, ["dospeli", "mena dospelych", "rodicia", "adults"]);

      if (!familyName || taken.has(familyName.toLocaleLowerCase("sk"))) {
        skipped += 1;
        continue;
      }

      await repo.saveParticipant({
        event_id: eventId,
        child_id: null,
        family_name: familyName,
        children_count: countNames(childNames),
        adults_count: countNames(adultNames),
        deposit: 0,
        deposit_paid: false,
        balance: 0,
        balance_paid: false,
        note: [childNames, adultNames, pick(row, ["poznamka", "note"])].filter(Boolean).join(" · "),
      });
      taken.add(familyName.toLocaleLowerCase("sk"));
      created += 1;
    }

    message = `Import hotový: ${created} nových rodín, ${skipped} preskočených (duplicita alebo chýbajúce meno).`;
  } catch (error) {
    rethrowControlFlow(error);
    redirect(`/akcie/${eventId}?error=` + encodeURIComponent(`Import zlyhal: ${errorMessage(error)}`));
  }

  revalidatePath(`/akcie/${eventId}`);
  redirect(`/akcie/${eventId}?success=` + encodeURIComponent(message));
}
