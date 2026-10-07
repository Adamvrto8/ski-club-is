/**
 * Lokálne úložisko pre vývojový náhľad (DEMO_MODE=true).
 * Dáta sú v `data/local-store.json` — nikdy nie v produkcii, súbor je v .gitignore,
 * pretože obsahuje rodné čísla a adresy.
 */
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
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
  PushSubscriptionInput,
  PushSubscriptionRecord,
  Repo,
  Season,
} from "./types";

type State = {
  seasons: Season[];
  club: ClubSettings;
  events: ClubEvent[];
  participants: EventParticipant[];
  donations: TaxDonation[];
  bankTransactions: BankTransaction[];
  pushSubscriptions: PushSubscriptionRecord[];
  children: Child[];
  contacts: Contact[];
  categories: PaymentCategory[];
  payments: Payment[];
  equipmentCategories: EquipmentCategory[];
  equipment: Equipment[];
  loans: Loan[];
  attendance: Attendance[];
  confirmations: Confirmation[];
  pendingImport: PendingImport | null;
  usedImportTokens: string[];
  importLogs: ImportLog[];
};

const STORE_FILE = path.join(process.cwd(), "data", "local-store.json");

function emptyState(): State {
  return {
    seasons: [
      {
        id: "season-current",
        name: "Sezóna 2026/2027",
        starts_on: "2026-09-01",
        ends_on: "2027-08-31",
        is_current: true,
      },
    ],
    events: [],
    participants: [],
    donations: [],
    bankTransactions: [],
    pushSubscriptions: [],
    club: {
      official_name: "Demo Ski Club",
      address: "Demo Street 1, 000 00 Demo City",
      ico: "00000000",
      iban: "SK00 0000 0000 0000 0000 0000",
      statutory_representative: "Meno Priezvisko, predseda",
      phone: "0900 000 000",
      account_holder_name: "Demo Ski Club",
      registry_note:
        "Občianske združenie Demo Ski Club je zapísaná v registri právnických osôb podľa zákona č. 440/2015 Z.z. o športe – IDPO: 00000.",
    },
    children: [],
    contacts: [],
    categories: [],
    payments: [],
    equipmentCategories: [],
    equipment: [],
    loans: [],
    attendance: [],
    confirmations: [],
    pendingImport: null,
    usedImportTokens: [],
    importLogs: [],
  };
}

async function readState(): Promise<State> {
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    return { ...emptyState(), ...(JSON.parse(raw) as Partial<State>) } as State;
  } catch {
    return emptyState();
  }
}

// Zápisy serializujeme, aby dve súbežné akcie neprepísali jedna druhú.
let writeQueue: Promise<unknown> = Promise.resolve();

function mutate<T>(mutator: (state: State) => T): Promise<T> {
  const run = writeQueue.then(async () => {
    const state = await readState();
    const result = mutator(state);
    await mkdir(path.dirname(STORE_FILE), { recursive: true });
    await writeFile(STORE_FILE, JSON.stringify(state, null, 2), "utf8");
    return result;
  });
  writeQueue = run.catch(() => undefined);
  return run;
}

const now = () => new Date().toISOString();

function nextVariableSymbol(children: Child[]) {
  return Math.max(1000, ...children.map((child) => child.variable_symbol)) + 1;
}

export class LocalRepo implements Repo {
  readonly mode = "local" as const;
  readonly canEdit = true;

  async currentSeason() {
    const { seasons } = await readState();
    return seasons.find((season) => season.is_current) ?? seasons[0];
  }

  async listChildren() {
    return (await readState()).children;
  }

  async getChild(id: string) {
    return (await readState()).children.find((child) => child.id === id) ?? null;
  }

  createChild(input: ChildInput) {
    return mutate((state) => {
      const stamp = now();
      const child: Child = {
        ...input,
        id: crypto.randomUUID(),
        variable_symbol: nextVariableSymbol(state.children),
        created_at: stamp,
        updated_at: stamp,
      };
      state.children.push(child);
      return child;
    });
  }

  async updateChild(id: string, input: ChildInput) {
    await mutate((state) => {
      const child = state.children.find((item) => item.id === id);
      if (child) Object.assign(child, input, { updated_at: now() });
    });
  }

