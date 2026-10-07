"use client";

import { useState } from "react";
import { markAttendance } from "@/app/dochadzka/actions";
import { SubmitButton } from "./submit-button";
import { TEAM_LABELS, formatDate, today, type Team } from "@/lib/domain";

type RosterEntry = { id: string; name: string; team: Team };

export function AttendanceSheet({
  roster,
  days,
  marks,
  stats,
  month,
  teamParam,
}: {
  roster: RosterEntry[];
  days: string[];
  marks: Record<string, boolean>;
  stats: { id: string; present: number; recorded: number }[];
  month: string;
  teamParam: string;
}) {
  const [entryOpen, setEntryOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(today());
  const [present, setPresent] = useState<string[]>([]);

  const statById = new Map(stats.map((row) => [row.id, row]));
  const backUrl = `/dochadzka?month=${month}&team=${teamParam}`;

  function toggle(id: string) {
    setPresent((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  /** Predvyplní zápis podľa už uloženej dochádzky na daný deň. */
  function openEntry() {
    const alreadyPresent = roster.filter((child) => marks[`${child.id}|${entryDate}`] === true).map((c) => c.id);
    setPresent(alreadyPresent);
    setEntryOpen(true);
  }

  return (
    <>
      <div className="list-actions">
        <p className="muted">Detí v zozname: {roster.length}</p>
        {!entryOpen && (
          <button type="button" className="secondary" onClick={openEntry} disabled={!roster.length}>
            Zapísať tréning ručne
          </button>
        )}
      </div>

      {entryOpen && (
        <form action={markAttendance} className="form-card edit-panel">
          <input type="hidden" name="back" value={backUrl} />
          <h2>Zápis tréningu</h2>
          <div className="form-grid">
            <label>
              Dátum tréningu *
              <input
                type="date"
                name="date"
                required
                value={entryDate}
                onChange={(event) => {
                  setEntryDate(event.target.value);
                  setPresent(roster.filter((c) => marks[`${c.id}|${event.target.value}`] === true).map((c) => c.id));
                }}
              />
            </label>
            <div className="check">
              <button type="button" className="secondary" onClick={() => setPresent(roster.map((c) => c.id))}>
                Označiť všetkých
              </button>
              <button type="button" className="secondary" onClick={() => setPresent([])}>Zrušiť výber</button>
            </div>
          </div>

          <fieldset className="member-picker">
            <legend>Prítomní ({present.length} z {roster.length})</legend>
            <div className="picker-list">
              {roster.map((child) => (
                <label key={child.id} className="check">
                  <input type="checkbox" checked={present.includes(child.id)} onChange={() => toggle(child.id)} />
                  {child.name}
                  <span className={`team team-${child.team}`}>{TEAM_LABELS[child.team]}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {roster.map((child) => <input key={child.id} type="hidden" name="child_ids" value={child.id} />)}
          {present.map((id) => <input key={id} type="hidden" name="present" value={id} />)}

          <div className="form-actions">
            <button type="button" className="secondary" onClick={() => setEntryOpen(false)}>Zrušiť</button>
            <SubmitButton label="Uložiť dochádzku" pendingLabel="Ukladám…" />
          </div>
        </form>
      )}

      {days.length > 0 && (
        <div className="table-wrap">
          <table className="members attendance-table">
            <thead>
              <tr>
                <th>Dieťa</th>
                {days.map((date) => (
                  <th key={date} className="day-column" title={formatDate(date)}>
                    {Number(date.slice(8, 10))}.
                  </th>
                ))}
                <th>Účasť</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((child) => {
                const stat = statById.get(child.id);
                return (
                  <tr key={child.id}>
                    <td className="sticky-name">{child.name}</td>
                    {days.map((date) => {
                      const mark = marks[`${child.id}|${date}`];
                      return (
                        <td key={date} className="day-column">
                          {mark === true ? <span className="ok">✓</span>
                            : mark === false ? <span className="no">✕</span>
                            : <span className="muted">–</span>}
                        </td>
                      );
                    })}
                    <td>
                      {stat?.present ?? 0} / {stat?.recorded ?? 0}
                    </td>
                  </tr>
                );
              })}
              {!roster.length && (
                <tr><td className="empty-cell" colSpan={days.length + 2}>Žiadne deti v tomto družstve.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
