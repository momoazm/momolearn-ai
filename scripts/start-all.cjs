#!/usr/bin/env node
/**
 * MomoLearn Startup Script - Starts server, runs health check, opens browser
 * Run: node scripts/start-all.cjs
 */

const { execSync, spawn } = require('child_process');

const PROJECT_ROOT = 'C:\\Users\\momo\\Documents\\Default Project';

function run(cmd, cwd = PROJECT_ROOT) {
  try {
    return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'inherit', shell: 'powershell.exe' });
  } catch (e) {
    console.error(`Failed: ${cmd}`);
    console.error(String(e.stdout || e.stderr || e.message));
    process.exit(1);
  }
}

async function main() {
  console.log('🚀 MomoLearn Startup Sequence');
  console.log('='.repeat(50));

  // 1. Fix environment
  console.log('\n1️⃣  Fixing environment...');
  run('node scripts/fix-environment.js');

  // 2. Start server
  console.log('\n2️⃣  Starting server on port 3111...');
  const server = spawn('node', ['server.js'], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: '3111', VERCEL: '' },
    detached: true,
    stdio: 'ignore'
  });
  server.unref();
  
  // Wait for server ready
  let ready = false;
  for (let i = 0; i < 10; i++) {
    try {
      execSync('curl -s -o /dev/null -w "%{http_code}" http://localhost:3111/ 2>&1 | findstr 200', { encoding: 'utf8', shell: 'cmd.exe' });
      ready = true;
      break;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!ready) {
    console.error('❌ Server failed to start');
    process.exit(1);
  }
  console.log('   ✅ Server ready');

  // 3. Health check
  console.log('\n3️⃣  Running health check...');
  try {
    run('node scripts/health-check.cjs');
  } catch {
    console.error('❌ Health check failed');
    process.exit(1);
  }

  // 4. Open browser
  console.log('\n4️⃣  Opening browser...');
  run('start http://localhost:3111/');

  console.log('\n' + '='.repeat(50));
  console.log('🎉 MomoLearn is running!');
  console.log('   • Server: http://localhost:3111');
  console.log('   • IGCSE: http://localhost:3111/#/ (click IGCSE tab)');
  console.log('   • API: http://localhost:3111/api/igcse/mark');
  console.log('   • Health: npm run health');
}

main();