  bulkChildren(ids: string[], action: BulkChildAction) {
    return mutate((state) => {
      if (action.type === "delete") {
        const before = state.children.length;
        state.children = state.children.filter((child) => !ids.includes(child.id));
        state.contacts = state.contacts.filter((contact) => !ids.includes(contact.child_id));
        state.payments = state.payments.filter((payment) => !ids.includes(payment.child_id));
        state.attendance = state.attendance.filter((item) => !ids.includes(item.child_id));
        state.loans = state.loans.filter((loan) => !ids.includes(loan.child_id));
        state.confirmations = state.confirmations.filter((item) => !ids.includes(item.child_id));
        return before - state.children.length;
      }
      let count = 0;
      for (const child of state.children) {
        if (!ids.includes(child.id)) continue;
        if (action.type === "activate") child.active = true;
        if (action.type === "deactivate") child.active = false;
        if (action.type === "move_team") child.team = action.team;
        child.updated_at = now();
        count += 1;
      }
      return count;
    });
  }

  async listContacts() {
    return (await readState()).contacts;
  }

  async saveContact(childId: string, input: ContactInput) {
    await mutate((state) => {
      const existing = state.contacts.find((contact) => contact.child_id === childId);
      if (existing) Object.assign(existing, input);
      else state.contacts.push({ id: crypto.randomUUID(), child_id: childId, ...input });
    });
  }

  async listCategories() {
    return (await readState()).categories;
  }

  async saveCategory(input: Omit<PaymentCategory, "id"> & { id?: string }) {
    await mutate((state) => {
      const existing = input.id ? state.categories.find((item) => item.id === input.id) : undefined;
      if (existing) {
        existing.name = input.name;
        existing.base_amount = input.base_amount;
        existing.eligible_for_confirmation = input.eligible_for_confirmation;
        return;
      }
      state.categories.push({
        id: crypto.randomUUID(),
        name: input.name,
        base_amount: input.base_amount,
        eligible_for_confirmation: input.eligible_for_confirmation,
      });
    });
  }

  async deleteCategory(id: string) {
    await mutate((state) => {
      state.categories = state.categories.filter((category) => category.id !== id);
    });
  }

  async listPayments() {
    return (await readState()).payments;
  }

  createPayments(inputs: PaymentInput[]) {
    return mutate((state) => {
      for (const input of inputs) state.payments.push({ ...input, id: crypto.randomUUID() });
      return inputs.length;
    });
  }

  async updatePayment(id: string, patch: Partial<PaymentInput>) {
    await mutate((state) => {
      const payment = state.payments.find((item) => item.id === id);
      if (payment) Object.assign(payment, patch);
    });
  }

  deletePayments(ids: string[]) {
    return mutate((state) => {
      const before = state.payments.length;
      state.payments = state.payments.filter((payment) => !ids.includes(payment.id));
      return before - state.payments.length;
    });
  }

  setPaid(ids: string[], paid: boolean, paidAt: string | null) {
    return mutate((state) => {
      let count = 0;
      for (const payment of state.payments) {
        if (!ids.includes(payment.id)) continue;
        payment.paid = paid;
        payment.paid_at = paid ? paidAt : null;
        count += 1;
      }
      return count;
    });
  }

  /* ---------- Push notifikácie ---------- */

  async listPushSubscriptions() {
    return (await readState()).pushSubscriptions;
  }

  async savePushSubscription(input: PushSubscriptionInput) {
    await mutate((state) => {
      // Endpoint je unikátny na zariadenie; opakované povolenie ho len obnoví.
      const existing = state.pushSubscriptions.find((item) => item.endpoint === input.endpoint);
      if (existing) {
        Object.assign(existing, input);
        return;
      }
      state.pushSubscriptions.push({ ...input, id: crypto.randomUUID(), created_at: now() });
    });
  }

  async deletePushSubscription(endpoint: string) {
    await mutate((state) => {
      state.pushSubscriptions = state.pushSubscriptions.filter((item) => item.endpoint !== endpoint);
    });
  }

  /* ---------- Akcie ---------- */

  async listEvents() {
    return (await readState()).events;
  }

  saveEvent(input: ClubEventInput & { id?: string }) {
    return mutate((state) => {
      const existing = input.id ? state.events.find((item) => item.id === input.id) : undefined;
      if (existing) {
        Object.assign(existing, input, { id: existing.id });
        return existing;
      }
      const { id: _ignored, ...rest } = input;
      const created: ClubEvent = { ...rest, id: crypto.randomUUID() };
      state.events.push(created);
      return created;
    });
  }

  async deleteEvent(id: string) {
    await mutate((state) => {
      state.events = state.events.filter((event) => event.id !== id);
      state.participants = state.participants.filter((participant) => participant.event_id !== id);
    });
  }

