"use client";

import { useMemo, useState } from "react";
import { bulkLoans, createLoan } from "@/app/pozicovna/actions";
import { SubmitButton } from "./submit-button";
import { formatDate, formatMoney } from "@/lib/domain";

export type LoanRow = {
  id: string;
  itemLabel: string;
  category: string;
  childName: string;
  borrowedOn: string;
  returnedOn: string | null;
  price: number;
  paid: boolean;
  returned: boolean;
  note: string;
};

type Option = { id: string; label: string };
type ItemOption = Option & { price: number };

export function LoansBoard({
  rows,
  canEdit,
  availableItems,
  members,
  defaultDate,
}: {
  rows: LoanRow[];
  canEdit: boolean;
  availableItems: ItemOption[];
  members: Option[];
  defaultDate: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [lendOpen, setLendOpen] = useState(false);
  const [priceHint, setPriceHint] = useState("");

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allSelected = rows.length > 0 && visibleIds.every((id) => selected.includes(id));
  const columnCount = canEdit ? 9 : 8;

  function toggleAll() {
    setSelected(allSelected ? [] : visibleIds);
  }

  function toggleOne(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <>
      {canEdit && (
        <>
          <div className="list-actions">
            <span />
            <button type="button" className="secondary" onClick={() => setLendOpen((value) => !value)} disabled={!availableItems.length}>
              {lendOpen ? "Skryť formulár" : "+ Požičať kus"}
            </button>
          </div>

          {!availableItems.length && (
            <p className="muted">Žiadny kus nie je voľný na požičanie. Najprv niečo prijmi späť alebo pridaj do inventára.</p>
          )}

          {lendOpen && (
            <form action={createLoan} className="form-card edit-panel">
              <h2>Nová výpožička</h2>
              <div className="form-grid">
                <label>
                  Kus výstroja *
                  <select
                    name="equipment_id"
                    required
                    defaultValue=""
                    onChange={(event) => {
                      const item = availableItems.find((entry) => entry.id === event.target.value);
                      setPriceHint(item ? String(item.price) : "");
                    }}
                  >
                    <option disabled value="">Vyberte kus</option>
                    {availableItems.map((item) => (
                      <option key={item.id} value={item.id}>{item.label} · {formatMoney(item.price)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Dieťa *
                  <select name="child_id" required defaultValue="">
                    <option disabled value="">Vyberte dieťa</option>
                    {members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
                  </select>
                </label>
                <label>Dátum požičania *<input type="date" name="borrowed_on" required defaultValue={defaultDate} /></label>
                <label>
                  Cena za sezónu <span className="field-help">Prázdne = podľa kategórie</span>
                  <input name="price" inputMode="decimal" placeholder={priceHint || "napr. 60"} />
                </label>
                <label className="check"><input type="checkbox" name="paid" /> Zaplatené hneď</label>
                <label className="wide">Poznámka<input name="note" /></label>
              </div>
              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setLendOpen(false)}>Zrušiť</button>
                <SubmitButton label="Požičať" pendingLabel="Ukladám…" />
              </div>
            </form>
          )}

          <form action={bulkLoans} className="bulk-bar">
            {selected.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
            <label>
              <input type="checkbox" checked={allSelected} disabled={!rows.length} onChange={toggleAll} />
              Označiť všetko
            </label>
            <span>Vybraných: {selected.length}</span>
            <button type="submit" name="bulk_action" value="return" className="secondary" disabled={!selected.length}>
              Označiť ako vrátené
            </button>
            <button type="submit" name="bulk_action" value="paid" className="secondary" disabled={!selected.length}>
              Označiť ako zaplatené
            </button>
            <button type="submit" name="bulk_action" value="unpaid" className="secondary" disabled={!selected.length}>
              Vrátiť na nezaplatené
            </button>
            <button
              type="submit"
              name="bulk_action"
              value="delete"
              className="danger-button"
              disabled={!selected.length}
              onClick={(event) => {
                if (!confirm(`Naozaj vymazať ${selected.length} výpožičiek?`)) event.preventDefault();
              }}
            >
              Vymazať
            </button>
          </form>
        </>
      )}

      <div className="table-wrap">
        <table className="members">
          <thead>
            <tr>
              {canEdit && (
                <th><input type="checkbox" aria-label="Označiť všetko" checked={allSelected} disabled={!rows.length} onChange={toggleAll} /></th>
              )}
              <th>Kus</th><th>Kategória</th><th>Dieťa</th><th>Požičané</th>
              <th>Vrátené</th><th>Cena</th><th>Platba</th><th>Stav</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={row.returned ? "inactive-row" : undefined}>
                {canEdit && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Označiť výpožičku ${row.itemLabel}`}
                      checked={selected.includes(row.id)}
                      onChange={() => toggleOne(row.id)}
                    />
                  </td>
                )}
                <td><strong>{row.itemLabel}</strong></td>
                <td>{row.category}</td>
                <td>{row.childName}</td>
                <td>{formatDate(row.borrowedOn)}</td>
                <td>{row.returnedOn ? formatDate(row.returnedOn) : "—"}</td>
                <td>{formatMoney(row.price)}</td>
                <td>
                  <span className={`payment-status ${row.paid ? "paid" : "unpaid"}`}>
                    {row.paid ? "Zaplatené" : "Nezaplatené"}
                  </span>
                </td>
                <td>
                  <span className={`equip-status ${row.returned ? "dostupne" : "pozicane"}`}>
                    {row.returned ? "Vrátené" : "U dieťaťa"}
                  </span>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td className="empty-cell" colSpan={columnCount}>Žiadne výpožičky nezodpovedajú filtru.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
