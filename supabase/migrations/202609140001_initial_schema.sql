-- Fáza 1: základ dátového modelu a bezpečnostných pravidiel.
create type public.app_role as enum ('admin', 'coach');
create type public.team_name as enum ('skola_lyzovania', 'sportove_druzstvo', 'pretekove_druzstvo');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'coach',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trainer_teams (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  team public.team_name not null,
  primary key (profile_id, team)
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create unique index one_current_season on public.seasons (is_current) where is_current;

-- Táto tabuľka neobsahuje rodné číslo ani adresu, preto ju môže bezpečne čítať tréner.
create table public.children (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text not null,
  birth_date date not null,
  team public.team_name not null,
  active boolean not null default true,
  variable_symbol integer not null unique check (variable_symbol >= 1001),
  is_sport_registered boolean not null default false,
  sport_registered_at date,
  sport_identifier text,
  membership_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (first_name, last_name, birth_date)
);

-- Citlivé údaje má k dispozícii iba admin; nikdy sa neposielajú trénerovi.
create table public.child_private_details (
  child_id uuid primary key references public.children(id) on delete cascade,
  national_id text,
  permanent_address text
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null unique references public.children(id) on delete cascade,
  father_name text,
  mother_name text,
  emails text[] not null default '{}',
  phone_1 text,
  phone_2 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.contact_private_details (
  contact_id uuid primary key references public.contacts(id) on delete cascade,
  address text
);

create table public.payment_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_amount numeric(10,2) not null check (base_amount >= 0),
  eligible_for_confirmation boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete restrict,
  category_id uuid not null references public.payment_categories(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  amount numeric(10,2) not null check (amount >= 0),
  due_date date not null,
  paid boolean not null default false,
  paid_at date,
  period text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((paid and paid_at is not null) or (not paid and paid_at is null))
);
create index payments_child_id_idx on public.payments(child_id);
create index payments_due_date_idx on public.payments(due_date) where not paid;

create table public.club_settings (
  id boolean primary key default true check (id),
  official_name text not null,
  address text not null,
  ico text,
  iban text,
  statutory_representative text not null,
  updated_at timestamptz not null default now()
);

create table public.confirmations (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete restrict,
  season_id uuid not null references public.seasons(id) on delete restrict,
  mode text not null check (mode in ('one_time', 'monthly')),
  period text not null,
  expense_type text not null,
  amount numeric(10,2) not null check (amount >= 0),
  pdf_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.can_access_team(target_team public.team_name)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.trainer_teams where profile_id = auth.uid() and team = target_team
  )
$$;

alter table public.profiles enable row level security;
alter table public.trainer_teams enable row level security;
alter table public.seasons enable row level security;
alter table public.children enable row level security;
alter table public.child_private_details enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_private_details enable row level security;
alter table public.payment_categories enable row level security;
alter table public.payments enable row level security;
alter table public.club_settings enable row level security;
alter table public.confirmations enable row level security;

create policy "users read own profile" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "admins manage profiles" on public.profiles for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage trainer teams" on public.trainer_teams for all using (public.is_admin()) with check (public.is_admin());
create policy "users read own team links" on public.trainer_teams for select using (profile_id = auth.uid());

create policy "authenticated users read seasons" on public.seasons for select to authenticated using (true);
create policy "admins manage seasons" on public.seasons for all using (public.is_admin()) with check (public.is_admin());
create policy "team scoped child read" on public.children for select using (public.can_access_team(team));
create policy "admins manage children" on public.children for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage private child data" on public.child_private_details for all using (public.is_admin()) with check (public.is_admin());
create policy "team scoped contact read" on public.contacts for select using (exists (select 1 from public.children c where c.id = child_id and public.can_access_team(c.team)));
create policy "admins manage contacts" on public.contacts for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage private contact data" on public.contact_private_details for all using (public.is_admin()) with check (public.is_admin());
create policy "authenticated users read payment categories" on public.payment_categories for select to authenticated using (true);
create policy "admins manage payment categories" on public.payment_categories for all using (public.is_admin()) with check (public.is_admin());
create policy "team scoped payment read" on public.payments for select using (exists (select 1 from public.children c where c.id = child_id and public.can_access_team(c.team)));
create policy "admins manage payments" on public.payments for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage club settings" on public.club_settings for all using (public.is_admin()) with check (public.is_admin());
create policy "admins manage confirmations" on public.confirmations for all using (public.is_admin()) with check (public.is_admin());

-- Vytvorí profil pri registrácii. Rola je vždy coach; admina povyšuje existujúci admin v DB.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