  async listParticipants() {
    return (await readState()).participants;
  }

  saveParticipant(input: EventParticipantInput & { id?: string }) {
    return mutate((state) => {
      const existing = input.id ? state.participants.find((item) => item.id === input.id) : undefined;
      if (existing) {
        Object.assign(existing, input, { id: existing.id });
        return existing;
      }
      const { id: _ignored, ...rest } = input;
      const created: EventParticipant = { ...rest, id: crypto.randomUUID() };
      state.participants.push(created);
      return created;
    });
  }

  updateParticipants(ids: string[], patch: Partial<EventParticipantInput>) {
    return mutate((state) => {
      let count = 0;
      for (const participant of state.participants) {
        if (!ids.includes(participant.id)) continue;
        Object.assign(participant, patch);
        count += 1;
      }
      return count;
    });
  }

  deleteParticipants(ids: string[]) {
    return mutate((state) => {
      const before = state.participants.length;
      state.participants = state.participants.filter((item) => !ids.includes(item.id));
      return before - state.participants.length;
    });
  }

  /* ---------- 2 % dane ---------- */

  async listDonations() {
    return (await readState()).donations;
  }

  saveDonations(inputs: TaxDonationInput[]) {
    return mutate((state) => {
      let saved = 0;
      for (const input of inputs) {
        if (input.fingerprint && state.donations.some((item) => item.fingerprint === input.fingerprint)) continue;
        state.donations.push({ ...input, id: crypto.randomUUID(), created_at: now() });
        saved += 1;
      }
      return saved;
    });
  }

  async updateDonation(id: string, patch: Partial<TaxDonationInput>) {
    await mutate((state) => {
      const donation = state.donations.find((item) => item.id === id);
      if (donation) Object.assign(donation, patch);
    });
  }

  deleteDonations(ids: string[]) {
    return mutate((state) => {
      const before = state.donations.length;
      state.donations = state.donations.filter((item) => !ids.includes(item.id));
      return before - state.donations.length;
    });
  }

  /* ---------- Banka ---------- */

  async listBankTransactions() {
    return (await readState()).bankTransactions;
  }

  saveBankTransactions(inputs: BankTransactionInput[]) {
    return mutate((state) => {
      const created: BankTransaction[] = [];
      for (const input of inputs) {
        // Rovnaký riadok výpisu sa nesmie započítať dvakrát.
        if (state.bankTransactions.some((item) => item.fingerprint === input.fingerprint)) continue;
        const row: BankTransaction = { ...input, id: crypto.randomUUID() };
        state.bankTransactions.push(row);
        created.push(row);
      }
      return created;
    });
  }

  /* ---------- Sezóny ---------- */

  async listSeasons() {
    return (await readState()).seasons;
  }

  saveSeason(input: { id?: string; name: string; starts_on: string; ends_on: string }) {
    return mutate((state) => {
      const existing = input.id ? state.seasons.find((item) => item.id === input.id) : undefined;
      if (existing) {
        existing.name = input.name;
        existing.starts_on = input.starts_on;
        existing.ends_on = input.ends_on;
        return existing;
      }
      const created: Season = {
        id: crypto.randomUUID(),
        name: input.name,
        starts_on: input.starts_on,
        ends_on: input.ends_on,
        is_current: state.seasons.length === 0,
      };
      state.seasons.push(created);
      return created;
    });
  }

  async setCurrentSeason(id: string) {
    await mutate((state) => {
      for (const season of state.seasons) season.is_current = season.id === id;
    });
  }

  async listEquipmentCategories() {
    return (await readState()).equipmentCategories;
  }

  saveEquipmentCategory(input: Omit<EquipmentCategory, "id"> & { id?: string }) {
    return mutate((state) => {
      const existing = input.id ? state.equipmentCategories.find((item) => item.id === input.id) : undefined;
      if (existing) {
        existing.name = input.name;
        existing.parent_id = input.parent_id;
        existing.season_price = input.season_price;
        return existing;
      }
      const created: EquipmentCategory = {
        id: crypto.randomUUID(),
        name: input.name,
        parent_id: input.parent_id,
        season_price: input.season_price,
      };
      state.equipmentCategories.push(created);
      return created;
    });
  }

