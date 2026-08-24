#!/usr/bin/env node
/**
 * Environment Fix Script for MomoLearn + OpenCode + Playwright
 * Run: node scripts/fix-environment.cjs
 * Fixes: Node version, Playwright browsers, API keys, server management
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = 'C:\\Users\\momo\\Documents\\Default Project';
const SKILLS_DIR = path.join(process.env.USERPROFILE, '.config', 'opencode', 'skills');
const PLAYWRIGHT_CORE = path.join(SKILLS_DIR, 'website-clips', 'scripts', 'node_modules', 'playwright-core');

function run(cmd, cwd = PROJECT_ROOT) {
  try {
    const out = execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe', shell: 'powershell.exe' });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, out: String(e.stdout || e.stderr || e.message).trim() };
  }
}

async function main() {
  console.log('🔧 MomoLearn Environment Fix');
  console.log('='.repeat(50));

  // 1. Node.js version
  console.log('\n1. Node.js Version:');
  const nodeVer = run('node --version');
  console.log(nodeVer.ok ? `   ✅ ${nodeVer.out}` : `   ❌ ${nodeVer.out}`);
  if (!nodeVer.ok || !nodeVer.out.startsWith('v22')) {
    console.log('   ⚠️  Recommend Node.js v22.x LTS. Install from nodejs.org');
  }

  // 2. npm packages
  console.log('\n2. Project Dependencies:');
  const pkgCheck = run('npm ls --depth=0 2>&1 | head -20');
  console.log(pkgCheck.ok ? '   ✅ Dependencies installed' : `   ⚠️  ${pkgCheck.out}`);

  // 3. Playwright browsers
  console.log('\n3. Playwright Browsers:');
  const pwInstall = run('npx playwright install --with-deps chromium 2>&1');
  console.log(pwInstall.ok ? '   ✅ Chromium installed' : `   ⚠️  ${pwInstall.out.slice(0, 200)}`);
  
  const edgeCheck = run('npx playwright install msedge 2>&1');
  console.log(edgeCheck.ok ? '   ✅ Edge channel available' : `   ⚠️  Edge: ${edgeCheck.out.slice(0, 100)}`);

  // 4. Playwright-core path (for skills)
  console.log('\n4. Playwright-core Path:');
  if (fs.existsSync(PLAYWRIGHT_CORE)) {
    console.log(`   ✅ Found at ${PLAYWRIGHT_CORE}`);
  } else {
    console.log(`   ❌ Not found at ${PLAYWRIGHT_CORE}`);
    console.log('   Run: cd ~/.config/opencode/skills/website-clips/scripts && npm install playwright-core');
  }

  // 5. OpenCode auth (not keyless)
  console.log('\n5. OpenCode Authentication:');
  const models = run('opencode models 2>&1 | Select-Object -First 5');
  if (models.ok && models.out.includes('provider')) {
    console.log('   ✅ Providers configured');
  } else {
    console.log('   ⚠️  Run: opencode connect');
    console.log('   (Keyless mode causes "Upstream request failed" on free tiers)');
  }

  // 6. Server test
  console.log('\n6. Server Health Check:');
  const serverCheck = run('$env:PORT="3111"; Start-Process node -ArgumentList "server.js" -PassThru -WindowStyle Hidden | Select-Object Id; Start-Sleep 2; (Invoke-WebRequest http://localhost:3111/ -UseBasicParsing).StatusCode');
  if (serverCheck.ok && serverCheck.out.includes('200')) {
    console.log('   ✅ Server starts and responds 200');
  } else {
    console.log(`   ⚠️  Server issue: ${serverCheck.out}`);
  }

  // 7. Skill loaded
  console.log('\n7. Resilient-Testing Skill:');
  const skillPath = path.join(SKILLS_DIR, 'resilient-testing', 'SKILL.md');
  if (fs.existsSync(skillPath)) {
    console.log('   ✅ Skill installed at ~/.config/opencode/skills/resilient-testing/SKILL.md');
    console.log('   Restart opencode to load: quit and reopen');
  } else {
    console.log('   ❌ Skill not found');
  }

  // 8. Quick API test
  console.log('\n8. IGCSE API Quick Test:');
  const apiTest = run('$body = @{ question="test"; maxMarks=2; markscheme=@("point 1","point 2"); answer="test answer" } | ConvertTo-Json; Invoke-RestMethod -Uri "http://localhost:3111/api/igcse/mark" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 30 2>&1 | Select-Object -First 3');
  console.log(apiTest.ok ? '   ✅ API responds' : `   ⚠️  ${apiTest.out.slice(0, 200)}`);

  console.log('\n' + '='.repeat(50));
  console.log('✅ Environment check complete');
  console.log('\n📋 Next steps:');
  console.log('   1. Restart opencode to load the new skill');
  console.log('   2. Run tests: node test/igcse-complete.spec.js');
  console.log('   3. For subagent failures, the skill provides inline fallback pattern');
}

main();