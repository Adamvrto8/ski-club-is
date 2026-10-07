"use client";

import { useMemo, useState } from "react";
import { createConfirmations } from "@/app/potvrdenia/actions";
import { SubmitButton } from "./submit-button";
import { MONTH_NAMES, formatDateDotted, formatMoney } from "@/lib/domain";
import type { Child } from "@/lib/data/types";

/** Hromadné vystavenie: rovnaké obdobie, druh výdavku a suma pre všetky označené deti. */
export function ConfirmationForm({ members, expenseTypes }: { members: Child[]; expenseTypes: string[] }) {
  const [selected, setSelected] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"one_time" | "monthly">("one_time");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  // Rozpis po mesiacoch — reálna predloha klubu ho pri mesačnom režime vyžaduje.
  const [monthly, setMonthly] = useState<Record<string, string>>({});
  const monthlyTotal = useMemo(
    () => MONTH_NAMES.reduce((sum, month) => sum + (Number(monthly[month]?.replace(",", ".")) || 0), 0),
    [monthly],
  );

  const visible = members.filter((child) =>
    `${child.last_name} ${child.first_name}`.toLocaleLowerCase("sk").includes(search.toLocaleLowerCase("sk")),
  );

  function toggle(id: string) {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <form action={createConfirmations} className="form-card">
      <h2>Vystaviť potvrdenie</h2>

      <div className="form-grid">
        <label>
          Režim *
          <select name="mode" value={mode} onChange={(event) => setMode(event.target.value === "monthly" ? "monthly" : "one_time")}>
            <option value="one_time">Jednorazová platba</option>
            <option value="monthly">Mesačné platby</option>
          </select>
        </label>
        <fieldset className="date-range">
          <legend>Obdobie *</legend>
          <label>Od<input type="date" required value={periodFrom} max={periodTo || undefined} onChange={(event) => setPeriodFrom(event.target.value)} /></label>
          <label>Do<input type="date" required value={periodTo} min={periodFrom || undefined} onChange={(event) => setPeriodTo(event.target.value)} /></label>
          <input type="hidden" name="period" value={periodFrom && periodTo ? `${formatDateDotted(periodFrom)} – ${formatDateDotted(periodTo)}` : ""} />
        </fieldset>
        <label>
          Druh výdavku *
          <input name="expense_type" required list="expense-types" placeholder="napr. Členské na rok 2026" />
          <datalist id="expense-types">
            {expenseTypes.map((type) => <option key={type} value={type} />)}
          </datalist>
        </label>
        <label>
          Vystavuje sa na žiadosť *
          <input name="requested_by" required placeholder="napr. Mgr. Jana Nováková" />
        </label>
        {mode === "one_time" && <label>Suma *<input name="amount" required inputMode="decimal" placeholder="250,00" /></label>}
      </div>

      {mode === "monthly" && (
        <fieldset className="member-picker">
          <legend>Rozpis po mesiacoch — spolu {formatMoney(monthlyTotal)}</legend>
          <div className="form-grid">
            {MONTH_NAMES.map((month) => (
              <label key={month}>
                {month}
                <input
                  name={`month_${month}`}
                  inputMode="decimal"
                  placeholder="0"
                  value={monthly[month] ?? ""}
                  onChange={(event) => setMonthly((current) => ({ ...current, [month]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <p className="muted">Mesiac s prázdnou alebo nulovou sumou sa na potvrdení nezobrazí.</p>
        </fieldset>
      )}

      <fieldset className="member-picker">
        <legend>Deti ({selected.length} označených)</legend>
        <input
          className="picker-search"
          placeholder="Hľadať dieťa"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Hľadať dieťa"
        />
        <div className="picker-actions">
          <button type="button" className="secondary" onClick={() => setSelected(visible.map((child) => child.id))}>
            Označiť zobrazené
          </button>
          <button type="button" className="secondary" onClick={() => setSelected([])}>Zrušiť výber</button>
        </div>
        <div className="picker-list">
          {visible.map((child) => (
            <label key={child.id} className="check">
              <input type="checkbox" checked={selected.includes(child.id)} onChange={() => toggle(child.id)} />
              {child.last_name} {child.first_name} · VS {child.variable_symbol}
            </label>
          ))}
          {!visible.length && <p className="muted">Žiadne dieťa nezodpovedá hľadaniu.</p>}
        </div>
      </fieldset>

      {selected.map((id) => <input key={id} type="hidden" name="child_ids" value={id} />)}

      <div className="form-actions">
        <SubmitButton
          label={selected.length > 1 ? `Vystaviť ${selected.length} potvrdení` : "Vystaviť potvrdenie"}
          pendingLabel="Vytváram…"
          onClick={(event) => {
            if (!selected.length) {
              event.preventDefault();
              alert("Označ aspoň jedno dieťa.");
            }
          }}
        />
      </div>
    </form>
  );
}
