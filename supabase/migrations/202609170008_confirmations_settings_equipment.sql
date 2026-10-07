-- Potvrdenia presne podľa reálnej predlohy klubu, doplnené údaje klubu, farba/model
-- na výstroji, a rozlíšenie druhu rozpracovaného importu (členovia vs. inventár).

-- Potvrdenie: kto oň žiadal (jeden konkrétny zákonný zástupca, nie oboch rodičov
-- spojených) a mesačný rozpis súm pre režim „mesačné platby“.
alter table public.confirmations add column if not exists requested_by text not null default '';
alter table public.confirmations add column if not exists monthly_breakdown jsonb;

/*
 * Skutočný vzor potvrdenia klubu obsahuje telefón, registráciu v registri
 * právnických osôb (IDPO) a názov účtu, na ktorý platby chodia — v appke
 * doteraz chýbali. Údaje klubu vypĺňa admin v Nastaveniach.
 */
alter table public.club_settings add column if not exists phone text not null default '';
alter table public.club_settings add column if not exists registry_note text not null default '';
alter table public.club_settings add column if not exists account_holder_name text not null default '';

-- Farba a model boli doteraz nezachytiteľné (miešali sa so značkou), hoci ich
-- reálne skladové zoznamy klubu bežne majú ako samostatné stĺpce.
alter table public.equipment add column if not exists color text not null default '';
alter table public.equipment add column if not exists model text not null default '';

-- Rozpracovaný import je teraz buď členov, alebo inventára — obe zdieľajú
-- jeden koncept (náhľad → mapovanie → potvrdenie), ale nesmú si navzájom
-- prepísať rozpracovaný stav toho druhého.
alter table public.import_drafts add column if not exists kind text not null default 'members';
alter table public.import_drafts drop constraint if exists import_drafts_kind_check;
alter table public.import_drafts add constraint import_drafts_kind_check check (kind in ('members', 'equipment'));
