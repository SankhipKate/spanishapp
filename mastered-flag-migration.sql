-- Run once in Supabase SQL Editor before enabling the new app version.
-- Retains every existing flag, word and progress record.
alter table public.word_flags drop constraint if exists word_flags_flag_check;
alter table public.word_flags add constraint word_flags_flag_check check (flag in ('fix','repeat','mastered'));
