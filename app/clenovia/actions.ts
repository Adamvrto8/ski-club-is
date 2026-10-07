"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorMessage, rethrowControlFlow } from "@/lib/next-errors";
import { requireAdmin, type ChildInput } from "@/lib/data";
import { hasContactData, readContactInput } from "@/lib/contact-form";
import { isTeam, memberKey, today } from "@/lib/domain";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string) {
  return text(formData, key) || null;
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function readChild(formData: FormData): ChildInput | null {
  const first_name = text(formData, "first_name");
  const last_name = text(formData, "last_name");
  const birth_date = text(formData, "birth_date");
  const membership_date = text(formData, "membership_date") || today();
  const team = text(formData, "team");
  if (!first_name || !last_name || !birth_date || !isTeam(team)) return null;

  return {
    first_name,
    last_name,
    birth_date,
    team,
    membership_date,
    active: checked(formData, "active"),
    is_sport_registered: checked(formData, "is_sport_registered"),
    sport_registered_at: optional(formData, "sport_registered_at"),
    sport_identifier: optional(formData, "sport_identifier"),
    national_id: optional(formData, "national_id"),
    permanent_address: optional(formData, "permanent_address"),
  };
}

function readContact(formData: FormData) {
  return readContactInput(formData, "contact_address");
}

function refreshMemberPages() {
  revalidatePath("/clenovia");
  revalidatePath("/kontakty");
  revalidatePath("/prehlad");
}

export async function addMember(formData: FormData) {
  const { repo } = await requireAdmin("/clenovia");
  const input = readChild(formData);
  if (!input) redirect("/clenovia/novy?error=" + encodeURIComponent("Vyplňte meno, priezvisko, dátum narodenia a družstvo."));

  const existing = await repo.listChildren();
  const key = memberKey(input.first_name, input.last_name, input.birth_date);
  if (existing.some((child) => memberKey(child.first_name, child.last_name, child.birth_date) === key)) {
    redirect("/clenovia/novy?error=" + encodeURIComponent("Člen s týmto menom a dátumom narodenia už existuje."));
  }

  let message: string;
  try {
    const child = await repo.createChild(input);
    const contact = readContact(formData);
    if (hasContactData(contact)) await repo.saveContact(child.id, contact);
    message = `Člen ${child.first_name} ${child.last_name} bol uložený (VS ${child.variable_symbol}).`;
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/clenovia/novy?error=" + encodeURIComponent(errorMessage(error)));
  }

  refreshMemberPages();
  redirect("/clenovia?success=" + encodeURIComponent(message));
}

export async function updateMember(formData: FormData) {
  const { repo } = await requireAdmin("/clenovia");
  const id = text(formData, "id");
  const input = readChild(formData);
  if (!id || !input) redirect(`/clenovia/${id}?error=` + encodeURIComponent("Vyplňte všetky povinné polia."));

  try {
    await repo.updateChild(id, input);
    await repo.saveContact(id, readContact(formData));
  } catch (error) {
    rethrowControlFlow(error);
    redirect(`/clenovia/${id}?error=` + encodeURIComponent(errorMessage(error)));
  }

  refreshMemberPages();
  redirect("/clenovia?success=" + encodeURIComponent("Zmeny boli uložené."));
}

export async function bulkMembers(formData: FormData) {
  const { repo } = await requireAdmin("/clenovia");
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  const action = text(formData, "bulk_action");
  const team = text(formData, "bulk_team");
  if (!ids.length) redirect("/clenovia?error=" + encodeURIComponent("Vyberte aspoň jedného člena."));

  let message: string;
  try {
    if (action === "move_team") {
      if (!isTeam(team)) redirect("/clenovia?error=" + encodeURIComponent("Vyberte cieľové družstvo."));
      const count = await repo.bulkChildren(ids, { type: "move_team", team });
      message = `Presunutých členov: ${count}.`;
    } else if (action === "activate") {
      message = `Obnovených z archívu: ${await repo.bulkChildren(ids, { type: "activate" })}.`;
    } else if (action === "deactivate") {
      message = `Presunutých do archívu: ${await repo.bulkChildren(ids, { type: "deactivate" })}.`;
    } else if (action === "delete") {
      message = `Vymazaných členov: ${await repo.bulkChildren(ids, { type: "delete" })}.`;
    } else {
      redirect("/clenovia?error=" + encodeURIComponent("Neznáma hromadná akcia."));
    }
  } catch (error) {
    rethrowControlFlow(error);
    redirect("/clenovia?error=" + encodeURIComponent(errorMessage(error)));
  }

  refreshMemberPages();
  redirect("/clenovia?success=" + encodeURIComponent(message));
}

