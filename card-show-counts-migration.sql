begin;

create table if not exists public.card_show_counts (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  source_id uuid not null,
  count integer not null check (count > 0),
  primary key (user_id, day, source_id)
);

alter table public.card_show_counts enable row level security;
grant select, insert, update on public.card_show_counts to authenticated;

drop policy if exists "read own card show counts" on public.card_show_counts;
create policy "read own card show counts" on public.card_show_counts
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "insert own card show counts" on public.card_show_counts;
create policy "insert own card show counts" on public.card_show_counts
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "update own card show counts" on public.card_show_counts;
create policy "update own card show counts" on public.card_show_counts
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.merge_card_show_counts(counts jsonb)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.card_show_counts as stored (user_id, day, source_id, count)
  select auth.uid(), incoming.day, incoming.source_id, incoming.count
  from jsonb_to_recordset(counts) as incoming(day date, source_id uuid, count integer)
  on conflict (user_id, day, source_id) do update
  set count = excluded.count
  where excluded.count > stored.count;
$$;

revoke execute on function public.merge_card_show_counts(jsonb) from public, anon;
grant execute on function public.merge_card_show_counts(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
