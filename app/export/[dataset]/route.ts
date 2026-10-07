import { getSession } from "@/lib/data";
import { csvResponse, toCsv } from "@/lib/csv";
import { TEAM_LABELS } from "@/lib/domain";
import { CONDITION_LABELS, EQUIPMENT_PURPOSE_LABELS, EQUIPMENT_STATUS_LABELS, categoryPath, seasonPrice } from "@/lib/equipment";
import { buildPaymentRows, type PaymentQuery } from "@/lib/payment-rows";

const STATUS_LABELS: Record<string, string> = {
  paid: "Zaplatené",
  unpaid: "Nezaplatené",
  overdue: "Po splatnosti",
};

/** Export do CSV pre Excel. Citlivé polia dostane len admin — u trénera ich repo nevráti. */
export async function GET(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const { dataset } = await params;
  const { repo, role } = await getSession();
  const query = Object.fromEntries(new URL(request.url).searchParams) as PaymentQuery;
  const stamp = new Date().toISOString().slice(0, 10);

  if (dataset === "clenovia") {
    const children = await repo.listChildren();
    const headers = [
      "Priezvisko", "Meno", "Dátum narodenia", "Družstvo", "VS", "Aktívny",
      "IS šport", "Dátum registrácie IS", "Identifikátor IS", "V klube od",
    ];
    if (role === "admin") headers.push("Rodné číslo", "Trvalé bydlisko");

    const rows = children.map((child) => {
      const base: (string | number)[] = [
        child.last_name, child.first_name, child.birth_date, TEAM_LABELS[child.team], child.variable_symbol,
        child.active ? "áno" : "nie", child.is_sport_registered ? "áno" : "nie",
        child.sport_registered_at ?? "", child.sport_identifier ?? "", child.membership_date,
      ];
      if (role === "admin") base.push(child.national_id ?? "", child.permanent_address ?? "");
      return base;
    });
    return csvResponse(`ski-club-clenovia-${stamp}.csv`, toCsv(headers, rows));
  }

  if (dataset === "kontakty") {
    const [children, contacts] = await Promise.all([repo.listChildren(), repo.listContacts()]);
    const byChild = new Map(contacts.map((contact) => [contact.child_id, contact]));
    const rows = children.map((child) => {
      const contact = byChild.get(child.id);
      return [
        child.last_name, child.first_name, TEAM_LABELS[child.team], child.birth_date,
        contact?.father_name ?? "", contact?.father_phone ?? "",
        contact?.mother_name ?? "", contact?.mother_phone ?? "",
        contact?.address ?? "", contact?.emails.join(", ") ?? "",
      ];
    });
    /*
     * Poradie kopíruje hárok klubu, len meno ostáva rozdelené na dva stĺpce
     * a telefóny majú rozlišujúci názov — inak by sa export nedal znova naimportovať.
     */
    const headers = [
      "Priezvisko", "Meno", "Družstvo", "Narodený",
      "Otec - meno", "Telefón otec", "Mama - meno", "Telefón mama",
      "Adresa", "E-mail na oznamy",
    ];
    return csvResponse(`ski-club-kontakty-${stamp}.csv`, toCsv(headers, rows));
  }

  if (dataset === "platby") {
    const [children, payments, categories] = await Promise.all([
      repo.listChildren(),
      repo.listPayments(),
      repo.listCategories(),
    ]);
    const rows = buildPaymentRows(payments, children, categories, query).map((row) => [
      row.childName, row.variableSymbol, row.category, row.period,
      row.amount.toFixed(2).replace(".", ","), row.dueDate,
      STATUS_LABELS[row.status] ?? row.status, row.paidAt ?? "", row.note,
    ]);
    const headers = ["Meno", "VS", "Kategória", "Obdobie", "Suma", "Splatnosť", "Stav", "Zaplatené dňa", "Poznámka"];
    return csvResponse(`ski-club-platby-${stamp}.csv`, toCsv(headers, rows));
  }

  if (dataset === "vystroj") {
    const [equipment, categories, loans, children] = await Promise.all([
      repo.listEquipment(),
      repo.listEquipmentCategories(),
      repo.listLoans(),
      repo.listChildren(),
    ]);
    const borrower = new Map<string, string>();
    for (const loan of loans.filter((entry) => !entry.returned)) {
      const child = children.find((entry) => entry.id === loan.child_id);
      if (child) borrower.set(loan.equipment_id, `${child.last_name} ${child.first_name}`);
    }
    const rows = equipment.map((item) => [
      item.inventory_code, EQUIPMENT_PURPOSE_LABELS[item.purpose ?? "prenajom"], categoryPath(item.category_id, categories),
      item.name, item.quantity ?? "", item.size, item.buckles ?? "", item.color, item.brand, item.model,
      seasonPrice(item, categories).toFixed(2).replace(".", ","),
      CONDITION_LABELS[item.condition], EQUIPMENT_STATUS_LABELS[item.status],
      borrower.get(item.id) ?? "", item.note,
    ]);
    const headers = [
      "Inventárne číslo", "Skupina", "Kategória", "Názov", "Počet kusov", "Veľkosť", "Počet klipsov", "Farba", "Značka", "Model",
      "Cena/sezóna", "Opotrebenie", "Stav", "U koho", "Poznámka",
    ];
    return csvResponse(`ski-club-vystroj-${stamp}.csv`, toCsv(headers, rows));
  }

  if (dataset === "vypozicky") {
    const [equipment, categories, loans, children] = await Promise.all([
      repo.listEquipment(),
      repo.listEquipmentCategories(),
      repo.listLoans(),
      repo.listChildren(),
    ]);
    const itemById = new Map(equipment.map((item) => [item.id, item]));
    const childById = new Map(children.map((child) => [child.id, child]));
    const rows = loans.map((loan) => {
      const item = itemById.get(loan.equipment_id);
      const child = childById.get(loan.child_id);
      return [
        item?.inventory_code ?? "", item?.name ?? "",
        item ? categoryPath(item.category_id, categories) : "",
        child ? `${child.last_name} ${child.first_name}` : "",
        loan.borrowed_on, loan.returned_on ?? "",
        loan.price.toFixed(2).replace(".", ","),
        loan.paid ? "áno" : "nie", loan.returned ? "áno" : "nie", loan.note,
      ];
    });
    const headers = ["Inventárne číslo", "Názov", "Kategória", "Dieťa", "Požičané", "Vrátené", "Cena", "Zaplatené", "Vrátené?", "Poznámka"];
    return csvResponse(`ski-club-vypozicky-${stamp}.csv`, toCsv(headers, rows));
  }

  return new Response("Neznámy export.", { status: 404 });
}
