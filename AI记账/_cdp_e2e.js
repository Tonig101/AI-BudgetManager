/* 临时端到端探针：真实浏览器里逐条发消息，记录回复与耗时（多轮上下文） */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTML = 'file:///' + path.resolve('AI记账.html').replace(/\\/g, '/');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ajprobe3-'));
const PORT = 9403;
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

  // 关掉新手弹窗
  await ev(`(() => {
    const b = Array.from(document.querySelectorAll('button')).find(x => /就它了/.test(x.textContent));
    if (b) { b.click(); return 'closed'; } return 'none';
  })()`);
  await sleep(500);

  const base = await ev(`(() => {
    const d = window.AJ_FLOW_DEBUG ? AJ_FLOW_DEBUG() : {};
    return { bills: (d.bills||0) };
  })()`);
  console.log('初始账本笔数:', JSON.stringify(base));

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

    let reply = '';
    for (let k = 0; k < 50; k++) {
      await sleep(400);
      const now = await ev(`document.querySelectorAll('.bubble.ai').length`);
      if (now > before) {
        reply = await ev(`(() => {
          const a = document.querySelectorAll('.bubble.ai');
          return (a[a.length-1].textContent || '').trim();
        })()`);
        if (reply) break;
      }
    }
    const cost = Date.now() - t0;
    const flow = await ev(`(() => { const d = window.AJ_FLOW_DEBUG?AJ_FLOW_DEBUG():{}; return {bills:(d.bills||0), pending: d.pending, committed: d.committed}; })()`);
    results.push({ msg, reply, cost, flow });
    console.log(`\n[${((cost) / 1000).toFixed(1)}s] 用户: ${msg}\n  阿账: ${reply || '（无回复/超时）'}\n  账本: ${JSON.stringify(flow)}`);
  }

  const costs = results.map(r => r.cost).sort((a, b) => a - b);
  console.log(`\n延迟：min ${costs[0]}ms / median ${costs[Math.floor(costs.length / 2)]}ms / max ${costs[costs.length - 1]}ms`);
  console.log('最终账本:', JSON.stringify(await ev(`AJ_FLOW_DEBUG()`)));
  fs.writeFileSync('_shot/e2e_ai.json', JSON.stringify(results, null, 1));

  await send('Page.captureScreenshot', {}).then(r => fs.writeFileSync('_shot/e2e_ai.png', Buffer.from(r.data, 'base64'))).catch(() => {});
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error('异常:', e.message); process.exit(1); });
