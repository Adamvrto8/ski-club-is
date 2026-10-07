import type { Team } from "../domain";

export type Season = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  is_current: boolean;
};

export type Child = {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  team: Team;
  active: boolean;
  variable_symbol: number;
  is_sport_registered: boolean;
  sport_registered_at: string | null;
  sport_identifier: string | null;
  membership_date: string;
  /** Citlivé polia — v Supabase režime ich načíta iba admin. */
  national_id: string | null;
  permanent_address: string | null;
  created_at: string;
  updated_at: string;
};

export type ChildInput = Omit<Child, "id" | "variable_symbol" | "created_at" | "updated_at">;

/** Zodpovedá kontaktnému hárku klubu, stĺpec po stĺpci. */
export type Contact = {
  id: string;
  child_id: string;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  address: string | null;
  emails: string[];
};

export type ContactInput = Omit<Contact, "id" | "child_id">;

export type PaymentCategory = {
  id: string;
  name: string;
  base_amount: number;
  eligible_for_confirmation: boolean;
};

export type Payment = {
  id: string;
  child_id: string;
  category_id: string;
  season_id: string;
  amount: number;
  due_date: string;
  paid: boolean;
  paid_at: string | null;
  period: string;
  note: string;
};

export type PaymentInput = Omit<Payment, "id">;

/** Jeden riadok mesačného rozpisu na potvrdení, napr. { month: "Január", amount: 37 }. */
export type MonthlyAmount = { month: string; amount: number };

export type Confirmation = {
  id: string;
  child_id: string;
  season_id: string;
  mode: "one_time" | "monthly";
  period: string;
  expense_type: string;
  amount: number;
  /** Zákonný zástupca, na ktorého žiadosť sa doklad vystavuje — meno, nie vzťah k dieťaťu. */
  requested_by: string;
  /** Iba pri mode "monthly": rozpis súm po mesiacoch, presne ako na tlačive. */
  monthly_breakdown: MonthlyAmount[] | null;
  created_at: string;
};

export type ConfirmationInput = Omit<Confirmation, "id" | "created_at">;

export type Attendance = {
  id: string;
  child_id: string;
  season_id: string;
  /** YYYY-MM-DD */
  date: string;
  present: boolean;
};

export type AttendanceInput = Omit<Attendance, "id">;

export type ClubEvent = {
  id: string;
  season_id: string;
  name: string;
  place: string;
  starts_on: string;
  ends_on: string;
  event_type: string;
  /** Vlastný VS akcie, napr. rok + poradové číslo. */
  variable_symbol: string;
  note: string;
};

export type ClubEventInput = Omit<ClubEvent, "id">;

/**
 * Účastník akcie. Buď je naviazaný na člena (`child_id`), alebo je to ručný
 * rodinný záznam — na sústredenia chodia aj rodičia a súrodenci.
 */
export type EventParticipant = {
  id: string;
  event_id: string;
  child_id: string | null;
  family_name: string;
  children_count: number;
  adults_count: number;
  deposit: number;
  deposit_paid: boolean;
  balance: number;
  balance_paid: boolean;
  note: string;
};

export type EventParticipantInput = Omit<EventParticipant, "id">;

/** Darovaná suma z 2 % dane, priradená dieťaťu. */
export type TaxDonation = {
  id: string;
  season_id: string;
  child_id: string | null;
  donor_name: string;
  amount: number;
  note: string;
  /** Odtlačok riadku z importu — null pri ručne zadanom dare. */
  fingerprint: string | null;
  created_at: string;
};

export type TaxDonationInput = Omit<TaxDonation, "id" | "created_at">;

/** Riadok bankového výpisu. `fingerprint` bráni dvojitému započítaniu. */
export type BankTransaction = {
  id: string;
  season_id: string;
  booked_on: string;
  amount: number;
  variable_symbol: string;
  counterparty: string;
  note: string;
  matched_payment_id: string | null;
  fingerprint: string;
};

export type BankTransactionInput = Omit<BankTransaction, "id">;

/** Odber push notifikácií jedného zariadenia. */
export type PushSubscriptionRecord = {
  id: string;
  owner_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string;
  created_at: string;
};

