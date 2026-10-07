-- Odbery push notifikácií. Jeden riadok na zariadenie prihláseného používateľa.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  -- Endpoint je unikátna adresa zariadenia u push služby (FCM, APNs, Mozilla).
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);

create index push_subscriptions_owner_idx on public.push_subscriptions(owner_id);

alter table public.push_subscriptions enable row level security;

-- Každý spravuje len vlastné zariadenia; admin vidí všetky, aby vedel rozposlať upozornenia.
create policy "users manage own push subscriptions" on public.push_subscriptions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "admins read push subscriptions" on public.push_subscriptions
  for select using (public.is_admin());
