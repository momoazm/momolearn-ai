#!/usr/bin/env node
/**
 * MomoLearn Health Check - Run on startup and before test runs
 * Exits 0 if all systems healthy, 1 if issues detected
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkPlaywrightBrowsers() {
  // Check for downloaded Chromium
  const base = path.join(process.env.USERPROFILE, 'AppData', 'Local', 'ms-playwright');
  let chromium = false;
  try {
    chromium = fs.readdirSync(base).some(f => f.startsWith('chromium') && !f.startsWith('chromium_headless'));
  } catch {}

  // Check for system Edge/Chrome (used via channel: 'msedge' or 'chrome')
  let edge = false;
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ];
  for (const p of edgePaths) {
    if (fs.existsSync(p)) { edge = true; break; }
  }

  // Check for Chrome as fallback
  let chrome = false;
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
  ];
  for (const p of chromePaths) {
    if (fs.existsSync(p)) { chrome = true; break; }
  }

  return { ok: chromium && (edge || chrome), msg: `Playwright: Chromium ${chromium ? '✅' : '❌'} System Edge ${edge ? '✅' : '❌'} Chrome ${chrome ? '✅' : '❌'}` };
}

const CHECKS = {
  nodeVersion: () => {
    const v = execSync('node --version', { encoding: 'utf8' }).trim();
    const major = parseInt(v.slice(1).split('.')[0]);
    return { ok: major >= 22, msg: `Node ${v} ${major >= 22 ? '✅' : '❌ (need v22+)'}` };
  },
  
  playwrightBrowsers: checkPlaywrightBrowsers,
  
  dependencies: () => {
    const pkg = path.join('C:\\Users\\momo\\Documents\\Default Project', 'package.json');
    return { ok: fs.existsSync(pkg), msg: 'package.json ✅' };
  },
  
  skillsLoaded: () => {
    const skill = path.join(process.env.USERPROFILE, '.config', 'opencode', 'skills', 'resilient-testing', 'SKILL.md');
    const fallback = path.join(process.env.USERPROFILE, '.config', 'opencode', 'fallback.json');
    return { ok: fs.existsSync(skill) && fs.existsSync(fallback), msg: `Skills: ${fs.existsSync(skill) ? '✅' : '❌'} Fallback: ${fs.existsSync(fallback) ? '✅' : '❌'}` };
  },
  
  serverRunning: () => {
    try {
      execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:3111/ 2>&1 | findstr 200', { encoding: 'utf8', shell: 'cmd.exe' });
      return { ok: true, msg: 'Server port 3111 ✅' };
    } catch {
      return { ok: false, msg: 'Server port 3111 ❌ (not running)' };
    }
  },
  
  apiHealth: () => {
    try {
      const out = execSync(`$body = @{ question="test"; maxMarks=2; markscheme=@("p1","p2"); answer="a" } | ConvertTo-Json; Invoke-RestMethod -Uri "http://localhost:3111/api/igcse/mark" -Method Post -ContentType "application/json" -Body $body -TimeoutSec 15 2>&1 | Select-Object -First 1`, { encoding: 'utf8', shell: 'powershell.exe' });
      return { ok: out.includes('ok'), msg: out.includes('ok') ? 'IGCSE API ✅' : `IGCSE API ❌: ${out.slice(0,80)}` };
    } catch (e) {
      return { ok: false, msg: `IGCSE API ❌: ${String(e).slice(0,80)}` };
    }
  },
  
  opencodeAuth: () => {
    try {
      const out = execSync('opencode models 2>&1', { encoding: 'utf8', shell: 'cmd.exe' });
      const hasKeys = out.includes('provider') && !out.includes('keyless') && !out.includes('login');
      return { ok: hasKeys, msg: hasKeys ? 'OpenCode auth ✅' : 'OpenCode auth ⚠️ (run: opencode connect)' };
    } catch {
      return { ok: true, msg: 'OpenCode auth ⚠️ (CLI not in PATH - optional)' };
    }
  }
};

function main() {
  console.log('🏥 MomoLearn Health Check');
  console.log('='.repeat(50));
  
  let allOk = true;
  for (const [name, check] of Object.entries(CHECKS)) {
    const result = check();
    console.log(`${result.ok ? '✅' : '❌'} ${result.msg}`);
    if (!result.ok) allOk = false;
  }
  
  console.log('='.repeat(50));
  if (allOk) {
    console.log('🎉 All systems healthy');
    process.exit(0);
  } else {
    console.log('⚠️  Issues detected - run: npm run fix-env');
    process.exit(1);
  }
}

main();