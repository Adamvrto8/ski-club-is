import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AttendanceSheet } from "@/components/attendance-sheet";
import { Notices } from "@/components/notices";
import { SubmitButton } from "@/components/submit-button";
import { getSession } from "@/lib/data";
import { TEAM_LABELS, isTeam, monthLabel, sortByName, today } from "@/lib/domain";
import { importAttendance } from "./actions";

type Query = { team?: string; month?: string; child?: string; success?: string; error?: string };

export const dynamic = "force-dynamic";

export default async function AttendancePage({ searchParams }: { searchParams: Promise<Query> }) {
  const params = await searchParams;
  const { repo, role, demo } = await getSession();

  const [children, attendance] = await Promise.all([repo.listChildren(), repo.listAttendance()]);

  const month = params.month || today().slice(0, 7);
  const team = params.team && isTeam(params.team) ? params.team : null;

  const inMonth = attendance.filter((entry) => entry.date.startsWith(month));
  const days = [...new Set(inMonth.map((entry) => entry.date))].sort();

  const roster = sortByName(children.filter((child) => (team ? child.team === team : true) && child.active));

  const byChildDate = new Map(inMonth.map((entry) => [`${entry.child_id}|${entry.date}`, entry.present]));

  const stats = roster.map((child) => {
    const present = days.filter((date) => byChildDate.get(`${child.id}|${date}`) === true).length;
    const recorded = days.filter((date) => byChildDate.has(`${child.id}|${date}`)).length;
    return { child, present, recorded };
  });

  const totalPresent = stats.reduce((sum, row) => sum + row.present, 0);
  const totalRecorded = stats.reduce((sum, row) => sum + row.recorded, 0);
  const rate = totalRecorded ? Math.round((totalPresent / totalRecorded) * 100) : 0;

  const [yearPart, monthPart] = month.split("-").map(Number);

  return (
    <AppShell active="/dochadzka" role={role} demo={demo}>
      <header className="page-header">
        <div>
          <p className="eyebrow">KLUB · DOCHÁDZKA</p>
          <h1>Dochádzka</h1>
          <p className="muted">
            {monthLabel(yearPart, monthPart)} · {days.length} tréningových dní
            {totalRecorded > 0 && <> · účasť {rate} %</>}
          </p>
        </div>
      </header>

      <Notices success={params.success} error={params.error} />

      <form className="toolbar" action="/dochadzka">
        <input type="month" name="month" defaultValue={month} aria-label="Mesiac" />
        <select name="team" defaultValue={params.team ?? ""} aria-label="Družstvo">
          <option value="">Všetky družstvá</option>
          {Object.entries(TEAM_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button type="submit">Zobraziť</button>
        <Link className="text-link" href="/dochadzka">Zrušiť filtre</Link>
      </form>

      <AttendanceSheet
        roster={roster.map((child) => ({ id: child.id, name: `${child.last_name} ${child.first_name}`, team: child.team }))}
        days={days}
        marks={Object.fromEntries(byChildDate)}
        stats={stats.map((row) => ({ id: row.child.id, present: row.present, recorded: row.recorded }))}
        month={month}
        teamParam={params.team ?? ""}
      />

      <section className="form-card">
        <h2>Import hárku z Google Sheets</h2>
        <p className="muted">
          Exportuj hárok ako .xlsx alebo .csv a nahraj ho sem. Stĺpce musia byť dni tréningov, bunky TRUE/FALSE.
          Mená spárujeme s členmi automaticky, nespárované ti vypíšeme. Opakovaný import ten istý deň len prepíše,
          duplikáty nevzniknú.
        </p>
        <form action={importAttendance}>
          <div className="form-grid">
            <label className="wide">
              Hárky s dochádzkou *
              <input type="file" name="files" accept=".xlsx,.csv,.txt" multiple required />
              <span className="field-help">Naraz môžeš nahrať viac mesiacov alebo viac družstiev.</span>
            </label>
          </div>
          <div className="form-actions">
            <SubmitButton label="Importovať dochádzku" pendingLabel="Spracúvam hárok…" />
          </div>
        </form>
      </section>

      {days.length === 0 && (
        <p className="muted">
          Za tento mesiac zatiaľ nie je zapísaná žiadna dochádzka. Nahraj hárok vyššie alebo zapíš tréning ručne.
        </p>
      )}
    </AppShell>
  );
}
