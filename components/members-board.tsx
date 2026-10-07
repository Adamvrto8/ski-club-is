"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { bulkMembers } from "@/app/clenovia/actions";
import { TEAM_LABELS, archiveWarning, deleteWarning, formatDate, type Team } from "@/lib/domain";

export type MemberRow = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  team: Team;
  variable_symbol: number;
  is_sport_registered: boolean;
};

export function MembersBoard({
  members,
  archive,
  canEdit,
  unpaidChildIds,
  blockers,
}: {
  members: MemberRow[];
  /** Zobrazený je archív (neaktívni) — namiesto archivácie sa ponúka obnovenie. */
  archive: boolean;
  canEdit: boolean;
  unpaidChildIds: string[];
  /** id dieťaťa → čo má nevyriešené (nevrátená výstroj, nezaplatené požičovné, neuhradená platba). */
  blockers: Record<string, string[]>;
}) {
  const [picked, setSelected] = useState<string[]>([]);
  const unpaid = useMemo(() => new Set(unpaidChildIds), [unpaidChildIds]);
  const visibleIds = useMemo(() => members.map((member) => member.id), [members]);
  // Po archivácii či vymazaní zostane stav označenia — skrytý člen nesmie ísť do ďalšej hromadnej akcie.
  const selected = picked.filter((id) => visibleIds.includes(id));
  const allSelected = members.length > 0 && visibleIds.every((id) => selected.includes(id));
  const columnCount = canEdit ? 8 : 6;

  function toggleAll() {
    setSelected(allSelected ? [] : visibleIds);
  }

  function toggleOne(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <>
      {canEdit && (
        <form action={bulkMembers} className="bulk-bar">
          {selected.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
          <label>
            <input type="checkbox" checked={allSelected} disabled={members.length === 0} onChange={toggleAll} />
            Označiť všetko
          </label>
          <span>Vybraných: {selected.length}</span>
          <select name="bulk_team" aria-label="Cieľové družstvo" defaultValue="skola_lyzovania">
            {Object.entries(TEAM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <button type="submit" name="bulk_action" value="move_team" className="secondary" disabled={!selected.length}>
            Presunúť do družstva
          </button>
          {archive ? (
            <button type="submit" name="bulk_action" value="activate" className="secondary" disabled={!selected.length}>
              Obnoviť z archívu
            </button>
          ) : (
            <button
              type="submit"
              name="bulk_action"
              value="deactivate"
              className="secondary"
              disabled={!selected.length}
              onClick={(event) => {
                if (!confirm(archiveWarning(selected, members, blockers))) {
                  event.preventDefault();
                }
              }}
            >
              Archivovať
            </button>
          )}
          <button
            type="submit"
            name="bulk_action"
            value="delete"
            className="danger-button"
            disabled={!selected.length}
            onClick={(event) => {
              if (!confirm(deleteWarning(selected, members, blockers))) {
                event.preventDefault();
              }
            }}
          >
            Vymazať
          </button>
        </form>
      )}

      <div className="table-wrap">
        <table className="members">
          <thead>
            <tr>
              {canEdit && (
                <th>
                  <input type="checkbox" aria-label="Označiť všetko" checked={allSelected} disabled={!members.length} onChange={toggleAll} />
                </th>
              )}
              <th>#</th>
              <th>Meno</th>
              <th>Dátum narodenia</th>
              <th>Družstvo</th>
              <th>VS</th>
              <th>IS šport</th>
              {canEdit && <th aria-label="Akcie" />}
            </tr>
          </thead>
          <tbody>
            {members.map((child, index) => (
              <tr key={child.id}>
                {canEdit && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Označiť ${child.first_name} ${child.last_name}`}
                      checked={selected.includes(child.id)}
                      onChange={() => toggleOne(child.id)}
                    />
                  </td>
                )}
                <td className="muted">{index + 1}</td>
                <td>
                  <strong>{child.last_name}</strong> {child.first_name}
                  {unpaid.has(child.id) && <span className="chip warn" title="Má neuhradenú platbu">dlžoba</span>}
                </td>
                <td>{formatDate(child.birth_date)}</td>
                <td><span className={`team team-${child.team}`}>{TEAM_LABELS[child.team]}</span></td>
                <td>{child.variable_symbol}</td>
                <td className={child.is_sport_registered ? "ok" : "no"}>{child.is_sport_registered ? "✓" : "✕"}</td>
                {canEdit && (
                  <td>
                    <Link className="icon-button" href={`/clenovia/${child.id}`} aria-label={`Upraviť ${child.last_name}`}>✎</Link>
                  </td>
                )}
              </tr>
            ))}
            {!members.length && (
              <tr>
                <td className="empty-cell" colSpan={columnCount}>
                  {archive
                    ? "V archíve nie je nikto, kto zodpovedá filtru."
                    : "Žiadni členovia nezodpovedajú filtru. Pridaj ich ručne alebo importom z Excelu."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
