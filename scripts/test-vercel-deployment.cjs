#!/usr/bin/env node
/**
 * Vercel Deployment Test Suite
 * Tests the live Vercel deployment at https://momolearn-ai.vercel.app
 * Run: node scripts/test-vercel-deployment.cjs
 */

const https = require('https');
const http = require('http');

const BASE_URL = 'https://momolearn-ai.vercel.app';

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'MomoLearn-Test/1.0',
        ...(options.headers || {})
      },
      timeout: 60000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, headers: res.headers, data: json, raw: data });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function runTests() {
  const results = { passed: 0, failed: 0, tests: [] };

  function test(name, fn) {
    return async () => {
      try {
        await fn();
        results.passed++;
        results.tests.push({ name, status: 'PASS' });
        console.log(`✅ ${name}`);
      } catch (e) {
        results.failed++;
        results.tests.push({ name, status: 'FAIL', error: e.message });
        console.log(`❌ ${name}: ${e.message}`);
      }
    };
  }

  // 1. Home page loads (handles Vercel redirect)
  await test('Home page loads (200/307)', async () => {
    const res = await request(BASE_URL + '/');
    if (![200, 307].includes(res.status)) throw new Error(`Status ${res.status}`);
    // If 307, follow redirect
    if (res.status === 307) {
      let location = res.headers.location;
      // Handle relative redirect URLs
      if (location.startsWith('/')) {
        location = BASE_URL + location;
      }
      const res2 = await request(location);
      if (res2.status !== 200) throw new Error(`Redirect target status ${res2.status}`);
      if (!res2.raw.includes('MomoLearn')) throw new Error('Missing MomoLearn branding');
      if (!res2.raw.includes('IGCSE')) throw new Error('Missing IGCSE tab');
    } else {
      if (!res.raw.includes('MomoLearn')) throw new Error('Missing MomoLearn branding');
      if (!res.raw.includes('IGCSE')) throw new Error('Missing IGCSE tab');
    }
  })();

  // 2. IGCSE static assets
  await test('IGCSE app.js loads', async () => {
    const res = await request(BASE_URL + '/igcse/app.js');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.raw.includes('buildExam') && !res.raw.includes('randomExam')) throw new Error('Missing core exports');
  })();

  await test('IGCSE CSS loads', async () => {
    const res = await request(BASE_URL + '/igcse/igcse.css');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.raw.includes('.timer') || !res.raw.includes('.q-card')) throw new Error('Missing key styles');
  })();

  await test('Physics bank loads', async () => {
    const res = await request(BASE_URL + '/igcse/banks/physics.js');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.raw.includes('p4:') || !res.raw.includes('p6:')) throw new Error('Missing P4/P6 banks');
  })();

  await test('Chemistry bank loads', async () => {
    const res = await request(BASE_URL + '/igcse/banks/chemistry.js');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  })();

  await test('Biology bank loads', async () => {
    const res = await request(BASE_URL + '/igcse/banks/biology.js');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
  })();

  // 3. Core API
  await test('GET /api/models', async () => {
    const res = await request(BASE_URL + '/api/models');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.categories || res.data.categories.length < 3) throw new Error('Missing categories');
  })();

  await test('GET /api/igcse/status', async () => {
    const res = await request(BASE_URL + '/api/igcse/status');
    if (res.status !== 200) throw new Error(`Status ${res.status}`);
    if (!res.data.ok || typeof res.data.aiAvailable !== 'boolean') throw new Error('Invalid response');
  })();

  // 4. IGCSE exam API
  await test('POST /api/igcse/mark - validation (empty)', async () => {
    const res = await request(BASE_URL + '/api/igcse/mark', { method: 'POST', body: {} });
    if (![400, 401].includes(res.status)) throw new Error(`Expected 400/401, got ${res.status}`);
  })();

  await test('POST /api/igcse/mark - validation (empty answer)', async () => {
    const body = { question: 'test', maxMarks: 2, markscheme: ['p1'], answer: '' };
    const res = await request(BASE_URL + '/api/igcse/mark', { method: 'POST', body });
    if (![400, 401].includes(res.status)) throw new Error(`Expected 400/401, got ${res.status}`);
  })();

  await test('POST /api/igcse/mark - validation (empty markscheme)', async () => {
    const body = { question: 'test', maxMarks: 2, markscheme: [], answer: 'ans' };
    const res = await request(BASE_URL + '/api/igcse/mark', { method: 'POST', body });
    if (![400, 401].includes(res.status)) throw new Error(`Expected 400/401, got ${res.status}`);
  })();

  // 5. IGCSE exam builder via API (test core logic via health check)
  // We can't easily test client-side JS without a browser, but we can verify data integrity
  // via a quick node check of the deployed core.js
  await test('Core exam builder (data integrity)', async () => {
    const res = await request(BASE_URL + '/igcse/core.js');
    if (res.status !== 200) throw new Error('Core JS failed to load');
    // Verify it exports key functions
    if (!res.raw.includes('buildExam') || !res.raw.includes('randomExam') || !res.raw.includes('SESSIONS')) {
      throw new Error('Missing core exports');
    }
  })();

  // 6. Chat API (if keys configured)
  await test('POST /api/chat - basic (may fail without keys)', async () => {
    const body = { messages: [{ role: 'user', content: 'hello' }] };
    const res = await request(BASE_URL + '/api/chat', { method: 'POST', body });
    // Accept 200, 401 (needs key), 503 (all models failed) as valid responses
    if (![200, 401, 503].includes(res.status)) {
      throw new Error(`Unexpected status ${res.status}: ${res.raw.slice(0,200)}`);
    }
  })();

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(`Results: ${results.passed} passed, ${results.failed} failed`);
  if (results.failed > 0) {
    console.log('\nFailures:');
    results.tests.filter(t => t.status === 'FAIL').forEach(t => {
      console.log(`  ❌ ${t.name}: ${t.error}`);
    });
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  }
}

runTests().catch(e => {
  console.error('Test runner error:', e.message);
  process.exit(1);
});