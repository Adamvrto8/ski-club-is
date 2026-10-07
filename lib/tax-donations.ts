import { createHash } from "node:crypto";

// Rovnaké ako normalizeName v attendance-import — tu bez importu, aby sa dal súbor testovať priamo v node.
const normalizeName = (value: string) =>
  value.trim().toLocaleLowerCase("sk").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

/**
 * Odtlačok riadku z Google Forms. Časová pečiatka odpovede ho robí jedinečným —
 * dvaja rodičia, ktorí darujú rovnakú sumu tomu istému dieťaťu, sa nezlejú.
 */
export function donationFingerprint(seasonId: string, submittedAt: string, childName: string, donor: string, amount: number) {
  return createHash("sha256")
    .update([seasonId, submittedAt.trim(), normalizeName(childName), normalizeName(donor), amount.toFixed(2)].join("|"))
    .digest("hex");
}
