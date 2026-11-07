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

// Continue until an empty page: a server may cap responses below pageSize.
// Callers supply a deterministic order ending in a unique key.
export async function readAllRows(api, path, pageSize = 500) {
  const rows = [];
  let previousPage = null;
  for (;;) {
    const page = await api(`${path}&limit=${pageSize}&offset=${rows.length}`);
    if (!Array.isArray(page)) throw new Error('Некорректный ответ при загрузке истории.');
    if (!page.length) return rows;
    const signature = JSON.stringify(page);
    if (signature === previousPage) throw new Error('Сервер повторяет страницу данных. Загрузка прервана.');
    rows.push(...page);
    previousPage = signature;
  }
}
