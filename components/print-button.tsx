"use client";

/** Pri tlači sa skryje (trieda `no-print`), takže na papieri ani v PDF nie je vidieť. */
export function PrintButton({ label = "Tlačiť / uložiť ako PDF" }: { label?: string }) {
  return (
    <div className="no-print print-toolbar">
      <button type="button" onClick={() => window.print()}>{label}</button>
      <button type="button" className="secondary" onClick={() => window.close()}>Zavrieť</button>
    </div>
  );
}
