-- Klub zrušil skupinu „Predaj“ — všetko z nej je odteraz na prenájom.
-- Tabuľky v Prenájme sa tvoria podľa kategórie, takže prilby z predaja sa pridajú
-- k prilbám a chrániče, palice a vaky dostanú vlastné tabuľky. Sklad sa nemení.
-- Hodnota 'predaj' v type equipment_purpose ostáva (z enumu sa v Postgrese
-- nedá jednoducho vyhodiť); appka ju už nepoužíva. Dá sa spustiť aj opakovane.

update public.equipment
set purpose = 'prenajom', updated_at = now()
where purpose = 'predaj';
