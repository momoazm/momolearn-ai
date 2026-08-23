const SUPABASE_URL = () => process.env.SUPABASE_URL;
const SERVICE_KEY = () => process.env.SUPABASE_SERVICE_KEY;

export function dbConfigured() {
  return Boolean(SUPABASE_URL() && SERVICE_KEY());
}

async function rest(method, path, { body, query, prefer } = {}) {
  if (!dbConfigured()) throw new Error('Supabase is not configured (SUPABASE_URL / SUPABASE_SERVICE_KEY).');
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${SUPABASE_URL()}/rest/v1/${path}${qs}`, {
    method,
    headers: {
      apikey: SERVICE_KEY(),
      Authorization: `Bearer ${SERVICE_KEY()}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export const db = {
  select: (table, query) => rest('GET', table, { query }),
  insert: (table, row) => rest('POST', table, { body: row, prefer: 'return=representation' }),
  update: (table, row, query) => rest('PATCH', table, { body: row, query, prefer: 'return=representation' }),
  upsert: (table, row, onConflict) =>
    rest('POST', table, { body: row, prefer: `resolution=merge-duplicates,on_conflict=${onConflict},return=representation` }),
  delete: (table, query) => rest('DELETE', table, { query }),
};
