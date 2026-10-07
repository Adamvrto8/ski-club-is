-- Opotrebenie patrí do stĺpca condition, nie do podkategórie.
--
-- Import vytváral podkategórie z názvu súboru („lyže nové“ → podkategória
-- „Nové“), takže stĺpec Kategória raz ukazoval vek kusu a inokedy len skupinu.
-- Import opotrebenie nikdy nečítal — všetko dostalo predvolené „dobre“, ktoré
-- nikto neoveril. Dohoda s klubom: kým kus niekto fyzicky neskontroluje,
-- vedie sa ako nový.

-- 1) Kusy z podkategórií „Nové“/„Staré“ presunieme do hlavnej kategórie.
--    Cena sa smie odvodzovať z podkategórie, preto ju najprv prepíšeme na kus,
--    aby sa presunom nezmenila.
update public.equipment e
set season_price = coalesce(e.season_price, c.season_price),
    category_id = c.parent_id
from public.equipment_categories c
where e.category_id = c.id
  and c.parent_id is not null
  and lower(c.name) ~ '(^|\s)(nov|star)[éeáaýyo](\s|$)';

-- 2) Prázdne podkategórie „Nové“/„Staré“ zmažeme.
delete from public.equipment_categories c
where c.parent_id is not null
  and lower(c.name) ~ '(^|\s)(nov|star)[éeáaýyo](\s|$)'
  and not exists (select 1 from public.equipment e where e.category_id = c.id);

-- 3) Neoverené „dobre“ → „nove“. Opotrebované a poškodené nechávame — tie
--    niekto nastavil ručne.
update public.equipment set condition = 'nove' where condition = 'dobre';

alter table public.equipment alter column condition set default 'nove';
