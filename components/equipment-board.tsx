"use client";

import { useMemo, useState } from "react";
import { bulkEquipment, saveEquipment } from "@/app/pozicovna/actions";
import { SubmitButton } from "./submit-button";
import { formatMoney } from "@/lib/domain";
import { normalizeName } from "@/lib/attendance-import";
import {
  CONDITION_LABELS,
  EQUIPMENT_PURPOSE_LABELS,
  EQUIPMENT_STATUS_LABELS,
  equipmentExtra,
  groupColumns,
  type EquipmentCondition,
  type EquipmentPurpose,
  type EquipmentStatus,
} from "@/lib/equipment";

export type EquipmentRow = {
  id: string;
  inventoryCode: string;
  name: string;
  category: string;
  categoryId: string | null;
  /** Hlavná kategória — podľa nej sa zoznam delí na zbaliteľné bloky. */
  group: string;
  /** Podkategória jedným slovom („Nové“), prázdna ak kus žiadnu nemá. */
  subcategory: string;
  size: string;
  brand: string;
  model: string;
  color: string;
  buckles: number | null;
  quantity: number | null;
  purpose: EquipmentPurpose;
  price: number;
  condition: EquipmentCondition;
  status: EquipmentStatus;
  note: string;
  borrower: string | null;
  borrowerId: string | null;
};

type Option = { id: string; label: string };

const EMPTY: EquipmentRow = {
  id: "", inventoryCode: "", name: "", category: "", categoryId: null, group: "", subcategory: "", size: "", brand: "",
  model: "", color: "", buckles: null, quantity: null, purpose: "prenajom", price: 0, condition: "nove", status: "dostupne", note: "",
  borrower: null, borrowerId: null,
};

/**
 * Zoznam inventára rozdelený na bloky podľa hlavnej kategórie.
 *
 * Kategórií je veľa a v každej desiatky kusov — jedna dlhá tabuľka s 300
 * riadkami sa nedá prehľadne použiť. Každá kategória je preto zbaliteľný blok
 * so súhrnom (koľko kusov, koľko dostupných, koľko požičaných), takže na prvý
 * pohľad je vidieť stav celého skladu a rozbalí sa len to, čo treba.
 */
