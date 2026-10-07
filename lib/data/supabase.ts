/**
 * Produkčné úložisko. Zápisy aj čítanie citlivých polí dodatočne stráži RLS v databáze —
 * `canEdit` tu slúži len na to, aby UI neponúkalo akcie, ktoré by databáza aj tak odmietla.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Attendance,
  AttendanceInput,
  BankTransaction,
  BankTransactionInput,
  BulkChildAction,
  BulkEquipmentAction,
  Child,
  ChildInput,
  ClubEvent,
  ClubEventInput,
  EventParticipant,
  EventParticipantInput,
  PushSubscriptionInput,
  PushSubscriptionRecord,
  TaxDonation,
  TaxDonationInput,
  Equipment,
  EquipmentCategory,
  EquipmentInput,
  Loan,
  LoanInput,
  ClubSettings,
  Confirmation,
  ConfirmationInput,
  Contact,
  ContactInput,
  ImportLog,
  Payment,
  PaymentCategory,
  PaymentInput,
  PendingImport,
  Repo,
  Season,
} from "./types";

type PrivateDetails = { national_id: string | null; permanent_address: string | null };
type ChildRow = Omit<Child, "national_id" | "permanent_address"> & {
  child_private_details: PrivateDetails | PrivateDetails[] | null;
};
type ContactRow = Omit<Contact, "address"> & {
  contact_private_details: { address: string | null } | { address: string | null }[] | null;
};

/** Supabase vracia embedded vzťah raz ako objekt, raz ako pole — podľa odvodenej kardinality. */
function one<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function fail(context: string, error: { message: string } | null) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

const CHILD_SELECT = "*, child_private_details(national_id, permanent_address)";
const CONTACT_SELECT = "*, contact_private_details(address)";

export class SupabaseRepo implements Repo {
  readonly mode = "supabase" as const;

  constructor(
    private readonly db: SupabaseClient,
    readonly canEdit: boolean,
    private readonly userId: string,
  ) {}

  private toChild(row: ChildRow): Child {
    const priv = one(row.child_private_details);
    const { child_private_details: _ignored, ...rest } = row;
    return { ...rest, national_id: priv?.national_id ?? null, permanent_address: priv?.permanent_address ?? null };
  }

  async currentSeason(): Promise<Season> {
    const { data } = await this.db
      .from("seasons")
      .select("id, name, starts_on, ends_on, is_current")
      .eq("is_current", true)
      .maybeSingle();
    if (data) return data;

    // Bez aktuálnej sezóny by sa nedali zakladať platby — admin ju založí podľa školského roka.
    const year = new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const season = {
      name: `Sezóna ${year}/${year + 1}`,
      starts_on: `${year}-09-01`,
      ends_on: `${year + 1}-08-31`,
      is_current: true,
    };
    if (!this.canEdit) return { id: "", ...season };

    const { data: created, error } = await this.db
      .from("seasons")
      .insert(season)
      .select("id, name, starts_on, ends_on, is_current")
      .single();
    fail("Nepodarilo sa založiť sezónu", error);
    return created!;
  }

  async listChildren(): Promise<Child[]> {
    const { data, error } = await this.db
      .from("children")
      .select(CHILD_SELECT)
      .order("last_name")
      .order("first_name");
    fail("Načítanie členov zlyhalo", error);
    return ((data ?? []) as ChildRow[]).map((row) => this.toChild(row));
  }

  async getChild(id: string): Promise<Child | null> {
    const { data, error } = await this.db.from("children").select(CHILD_SELECT).eq("id", id).maybeSingle();
    fail("Načítanie člena zlyhalo", error);
    return data ? this.toChild(data as ChildRow) : null;
  }

  async createChild(input: ChildInput): Promise<Child> {
    const { national_id, permanent_address, ...core } = input;
    const { data, error } = await this.db.from("children").insert(core).select(CHILD_SELECT).single();
    fail("Člena sa nepodarilo uložiť", error);
    const child = this.toChild(data as ChildRow);
    await this.savePrivateDetails(child.id, national_id, permanent_address);
    return { ...child, national_id, permanent_address };
  }

  private async savePrivateDetails(childId: string, nationalId: string | null, address: string | null) {
    if (!nationalId && !address) return;
    const { error } = await this.db
      .from("child_private_details")
      .upsert({ child_id: childId, national_id: nationalId, permanent_address: address }, { onConflict: "child_id" });
    fail("Citlivé údaje sa nepodarilo uložiť", error);
  }

