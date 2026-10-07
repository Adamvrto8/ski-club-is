import type { ContactInput } from "./data/types";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function optional(formData: FormData, key: string) {
  return text(formData, key) || null;
}

export function emailList(value: string) {
  return value
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

/**
 * Formulár člena a formulár kontaktu zdieľajú tie isté polia, líšia sa len
 * názvom poľa pre adresu (`contact_address` vs. `address`), aby sa v jednom
 * formulári nebila s trvalým bydliskom dieťaťa.
 */
export function readContactInput(formData: FormData, addressKey = "address"): ContactInput {
  return {
    father_name: optional(formData, "father_name"),
    father_phone: optional(formData, "father_phone"),
    mother_name: optional(formData, "mother_name"),
    mother_phone: optional(formData, "mother_phone"),
    address: optional(formData, addressKey),
    emails: emailList(text(formData, "emails")),
  };
}

export function hasContactData(contact: ContactInput) {
  return Boolean(
    contact.father_name ||
      contact.father_phone ||
      contact.mother_name ||
      contact.mother_phone ||
      contact.address ||
      contact.emails.length,
  );
}
