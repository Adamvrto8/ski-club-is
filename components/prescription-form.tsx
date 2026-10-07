"use client";

import Link from "next/link";
import { useState } from "react";
import { createPrescription } from "@/app/platby/actions";
import { TEAM_LABELS, formatMoney, today } from "@/lib/domain";
import type { Child, PaymentCategory } from "@/lib/data/types";

/**
 * Predpis platieb. Príjemcov možno vybrať buď celým družstvom, alebo ručne
 * jednotlivými deťmi — pri ručnom výbere má prednosť zoznam detí.
 */
export function PrescriptionForm({ categories, members }: { categories: PaymentCategory[]; members: Child[] }) {
  const [mode, setMode] = useState<"one_time" | "monthly">("one_time");
  const [pickMembers, setPickMembers] = useState(false);
  const [amount, setAmount] = useState("");
  const [open, setOpen] = useState(false);

  if (!categories.length) {
    return (
      <section className="form-card">
        <h2>Predpísať platbu</h2>
        <p className="muted">
          Najprv si v <Link className="text-link" href="/nastavenia">Nastaveniach</Link> vytvor aspoň jednu kategóriu platby
          (napr. „Mesačný členský príspevok“).
        </p>
      </section>
    );
  }

  return (
    <section className="form-card">
      <div className="section-heading">
        <div>
          <h2>Predpísať platbu</h2>
          <p className="muted">Pre každé vybrané dieťa vznikne samostatná platba s jeho variabilným symbolom.</p>
        </div>
        <button type="button" className="secondary" onClick={() => setOpen((value) => !value)}>
          {open ? "Skryť" : "Otvoriť"}
        </button>
      </div>

      {open && (
        <form action={createPrescription} className="form-grid">
          <label>
            Kategória platby *
            <select
              name="category_id"
              required
              defaultValue=""
              onChange={(event) => {
                const category = categories.find((item) => item.id === event.target.value);
                if (category && !amount) setAmount(String(category.base_amount));
              }}
            >
              <option disabled value="">Vyberte kategóriu</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} · {formatMoney(category.base_amount)}
                </option>
              ))}
            </select>
          </label>

          <label>
            Suma na dieťa *
            <input
              name="amount"
              required
              inputMode="decimal"
              placeholder="45,00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>

          <label>
            Typ predpisu
            <select name="mode" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}>
              <option value="one_time">Jednorazová platba</option>
              <option value="monthly">Mesačné platby</option>
            </select>
          </label>

          {mode === "one_time" ? (
            <>
              <label>Splatnosť *<input name="due_date" type="date" required defaultValue={today()} /></label>
              <label className="wide">Obdobie<input name="period" placeholder="napr. Sezóna 2026/27" /></label>
            </>
          ) : (
            <>
              <label>Prvý mesiac *<input name="start_month" type="month" required defaultValue={today().slice(0, 7)} /></label>
              <label>Počet mesiacov *<input name="months" type="number" min={1} max={12} defaultValue={10} required /></label>
              <label>Deň splatnosti v mesiaci<input name="due_day" type="number" min={1} max={31} defaultValue={15} /></label>
            </>
          )}

          <label className="check wide">
            <input type="checkbox" checked={pickMembers} onChange={(event) => setPickMembers(event.target.checked)} />
            Vybrať konkrétne deti namiesto celého družstva
          </label>

          {pickMembers ? (
            <fieldset className="wide member-picker">
              <legend>Deti</legend>
              {members.map((child) => (
                <label key={child.id} className="check">
                  <input type="checkbox" name="child_ids" value={child.id} />
                  {child.last_name} {child.first_name} · VS {child.variable_symbol}
                </label>
              ))}
            </fieldset>
          ) : (
            <label>
              Družstvo
              <select name="team" defaultValue="">
                <option value="">Všetky družstvá</option>
                {Object.entries(TEAM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          )}

          <label className="check wide">
            <input type="checkbox" name="apply_tax_discount" />
            Odpočítať 50 % z priradených 2 % dane
          </label>

          <label className="wide">Poznámka<input name="note" placeholder="Zobrazí sa pri platbe" /></label>

          <div className="wide form-actions">
            <button type="submit">Vytvoriť predpis</button>
          </div>
        </form>
      )}
    </section>
  );
}