export type PushSubscriptionInput = Omit<PushSubscriptionRecord, "id" | "created_at">;

export type EquipmentCategory = {
  id: string;
  name: string;
  /** null = hlavná kategória, inak podkategória (napr. „Lyže → Lyže staré“). */
  parent_id: string | null;
  /** Cena za požičanie na sezónu; kus si ju môže prepísať vlastnou. */
  season_price: number | null;
};

export type Equipment = {
  id: string;
  inventory_code: string;
  name: string;
  category_id: string | null;
  size: string;
  brand: string;
  /** Model oddelený od značky, napr. brand "atomic", model "G9 REDSTER FIS". */
  model: string;
  color: string;
  season_price: number | null;
  condition: "nove" | "stare" | "dobre" | "opotrebovane" | "poskodene";
  status: "dostupne" | "pozicane" | "v_oprave" | "stratene" | "vyradene";
  /** Na čo kus slúži: požičiavame ho, predávame ho, alebo je to pomôcka na tréningy. */
  purpose: "prenajom" | "sklad";
  /** Počet klipsov na lyžiarkach — určuje cenu. null = v hárku nebolo vyplnené. */
  buckles: number | null;
  /** Počet kusov pri skladových položkách (pomôcky, tyče, vesty). null = jednotlivý kus. */
  quantity: number | null;
  note: string;
};

export type EquipmentInput = Omit<Equipment, "id">;

export type Loan = {
  id: string;
  equipment_id: string;
  child_id: string;
  season_id: string;
  borrowed_on: string;
  returned_on: string | null;
  price: number;
  paid: boolean;
  returned: boolean;
  note: string;
};

export type LoanInput = Omit<Loan, "id">;

export type BulkEquipmentAction =
  | { type: "status"; status: Equipment["status"] }
  | { type: "category"; categoryId: string }
  | { type: "purpose"; purpose: Equipment["purpose"] }
  | { type: "delete" };

export type ClubSettings = {
  official_name: string;
  address: string;
  ico: string;
  iban: string;
  statutory_representative: string;
  phone: string;
  /** Meno, na ktoré je vedený bankový účet, ak sa líši od official_name (napr. skrátený názov klubu). */
  account_holder_name: string;
  /** Voľný text o registrácii v registri právnických osôb (zákon, IDPO) — tlačí sa na potvrdeniach. */
  registry_note: string;
};

/** Rozpracovaný import čaká na potvrdenie; token chráni pred dvojitým spustením. */
export type PendingImport = {
  token: string;
  /** Členovia a inventár majú oddelený rozpracovaný stav, aby si navzájom neprepísali náhľad. */
  kind: "members" | "equipment";
  file_name: string;
  headers: string[];
  rows: Record<string, string>[];
  created_at: string;
};

export type ImportSummary = { created: number; updated: number; skipped: number };

/** Posledný import daného druhu a riadky, ktoré preskočil — aby sa k nim dalo vrátiť. */
export type ImportLog = {
  kind: PendingImport["kind"];
  file_name: string;
  created_at: string;
  skipped: { label: string; reasons: string[] }[];
};

export type BulkChildAction =
  | { type: "activate" }
  | { type: "deactivate" }
  | { type: "move_team"; team: Team }
  | { type: "delete" };

/**
 * Jedno rozhranie pre obe úložiská. Stránky a server actions volajú iba toto —
 * nevedia, či dáta pochádzajú z lokálneho JSON-u alebo zo Supabase.
 */
export interface Repo {
  readonly mode: "local" | "supabase";
  /** Admin smie zapisovať; tréner má len čítanie (v Supabase to navyše vynucuje RLS). */
  readonly canEdit: boolean;

  currentSeason(): Promise<Season>;

  listChildren(): Promise<Child[]>;
  getChild(id: string): Promise<Child | null>;
  createChild(input: ChildInput): Promise<Child>;
  updateChild(id: string, input: ChildInput): Promise<void>;
  bulkChildren(ids: string[], action: BulkChildAction): Promise<number>;

  listContacts(): Promise<Contact[]>;
  saveContact(childId: string, input: ContactInput): Promise<void>;

