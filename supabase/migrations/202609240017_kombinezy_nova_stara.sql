-- Kombinézy: cena podľa podkategórie „Nová“ (40 €) / „Stará“ (20 €), ktoré klub
-- založil v Požičovňa → Kategórie. Kusy doteraz ležali v hlavnej kategórii bez ceny.
--
-- Nové a staré sa dajú spoľahlivo rozlíšiť len podľa inventárneho čísla
-- (KOMB-N-… z „Kombinézy nové“, KOMB-S-… zo „Kombinézy staré“); opotrebenie je
-- pri neskontrolovaných kusoch predvolene „nové“. Vlastnú cenu kusu zmažeme,
-- aby platila cena podkategórie. Kusy s iným číslom treba preradiť ručne.
-- Dá sa spustiť aj opakovane.

update public.equipment e
set category_id = sub.id, season_price = null, updated_at = now()
from public.equipment_categories sub
join public.equipment_categories parent on parent.id = sub.parent_id
where lower(parent.name) like 'kombin%'
  and lower(sub.name) like 'nov%'
  and e.inventory_code ilike 'KOMB-N-%';

update public.equipment e
set category_id = sub.id, season_price = null, updated_at = now()
from public.equipment_categories sub
join public.equipment_categories parent on parent.id = sub.parent_id
where lower(parent.name) like 'kombin%'
  and lower(sub.name) like 'star%'
  and e.inventory_code ilike 'KOMB-S-%';