  async updateChild(id: string, input: ChildInput) {
    const { national_id, permanent_address, ...core } = input;
    const { error } = await this.db
      .from("children")
      .update({ ...core, updated_at: new Date().toISOString() })
      .eq("id", id);
    fail("Zmeny sa nepodarilo uložiť", error);
    await this.savePrivateDetails(id, national_id, permanent_address);
  }

  async bulkChildren(ids: string[], action: BulkChildAction) {
    if (!ids.length) return 0;
    if (action.type === "delete") {
      const { error, count } = await this.db.from("children").delete({ count: "exact" }).in("id", ids);
      fail("Hromadné vymazanie zlyhalo", error);
      return count ?? 0;
    }
    const patch =
      action.type === "move_team"
        ? { team: action.team }
        : { active: action.type === "activate" };
    const { error, count } = await this.db
      .from("children")
      .update({ ...patch, updated_at: new Date().toISOString() }, { count: "exact" })
      .in("id", ids);
    fail("Hromadná akcia zlyhala", error);
    return count ?? 0;
  }

  async listContacts(): Promise<Contact[]> {
    const { data, error } = await this.db.from("contacts").select(CONTACT_SELECT);
    fail("Načítanie kontaktov zlyhalo", error);
    return ((data ?? []) as ContactRow[]).map((row) => {
      const { contact_private_details: _ignored, ...rest } = row;
      return { ...rest, address: one(row.contact_private_details)?.address ?? null };
    });
  }

  async saveContact(childId: string, input: ContactInput) {
    const { address, ...core } = input;
    const { data, error } = await this.db
      .from("contacts")
      .upsert({ child_id: childId, ...core }, { onConflict: "child_id" })
      .select("id")
      .single();
    fail("Kontakt sa nepodarilo uložiť", error);
    if (address) {
      const { error: addressError } = await this.db
        .from("contact_private_details")
        .upsert({ contact_id: data!.id, address }, { onConflict: "contact_id" });
      fail("Adresu kontaktu sa nepodarilo uložiť", addressError);
    }
  }

  async listCategories(): Promise<PaymentCategory[]> {
    const { data, error } = await this.db
      .from("payment_categories")
      .select("id, name, base_amount, eligible_for_confirmation")
      .order("name");
    fail("Načítanie kategórií zlyhalo", error);
    return (data ?? []) as PaymentCategory[];
  }

  async saveCategory(input: Omit<PaymentCategory, "id"> & { id?: string }) {
    const row = {
      name: input.name,
      base_amount: input.base_amount,
      eligible_for_confirmation: input.eligible_for_confirmation,
    };
    const { error } = input.id
      ? await this.db.from("payment_categories").update(row).eq("id", input.id)
      : await this.db.from("payment_categories").insert(row);
    fail("Kategóriu sa nepodarilo uložiť", error);
  }

  async deleteCategory(id: string) {
    const { error } = await this.db.from("payment_categories").delete().eq("id", id);
    fail("Kategóriu sa nepodarilo vymazať", error);
  }

  async listPayments(): Promise<Payment[]> {
    const { data, error } = await this.db
      .from("payments")
      .select("id, child_id, category_id, season_id, amount, due_date, paid, paid_at, period, note")
      .order("due_date");
    fail("Načítanie platieb zlyhalo", error);
    return ((data ?? []) as Payment[]).map((payment) => ({
      ...payment,
      amount: Number(payment.amount),
      period: payment.period ?? "",
      note: payment.note ?? "",
    }));
  }

  async createPayments(inputs: PaymentInput[]) {
    if (!inputs.length) return 0;
    const { error, count } = await this.db.from("payments").insert(inputs, { count: "exact" });
    fail("Platby sa nepodarilo vytvoriť", error);
    return count ?? inputs.length;
  }

  async updatePayment(id: string, patch: Partial<PaymentInput>) {
    const { error } = await this.db
      .from("payments")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", id);
    fail("Platbu sa nepodarilo upraviť", error);
  }

  async deletePayments(ids: string[]) {
    if (!ids.length) return 0;
    const { error, count } = await this.db.from("payments").delete({ count: "exact" }).in("id", ids);
    fail("Platby sa nepodarilo vymazať", error);
    return count ?? 0;
  }

