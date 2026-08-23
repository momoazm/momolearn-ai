import { AsyncLocalStorage } from 'node:async_hooks';

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

const byok = new AsyncLocalStorage();

export function byokMiddleware(req, res, next) {
  const key = String(req.headers['x-ai-key'] || '').trim();
  if (!key) return next();
  const provider = String(req.headers['x-ai-provider'] || '').trim().toLowerCase();
  if (!PROVIDERS[provider]) {
    return res.status(400).json({ error: `Unknown AI provider "${provider}". Supported: ${Object.keys(PROVIDERS).join(', ')}.` });
  }
  if (key.length < 16 || key.length > 400) {
    return res.status(400).json({ error: 'That API key looks invalid. Copy the full key from the provider dashboard.' });
  }
  byok.run({ provider, key }, next);
}

const labelKey = (label) => (byok.getStore() ? `byok:${label}` : label);

// Server env keys are honored ONLY outside Vercel (local dev).
// The deployed site never spends the owner's keys - users must bring their own.
export const envKeysAllowed = () => !process.env.VERCEL;

export const hasKey = (provider) => {
  const override = byok.getStore();
  if (override) return override.provider === provider;
  return Boolean(envKeysAllowed() && PROVIDERS[provider]?.key());
};
export const isCoolingDown = (label) => (cooldowns.get(labelKey(label)) ?? 0) > Date.now();
export const markCooldown = (label) => cooldowns.set(labelKey(label), Date.now() + COOLDOWN_MS);

const MODEL_POOL = {
  'groq/gpt-oss-120b': { provider: 'groq', model: 'openai/gpt-oss-120b' },
  'cerebras/gpt-oss-120b': { provider: 'cerebras', model: 'gpt-oss-120b' },
  'openrouter/nemotron-3-ultra': { provider: 'openrouter', model: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
  'openrouter/nemotron-3-super': { provider: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
  'openrouter/glm-5.2': { provider: 'openrouter', model: 'z-ai/glm-5.2:free' },
  'openrouter/inkling': { provider: 'openrouter', model: 'thinkingmachines/inkling:free' },
  'openrouter/gemma-4-31b': { provider: 'openrouter', model: 'google/gemma-4-31b-it:free' },
  'mistral/mistral-small': { provider: 'mistral', model: 'mistral-small-latest' },
  'gemini/gemini-2.0-flash': { provider: 'gemini', model: 'gemini-2.0-flash' },
  'github/gpt-4o-mini': { provider: 'github-models', model: 'openai/gpt-4o-mini' },
  'openai/gpt-4o-mini (paid)': { provider: 'openai', model: 'gpt-4o-mini' },
  'openrouter/auto (paid)': { provider: 'openrouter', model: 'openrouter/auto' },
};

const CHAIN = [
  'groq/gpt-oss-120b',
  'cerebras/gpt-oss-120b',
  'openrouter/inkling',
  'openrouter/nemotron-3-ultra',
  'openrouter/nemotron-3-super',
  'openrouter/glm-5.2',
  'gemini/gemini-2.0-flash',
  'mistral/mistral-small',
  'openrouter/gemma-4-31b',
  'github/gpt-4o-mini',
  'openai/gpt-4o-mini (paid)',
  'openrouter/auto (paid)',
];

export function chain() {
  return CHAIN.map((label) => ({ label, ...MODEL_POOL[label], tier: label.includes('paid') ? 'paid' : 'free' }));
}

export async function callModel(entry, messages, options = {}) {
  const provider = PROVIDERS[entry.provider];
  const override = byok.getStore();
  const apiKey =
    override && override.provider === entry.provider
      ? override.key
      : envKeysAllowed()
        ? provider.key()
        : undefined;
  if (!apiKey) throw new Error(`no API key for ${entry.provider}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...(entry.provider === 'openrouter'
          ? {
              'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
              'X-Title': 'MBZUAI Interview Coach',
            }
          : {}),
      },
      body: JSON.stringify({
        model: entry.model,
        messages,
        ...(options.temperature != null ? { temperature: options.temperature } : {}),
      }),
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

export async function runChain(messages, options = {}) {
  const attempts = [];
  const startedAt = Date.now();
  const budgetMs = Number(process.env.TOTAL_TIMEOUT_MS) || 55_000;
  for (const entry of chain()) {
    if (!hasKey(entry.provider)) continue;
    if (Date.now() - startedAt > budgetMs) break;
    if (isCoolingDown(entry.label)) {
      attempts.push({ model: entry.label, status: 'cooldown' });
      continue;
    }
    try {
      const started = Date.now();
      const content = await callModel(entry, messages, options);
      attempts.push({ model: entry.label, status: 'ok', ms: Date.now() - started });
      return { content, model: entry.label, attempts };
    } catch (e) {
      const status = e.status ?? (e.name === 'AbortError' ? 408 : 0);
      if (status === 429 || status >= 500 || status === 408 || status === 0) markCooldown(entry.label);
      attempts.push({ model: entry.label, status: `fail:${status}` });
    }
  }
  const anyKey =
    Boolean(byok.getStore()) ||
    (envKeysAllowed() && Object.values(PROVIDERS).some((p) => p.key()));
  const err = new Error(
    anyKey
      ? 'All models failed or are cooling down. Try again shortly.'
      : 'This feature uses your own free AI key. Add one in about a minute at /keys.html.'
  );
  err.attempts = attempts;
  err.needsKey = !anyKey;
  throw err;
}
