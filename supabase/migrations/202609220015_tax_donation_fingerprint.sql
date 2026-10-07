-- Odtlačok importovaného daru 2 %: ten istý riadok z Google Forms sa nesmie
-- započítať dvakrát, ani keď sa súbor nahrá znova (inak sa zdvojí aj zľava 2 %).
--
-- Ručne zadané dary odtlačok nemajú (null) — unikátnosť sa na ne nevzťahuje.

alter table public.tax_donations add column if not exists fingerprint text unique;
