/* 临时探针：DOM 结构侦察 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTML = 'file:///' + path.resolve('AI记账.html').replace(/\\/g, '/');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'ajprobe2-'));
const PORT = 9402;
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  await sleep(7000);

  const info = await send('Runtime.evaluate', {
    expression: `(() => {
      const out = {};
      const inp = document.querySelector('textarea, input[placeholder]');
      out.input = inp ? { tag: inp.tagName, id: inp.id, cls: inp.className, ph: inp.placeholder } : null;
      const btns = Array.from(document.querySelectorAll('button')).filter(b => /发送/.test(b.textContent));
      out.sendBtn = btns.map(b => ({ id: b.id, cls: b.className, txt: b.textContent.trim() }));
      // 找聊天消息容器
      const bubbles = Array.from(document.querySelectorAll('[class*=msg], [class*=bubble], [class*=ai-]')).slice(0, 12);
      out.bubbles = bubbles.map(b => ({ cls: b.className.slice(0, 60), txt: (b.textContent || '').trim().slice(0, 40) }));
      const modal = Array.from(document.querySelectorAll('button')).filter(b => /就它了/.test(b.textContent));
      out.modalBtn = modal.length;
      out.bodyCls = document.body.className;
      return out;
    })()`, returnByValue: true
  });
  console.log(JSON.stringify(info.result.value, null, 1));
  ws.close(); chrome.kill(); process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
