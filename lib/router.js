export const CATEGORIES = ['code', 'reasoning', 'creative', 'summarize', 'general'];

const KEYWORDS = {
  code: [
    'code', 'function', 'bug', 'debug', 'error', 'exception', 'stack trace',
    'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'rust', 'golang',
    'html', 'css', 'sql', 'regex', 'api', 'refactor', 'compile', 'script',
    'npm', 'git ', 'react', 'node', 'class', 'array', 'loop', 'variable',
    'database', 'query', 'endpoint', 'server', 'deploy', 'docker',
  ],
  reasoning: [
    'solve', 'equation', 'derivative', 'integral', 'calculate', 'compute',
    'probability', 'algebra', 'geometry', 'theorem', 'proof', 'logic',
    'math', 'matrix', 'factorial', 'percentage', 'percent of', 'step by step',
    'why does', 'explain why', 'analyze', 'reason through', 'puzzle',
  ],
  creative: [
    'story', 'poem', 'poetry', 'lyrics', 'song', 'joke', 'slogan', 'tagline',
    'brainstorm', 'imagine', 'fiction', 'character', 'plot', 'screenplay',
    'write me a', 'once upon', 'creative', 'roleplay', 'rap', 'haiku',
    'essay about', 'paragraph about my', 'name ideas',
  ],
  summarize: [
    'summarize', 'summary', 'tldr', 'tl;dr', 'shorten', 'condense',
    'key points', 'main points', 'main idea', 'bullet points', 'digest',
    'recap', 'brief overview', 'in short',
  ],
};

const PATTERNS = {
  code: [/```/, /;\s*$/m, /\b(def|const|let|var|import|export|SELECT .+ FROM)\b/],
  reasoning: [/\d+\s*[+\-*/^]\s*\d+/, /[∫∑√π]/, /\bx\s*[=<>]/, /\d+\s*%/],
};

export function classify(text) {
  const t = ` ${text.toLowerCase()} `;
  const scores = { code: 0, reasoning: 0, creative: 0, summarize: 0 };

  for (const [cat, words] of Object.entries(KEYWORDS)) {
    for (const w of words) if (t.includes(w)) scores[cat] += 1;
  }
  for (const [cat, patterns] of Object.entries(PATTERNS)) {
    for (const re of patterns) if (re.test(text)) scores[cat] += 2;
  }

  let best = 'general';
  let bestScore = 0.5;
  for (const cat of CATEGORIES) {
    if (cat === 'general') continue;
    if (scores[cat] > bestScore) {
      best = cat;
      bestScore = scores[cat];
    }
  }
  return { category: best, scores };
}

const MODEL_POOL = {
  'groq/gpt-oss-120b': { provider: 'groq', model: 'openai/gpt-oss-120b' },
  'cerebras/gpt-oss-120b': { provider: 'cerebras', model: 'gpt-oss-120b' },
  'openrouter/nemotron-3-ultra': { provider: 'openrouter', model: 'nvidia/nemotron-3-ultra-550b-a55b:free' },
  'openrouter/nemotron-3-super': { provider: 'openrouter', model: 'nvidia/nemotron-3-super-120b-a12b:free' },
  'openrouter/glm-5.2': { provider: 'openrouter', model: 'z-ai/glm-5.2:free' },
  'openrouter/inkling': { provider: 'openrouter', model: 'thinkingmachines/inkling:free' },
  'openrouter/gemma-4-31b': { provider: 'openrouter', model: 'google/gemma-4-31b-it:free' },
  'mistral/mistral-small': { provider: 'mistral', model: 'mistral-small-latest' },
  'gemini/gemini-3.6-flash': { provider: 'gemini', model: 'gemini-3.6-flash' },
  'github/gpt-4o-mini': { provider: 'github-models', model: 'openai/gpt-4o-mini' },
  'openai/gpt-4o-mini (paid)': { provider: 'openai', model: 'gpt-4o-mini' },
  'openrouter/auto (paid)': { provider: 'openrouter', model: 'openrouter/auto' },
};

function entry(label) {
  return { label, ...MODEL_POOL[label], tier: label.includes('paid') ? 'paid' : 'free' };
}

export const ROUTES = {
  code: {
    description: 'Strong at programming & technical answers',
    order: [
      'groq/gpt-oss-120b',
      'cerebras/gpt-oss-120b',
      'openrouter/glm-5.2',
      'gemini/gemini-3.6-flash',
      'mistral/mistral-small',
      'github/gpt-4o-mini',
      'openrouter/nemotron-3-super',
      'openai/gpt-4o-mini (paid)',
      'openrouter/auto (paid)',
    ],
  },
  reasoning: {
    description: 'Best at math & multi-step logic',
    order: [
      'groq/gpt-oss-120b',
      'cerebras/gpt-oss-120b',
      'openrouter/glm-5.2',
      'gemini/gemini-3.6-flash',
      'github/gpt-4o-mini',
      'mistral/mistral-small',
      'openai/gpt-4o-mini (paid)',
      'openrouter/auto (paid)',
    ],
  },
  creative: {
    description: 'Natural, expressive writing',
    order: [
      'openrouter/glm-5.2',
      'mistral/mistral-small',
      'gemini/gemini-3.6-flash',
      'openrouter/nemotron-3-super',
      'groq/gpt-oss-120b',
      'cerebras/gpt-oss-120b',
      'openrouter/gemma-4-31b',
      'github/gpt-4o-mini',
      'openai/gpt-4o-mini (paid)',
      'openrouter/auto (paid)',
    ],
  },
  summarize: {
    description: 'Long-context condensing & key points',
    order: [
      'gemini/gemini-3.6-flash',
      'openrouter/nemotron-3-super',
      'groq/gpt-oss-120b',
      'cerebras/gpt-oss-120b',
      'mistral/mistral-small',
      'openrouter/glm-5.2',
      'github/gpt-4o-mini',
      'openai/gpt-4o-mini (paid)',
      'openrouter/auto (paid)',
    ],
  },
  general: {
    description: 'Fast everyday chat',
    order: [
      'groq/gpt-oss-120b',
      'cerebras/gpt-oss-120b',
      'gemini/gemini-3.6-flash',
      'openrouter/glm-5.2',
      'openrouter/nemotron-3-super',
      'mistral/mistral-small',
      'github/gpt-4o-mini',
      'openai/gpt-4o-mini (paid)',
      'openrouter/auto (paid)',
    ],
  },
};

export function routeFor(category) {
  const cat = ROUTES[category] ? category : 'general';
  return {
    category: cat,
    chain: ROUTES[cat].order.map(entry),
  };
}

export function fullRoute(category) {
  const primary = routeFor(category);
  const seen = new Set(primary.chain.map((e) => e.label));
  const rest = ROUTES.general.order
    .map(entry)
    .filter((e) => !seen.has(e.label));
  return { ...primary, chain: [...primary.chain, ...rest] };
}
