import assert from "node:assert/strict";
import { test } from "node:test";
import { donationFingerprint } from "./tax-donations.ts";

test("ten istý riadok 2 % má pri opakovanom importe rovnaký odtlačok", () => {
  const a = donationFingerprint("s1", "12.3.2026 10:15:00", "Novák Ján", "Mária", 45);
  assert.equal(a, donationFingerprint("s1", " 12.3.2026 10:15:00 ", "novak  jan", "MÁRIA", 45.0));
});

test("iná odpoveď, suma alebo sezóna je iný dar", () => {
  const a = donationFingerprint("s1", "12.3.2026 10:15:00", "Novák Ján", "Mária", 45);
  assert.notEqual(a, donationFingerprint("s1", "12.3.2026 10:16:00", "Novák Ján", "Mária", 45));
  assert.notEqual(a, donationFingerprint("s1", "12.3.2026 10:15:00", "Novák Ján", "Mária", 46));
  assert.notEqual(a, donationFingerprint("s2", "12.3.2026 10:15:00", "Novák Ján", "Mária", 45));
});
