-- Run once in the Supabase SQL editor. Never expose service_role credentials to the browser.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sheet_url text not null default '',
  sheet_range text not null default '',
  review_mode text not null default 'practice',
  updated_at timestamptz not null default now()
);
create table if not exists public.reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id text not null,
  data jsonb not null,
  primary key (user_id, word_id)
);
alter table public.profiles enable row level security;
alter table public.reviews enable row level security;
create policy "profiles_select_own" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "reviews_select_own" on public.reviews for select to authenticated using ((select auth.uid()) = user_id);
create policy "reviews_insert_own" on public.reviews for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "reviews_update_own" on public.reviews for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