export function EquipmentBoard({
  rows,
  categories,
  members,
  canEdit,
  purpose,
  expandAll,
}: {
  rows: EquipmentRow[];
  categories: Option[];
  members: Option[];
  canEdit: boolean;
  purpose: EquipmentPurpose;
  expandAll: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<EquipmentRow | null>(null);
  const [editStatus, setEditStatus] = useState<EquipmentStatus>("dostupne");
  const [memberQuery, setMemberQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const groups = useMemo(() => {
    const byName = new Map<string, EquipmentRow[]>();
    for (const row of rows) byName.set(row.group, [...(byName.get(row.group) ?? []), row]);
    // Najpočetnejšie kategórie hore, pri rovnakom počte abecedne; „Bez zaradenia“ vždy na konci.
    return [...byName.entries()].sort(([a, aRows], [b, bRows]) =>
      a === "Bez zaradenia" ? 1 : b === "Bez zaradenia" ? -1 : bRows.length - aRows.length || a.localeCompare(b, "sk"),
    );
  }, [rows]);

  // Sklad nikomu nepožičiavame — farba, veľkosť, cena ani opotrebenie tam nemajú zmysel.
  const isStore = purpose === "sklad";

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allSelected = rows.length > 0 && visibleIds.every((id) => selected.includes(id));
  // Klipsy majú zmysel len tam, kde ich aspoň jeden kus má — inak by stĺpec zaberal miesto prázdny.

  // Dieťa je vybraté, až keď text presne sedí na meno zo zoznamu.
  const pickedMember = useMemo(() => {
    const query = memberQuery.trim().toLocaleLowerCase("sk");
    return query ? members.find((member) => member.label.toLocaleLowerCase("sk") === query) ?? null : null;
  }, [members, memberQuery]);

  // Návrhy počas písania — bez ohľadu na diakritiku, takže „cer“ nájde aj „Čermák“.
  const suggestions = useMemo(() => {
    const query = normalizeName(memberQuery);
    if (!query || pickedMember) return [];
    return members.filter((member) => normalizeName(member.label).includes(query)).slice(0, 8);
  }, [members, memberQuery, pickedMember]);

  function pickMember(label: string) {
    setMemberQuery(label);
    setPickerOpen(false);
  }

  function toggleIds(ids: string[]) {
    const everySelected = ids.every((id) => selected.includes(id));
    setSelected((current) => (everySelected ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])]));
  }

  function toggleOne(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function openEditor(row: EquipmentRow) {
    setEditing(row.id ? row : { ...row, purpose });
    setEditStatus(row.status);
    // Požičaný kus otvoríme s menom súčasného dieťaťa — uloženie bez zmeny výpožičku nechá tak.
    setMemberQuery(members.find((member) => member.id === row.borrowerId)?.label ?? row.borrower ?? "");
  }

  return (
    <>
      {canEdit && (
        <>
          <div className="list-actions">
            <span />
            <button type="button" className="secondary" onClick={() => openEditor(EMPTY)}>+ Pridať kus</button>
          </div>

          <form action={bulkEquipment} className="bulk-bar">
            {selected.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
            <label>
              <input type="checkbox" checked={allSelected} disabled={!rows.length} onChange={() => toggleIds(visibleIds)} />
              Označiť všetko
            </label>
            <span>Vybraných: {selected.length}</span>

            <select name="bulk_status" aria-label="Nový stav" defaultValue="dostupne">
              {Object.entries(EQUIPMENT_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <button type="submit" name="bulk_action" value="status" className="secondary" disabled={!selected.length}>
              Zmeniť stav
            </button>

            <select name="bulk_category" aria-label="Nová kategória" defaultValue="">
              <option value="">Bez zaradenia</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
            <button type="submit" name="bulk_action" value="category" className="secondary" disabled={!selected.length}>
              Preradiť
            </button>

            <select name="bulk_purpose" aria-label="Presunúť do skupiny" defaultValue="">
              <option value="" disabled>Presunúť do…</option>
              {Object.entries(EQUIPMENT_PURPOSE_LABELS)
                .filter(([value]) => value !== purpose)
                .map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="submit" name="bulk_action" value="purpose" className="secondary" disabled={!selected.length}>
              Presunúť
            </button>

            <button
              type="submit"
              name="bulk_action"
              value="delete"
              className="danger-button"
              disabled={!selected.length}
              onClick={(event) => {
                if (!confirm(`Naozaj vymazať ${selected.length} kusov aj s ich výpožičkami?`)) event.preventDefault();
              }}
            >
              Vymazať
            </button>
          </form>
        </>
      )}

      {editing && (
        <form key={editing.id || "new"} action={saveEquipment} className="form-card edit-panel">
          {editing.id && <input type="hidden" name="id" value={editing.id} />}
          <h2>{editing.id ? `Upraviť kus ${editing.inventoryCode}` : "Nový kus výstroja"}</h2>
          <div className="form-grid">
            <label>Inventárne číslo *<input name="inventory_code" required defaultValue={editing.inventoryCode} /></label>
            <label>Názov *<input name="name" required defaultValue={editing.name} placeholder="napr. Prilba - Rossignol" /></label>
            <label>
              Kategória
              <select name="category_id" defaultValue={editing.categoryId ?? ""}>
                <option value="">Bez zaradenia</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
              </select>
            </label>
            <label>
              Skupina
              <select name="purpose" defaultValue={editing.purpose}>
                {Object.entries(EQUIPMENT_PURPOSE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Počet kusov <span className="field-help">Pre sklad; pri jednom kuse nechaj prázdne</span>
              <input name="quantity" type="number" min={0} inputMode="numeric" defaultValue={editing.quantity ?? ""} />
            </label>
            <label>Veľkosť / dĺžka<input name="size" defaultValue={editing.size} placeholder="napr. 120 cm / 36" /></label>
            <label>
              Počet klipsov <span className="field-help">Len lyžiarky, inak nechaj prázdne</span>
              <input
                name="buckles"
                type="number"
                min={1}
                max={10}
                inputMode="numeric"
                defaultValue={editing.buckles ?? ""}
              />
            </label>
            <label>Značka<input name="brand" defaultValue={editing.brand} placeholder="napr. atomic" /></label>
            <label>Model<input name="model" defaultValue={editing.model} placeholder="napr. G9 REDSTER FIS" /></label>
            <label>Farba<input name="color" defaultValue={editing.color} placeholder="napr. červené" /></label>
            <label>
              Cena za sezónu <span className="field-help">Prázdne = podľa kategórie</span>
              <input name="season_price" inputMode="decimal" defaultValue={editing.id ? String(editing.price) : ""} />
            </label>
            <label>
              Stav opotrebenia
              <select name="condition" defaultValue={editing.condition}>
                {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              Dostupnosť
              <select name="status" value={editStatus} onChange={(event) => setEditStatus(event.target.value as EquipmentStatus)}>
                {Object.entries(EQUIPMENT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            {editStatus === "pozicane" && (
              <fieldset className="member-picker wide">
                <legend>U koho je kus požičaný</legend>
                <div className="combobox">
                  <input
                    className="picker-search"
                    role="combobox"
                    aria-expanded={pickerOpen && suggestions.length > 0}
                    aria-controls="borrower-options"
                    aria-activedescendant={pickerOpen && suggestions[activeIndex] ? `borrower-${suggestions[activeIndex].id}` : undefined}
                    value={memberQuery}
                    onChange={(event) => {
                      setMemberQuery(event.target.value);
                      setActiveIndex(0);
                      setPickerOpen(true);
                    }}
                    onFocus={() => setPickerOpen(true)}
                    onBlur={() => setPickerOpen(false)}
                    onKeyDown={(event) => {
                      if (!pickerOpen || !suggestions.length) return;
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setActiveIndex((index) => (index + 1) % suggestions.length);
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        setActiveIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
                      } else if (event.key === "Enter") {
                        // Enter vyberie meno, formulár sa neodošle.
                        event.preventDefault();
                        pickMember(suggestions[activeIndex]?.label ?? suggestions[0].label);
                      } else if (event.key === "Escape") {
                        setPickerOpen(false);
                      }
                    }}
                    placeholder="Začni písať priezvisko…"
                    aria-label="Dieťa, ktorému je kus požičaný"
                    aria-describedby="borrower-status"
                    autoComplete="off"
                  />
                  {pickerOpen && suggestions.length > 0 && (
                    <ul id="borrower-options" role="listbox" className="combobox-list">
                      {suggestions.map((member, index) => (
                        <li
                          key={member.id}
                          id={`borrower-${member.id}`}
                          role="option"
                          aria-selected={index === activeIndex}
                          // mousedown, nie click — inak blur zavrie zoznam skôr, než sa klik zaráta.
                          onMouseDown={(event) => {
                            event.preventDefault();
                            pickMember(member.label);
                          }}
                          onMouseEnter={() => setActiveIndex(index)}
                        >
                          {member.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <input type="hidden" name="borrower_child_id" value={pickedMember?.id ?? ""} />
                <span id="borrower-status" className="field-help" aria-live="polite">
                  {pickedMember ? (
                    <>✓ Požičané: <strong>{pickedMember.label}</strong></>
                  ) : !memberQuery.trim() ? (
                    "Nikto nevybratý — výpožička zostane, ako je."
                  ) : memberQuery.trim() === editing.borrower ? (
                    <>Kus zostáva u <strong>{editing.borrower}</strong>.</>
                  ) : (
                    <strong className="overdue-text">Toto meno nie je v zozname — vyber ho z ponuky, inak sa výpožička nezmení.</strong>
                  )}
                </span>
                <span className="field-help">
                  Vytvorí sa výpožička na aktuálnu sezónu s cenou podľa kusu. Pri zmene dieťaťa sa predošlá výpožička
                  uzavrie ako vrátená.
                </span>
              </fieldset>
            )}
            {editStatus !== "pozicane" && editing.borrower && (
              <p className="notice wide">
                Kus je teraz u <strong>{editing.borrower}</strong>. Uložením s iným stavom sa výpožička uzavrie ako vrátená.
              </p>
            )}

            <label className="wide">Poznámka<input name="note" defaultValue={editing.note} /></label>
          </div>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setEditing(null)}>Zrušiť</button>
            <SubmitButton label="Uložiť kus" pendingLabel="Ukladám…" />
          </div>
        </form>
      )}

      {!rows.length && <p className="empty-panel">Žiadny výstroj v tejto skupine nezodpovedá filtru.</p>}

      {groups.map(([groupName, groupRows]) => {
        const ids = groupRows.map((row) => row.id);
        const available = groupRows.filter((row) => row.status === "dostupne").length;
        const borrowed = groupRows.filter((row) => row.status === "pozicane").length;
        const pieces = groupRows.reduce((sum, row) => sum + (row.quantity ?? 1), 0);
        const groupSelected = ids.every((id) => selected.includes(id));
        const columns = groupColumns(groupName);

        return (
          <details key={groupName} className="equipment-group" open={expandAll || groups.length === 1}>
            <summary>
              <strong>{groupName}</strong>
              {isStore ? (
                <>
                  <span className="group-count">{groupRows.length} položiek</span>
                  <span className="equip-status dostupne">{pieces} ks spolu</span>
                </>
              ) : (
                <>
                  <span className="group-count">{groupRows.length} ks</span>
                  <span className="equip-status dostupne">{available} dostupných</span>
                  {borrowed > 0 && <span className="equip-status pozicane">{borrowed} požičaných</span>}
                  <span className="muted group-value">
                    {formatMoney(groupRows.reduce((sum, row) => sum + row.price, 0))} / sezóna
                  </span>
                </>
              )}
            </summary>

            <div className="table-wrap">
              <table className={`members${isStore ? " store-table" : ""}`}>
                <thead>
                  <tr>
                    {canEdit && (
                      <th>
                        <input
                          type="checkbox"
                          aria-label={`Označiť všetko v ${groupName}`}
                          checked={groupSelected}
                          onChange={() => toggleIds(ids)}
                        />
                      </th>
                    )}
                    <th>Kód</th>
                    {isStore ? (
                      <><th>Názov</th><th className="quantity-cell">Počet kusov</th><th>Stav</th></>
                    ) : (
                      <>
                        <th>Názov</th><th>Veľkosť</th>
                        {columns.buckles && <th>Klipsy</th>}
                        {columns.color && <th>Farba</th>}<th>Cena/sezóna</th><th>Opotrebenie</th><th>Stav</th><th>U koho</th>
                      </>
                    )}
                    {canEdit && <th aria-label="Akcie" />}
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((row) => {
                    const extra = equipmentExtra(row);

                    return (
                      <tr key={row.id}>
                        {canEdit && (
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Označiť ${row.inventoryCode}`}
                              checked={selected.includes(row.id)}
                              onChange={() => toggleOne(row.id)}
                            />
                          </td>
                        )}
                        <td><strong>{row.inventoryCode}</strong></td>
                        {/* Skupinu (prenájom/sklad) hovorí karta a druh nadpis — pri kuse ukážeme len podkategóriu, ak nejakú má. */}
                        <td>
                          {row.name}
                          {extra && <small className="muted"> · {extra}</small>}
                          {row.subcategory && <span className="chip neutral">{row.subcategory}</span>}
                          {row.note && <small className="muted note-line">{row.note}</small>}
                        </td>
                        {isStore ? (
                          <>
                            <td className="quantity-cell"><strong>{row.quantity ?? "—"}</strong></td>
                            <td><span className={`equip-status ${row.status}`}>{EQUIPMENT_STATUS_LABELS[row.status]}</span></td>
                          </>
                        ) : (
                          <>
                            <td>{row.size || "—"}</td>
                            {columns.buckles && <td>{row.buckles ?? ""}</td>}
                            {columns.color && <td>{row.color || "—"}</td>}
                            <td>{formatMoney(row.price)}</td>
                            <td>{CONDITION_LABELS[row.condition]}</td>
                            <td><span className={`equip-status ${row.status}`}>{EQUIPMENT_STATUS_LABELS[row.status]}</span></td>
                            <td>{row.borrower ?? "—"}</td>
                          </>
                        )}
                        {canEdit && (
                          <td>
                            <button type="button" className="icon-button" onClick={() => openEditor(row)} aria-label={`Upraviť ${row.inventoryCode}`}>✎</button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </>
  );
}