  async setPaid(ids: string[], paid: boolean, paidAt: string | null) {
    if (!ids.length) return 0;
    const { error, count } = await this.db
      .from("payments")
      .update({ paid, paid_at: paid ? paidAt : null, updated_at: new Date().toISOString() }, { count: "exact" })
      .in("id", ids);
    fail("Stav platby sa nepodarilo zmeniť", error);
    return count ?? 0;
  }

  /* ---------- Push notifikácie ---------- */

  async listPushSubscriptions(): Promise<PushSubscriptionRecord[]> {
    const { data, error } = await this.db
      .from("push_subscriptions")
      .select("id, owner_id, endpoint, p256dh, auth, user_agent, created_at");
    fail("Načítanie odberov notifikácií zlyhalo", error);
    return (data ?? []) as PushSubscriptionRecord[];
  }

  async savePushSubscription(input: PushSubscriptionInput) {
    const { error } = await this.db
      .from("push_subscriptions")
      .upsert(input, { onConflict: "endpoint" });
    fail("Odber notifikácií sa nepodarilo uložiť", error);
  }

  async deletePushSubscription(endpoint: string) {
    const { error } = await this.db.from("push_subscriptions").delete().eq("endpoint", endpoint);
    fail("Odber notifikácií sa nepodarilo zrušiť", error);
  }

  /* ---------- Akcie ---------- */

  async listEvents(): Promise<ClubEvent[]> {
    const { data, error } = await this.db
      .from("events")
      .select("id, season_id, name, place, starts_on, ends_on, event_type, variable_symbol, note")
      .order("starts_on", { ascending: false });
    fail("Načítanie akcií zlyhalo", error);
    return ((data ?? []) as ClubEvent[]).map((event) => ({
      ...event,
      place: event.place ?? "",
      event_type: event.event_type ?? "",
      variable_symbol: event.variable_symbol ?? "",
      note: event.note ?? "",
    }));
  }

  async saveEvent(input: ClubEventInput & { id?: string }) {
    const { id, ...row } = input;
    const { data, error } = id
      ? await this.db.from("events").update(row).eq("id", id).select().single()
      : await this.db.from("events").insert(row).select().single();
    fail("Akciu sa nepodarilo uložiť", error);
    return data as ClubEvent;
  }

  async deleteEvent(id: string) {
    const { error } = await this.db.from("events").delete().eq("id", id);
    fail("Akciu sa nepodarilo vymazať", error);
  }

  async listParticipants(): Promise<EventParticipant[]> {
    const { data, error } = await this.db
      .from("event_participants")
      .select("id, event_id, child_id, family_name, children_count, adults_count, deposit, deposit_paid, balance, balance_paid, note")
      .order("family_name");
    fail("Načítanie účastníkov zlyhalo", error);
    return ((data ?? []) as EventParticipant[]).map((participant) => ({
      ...participant,
      deposit: Number(participant.deposit),
      balance: Number(participant.balance),
      note: participant.note ?? "",
    }));
  }

  async saveParticipant(input: EventParticipantInput & { id?: string }) {
    const { id, ...row } = input;
    const { data, error } = id
      ? await this.db.from("event_participants").update(row).eq("id", id).select().single()
      : await this.db.from("event_participants").insert(row).select().single();
    fail("Účastníka sa nepodarilo uložiť", error);
    return data as EventParticipant;
  }

  async updateParticipants(ids: string[], patch: Partial<EventParticipantInput>) {
    if (!ids.length) return 0;
    const { error, count } = await this.db
      .from("event_participants")
      .update(patch, { count: "exact" })
      .in("id", ids);
    fail("Účastníkov sa nepodarilo upraviť", error);
    return count ?? 0;
  }

  async deleteParticipants(ids: string[]) {
    if (!ids.length) return 0;
    const { error, count } = await this.db.from("event_participants").delete({ count: "exact" }).in("id", ids);
    fail("Účastníkov sa nepodarilo vymazať", error);
    return count ?? 0;
  }

  /* ---------- 2 % dane ---------- */

  async listDonations(): Promise<TaxDonation[]> {
    const { data, error } = await this.db
      .from("tax_donations")
      .select("id, season_id, child_id, donor_name, amount, note, created_at")
      .order("created_at", { ascending: false });
    fail("Načítanie darov zlyhalo", error);
    return ((data ?? []) as TaxDonation[]).map((donation) => ({
      ...donation,
      amount: Number(donation.amount),
      donor_name: donation.donor_name ?? "",
      note: donation.note ?? "",
    }));
  }

