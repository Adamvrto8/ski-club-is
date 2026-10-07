"use client";

import { useMemo, useState } from "react";
import { addParticipants, bulkParticipants, saveParticipant } from "@/app/akcie/actions";
import { SubmitButton } from "./submit-button";
import { TEAM_LABELS, formatMoney, isTeam } from "@/lib/domain";

export type ParticipantRow = {
  id: string;
  familyName: string;
  childId: string | null;
  childrenCount: number;
  adultsCount: number;
  deposit: number;
  depositPaid: boolean;
  balance: number;
  balancePaid: boolean;
  note: string;
};

const EMPTY: ParticipantRow = {
  id: "", familyName: "", childId: null, childrenCount: 1, adultsCount: 0,
  deposit: 0, depositPaid: false, balance: 0, balancePaid: false, note: "",
};

export function EventParticipants({
  eventId,
  rows,
  members,
  canEdit,
}: {
  eventId: string;
  rows: ParticipantRow[];
  members: { id: string; label: string; team: string }[];
  canEdit: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<ParticipantRow | null>(null);
  const [fromMember, setFromMember] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkTeam, setBulkTeam] = useState("");
  const [bulkPicked, setBulkPicked] = useState<string[]>([]);

  // Kto na akcii ešte nie je — prihlásených netreba ponúkať znova.
  const available = useMemo(() => {
    const taken = new Set(rows.map((row) => row.childId).filter(Boolean));
    return members.filter((member) => !taken.has(member.id) && (!bulkTeam || member.team === bulkTeam));
  }, [members, rows, bulkTeam]);

  const allPicked = available.length > 0 && available.every((member) => bulkPicked.includes(member.id));

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allSelected = rows.length > 0 && visibleIds.every((id) => selected.includes(id));
  const columnCount = canEdit ? 9 : 8;

  function toggleAll() {
    setSelected(allSelected ? [] : visibleIds);
  }

  function toggleOne(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function togglePicked(id: string) {
    setBulkPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function openNew(useMember: boolean) {
    setFromMember(useMember);
    setEditing(EMPTY);
  }

  return (
    <>
      {canEdit && (
        <>
          <div className="list-actions">
            <p className="muted">Účastníkov: {rows.length} rodín</p>
            <span className="inline-links">
              <button type="button" className="secondary" onClick={() => openNew(true)}>+ Pridať člena</button>
              <button type="button" className="secondary" onClick={() => openNew(false)}>+ Pridať rodinu</button>
              <button type="button" className="secondary" onClick={() => setBulkOpen((open) => !open)}>
                {bulkOpen ? "Skryť hromadné prihlásenie" : "Hromadne prihlásiť"}
              </button>
            </span>
          </div>

          {bulkOpen && (
            <form action={addParticipants} className="form-card edit-panel">
              <input type="hidden" name="event_id" value={eventId} />
              <h2>Hromadné prihlásenie</h2>
              <p className="muted">
                Zaškrtnutí členovia sa pridajú ako účastníci s nulovými sumami — štartovné doplníte potom.
                Kto už je prihlásený, v zozname nie je.
              </p>

              <div className="toolbar">
                <select
                  value={bulkTeam}
                  onChange={(event) => setBulkTeam(isTeam(event.target.value) ? event.target.value : "")}
                  aria-label="Filtrovať podľa družstva"
                >
                  <option value="">Všetky družstvá</option>
                  {Object.entries(TEAM_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setBulkPicked(allPicked ? [] : available.map((member) => member.id))}
                  disabled={!available.length}
                >
                  {allPicked ? "Odznačiť všetkých" : "Označiť všetkých zobrazených"}
                </button>
                <span className="muted">Vybraných: {bulkPicked.length}</span>
              </div>

              {available.length ? (
                <ul className="pick-list">
                  {available.map((member) => (
                    <li key={member.id}>
                      <label>
                        <input
                          type="checkbox"
                          name="child_ids"
                          value={member.id}
                          checked={bulkPicked.includes(member.id)}
                          onChange={() => togglePicked(member.id)}
                        />
                        {member.label}
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="notice">Všetci členovia z tohto výberu už sú prihlásení.</p>
              )}

              <div className="form-actions">
                <SubmitButton label="Prihlásiť vybraných" pendingLabel="Prihlasujem..." disabled={!bulkPicked.length} />
                <button type="button" className="secondary" onClick={() => { setBulkOpen(false); setBulkPicked([]); }}>
                  Zavrieť
                </button>
              </div>
            </form>
          )}

          {editing && (
            <form action={saveParticipant} className="form-card edit-panel">
              <input type="hidden" name="event_id" value={eventId} />
              {editing.id && <input type="hidden" name="id" value={editing.id} />}
              <h2>{editing.id ? `Upraviť: ${editing.familyName}` : fromMember ? "Účastník z členov" : "Rodina mimo členov"}</h2>

              <div className="form-grid">
                {fromMember && !editing.id ? (
                  <label className="wide">
                    Člen *
                    <select name="child_id" required defaultValue="">
                      <option disabled value="">Vyberte člena</option>
                      {members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
                    </select>
                  </label>
                ) : (
                  <>
                    {editing.childId && <input type="hidden" name="child_id" value={editing.childId} />}
                    <label className="wide">
                      Priezvisko alebo názov rodiny *
                      <input name="family_name" required defaultValue={editing.familyName} placeholder="napr. Novákovci" />
                    </label>
                  </>
                )}

                <label>Počet detí<input type="number" name="children_count" min={0} defaultValue={editing.childrenCount} /></label>
                <label>Počet dospelých<input type="number" name="adults_count" min={0} defaultValue={editing.adultsCount} /></label>
                <label>Záloha<input name="deposit" inputMode="decimal" defaultValue={String(editing.deposit)} /></label>
                <label>Doplatok<input name="balance" inputMode="decimal" defaultValue={String(editing.balance)} /></label>
                <label className="check"><input type="checkbox" name="deposit_paid" defaultChecked={editing.depositPaid} /> Záloha zaplatená</label>
                <label className="check"><input type="checkbox" name="balance_paid" defaultChecked={editing.balancePaid} /> Doplatok zaplatený</label>
                <label className="wide">Poznámka<input name="note" defaultValue={editing.note} /></label>
              </div>

              <div className="form-actions">
                <button type="button" className="secondary" onClick={() => setEditing(null)}>Zrušiť</button>
                <SubmitButton label="Uložiť účastníka" pendingLabel="Ukladám…" />
              </div>
            </form>
          )}

          <form action={bulkParticipants} className="bulk-bar">
            <input type="hidden" name="event_id" value={eventId} />
            {selected.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
            <label>
              <input type="checkbox" checked={allSelected} disabled={!rows.length} onChange={toggleAll} />
              Označiť všetko
            </label>
            <span>Vybraných: {selected.length}</span>
            <button type="submit" name="bulk_action" value="deposit_paid" className="secondary" disabled={!selected.length}>
              Záloha zaplatená
            </button>
            <button type="submit" name="bulk_action" value="balance_paid" className="secondary" disabled={!selected.length}>
              Doplatok zaplatený
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
                if (!confirm(`Naozaj vymazať ${selected.length} účastníkov?`)) event.preventDefault();
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
              <th>Rodina</th><th>Deti</th><th>Dospelí</th><th>Spolu</th>
              <th>Záloha</th><th>Doplatok</th><th>Poznámka</th>
              {canEdit && <th aria-label="Akcie" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {canEdit && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Označiť ${row.familyName}`}
                      checked={selected.includes(row.id)}
                      onChange={() => toggleOne(row.id)}
                    />
                  </td>
                )}
                <td>
                  <strong>{row.familyName}</strong>
                  {row.childId && <span className="chip">člen</span>}
                </td>
                <td>{row.childrenCount}</td>
                <td>{row.adultsCount}</td>
                <td><strong>{row.childrenCount + row.adultsCount}</strong></td>
                <td>
                  {formatMoney(row.deposit)}{" "}
                  <span className={`payment-status ${row.depositPaid ? "paid" : "unpaid"}`}>
                    {row.depositPaid ? "OK" : "čaká"}
                  </span>
                </td>
                <td>
                  {formatMoney(row.balance)}{" "}
                  <span className={`payment-status ${row.balancePaid ? "paid" : "unpaid"}`}>
                    {row.balancePaid ? "OK" : "čaká"}
                  </span>
                </td>
                <td className="note-cell">{row.note || "—"}</td>
                {canEdit && (
                  <td>
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => { setFromMember(false); setEditing(row); }}
                      aria-label={`Upraviť ${row.familyName}`}
                    >
                      ✎
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {!rows.length && (
              <tr><td className="empty-cell" colSpan={columnCount}>Zatiaľ nikto neprihlásený.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
