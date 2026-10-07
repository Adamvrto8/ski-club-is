-- Inventár klubu sa delí na tri skupiny podľa toho, na čo vec slúži, a lyžiarky
-- majú počet klipsov, od ktorého sa odvíja cena požičania.

/*
 * Určenie kusu. V hárkoch klubu to bolo doteraz len nadpisom nad tabuľkou
 * („PRENÁJOM“, „PREDAJ“) — teda údaj, ktorý sa pri importe stratil. Pomôcky na
 * tréningy nie sú ani na predaj, ani na požičanie, a nemajú sa miešať
 * do zoznamu, z ktorého sa deťom požičiava.
 */
do $$
begin
  if not exists (select 1 from pg_type where typname = 'equipment_purpose') then
    create type public.equipment_purpose as enum ('prenajom', 'predaj', 'sklad');
  end if;
end $$;

alter table public.equipment
  add column if not exists purpose public.equipment_purpose not null default 'prenajom';

/*
 * Počet klipsov (praciek) na lyžiarkach. Klub podľa neho určuje cenu —
 * 3-klipsové a 4-klipsové sa požičiavajú za iné peniaze. Nullable zámerne:
 * tam, kde to v hárku nikto nevyplnil, má zostať prázdne, nie nula.
 */
alter table public.equipment
  add column if not exists buckles smallint check (buckles is null or (buckles >= 0 and buckles <= 10));

create index if not exists equipment_purpose_idx on public.equipment(purpose);
