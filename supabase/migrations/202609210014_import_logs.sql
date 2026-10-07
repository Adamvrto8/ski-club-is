-- Posledný import členov a inventára: ktoré riadky preskočil a prečo.
--
-- Jeden záznam na druh importu, ďalší import toho istého druhu ho prepíše.
-- Vidia ho všetci admini klubu — k preskočeným riadkom sa treba vedieť vrátiť
-- aj o pár dní a z iného zariadenia, keď sa opravuje zdrojový súbor.

create table if not exists public.import_logs (
  kind text primary key check (kind in ('members', 'equipment')),
  file_name text not null default '',
  skipped jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.import_logs enable row level security;

drop policy if exists "admins manage import logs" on public.import_logs;
create policy "admins manage import logs" on public.import_logs
  for all using (public.is_admin())
  with check (public.is_admin());
