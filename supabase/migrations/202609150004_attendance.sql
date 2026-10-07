-- Dochádzka: jeden riadok na dieťa a deň tréningu.

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  season_id uuid not null references public.seasons(id) on delete restrict,
  date date not null,
  present boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Opakovaný import toho istého hárku prepíše hodnotu, nevytvorí duplikát.
  unique (child_id, date)
);

create index attendance_date_idx on public.attendance(date);
create index attendance_child_idx on public.attendance(child_id);

alter table public.attendance enable row level security;

-- Tréner vidí aj zapisuje dochádzku len pre deti zo svojich družstiev; admin všetko.
create policy "team scoped attendance read" on public.attendance
  for select using (
    exists (select 1 from public.children c where c.id = child_id and public.can_access_team(c.team))
  );

create policy "team scoped attendance insert" on public.attendance
  for insert with check (
    exists (select 1 from public.children c where c.id = child_id and public.can_access_team(c.team))
  );

create policy "team scoped attendance update" on public.attendance
  for update using (
    exists (select 1 from public.children c where c.id = child_id and public.can_access_team(c.team))
  ) with check (
    exists (select 1 from public.children c where c.id = child_id and public.can_access_team(c.team))
  );

create policy "admins delete attendance" on public.attendance
  for delete using (public.is_admin());
