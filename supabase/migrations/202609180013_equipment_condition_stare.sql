-- Opotrebenie „Staré“: hárky klubu delili lyže a kombinézy na nové a staré.
--
-- Migrácia 0012 dala všetkému „nové“ a podkategóriu „Staré“ zrušila — tým sa
-- stratilo, čo hárok o kuse vedel. Tu to vraciame. Funguje v oboch prípadoch:
-- ak 0012 ešte nebežala (kus je stále v podkategórii „Staré“), aj ak už bežala
-- (starý kus sa pozná podľa kódu — zoznamy „lyže staré“ a „kombinézy staré“
-- sa importovali s predponou LYZE-S a KOMB-S, žiadny nový kus ju nemá).
-- Spustiť raz, pred fyzickou kontrolou: opakovaný beh by skontrolovaný
-- „Dobrý stav“ prepísal späť.

-- 1) Stĺpec z enumu na text s kontrolou. Nová hodnota enumu by sa v tom istom
--    behu SQL editora nedala hneď použiť; text s kontrolou áno.
alter table public.equipment alter column condition drop default;
alter table public.equipment alter column condition type text using condition::text;
alter table public.equipment alter column condition set default 'nove';
alter table public.equipment drop constraint if exists equipment_condition_check;
alter table public.equipment add constraint equipment_condition_check
  check (condition in ('nove', 'stare', 'dobre', 'opotrebovane', 'poskodene'));

-- 2) Kusy, ktoré sú ešte v podkategórii „Staré“ (0012 nebežala).
update public.equipment e
set condition = 'stare'
from public.equipment_categories c
where e.category_id = c.id
  and c.parent_id is not null
  and lower(c.name) ~ '(^|\s)star[éeáaýyo](\s|$)'
  and e.condition in ('nove', 'dobre');

-- 3) Kusy, ktoré už 0012 presunula — poznáme ich podľa kódu.
update public.equipment
set condition = 'stare'
where (inventory_code ilike 'LYZE-S-%' or inventory_code ilike 'KOMB-S-%')
  and condition in ('nove', 'dobre');

-- 4) To isté, čo robí 0012, aby tu nezáležalo na poradí: podkategórie
--    „Nové“/„Staré“ zrušiť (cena zostane na kuse), neoverené „dobre“ → „nove“.
update public.equipment e
set season_price = coalesce(e.season_price, c.season_price),
    category_id = c.parent_id
from public.equipment_categories c
where e.category_id = c.id
  and c.parent_id is not null
  and lower(c.name) ~ '(^|\s)(nov|star)[éeáaýyo](\s|$)';

delete from public.equipment_categories c
where c.parent_id is not null
  and lower(c.name) ~ '(^|\s)(nov|star)[éeáaýyo](\s|$)'
  and not exists (select 1 from public.equipment e where e.category_id = c.id);

update public.equipment set condition = 'nove' where condition = 'dobre';
