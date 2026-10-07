-- Bezpečné prideľovanie VS: databáza, nie UI, je jediným zdrojom pravdy.
create sequence if not exists public.child_variable_symbol_seq start with 1001;
select setval(
  'public.child_variable_symbol_seq',
  greatest((select coalesce(max(variable_symbol) + 1, 1001) from public.children), 1001),
  false
);
alter table public.children
  alter column variable_symbol set default nextval('public.child_variable_symbol_seq');