  async deleteEquipmentCategory(id: string) {
    await mutate((state) => {
      // Podkategórie idú preč s rodičom, kusy zostanú bez zaradenia.
      const removed = new Set([id, ...state.equipmentCategories.filter((c) => c.parent_id === id).map((c) => c.id)]);
      state.equipmentCategories = state.equipmentCategories.filter((item) => !removed.has(item.id));
      for (const item of state.equipment) {
        if (item.category_id && removed.has(item.category_id)) item.category_id = null;
      }
    });
  }

  async listEquipment() {
    return (await readState()).equipment;
  }

  saveEquipment(input: EquipmentInput & { id?: string }) {
    return mutate((state) => {
      const existing = input.id ? state.equipment.find((item) => item.id === input.id) : undefined;
      if (existing) {
        Object.assign(existing, input, { id: existing.id });
        return existing;
      }
      const { id: _ignored, ...rest } = input;
      const created: Equipment = { ...rest, id: crypto.randomUUID() };
      state.equipment.push(created);
      return created;
    });
  }

  bulkEquipment(ids: string[], action: BulkEquipmentAction) {
    return mutate((state) => {
      if (action.type === "delete") {
        const before = state.equipment.length;
        state.equipment = state.equipment.filter((item) => !ids.includes(item.id));
        state.loans = state.loans.filter((loan) => !ids.includes(loan.equipment_id));
        return before - state.equipment.length;
      }
      let count = 0;
      for (const item of state.equipment) {
        if (!ids.includes(item.id)) continue;
        if (action.type === "status") item.status = action.status;
        if (action.type === "category") item.category_id = action.categoryId || null;
        if (action.type === "purpose") item.purpose = action.purpose;
        count += 1;
      }
      return count;
    });
  }

  async listLoans() {
    return (await readState()).loans;
  }

  saveLoan(input: LoanInput & { id?: string }) {
    return mutate((state) => {
      const existing = input.id ? state.loans.find((item) => item.id === input.id) : undefined;
      if (existing) {
        Object.assign(existing, input, { id: existing.id });
        return existing;
      }
      const { id: _ignored, ...rest } = input;
      const created: Loan = { ...rest, id: crypto.randomUUID() };
      state.loans.push(created);
      return created;
    });
  }

  updateLoans(ids: string[], patch: Partial<LoanInput>) {
    return mutate((state) => {
      let count = 0;
      for (const loan of state.loans) {
        if (!ids.includes(loan.id)) continue;
        Object.assign(loan, patch);
        count += 1;
      }
      return count;
    });
  }

  deleteLoans(ids: string[]) {
    return mutate((state) => {
      const before = state.loans.length;
      state.loans = state.loans.filter((loan) => !ids.includes(loan.id));
      return before - state.loans.length;
    });
  }

  async listAttendance() {
    return (await readState()).attendance;
  }

  saveAttendance(entries: AttendanceInput[]) {
    return mutate((state) => {
      for (const entry of entries) {
        const existing = state.attendance.find(
          (item) => item.child_id === entry.child_id && item.date === entry.date,
        );
        if (existing) existing.present = entry.present;
        else state.attendance.push({ ...entry, id: crypto.randomUUID() });
      }
      return entries.length;
    });
  }

  async listConfirmations() {
    return (await readState()).confirmations;
  }

  createConfirmations(inputs: ConfirmationInput[]) {
    return mutate((state) => {
      for (const input of inputs) {
        state.confirmations.push({ ...input, id: crypto.randomUUID(), created_at: now() });
      }
      return inputs.length;
    });
  }

  async deleteConfirmation(id: string) {
    await mutate((state) => {
      state.confirmations = state.confirmations.filter((item) => item.id !== id);
    });
  }

  async clubSettings() {
    return (await readState()).club;
  }

  async saveClubSettings(settings: ClubSettings) {
    await mutate((state) => {
      state.club = settings;
    });
  }

  async savePendingImport(pending: PendingImport) {
    await mutate((state) => {
      state.pendingImport = pending;
    });
  }

  async pendingImport() {
    return (await readState()).pendingImport;
  }

  async clearPendingImport() {
    await mutate((state) => {
      state.pendingImport = null;
    });
  }

  claimImportToken(token: string) {
    return mutate((state) => {
      if (state.usedImportTokens.includes(token)) return false;
      state.usedImportTokens.push(token);
      return true;
    });
  }

  async saveImportLog(log: ImportLog) {
    await mutate((state) => {
      // Jeden záznam na druh — nový import toho istého druhu prepíše starý.
      state.importLogs = [...state.importLogs.filter((entry) => entry.kind !== log.kind), log];
    });
  }

  async importLogs() {
    return (await readState()).importLogs;
  }
}
