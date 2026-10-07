-- Zosúladenie kontaktov s kontaktným hárkom klubu.
--
-- 1) Telefón patrí konkrétnemu rodičovi, nie poradiu. V hárku je stĺpec „telefón“
--    hneď za „Otec - meno“ a druhý hneď za „Mama - meno“, takže phone_1 je otcov
--    a phone_2 mamin. Premenovanie hodnoty zachováva.
-- 2) Miery na výstroj (výška, váha, chodidlo) boli doteraz iba v Exceli.

alter table public.contacts rename column phone_1 to father_phone;
alter table public.contacts rename column phone_2 to mother_phone;

-- Chodidlo s jedným desatinným miestom: veľkosti lyžiarok (mondopoint) idú
-- po pol centimetri, 19,5 a 20 sú dve rôzne topánky.
alter table public.contacts
  add column height_cm smallint check (height_cm between 50 and 250),
  add column weight_kg smallint check (weight_kg between 10 and 200),
  add column foot_cm numeric(3,1) check (foot_cm between 10 and 40);

comment on column public.contacts.father_phone is 'Hárok: stĺpec „telefón“ za „Otec - meno“.';
comment on column public.contacts.mother_phone is 'Hárok: stĺpec „telefón“ za „Mama - meno“.';
comment on column public.contacts.height_cm is 'Miera na výstroj, hárok „výška cm“.';
comment on column public.contacts.weight_kg is 'Miera na výstroj, hárok „váha kg“.';
comment on column public.contacts.foot_cm is 'Dĺžka chodidla na lyžiarky, hárok „chodidlo cm“.';
