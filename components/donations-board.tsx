"use client";

import { useState } from "react";
import { deleteDonations, saveDonation } from "@/app/dve-percenta/actions";
import { SubmitButton } from "./submit-button";
import { formatMoney } from "@/lib/domain";

export type DonationRow = {
  id: string;
  childId: string | null;
  childName: string | null;
  donorName: string;
  amount: number;
  note: string;
};

export function DonationsBoard({
  rows,
  members,
}: {
  rows: DonationRow[];
  members: { id: string; label: string }[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<DonationRow | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const allSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id));
  const unassigned = rows.filter((row) => !row.childId).length;

  function toggleOne(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <section className="table-section">
      <div className="section-heading">
        <div>
          <h2>Jednotlivé dary</h2>
          <p className="muted">
            {rows.length} záznamov
            {unassigned > 0 && <> · <strong className="overdue-text">{unassigned}</strong> čaká na priradenie dieťaťu</>}
          </p>
        </div>
        <button type="button" className="secondary" onClick={() => setShowAdd((value) => !value)}>
          {showAdd ? "Skryť" : "+ Pridať dar ručne"}
        </button>
      </div>

      {showAdd && (
        <form action={saveDonation} className="form-card edit-panel">
          <h3>Nový dar</h3>
          <div className="form-grid">
            <label>
              Dieťa
              <select name="child_id" defaultValue="">
                <option value="">Zatiaľ nepriradené</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
              </select>
            </label>
            <label>Suma *<input name="amount" required inputMode="decimal" placeholder="80,00" /></label>
            <label>Darca<input name="donor_name" /></label>
            <label>Poznámka<input name="note" /></label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setShowAdd(false)}>Zrušiť</button>
            <SubmitButton label="Uložiť dar" pendingLabel="Ukladám…" />
          </div>
        </form>
      )}

      {editing && (
        <form action={saveDonation} className="form-card edit-panel">
          <input type="hidden" name="id" value={editing.id} />
          <h3>Upraviť dar {formatMoney(editing.amount)}</h3>
          <div className="form-grid">
            <label>
              Dieťa
              <select name="child_id" defaultValue={editing.childId ?? ""}>
                <option value="">Zatiaľ nepriradené</option>
                {members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
              </select>
            </label>
            <label>Suma *<input name="amount" required inputMode="decimal" defaultValue={String(editing.amount)} /></label>
            <label>Darca<input name="donor_name" defaultValue={editing.donorName} /></label>
            <label>Poznámka<input name="note" defaultValue={editing.note} /></label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Zrušiť</button>
            <SubmitButton label="Uložiť zmeny" pendingLabel="Ukladám…" />
          </div>
        </form>
      )}

      <form action={deleteDonations} className="bulk-bar">
        {selected.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
        <label>
          <input
            type="checkbox"
            checked={allSelected}
            disabled={!rows.length}
            onChange={() => setSelected(allSelected ? [] : rows.map((row) => row.id))}
          />
          Označiť všetko
        </label>
        <span>Vybraných: {selected.length}</span>
        <button
          type="submit"
          className="danger-button"
          disabled={!selected.length}
          onClick={(event) => {
            if (!confirm(`Naozaj vymazať ${selected.length} darov?`)) event.preventDefault();
          }}
        >
          Vymazať
        </button>
      </form>

      <div className="table-wrap">
        <table className="members">
          <thead>
            <tr>
              <th aria-label="Výber" /><th>Dieťa</th><th>Darca</th><th>Suma</th><th>Poznámka</th><th aria-label="Akcie" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.childId ? undefined : "invalid-row"}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Označiť dar ${row.amount}`}
                    checked={selected.includes(row.id)}
                    onChange={() => toggleOne(row.id)}
                  />
                </td>
                <td>{row.childName ?? <span className="muted">nepriradené</span>}</td>
                <td>{row.donorName || "—"}</td>
                <td><strong>{formatMoney(row.amount)}</strong></td>
                <td className="note-cell">{row.note || "—"}</td>
                <td>
                  <button type="button" className="icon-button" onClick={() => setEditing(row)} aria-label="Upraviť dar">✎</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td className="empty-cell" colSpan={6}>Zatiaľ žiadne dary.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
