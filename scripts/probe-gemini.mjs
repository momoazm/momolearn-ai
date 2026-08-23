import 'dotenv/config';

const key = process.env.GEMINI_API_KEY;
if (!key) { console.log('NO GEMINI KEY'); process.exit(0); }
const models = ['gemini-3.6-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-2.5-flash'];
for (const m of models) {
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: m,
      max_tokens: 200,
      messages: [{ role: 'user', content: 'Reply with JSON {"ok":true}' }],
    }),
  });
  let extra = '';
  if (!res.ok) {
    const t = await res.text();
    extra = t.replace(/\s+/g, ' ').slice(0, 140);
  }
  console.log(m, res.status, extra);
}
