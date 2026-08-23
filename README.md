# MomoLearn AI

Calm, open-source study tools for MBZUAI admissions prep — two apps in one repo:

| App | What it does |
| --- | --- |
| **MBZUAI Prep** (`/mbzuai`) | Diagnostic + full mock screening tests, per-topic practice (math, logic, programming, data & AI reasoning), AI tutor, performance coach, mistake auto-classification, streaks and progress sync |
| **MBZUAI Interview Coach** (`mbzuai-interview/`) | Realistic voice mock interviews — general, motivation, technical, research, behavioral, stress — with instant scored reports |

> Independent practice project inspired by publicly available information about MBZUAI admissions. Not affiliated with Mohamed bin Zayed University of Artificial Intelligence.

## Bring your own key (BYOK)

Both apps run on **your own free AI key** — the server never ships or shares anyone's keys:

1. Open **`/keys.html`** on either app
2. Pick a provider (Google AI Studio / Gemini is the easiest free option) and create a key using the linked guide
3. Paste it in, hit **Save**, then **Test it**

The key is stored only in your browser's `localStorage` and sent only to the app's server to call the model on your behalf. It is never logged, stored server-side, or committed.

Supported providers: Google AI Studio (Gemini), Groq, OpenRouter, Cerebras, GitHub Models, Mistral, OpenAI.

## Run it yourself

```bash
git clone https://github.com/momoazm/momolearn-ai.git
cd momolearn-ai
npm install

# optional: only for local dev convenience
cp .env.example .env   # keys here work locally; they are IGNORED on Vercel

npm start              # MomoLearn on http://localhost:3000

cd mbzuai-interview
npm install
npm start              # Interview Coach on http://localhost:3100
```

Then open `/keys.html`, add a free key, and everything works.

### Environment variables (all optional)

See [`.env.example`](.env.example). Server-side model keys are honored **only outside production** (`VERCEL` unset) so a public deployment can never spend the owner's quota. Other optional vars: `MBZUAI_ACCESS_CODE`, `MBZUAI_DAILY_LIMIT`, `SITE_URL`, `TOTAL_TIMEOUT_MS`. The Interview Coach can optionally use Vercel KV for account sync (`lib/db.js`).

## Project structure

```
server.js                  Express app + BYOK middleware + multi-provider model router
lib/router.js              Classifies prompts -> picks a fallback chain of models
lib/mbzuai/                Question bank, generator, coach, auth, state sync routes
public/                    MomoLearn workspace + MBZUAI Prep SPA
public/keys.html           Step-by-step "add your free AI key" guide
mbzuai-interview/          Second deployable site (own api/, lib/, public/)
```

## Deploying

Any Node host works. On Vercel: import the repo once for the root app and again with root directory `mbzuai-interview`. No secrets required — visitors bring their own keys.

## License

[MIT](LICENSE)