  async saveDonations(inputs: TaxDonationInput[]) {
    if (!inputs.length) return 0;
    // Rovnako ako pri výpise z banky: už naimportovaný riadok (rovnaký odtlačok) sa zahodí.
    const { data, error } = await this.db
      .from("tax_donations")
      .upsert(inputs, { onConflict: "fingerprint", ignoreDuplicates: true })
      .select("id");
    fail("Dary sa nepodarilo uložiť", error);
    return data?.length ?? 0;
  }

  async updateDonation(id: string, patch: Partial<TaxDonationInput>) {
    const { error } = await this.db.from("tax_donations").update(patch).eq("id", id);
    fail("Dar sa nepodarilo upraviť", error);
  }

  async deleteDonations(ids: string[]) {
    if (!ids.length) return 0;
    const { error, count } = await this.db.from("tax_donations").delete({ count: "exact" }).in("id", ids);
    fail("Dary sa nepodarilo vymazať", error);
    return count ?? 0;
  }

  /* ---------- Banka ---------- */

  async listBankTransactions(): Promise<BankTransaction[]> {
    const { data, error } = await this.db
      .from("bank_transactions")
      .select("id, season_id, booked_on, amount, variable_symbol, counterparty, note, matched_payment_id, fingerprint")
      .order("booked_on", { ascending: false });
    fail("Načítanie výpisu zlyhalo", error);
    return ((data ?? []) as BankTransaction[]).map((row) => ({
      ...row,
      amount: Number(row.amount),
      variable_symbol: row.variable_symbol ?? "",
      counterparty: row.counterparty ?? "",
      note: row.note ?? "",
    }));
  }

  async saveBankTransactions(inputs: BankTransactionInput[]) {
    if (!inputs.length) return [];
    // `ignoreDuplicates` spolu s unikátnym fingerprintom zahodí už naimportované riadky.
    const { data, error } = await this.db
      .from("bank_transactions")
      .upsert(inputs, { onConflict: "fingerprint", ignoreDuplicates: true })
      .select();
    fail("Výpis sa nepodarilo uložiť", error);
    return (data ?? []) as BankTransaction[];
  }

  /* ---------- Sezóny ---------- */

  async listSeasons(): Promise<Season[]> {
    const { data, error } = await this.db
      .from("seasons")
      .select("id, name, starts_on, ends_on, is_current")
      .order("starts_on", { ascending: false });
    fail("Načítanie sezón zlyhalo", error);
    return (data ?? []) as Season[];
  }

  async saveSeason(input: { id?: string; name: string; starts_on: string; ends_on: string }) {
    const row = { name: input.name, starts_on: input.starts_on, ends_on: input.ends_on };
    const { data, error } = input.id
      ? await this.db.from("seasons").update(row).eq("id", input.id).select().single()
      : await this.db.from("seasons").insert(row).select().single();
    fail("Sezónu sa nepodarilo uložiť", error);
    return data as Season;
  }

  async setCurrentSeason(id: string) {
    // Najprv zhodíme príznak zo všetkých, inak by unikátny index zabránil prepnutiu.
    const { error: clearError } = await this.db
      .from("seasons")
      .update({ is_current: false })
      .eq("is_current", true);
    fail("Sezónu sa nepodarilo prepnúť", clearError);
    const { error } = await this.db.from("seasons").update({ is_current: true }).eq("id", id);
    fail("Sezónu sa nepodarilo prepnúť", error);
  }

  async listEquipmentCategories(): Promise<EquipmentCategory[]> {
    const { data, error } = await this.db
      .from("equipment_categories")
      .select("id, name, parent_id, season_price")
      .order("name");
    fail("Načítanie kategórií výstroja zlyhalo", error);
    return ((data ?? []) as EquipmentCategory[]).map((category) => ({
      ...category,
      season_price: category.season_price === null ? null : Number(category.season_price),
    }));
  }

  async saveEquipmentCategory(input: Omit<EquipmentCategory, "id"> & { id?: string }) {
    const row = { name: input.name, parent_id: input.parent_id, season_price: input.season_price };
    const { data, error } = input.id
      ? await this.db.from("equipment_categories").update(row).eq("id", input.id).select().single()
      : await this.db.from("equipment_categories").insert(row).select().single();
    fail("Kategóriu výstroja sa nepodarilo uložiť", error);
    return data as EquipmentCategory;
  }

