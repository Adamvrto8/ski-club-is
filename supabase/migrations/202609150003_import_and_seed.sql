-- Import: náhľad pred potvrdením + ochrana proti dvojitému spusteniu.

-- Rozpracovaný import čaká na potvrdenie. Jeden koncept na používateľa.
create table public.import_drafts (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  token uuid not null,
  file_name text not null,
  headers jsonb not null,
  rows jsonb not null,
  created_at timestamptz not null default now()
);

-- Už spustené importy. Unikátny token zabezpečí, že druhé kliknutie neprejde.
create table public.import_runs (
  token uuid primary key,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.import_drafts enable row level security;
alter table public.import_runs enable row level security;

-- Koncept aj beh importu patria vždy jednému adminovi a nikto iný ich nevidí.
create policy "admins manage own import drafts" on public.import_drafts
  for all using (owner_id = auth.uid() and public.is_admin())
  with check (owner_id = auth.uid() and public.is_admin());

create policy "admins manage own import runs" on public.import_runs
  for all using (owner_id = auth.uid() and public.is_admin())
  with check (owner_id = auth.uid() and public.is_admin());

-- Potvrdenie sa tlačí priamo z appky, preto cesta k súboru nie je povinná.
alter table public.confirmations alter column pdf_path drop not null;

-- Východiskové údaje klubu, aby potvrdenia neboli prázdne.
insert into public.club_settings (id, official_name, address, ico, iban, statutory_representative)
values (
  true,
  'Demo Ski Club',
  'Demo Street 1, 000 00 Demo City',
  null,
  null,
  ''
)
on conflict (id) do nothing;

-- Aktuálna sezóna, na ktorú sa viažu platby a potvrdenia.
insert into public.seasons (name, starts_on, ends_on, is_current)
values ('Sezóna 2026/2027', '2026-09-01', '2027-08-31', true)
on conflict (name) do nothing;
