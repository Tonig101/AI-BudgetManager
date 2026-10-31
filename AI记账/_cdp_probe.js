/* 用本机 Chrome + CDP（Node 22 内置 WebSocket，零依赖）跑真实浏览器测量。
   产出：① 5 种宽度下 .sheet-body 的 scrollWidth/clientWidth
        ② 真数据「手机」下首屏 8 条贵贱条的实测像素宽度与占比
        ③ .rs-list 距滚动容器顶的距离（改动前后对比）
        ④ 轴轨道 scrollWidth/clientWidth（P4 是否还溢出） */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { spawn } = require('child_process');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTML = path.resolve('AI记账.html');
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'rsprofile-'));
const PORT = 9333;

/* QA probe 里那次「手机」真实抓取的 30 条价格（升序） */
const PHONE_PRICES = [1817.3, 1889, 1949, 1969, 2003.5, 2229.51, 2298, 2342.83, 2359, 2491.36,
  2499, 2505.65, 2549.15, 2553.88, 2567.34, 2660.84, 3149, 3699, 3979, 3999,
  4160.11, 4199, 4304.01, 5059.04, 5599, 6999, 7249, 7499, 7969, 10999];

/* 把真数据塞进页面：直接调用应用自己的渲染通道前，先把 deals 快照换成「手机」这组，
   再点进 省钱/比价 面板。若面板入口拿不到，则退而求其次注入一块静态 rs-wrap。 */
const INJECT = `(() => {
  const prices = ${JSON.stringify(PHONE_PRICES)};
  const items = prices.map((p, i) => ({
    sku: 'p' + i, source: ['网易严选','慢慢买比价','当当网'][i % 3],
    source_host: 'x', platform: ['网易严选','淘宝','当当'][i % 3],
    title: '手机型号 ' + i + ' 全网通5G 12GB+256GB 大容量长续航' ,
    price: p, original: null, shop: '店铺' + i, reviews: (i * 37) % 900,
    reviews_label: '销量', url: 'https://example.com/p/' + i, image: '',
    page: 1, material: null, target: '通用', feature: []
  }));
  const meta = {
    source: '网易严选 + 慢慢买比价 + 当当网', source_host: 'x', keyword: '手机',
    scraped_at: '2026-10-31 01:00:00', pages_scraped: [1,2,3,4,5,6],
    total_parsed: 120, relevant: 30, dropped: 90, price_range: [1817.3, 10999],
    shop_count: 12, from_cache: false, sources: [
      {name:'网易严选', host:'you.163.com', note:'', count:10},
      {name:'慢慢买比价', host:'s.manmanbuy.com', note:'', count:10},
      {name:'当当网', host:'dangdang.com', note:'', count:10}],
    page_urls: []
  };
  window.__rsInjected = { meta: meta, items: items };
  return true;
})()`;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const proc = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars=false', '--force-device-scale-factor=1',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROFILE,
    'file:///' + HTML.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });

  let ws = null, base = null;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + PORT + '/json/list');
      const list = await r.json();
      const page = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) { base = page; break; }
    } catch (e) { /* not up yet */ }
    await sleep(500);
  }
  if (!base) { throw new Error('Chrome 未就绪'); }
  ws = new WebSocket(base.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params, sessionId) => new Promise(res => {
    const i = ++id;
    pending.set(i, m => res(m));
    ws.send(JSON.stringify({ id: i, method, params: params || {}, sessionId }));
  });

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + HTML.replace(/\\/g, '/') });
  await sleep(3500);

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) {
      return { __err: (r.result.exceptionDetails.exception || {}).description || 'eval error' };
    }
    return (r.result && r.result.result && r.result.result.value);
  };

  // ---- 找到「省钱/比价」面板并打开 ----
  const findPanel = await evalJs(`(() => {
      const ids = ['dealsPane','deals', 'sheet-deals'];
      let pane = null;
      for (const id of ids) { pane = document.getElementById(id); if (pane) { break; } }
      return { paneId: pane ? pane.id : null,
               bodyIds: Array.from(document.querySelectorAll('.sheet-body')).map(e => (e.className||'') + '|' + (e.closest('[id]')||{}).id) };
    })()`);
  console.log('面板探测:', JSON.stringify(findPanel));

  const opened = await evalJs(`(() => {
      // 尝试各类入口：导航项 / 按钮 / 已有脚本 API
      const tryClick = (sel) => { const e = document.querySelector(sel); if (e && e.click) { e.click(); return true; } return false; };
      const cands = ['[data-tab="deals"]','[data-nav="deals"]','#nav-deals','[data-pane="deals"]',
                     '.nav-item[data-id="deals"]','button[data-open="deals"]'];
      for (const c of cands) { if (tryClick(c)) { return 'clicked:'+c; } }
      if (window.APP && typeof window.APP.openDeals === 'function') { window.APP.openDeals(); return 'api:openDeals'; }
      return 'none';
    })()`);
  console.log('面板打开方式:', JSON.stringify(opened));
  await sleep(1200);

  // 看看 DOM 里有没有 rs-* 结构；没有就用注入数据自己渲染一块
  const hasRs = await evalJs(`!!document.querySelector('.rs-wrap')`);
  console.log('.rs-wrap 已存在:', JSON.stringify(hasRs));

  let injected = false;
  if (!hasRs) {
    injected = true;
    const info = await evalJs(INJECT);
    console.log('注入真实「手机」数据:', JSON.stringify(info));
    const built = await evalJs(`(() => {
        const fns = Object.keys(window).filter(k => /realSearchBlockHtml|renderDeals/i.test(k));
        return { windowFns: fns };
      })()`);
    console.log('可用渲染函数:', JSON.stringify(built));
  }

  const state = await evalJs(`(() => {
      const body = document.querySelector('.sheet-body') || document.scrollingElement;
      const wrap = document.querySelector('.rs-wrap');
      return {
        hasWrap: !!wrap,
        bodyCls: body ? body.className : null,
        bodyScroll: body ? body.scrollWidth : null,
        bodyClient: body ? body.clientWidth : null,
        rsCount: document.querySelectorAll('.rs-row').length,
        dotCount: document.querySelectorAll('.rs-dot').length,
        leadH: (document.querySelector('.rs-lead')||{}).clientHeight || null,
        axisH: (document.querySelector('.rs-axis')||{}).clientHeight || null,
        title: document.title
      };
    })()`);
  console.log('页面状态:', JSON.stringify(state, null, 2));

  proc.kill();
  if (ws && ws.readyState === 1) { ws.close(); }
  return { state, injected };
}

main().then(r => { console.log('\nDONE'); process.exit(0); })
     .catch(e => { console.error('FATAL', e); process.exit(1); });
