"use client";

import { useMemo, useState } from "react";
import { formatDate, formatMoney } from "@/lib/domain";

export type ReminderRow = {
  id: string;
  childName: string;
  variableSymbol: number;
  category: string;
  period: string;
  amount: number;
  dueDate: string;
  overdue: boolean;
  contact: string;
};

function buildMessage(rows: ReminderRow[], iban: string) {
  return rows
    .map((row) => {
      const lines = [
        `Ahoj, zatiaľ od vás neevidujeme platbu za ${row.childName}.`,
        `${row.category}${row.period ? ` (${row.period})` : ""}: ${formatMoney(row.amount)}`,
        `Variabilný symbol: ${row.variableSymbol}`,
        `Splatnosť: ${formatDate(row.dueDate)}`,
      ];
      if (iban) lines.push(`Číslo účtu: ${iban}`);
      lines.push("Ďakujeme, Demo Ski Club");
      return lines.join("\n");
    })
    .join("\n\n———\n\n");
}

export function RemindersBoard({ rows, iban }: { rows: ReminderRow[]; iban: string }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  const selectedRows = useMemo(() => rows.filter((row) => selected.includes(row.id)), [rows, selected]);
  const allSelected = rows.length > 0 && selected.length === rows.length;
  const message = buildMessage(selectedRows, iban);
  const total = selectedRows.reduce((sum, row) => sum + row.amount, 0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
      alert("Kopírovanie zlyhalo. Text môžeš označiť a skopírovať ručne.");
    }
  }

  return (
    <>
      <div className="bulk-bar">
        <label>
          <input
            type="checkbox"
            checked={allSelected}
            disabled={!rows.length}
            onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))}
          />
          Označiť všetko
        </label>
        <span>Vybraných: {selected.length} · {formatMoney(total)}</span>
        <button type="button" className="secondary" disabled={!selected.length} onClick={copy}>
          {copied ? "✓ Skopírované" : "Kopírovať správy"}
        </button>
      </div>

      <div className="table-wrap">
        <table className="members payments">
          <thead>
            <tr>
              <th aria-label="Výber" /><th>Meno</th><th>VS</th><th>Kategória</th>
              <th>Suma</th><th>Splatnosť</th><th>Kontakt</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Označiť ${row.childName}`}
                    checked={selected.includes(row.id)}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(row.id) ? current.filter((item) => item !== row.id) : [...current, row.id],
                      )
                    }
                  />
                </td>
                <td>{row.childName}</td>
                <td>{row.variableSymbol}</td>
                <td>{row.category}{row.period && <small className="muted"> · {row.period}</small>}</td>
                <td>{formatMoney(row.amount)}</td>
                <td className={row.overdue ? "overdue-text" : undefined}>{formatDate(row.dueDate)}</td>
                <td>{row.contact || "—"}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className="empty-cell" colSpan={7}>Žiadne neuhradené platby. 🎉</td></tr>}
          </tbody>
        </table>
      </div>

      {selectedRows.length > 0 && (
        <section className="form-card">
          <h2>Text na odoslanie</h2>
          <textarea className="message-box" readOnly value={message} rows={Math.min(20, selectedRows.length * 7)} />
          <div className="form-actions">
            <button type="button" onClick={copy}>{copied ? "✓ Skopírované" : "Kopírovať do schránky"}</button>
          </div>
        </section>
      )}
    </>
  );
}
