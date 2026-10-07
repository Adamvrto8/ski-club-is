import type { Child, Payment, PaymentCategory } from "./data/types";
import { isTeam, paymentStatus, type PaymentState, type Team } from "./domain";

export type PaymentQuery = { q?: string; team?: string; status?: string; category?: string };

export type PaymentRow = {
  id: string;
  childId: string;
  childName: string;
  variableSymbol: number;
  team: Team | null;
  category: string;
  period: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt: string | null;
  note: string;
  status: PaymentState;
};

/** Jedno miesto pre filtrovanie platieb — používa ho zoznam, CSV export aj tlačový zoznam. */
export function buildPaymentRows(
  payments: Payment[],
  children: Child[],
  categories: PaymentCategory[],
  query: PaymentQuery = {},
): PaymentRow[] {
  const childById = new Map(children.map((child) => [child.id, child]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const search = query.q?.trim().toLocaleLowerCase("sk") ?? "";

  return payments
    .map((payment): PaymentRow => {
      const child = childById.get(payment.child_id);
      return {
        id: payment.id,
        childId: payment.child_id,
        childName: child ? `${child.last_name} ${child.first_name}` : "Neznámy člen",
        variableSymbol: child?.variable_symbol ?? 0,
        team: child?.team ?? null,
        category: categoryById.get(payment.category_id)?.name ?? "—",
        period: payment.period,
        amount: payment.amount,
        dueDate: payment.due_date,
        paid: payment.paid,
        paidAt: payment.paid_at,
        note: payment.note,
        status: paymentStatus(payment.paid, payment.due_date).style,
      };
    })
    .filter((row) => {
      if (search && !`${row.childName} ${row.variableSymbol}`.toLocaleLowerCase("sk").includes(search)) return false;
      if (query.team && isTeam(query.team) && row.team !== query.team) return false;
      if (query.category && row.category !== query.category) return false;
      if (query.status && query.status !== row.status) return false;
      return true;
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.childName.localeCompare(b.childName, "sk"));
}
