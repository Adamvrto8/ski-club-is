-- Počet kusov pre sklad: pomôcky, tyče a vesty nie sú jednotlivé požičiavané kusy,
-- ale zoznam „koľko toho máme“. Počet bol doteraz len textom v poznámke, takže sa
-- nedal zobraziť ako samostatný stĺpec. Nullable — pri kusoch na požičanie nemá zmysel.
alter table public.equipment
  add column if not exists quantity integer check (quantity is null or quantity >= 0);
