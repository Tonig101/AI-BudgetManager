/* 临时端到端探针 v2：等流式输出稳定后再取回复，逐条串行，避免测量偏差 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTML = 'file:///' + path.resolve('AI记账.html').replace(/\\/g, '/');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ajprobe4-'));
const PORT = 9404;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MSGS = [
  '昨天中午和室友吃麻辣香锅花了68，我请的',
  '这周点外卖太频繁了，有点慌',
  '刚才那笔记错了，是86不是68',
  '这个月哪类花得最多',
  '我想毕业前攒5000块，一个月得存多少',
  '今天没花钱'
];

(async () => {
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--window-size=1280,900', HTML], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl);
  const pending = new Map(); let id = 0;
  const send = (method, params) => new Promise((res, rej) => {
    const mid = ++id; pending.set(mid, { res, rej });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
  });
  await new Promise(r => ws.addEventListener('open', r));
  await send('Runtime.enable');
  await sleep(8000);

  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result && 'value' in r.result ? r.result.value : (r.result && r.result.description);
  };

  await ev(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => /就它了/.test(x.textContent));
    if (b) b.click(); return true;
  })()`);
  await sleep(600);

  console.log('初始:', JSON.stringify(await ev(`AJ_FLOW_DEBUG()`)));

  const results = [];
  for (const msg of MSGS) {
    const t0 = Date.now();
    const before = await ev(`document.querySelectorAll('.bubble.ai').length`);
    await ev(`(() => {
      const i = document.getElementById('chatInput');
      i.focus(); i.value = ${JSON.stringify(msg)};
      i.dispatchEvent(new Event('input', { bubbles: true }));
      document.getElementById('btnSend').click();
      return true;
    })()`);

    // 等气泡出现，再等文本连续 4 次采样不变（流式结束）
    let reply = '', stable = 0, last = '', appeared = false;
    for (let k = 0; k < 75; k++) {
      await sleep(400);
      const now = await ev(`document.querySelectorAll('.bubble.ai').length`);
      if (!appeared && now > before) appeared = true;
      if (!appeared) continue;
      const cur = await ev(`(() => {
        const a = document.querySelectorAll('.bubble.ai');
        return (a[a.length-1].textContent || '').trim();
      })()`);
      if (cur && cur === last) { stable++; } else { stable = 0; }
      last = cur || last;
      if (stable >= 4 && cur) { reply = cur; break; }
      if (k === 74) reply = cur || '';
    }
    const cost = Date.now() - t0;
    const flow = await ev(`AJ_FLOW_DEBUG()`);
    results.push({ msg, reply, cost, bills: flow.bills, last: flow.last });
    console.log(`\n[${(cost / 1000).toFixed(1)}s] 用户: ${msg}\n  阿账: ${reply || '（无回复）'}\n  账本笔数: ${flow.bills} | 最近入账: ${JSON.stringify(flow.last)}`);
    await sleep(800);
  }

  const costs = results.map(r => r.cost).sort((a, b) => a - b);
  console.log(`\n延迟：min ${costs[0]}ms / median ${costs[Math.floor(costs.length / 2)]}ms / max ${costs[costs.length - 1]}ms`);
  fs.writeFileSync('_shot/e2e_ai_v2.json', JSON.stringify(results, null, 1));
  await send('Page.captureScreenshot', {}).then(r => fs.writeFileSync('_shot/e2e_ai_v2.png', Buffer.from(r.data, 'base64'))).catch(() => {});
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error('异常:', e.message); process.exit(1); });
