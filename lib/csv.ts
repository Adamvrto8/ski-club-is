/**
 * CSV pre Excel: stredník ako oddeľovač a BOM, aby sa diakritika zobrazila správne
 * po otvorení v slovenskom Exceli.
 */
export function toCsv(headers: string[], rows: (string | number)[][]) {
  const escape = (value: string | number) => {
    const text = String(value ?? "");
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [headers.map(escape).join(";"), ...rows.map((row) => row.map(escape).join(";"))];
  return `﻿${lines.join("\r\n")}`;
}

export function csvResponse(fileName: string, csv: string) {
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileName}"`,
    },
  });
}
