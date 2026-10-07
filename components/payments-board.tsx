"use client";

import { useMemo, useState } from "react";
import { bulkPayments, savePayment } from "@/app/platby/actions";
import { formatDate, formatMoney, paymentStatus, type PaymentState } from "@/lib/domain";

export type PaymentRow = {
  id: string;
  childName: string;
  variableSymbol: number;
  category: string;
  period: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt: string | null;
  note: string;
  status: PaymentState;
};

export function PaymentsBoard({ rows, canEdit }: { rows: PaymentRow[]; canEdit: boolean }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allSelected = rows.length > 0 && visibleIds.every((id) => selected.includes(id));
  const columnCount = canEdit ? 9 : 7;

  function toggleAll() {
    setSelected(allSelected ? [] : visibleIds);
  }

  function toggleOne(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  const editingRow = rows.find((row) => row.id === editing);

  return (
    <>
      {canEdit && (
        <form action={bulkPayments} className="bulk-bar">
          {selected.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
          <label>
            <input type="checkbox" checked={allSelected} disabled={!rows.length} onChange={toggleAll} />
            Označiť všetko
          </label>
          <span>Vybraných: {selected.length}</span>
          <button type="submit" name="bulk_action" value="mark_paid" className="secondary" disabled={!selected.length}>
            Označiť ako zaplatené
          </button>
          <button type="submit" name="bulk_action" value="mark_unpaid" className="secondary" disabled={!selected.length}>
            Vrátiť na nezaplatené
          </button>
          <button
            type="submit"
            name="bulk_action"
            value="delete"
            className="danger-button"
            disabled={!selected.length}
            onClick={(event) => {
              if (!confirm(`Naozaj vymazať ${selected.length} platieb?`)) event.preventDefault();
            }}
          >
            Vymazať
          </button>
        </form>
      )}

      {editingRow && (
        <form action={savePayment} className="form-card edit-panel">
          <input type="hidden" name="id" value={editingRow.id} />
          <h2>Upraviť platbu · {editingRow.childName}</h2>
          <div className="form-grid">
            <label>Suma *<input name="amount" required inputMode="decimal" defaultValue={String(editingRow.amount)} /></label>
            <label>Splatnosť *<input name="due_date" type="date" required defaultValue={editingRow.dueDate} /></label>
            <label>Obdobie<input name="period" defaultValue={editingRow.period} /></label>
            <label>Dátum zaplatenia<input name="paid_at" type="date" defaultValue={editingRow.paidAt ?? ""} /></label>
            <label className="check"><input type="checkbox" name="paid" defaultChecked={editingRow.paid} /> Zaplatené</label>
            <label className="wide">Poznámka<input name="note" defaultValue={editingRow.note} /></label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Zrušiť</button>
            <button type="submit">Uložiť platbu</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table className="members payments">
          <thead>
            <tr>
              {canEdit && (
                <th><input type="checkbox" aria-label="Označiť všetko" checked={allSelected} disabled={!rows.length} onChange={toggleAll} /></th>
              )}
              <th>Meno</th><th>VS</th><th>Kategória</th><th>Obdobie</th>
              <th>Suma</th><th>Splatnosť</th><th>Stav</th>
              {canEdit && <th aria-label="Akcie" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = paymentStatus(row.paid, row.dueDate);
              return (
                <tr key={row.id}>
                  {canEdit && (
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Označiť platbu ${row.childName}`}
                        checked={selected.includes(row.id)}
                        onChange={() => toggleOne(row.id)}
                      />
                    </td>
                  )}
                  <td>{row.childName}</td>
                  <td>{row.variableSymbol || "—"}</td>
                  <td>{row.category}</td>
                  <td>{row.period || "—"}</td>
                  <td>{formatMoney(row.amount)}</td>
                  <td>{formatDate(row.dueDate)}</td>
                  <td>
                    <span className={`payment-status ${status.style}`}>{status.label}</span>
                    {row.paid && row.paidAt && <small className="muted"> {formatDate(row.paidAt)}</small>}
                  </td>
                  {canEdit && (
                    <td>
                      <button type="button" className="icon-button" onClick={() => setEditing(row.id)} aria-label="Upraviť platbu">✎</button>
                    </td>
                  )}
                </tr>
              );
            })}
            {!rows.length && (
              <tr><td className="empty-cell" colSpan={columnCount}>Žiadne platby nezodpovedajú filtru.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