  async deleteEquipmentCategory(id: string) {
    const { error } = await this.db.from("equipment_categories").delete().eq("id", id);
    fail("Kategóriu sa nepodarilo vymazať", error);
  }

  async listEquipment(): Promise<Equipment[]> {
    const { data, error } = await this.db
      .from("equipment")
      .select(
        "id, inventory_code, name, category_id, size, brand, model, color, season_price, condition, status, purpose, buckles, quantity, note",
      )
      .order("inventory_code");
    fail("Načítanie výstroja zlyhalo", error);
    return ((data ?? []) as Equipment[]).map((item) => ({
      ...item,
      season_price: item.season_price === null ? null : Number(item.season_price),
      size: item.size ?? "",
      brand: item.brand ?? "",
      model: item.model ?? "",
      color: item.color ?? "",
      purpose: item.purpose ?? "prenajom",
      buckles: item.buckles === null || item.buckles === undefined ? null : Number(item.buckles),
      quantity: item.quantity === null || item.quantity === undefined ? null : Number(item.quantity),
      note: item.note ?? "",
    }));
  }

  async saveEquipment(input: EquipmentInput & { id?: string }) {
    const { id, ...row } = input;
    const { data, error } = id
      ? await this.db.from("equipment").update(row).eq("id", id).select().single()
      : await this.db.from("equipment").insert(row).select().single();
    fail("Kus výstroja sa nepodarilo uložiť", error);
    return data as Equipment;
  }

  async bulkEquipment(ids: string[], action: BulkEquipmentAction) {
    if (!ids.length) return 0;
    if (action.type === "delete") {
      const { error, count } = await this.db.from("equipment").delete({ count: "exact" }).in("id", ids);
      fail("Výstroj sa nepodarilo vymazať", error);
      return count ?? 0;
    }
    const patch =
      action.type === "status"
        ? { status: action.status }
        : action.type === "purpose"
          ? { purpose: action.purpose }
          : { category_id: action.categoryId || null };
    const { error, count } = await this.db
      .from("equipment")
      .update(patch, { count: "exact" })
      .in("id", ids);
    fail("Hromadná akcia zlyhala", error);
    return count ?? 0;
  }

  async listLoans(): Promise<Loan[]> {
    const { data, error } = await this.db
      .from("loans")
      .select("id, equipment_id, child_id, season_id, borrowed_on, returned_on, price, paid, returned, note")
      .order("borrowed_on", { ascending: false });
    fail("Načítanie výpožičiek zlyhalo", error);
    return ((data ?? []) as Loan[]).map((loan) => ({ ...loan, price: Number(loan.price), note: loan.note ?? "" }));
  }

  async saveLoan(input: LoanInput & { id?: string }) {
    const { id, ...row } = input;
    const { data, error } = id
      ? await this.db.from("loans").update(row).eq("id", id).select().single()
      : await this.db.from("loans").insert(row).select().single();
    fail("Výpožičku sa nepodarilo uložiť", error);
    return data as Loan;
  }

  async updateLoans(ids: string[], patch: Partial<LoanInput>) {
    if (!ids.length) return 0;
    const { error, count } = await this.db.from("loans").update(patch, { count: "exact" }).in("id", ids);
    fail("Výpožičky sa nepodarilo upraviť", error);
    return count ?? 0;
  }

  async deleteLoans(ids: string[]) {
    if (!ids.length) return 0;
    const { error, count } = await this.db.from("loans").delete({ count: "exact" }).in("id", ids);
    fail("Výpožičky sa nepodarilo vymazať", error);
    return count ?? 0;
  }

  async listAttendance(): Promise<Attendance[]> {
    const { data, error } = await this.db
      .from("attendance")
      .select("id, child_id, season_id, date, present")
      .order("date", { ascending: false });
    fail("Načítanie dochádzky zlyhalo", error);
    return (data ?? []) as Attendance[];
  }

  async saveAttendance(entries: AttendanceInput[]) {
    if (!entries.length) return 0;
    // Unikátny index na (child_id, date) zabezpečí, že opakovaný import prepíše, nezduplikuje.
    const { error, count } = await this.db
      .from("attendance")
      .upsert(entries, { onConflict: "child_id,date", count: "exact" });
    fail("Dochádzku sa nepodarilo uložiť", error);
    return count ?? entries.length;
  }

