"use client";

import { useState } from "react";

/**
 * Hromadná pošta rodičom: e-maily z práve vyfiltrovaných kontaktov skopírujeme
 * oddelené čiarkou, nech sa dajú vložiť do skrytej kópie (BCC) v poštovom
 * programe. Zámerne needitujeme poštu za užívateľa — len podáme zoznam.
 */
export function CopyEmails({ emails }: { emails: string[] }) {
  const [copied, setCopied] = useState(false);
  if (!emails.length) return null;

  const text = emails.join(", ");
  return (
    <button
      type="button"
      className="text-link"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Schránka je zakázaná (starší prehliadač, http) — nech sa dá aspoň označiť ručne.
          window.prompt("Skopírujte e-maily (Ctrl+C):", text);
        }
      }}
    >
      {copied ? `Skopírované (${emails.length})` : `Kopírovať e-maily (${emails.length})`}
    </button>
  );
}