  listCategories(): Promise<PaymentCategory[]>;
  saveCategory(input: Omit<PaymentCategory, "id"> & { id?: string }): Promise<void>;
  deleteCategory(id: string): Promise<void>;

  listPayments(): Promise<Payment[]>;
  createPayments(inputs: PaymentInput[]): Promise<number>;
  updatePayment(id: string, patch: Partial<PaymentInput>): Promise<void>;
  deletePayments(ids: string[]): Promise<number>;
  setPaid(ids: string[], paid: boolean, paidAt: string | null): Promise<number>;

  /** Push notifikácie — jeden záznam na zariadenie. */
  listPushSubscriptions(): Promise<PushSubscriptionRecord[]>;
  savePushSubscription(input: PushSubscriptionInput): Promise<void>;
  deletePushSubscription(endpoint: string): Promise<void>;

  /** Akcie a sústredenia. */
  listEvents(): Promise<ClubEvent[]>;
  saveEvent(input: ClubEventInput & { id?: string }): Promise<ClubEvent>;
  deleteEvent(id: string): Promise<void>;

  listParticipants(): Promise<EventParticipant[]>;
  saveParticipant(input: EventParticipantInput & { id?: string }): Promise<EventParticipant>;
  updateParticipants(ids: string[], patch: Partial<EventParticipantInput>): Promise<number>;
  deleteParticipants(ids: string[]): Promise<number>;

  /** 2 % dane. */
  listDonations(): Promise<TaxDonation[]>;
  /** Vráti počet naozaj uložených darov — už naimportované (rovnaký odtlačok) preskočí. */
  saveDonations(inputs: TaxDonationInput[]): Promise<number>;
  updateDonation(id: string, patch: Partial<TaxDonationInput>): Promise<void>;
  deleteDonations(ids: string[]): Promise<number>;

  /** Bankové platby. */
  listBankTransactions(): Promise<BankTransaction[]>;
  saveBankTransactions(inputs: BankTransactionInput[]): Promise<BankTransaction[]>;

  /** Sezóny. */
  listSeasons(): Promise<Season[]>;
  saveSeason(input: { id?: string; name: string; starts_on: string; ends_on: string }): Promise<Season>;
  setCurrentSeason(id: string): Promise<void>;

  /** Požičovňa: kategórie a podkategórie výstroja. */
  listEquipmentCategories(): Promise<EquipmentCategory[]>;
  saveEquipmentCategory(input: Omit<EquipmentCategory, "id"> & { id?: string }): Promise<EquipmentCategory>;
  deleteEquipmentCategory(id: string): Promise<void>;

  listEquipment(): Promise<Equipment[]>;
  saveEquipment(input: EquipmentInput & { id?: string }): Promise<Equipment>;
  bulkEquipment(ids: string[], action: BulkEquipmentAction): Promise<number>;

  listLoans(): Promise<Loan[]>;
  saveLoan(input: LoanInput & { id?: string }): Promise<Loan>;
  updateLoans(ids: string[], patch: Partial<LoanInput>): Promise<number>;
  deleteLoans(ids: string[]): Promise<number>;

  /** Dochádzka. Zápis je idempotentný podľa dvojice dieťa + dátum. */
  listAttendance(): Promise<Attendance[]>;
  saveAttendance(entries: AttendanceInput[]): Promise<number>;

  listConfirmations(): Promise<Confirmation[]>;
  createConfirmations(inputs: ConfirmationInput[]): Promise<number>;
  deleteConfirmation(id: string): Promise<void>;

  clubSettings(): Promise<ClubSettings>;
  saveClubSettings(settings: ClubSettings): Promise<void>;

  /** Import: náhľad sa odloží, potvrdenie beží práve raz (token). */
  savePendingImport(pending: PendingImport): Promise<void>;
  pendingImport(): Promise<PendingImport | null>;
  clearPendingImport(): Promise<void>;
  /** `false` = tento token už prebehol, import sa nemá zopakovať. */
  claimImportToken(token: string): Promise<boolean>;
  /** Záznam o importe je len doplnok — uloženie nikdy nezhodí samotný import. */
  saveImportLog(log: ImportLog): Promise<void>;
  importLogs(): Promise<ImportLog[]>;
}
