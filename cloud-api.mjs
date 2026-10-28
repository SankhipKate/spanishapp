// Supabase REST writes commonly succeed with HTTP 201/204 and no response body.
export async function readApiResponse(response) {
  const body = await response.text();
  let payload = null;
  if (body.trim()) {
    try { payload = JSON.parse(body); }
    catch { if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 300)}`);
      throw new Error(`Supabase вернул некорректный ответ (HTTP ${response.status}).`); }
  }
  if (!response.ok) {
    const detail = payload?.message || payload?.error_description || payload?.error || payload?.hint || response.statusText || 'Ошибка запроса';
    throw new Error(`HTTP ${response.status}: ${detail}`);
  }
  return payload;
}
