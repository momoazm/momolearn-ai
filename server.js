import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { classify, fullRoute, ROUTES, CATEGORIES } from './lib/router.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PROVIDERS = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    key: () => process.env.OPENROUTER_API_KEY,
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    key: () => process.env.GROQ_API_KEY,
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    key: () => process.env.GEMINI_API_KEY,
  },
  'github-models': {
    baseUrl: 'https://models.github.ai/inference',
    key: () => process.env.GITHUB_TOKEN,
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    key: () => process.env.OPENAI_API_KEY,
  },
  cerebras: {
    baseUrl: 'https://api.cerebras.ai/v1',
    key: () => process.env.CEREBRAS_API_KEY,
  },
  mistral: {
    baseUrl: 'https://api.mistral.ai/v1',
    key: () => process.env.MISTRAL_API_KEY,
  },
};

const COOLDOWN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 45_000;
const cooldowns = new Map();

const isCoolingDown = (label) => (cooldowns.get(label) ?? 0) > Date.now();

async function callModel(entry, messages) {
  const provider = PROVIDERS[entry.provider];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.key()}`,
        ...(entry.provider.startsWith('openrouter')
          ? {
              'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
              'X-Title': 'MomoLearn',
            }
          : {}),
      },
      body: JSON.stringify({ model: entry.model, messages }),
    });
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('empty response');
    return content;
  } finally {
    clearTimeout(timer);
  }
}

app.post('/api/chat', async (req, res) => {
  const messages = Array.isArray(req.body.messages) ? req.body.messages : null;
  if (!messages) return res.status(400).json({ error: 'messages array required' });

  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const promptText =
    (lastUser?.content || messages.map((m) => m.content || '').join(' ')) ?? '';
  const { category, scores } = classify(String(promptText));
  const { chain } = fullRoute(category);

  const attempts = [];
  const startedAt = Date.now();
  const budgetMs = Number(process.env.TOTAL_TIMEOUT_MS) || 55_000;
  for (const entry of chain) {
    if (!PROVIDERS[entry.provider].key()) continue;
    if (Date.now() - startedAt > budgetMs) break;
    if (isCoolingDown(entry.label)) {
      attempts.push({ model: entry.label, status: 'cooldown' });
      continue;
    }
    try {
      const started = Date.now();
      const content = await callModel(entry, messages);
      attempts.push({ model: entry.label, status: 'ok', ms: Date.now() - started });
      return res.json({
        content,
        model: entry.label,
        tier: entry.tier,
        category,
        scores,
        attempts,
      });
    } catch (e) {
      const status = e.status ?? (e.name === 'AbortError' ? 408 : 0);
      if (status === 429 || status >= 500 || status === 408 || status === 0) {
        cooldowns.set(entry.label, Date.now() + COOLDOWN_MS);
      }
      attempts.push({ model: entry.label, status: `fail:${status}` });
    }
  }

  const anyKeyConfigured = Object.values(PROVIDERS).some((p) => p.key());
  res.status(anyKeyConfigured ? 503 : 500).json({
    error: anyKeyConfigured
      ? 'All models failed or are cooling down. Try again shortly.'
      : 'No API keys configured on the server (.env).',
    category,
    attempts,
  });
});

app.get('/api/models', (req, res) => {
  res.json({
    routing: 'criteria-based',
    categories: CATEGORIES.map((cat) => ({
      id: cat,
      description: ROUTES[cat].description,
      models: ROUTES[cat].order.map((label) => ({
        label,
        cooldown: isCoolingDown(label),
      })),
    })),
  });
});

if (!process.env.VERCEL) {
  app.listen(process.env.PORT || 3000, () => {
    console.log(`MomoLearn AI running on http://localhost:${process.env.PORT || 3000}`);
  });
}