  async listConfirmations(): Promise<Confirmation[]> {
    const { data, error } = await this.db
      .from("confirmations")
      .select("id, child_id, season_id, mode, period, expense_type, amount, requested_by, monthly_breakdown, created_at")
      .order("created_at", { ascending: false });
    fail("Načítanie potvrdení zlyhalo", error);
    return ((data ?? []) as Confirmation[]).map((item) => ({
      ...item,
      amount: Number(item.amount),
      requested_by: item.requested_by ?? "",
      monthly_breakdown: item.monthly_breakdown ?? null,
    }));
  }

  async createConfirmations(inputs: ConfirmationInput[]) {
    if (!inputs.length) return 0;
    // `pdf_path` je v schéme povinný; dokument sa tlačí z appky, preto ukladáme cestu na náhľad.
    const rows = inputs.map((input) => ({ ...input, pdf_path: `/potvrdenia/tlac?child=${input.child_id}` }));
    const { error, count } = await this.db.from("confirmations").insert(rows, { count: "exact" });
    fail("Potvrdenia sa nepodarilo vytvoriť", error);
    return count ?? inputs.length;
  }

  async deleteConfirmation(id: string) {
    const { error } = await this.db.from("confirmations").delete().eq("id", id);
    fail("Potvrdenie sa nepodarilo vymazať", error);
  }

  async clubSettings(): Promise<ClubSettings> {
    const { data } = await this.db
      .from("club_settings")
      .select("official_name, address, ico, iban, statutory_representative, phone, account_holder_name, registry_note")
      .maybeSingle();
    return {
      official_name: data?.official_name ?? "Demo Ski Club",
      address: data?.address ?? "Demo Street 1, 000 00 Demo City",
      ico: data?.ico ?? "",
      iban: data?.iban ?? "",
      statutory_representative: data?.statutory_representative ?? "",
      phone: data?.phone ?? "",
      account_holder_name: data?.account_holder_name ?? "",
      registry_note: data?.registry_note ?? "",
    };
  }

  async saveClubSettings(settings: ClubSettings) {
    const { error } = await this.db.from("club_settings").upsert({ id: true, ...settings }, { onConflict: "id" });
    fail("Nastavenia sa nepodarilo uložiť", error);
  }

  async savePendingImport(pending: PendingImport) {
    const { error } = await this.db.from("import_drafts").upsert(
      {
        owner_id: this.userId,
        token: pending.token,
        kind: pending.kind,
        file_name: pending.file_name,
        headers: pending.headers,
        rows: pending.rows,
      },
      { onConflict: "owner_id" },
    );
    fail("Náhľad importu sa nepodarilo uložiť", error);
  }

  async pendingImport(): Promise<PendingImport | null> {
    const { data } = await this.db
      .from("import_drafts")
      .select("token, kind, file_name, headers, rows, created_at")
      .eq("owner_id", this.userId)
      .maybeSingle();
    return data ? ({ ...data, kind: data.kind ?? "members" } as PendingImport) : null;
  }

  async clearPendingImport() {
    await this.db.from("import_drafts").delete().eq("owner_id", this.userId);
  }

  async claimImportToken(token: string) {
    // Unikátny index na `token` zabezpečí, že druhé kliknutie na potvrdenie neprejde.
    const { error } = await this.db.from("import_runs").insert({ token, owner_id: this.userId });
    if (error?.code === "23505") return false;
    fail("Import sa nepodarilo spustiť", error);
    return true;
  }

  /*
   * Záznam o importe chybu len zaloguje, nevyhodí ju ďalej: dáta sú v tej chvíli
   * už uložené a hláška „import zlyhal“ by klamala. Typický prípad je nasadená
   * appka pred spustením migrácie 0014 — tabuľka ešte neexistuje.
   */
  async saveImportLog(log: ImportLog) {
    const { error } = await this.db.from("import_logs").upsert(
      { kind: log.kind, file_name: log.file_name, skipped: log.skipped, created_at: log.created_at },
      { onConflict: "kind" },
    );
    if (error) console.error("[import_logs] záznam o importe sa neuložil:", error.message);
  }

  async importLogs(): Promise<ImportLog[]> {
    const { data, error } = await this.db.from("import_logs").select("kind, file_name, skipped, created_at");
    if (error) {
      console.error("[import_logs] záznamy o importe sa nenačítali:", error.message);
      return [];
    }
    return (data ?? []) as ImportLog[];
  }
}
