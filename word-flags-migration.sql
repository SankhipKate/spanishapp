-- Run in Supabase SQL Editor. Does not change existing progress or history.
create table if not exists public.word_flags (
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id text not null,
  flag text not null check (flag in ('fix','repeat')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  ru text not null default '',
  es text not null default '',
  primary key (user_id,word_id,flag)
);
alter table public.word_flags enable row level security;
grant select,insert,update on public.word_flags to authenticated;
create policy "word_flags_select" on public.word_flags for select to authenticated using ((select auth.uid())=user_id);
create policy "word_flags_insert" on public.word_flags for insert to authenticated with check ((select auth.uid())=user_id);
create policy "word_flags_update" on public.word_flags for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
