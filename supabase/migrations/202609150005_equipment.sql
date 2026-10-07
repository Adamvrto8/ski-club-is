-- Požičovňa a inventár: kategórie, kusy výstroja a výpožičky.

create type public.equipment_status as enum ('dostupne', 'pozicane', 'v_oprave', 'stratene', 'vyradene');
create type public.equipment_condition as enum ('nove', 'dobre', 'opotrebovane', 'poskodene');

-- Jedna tabuľka pre kategórie aj podkategórie: podkategória má vyplnený parent_id.
create table public.equipment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.equipment_categories(id) on delete cascade,
  season_price numeric(10,2) check (season_price is null or season_price >= 0),
  created_at timestamptz not null default now()
);

-- Rovnaký názov sa nesmie vytvoriť dvakrát v tej istej úrovni — chráni import pred duplicitami.
create unique index equipment_categories_unique_root
  on public.equipment_categories (lower(name)) where parent_id is null;
create unique index equipment_categories_unique_child
  on public.equipment_categories (parent_id, lower(name)) where parent_id is not null;

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  inventory_code text not null unique,
  name text not null,
  category_id uuid references public.equipment_categories(id) on delete set null,
  size text not null default '',
  brand text not null default '',
  season_price numeric(10,2) check (season_price is null or season_price >= 0),
  condition public.equipment_condition not null default 'dobre',
  status public.equipment_status not null default 'dostupne',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index equipment_status_idx on public.equipment(status);
create index equipment_category_idx on public.equipment(category_id);

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete restrict,
  borrowed_on date not null,
  returned_on date,
  price numeric(10,2) not null default 0 check (price >= 0),
  paid boolean not null default false,
  returned boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((returned and returned_on is not null) or (not returned and returned_on is null))
);

create index loans_equipment_idx on public.loans(equipment_id);
create index loans_child_idx on public.loans(child_id);
-- Jeden kus môže mať naraz len jednu nevrátenú výpožičku.
create unique index loans_one_active_per_item on public.loans (equipment_id) where not returned;

alter table public.equipment_categories enable row level security;
alter table public.equipment enable row level security;
alter table public.loans enable row level security;

-- Výstroj vidia všetci prihlásení, meniť ho smie iba admin.
create policy "authenticated read equipment categories" on public.equipment_categories
  for select to authenticated using (true);
create policy "admins manage equipment categories" on public.equipment_categories
  for all using (public.is_admin()) with check (public.is_admin());

create policy "authenticated read equipment" on public.equipment
  for select to authenticated using (true);
create policy "admins manage equipment" on public.equipment
  for all using (public.is_admin()) with check (public.is_admin());

-- Tréner vidí výpožičky detí zo svojich družstiev, upravuje ich len admin.
create policy "team scoped loan read" on public.loans
  for select using (
    exists (select 1 from public.children c where c.id = child_id and public.can_access_team(c.team))
  );
create policy "admins manage loans" on public.loans
  for all using (public.is_admin()) with check (public.is_admin());
