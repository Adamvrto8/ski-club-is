-- Sústredenia a akcie, 2 % dane a bankové výpisy.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  name text not null,
  place text not null default '',
  starts_on date not null,
  ends_on date not null,
  event_type text not null default '',
  -- Vlastný VS akcie, napr. „2026001“.
  variable_symbol text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

/*
 * Účastník je buď existujúci člen (child_id), alebo ručný rodinný záznam —
 * na sústredenia chodia aj rodičia a súrodenci, ktorí nie sú členmi klubu.
 */
create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  child_id uuid references public.children(id) on delete set null,
  family_name text not null,
  children_count integer not null default 0 check (children_count >= 0),
  adults_count integer not null default 0 check (adults_count >= 0),
  deposit numeric(10,2) not null default 0 check (deposit >= 0),
  deposit_paid boolean not null default false,
  balance numeric(10,2) not null default 0 check (balance >= 0),
  balance_paid boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index event_participants_event_idx on public.event_participants(event_id);

create table public.tax_donations (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  -- Dar sa dá naimportovať aj bez priradenia a priradiť dieťaťu neskôr.
  child_id uuid references public.children(id) on delete set null,
  donor_name text not null default '',
  amount numeric(10,2) not null check (amount >= 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index tax_donations_child_idx on public.tax_donations(child_id);

create table public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons(id) on delete restrict,
  booked_on date not null,
  amount numeric(10,2) not null,
  variable_symbol text not null default '',
  counterparty text not null default '',
  note text not null default '',
  matched_payment_id uuid references public.payments(id) on delete set null,
  -- Odtlačok riadku výpisu: ten istý pohyb sa nesmie započítať dvakrát.
  fingerprint text not null unique,
  created_at timestamptz not null default now()
);

create index bank_transactions_vs_idx on public.bank_transactions(variable_symbol);

alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.tax_donations enable row level security;
alter table public.bank_transactions enable row level security;

-- Akcie vidia všetci prihlásení, spravuje ich admin.
create policy "authenticated read events" on public.events for select to authenticated using (true);
create policy "admins manage events" on public.events for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read participants" on public.event_participants
  for select to authenticated using (true);
create policy "admins manage participants" on public.event_participants
  for all using (public.is_admin()) with check (public.is_admin());

-- Dary aj bankové pohyby sú citlivé, vidí ich len admin.
create policy "admins manage donations" on public.tax_donations
  for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage bank transactions" on public.bank_transactions
  for all using (public.is_admin()) with check (public.is_admin());
