-- Miery na výstroj (výška, váha, chodidlo) z kontaktov preč — klub ich v appke nechce.
-- Spusti až PO nasadení kódu, ktorý tieto stĺpce už neposiela; inak ukladanie kontaktu zlyhá.

alter table public.contacts
  drop column if exists height_cm,
  drop column if exists weight_kg,
  drop column if exists foot_cm;
