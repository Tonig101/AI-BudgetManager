/* 临时探针：用本机 Chrome CDP 打开应用，检查云服务/智能体是否真的就绪 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTML = 'file:///' + path.resolve('AI记账.html').replace(/\\/g, '/');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ajprobe-'));
const PORT = 9401;
const sleep = ms => new Promise(r => setTimeout(r, ms));

function jget(url) {
  return fetch(url).then(r => r.json());
}

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--window-size=1280,900',
    HTML
  ], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try {
      const list = await jget(`http://127.0.0.1:${PORT}/json/list`);
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (e) { /* retry */ }
  }
  if (!wsUrl) { console.log('CDP 未就绪'); chrome.kill(); process.exit(1); }

  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;
  const send = (method, params) => new Promise((res, rej) => {
    const mid = ++id;
    pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });

  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  await send('Page.enable');

  async function evalJs(expr) {
    const r = await send('Runtime.evaluate', {
      expression: expr, returnByValue: true, awaitPromise: true
    });
    return r.result && 'value' in r.result ? r.result.value : r.result;
  }

  console.log('页面已打开，等待 SDK 初始化…');
  await sleep(9000);

  console.log('AJ_AGENT_DEBUG =>', JSON.stringify(await evalJs('window.AJ_AGENT_DEBUG && AJ_AGENT_DEBUG()')));
  console.log('AJ_METRICS_REPORT =>', JSON.stringify(await evalJs('window.AJ_METRICS_REPORT && AJ_METRICS_REPORT()')));
  console.log('_cloudReady/模型 =>', JSON.stringify(await evalJs(`(() => {
    try {
      return {
        sdk: !!window.WorkBuddyCloud,
        cfg: !!window.AJ_CLOUD_CONFIG,
        hasInput: !!document.querySelector('input[type=text], textarea')
      };
    } catch(e) { return { err: String(e) }; }
  })()`)));

  await send('Page.captureScreenshot', {}).then(r => {
    fs.writeFileSync('_shot/ai_probe.png', Buffer.from(r.data, 'base64'));
    console.log('截图已存 _shot/ai_probe.png');
  }).catch(e => console.log('截图失败', e.message));

  ws.close();
  chrome.kill();
  process.exit(0);
})().catch(e => { console.error('探针异常:', e.message); process.exit(1); });
