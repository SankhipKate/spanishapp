# Cloud synchronization (v24)

The existing Supabase schema expected by this version is `public.word_progress(user_id,word_id,state,updated_at)` and `public.review_history(user_id,event_id,word_id,rating,answered_at,extra)` with per-user RLS.

1. Configure Google provider in Supabase and set Site URL + Redirect URLs to https://sankhipkate.github.io/spanishapp/.
2. Deploy the updated static files through a feature branch and Pull Request.
3. On the Mac where training progress was originally saved, export `slova-progress.json`.
4. Open the deployed site, sign in using Google, and import that JSON from Settings. The importer merges with cloud progress, retaining locally newer per-word states.
5. On iPhone, open the deployed site and sign in with the same Google account. Review history and progress are loaded from Supabase.

Limitations: Supabase REST requests aren't transactional across all words and history; use the original export as a backup. Concurrent edits to the same word within seconds on multiple devices are not conflict-free. Cross-device cloud history is read with Supabase's default page limit and needs pagination for very large journals. Google Sheet URL is locally configured and the same default URL is bundled with the app.

Public keys in `config.js` are intended for use from the browser. Never place a service role key or Google OAuth client secret in GitHub.


## v25: исправление пустого ответа REST

Операции INSERT/UPSERT в Supabase по умолчанию могут возвращать HTTP 201 с пустым телом. Теперь это считается успешной записью. При ошибке импорта локальная копия остаётся сохранённой, а ошибка облака показывается отдельно. После публикации v25 на Mac открой опубликованный сайт в том же браузере, где импортирован JSON, и повторно импортируй резервную копию, чтобы повторить облачную отправку. Проверить облачные записи можно в Supabase Table Editor (`word_progress` и `review_history`).

## v0.27.0: safe sync
On login, preserve previously verified cloud data in a separate per-user browser backup. Merge by word update timestamp, never replace the full learned-word set with a smaller local snapshot. Import merges rather than replaces.
