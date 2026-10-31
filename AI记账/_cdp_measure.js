/* 真实浏览器测量（本机 Chrome + CDP，Node 22 内置 WebSocket，零第三方依赖）
   数据源：QA probe 里那次「手机」真实抓取的 30 条价格，经 ai_jizhang_real_search_v1 走应用自己的恢复通道，
           所以渲染出来的是真实的产品链路，不是我们拼的静态 HTML。
   测什么：
     ① 5 种宽度下 #saveHubView .sheet-body 的 scrollWidth / clientWidth（P0 验收）
     ② .rs-lead 自身 overflow 与高度
     ③ 首屏 8 条贵贱条 .rs-bar-fill 的像素宽度与其占 track 的百分比（P1 验收）
     ④ 轴上圆点的 left%、以及落在左 25% 的比例
     ⑤ .rs-list 距滚动容器顶的距离与容器可视高（P3 验收）
     ⑥ .rs-axis-track 的 scrollWidth/clientWidth（P4 验收）
 */
'use strict';
const fs = require('fs');
const { execSync } = require('child_process');

const HTML = 'file:///' + require('path').resolve('AI记账.html').replace(/\\/g, '/');
const PORT = 9412;
const OUT = process.argv[2] || '_shot/measure_rs.json';

const PHONE = [1817.3, 1889, 1949, 1969, 2003.5, 2229.51, 2298, 2342.83, 2359, 2491.36,
  2499, 2505.65, 2549.15, 2553.88, 2567.34, 2660.84, 3149, 3699, 3979, 3999,
  4160.11, 4199, 4304.01, 5059.04, 5599, 6999, 7249, 7499, 7969, 10999];

const sleep = ms => new Promise(r => setTimeout(r, ms));

const PROBE = `(() => {
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const pane = document.getElementById('dealsPane');
  if (!pane) { return { err: 'no #dealsPane' }; }
  const body = pane.closest('.sheet-body') || q('.sheet-body');
  const lead = q('.rs-lead');
  const track = q('.rs-axis-track');
  const list = q('.rs-list');
  const fills = qa('.rs-bar-fill');
  const tracksAll = qa('.rs-bar-track');
  const dots = qa('.rs-dot');
  const bodyRect = body.getBoundingClientRect();
  const listRect = list ? list.getBoundingClientRect() : null;
  const barPct = fills.map((f, i) => {
    const t = tracksAll[i];
    if (!t) { return null; }
    const tw = t.clientWidth, fw = f.getBoundingClientRect().width;
    return Math.round(fw / tw * 1000) / 10;
  });
  const dotLefts = dots.map(d => parseFloat(d.style.left));
  return {
    bodyScrollW: body.scrollWidth, bodyClientW: body.clientWidth,
    bodyOverflowX: body.scrollWidth - body.clientWidth,
    leadH: lead ? Math.round(lead.getBoundingClientRect().height) : null,
    leadScrollW: lead ? lead.scrollWidth : null, leadClientW: lead ? lead.clientWidth : null,
    leadOverflow: lead ? lead.scrollWidth - lead.clientWidth : null,
    trackScrollW: track ? track.scrollWidth : null, trackClientW: track ? track.clientWidth : null,
    trackOverflow: track ? track.scrollWidth - track.clientWidth : null,
    barPcts: barPct,
    barNotes: qa('.rs-barnote').map(e => e.textContent),
    dotCount: dots.length,
    dotLefts: dotLefts,
    dotsInLeft25: dotLefts.filter(v => v <= 25).length,
    listTopInContainer: listRect && bodyRect ? Math.round(listRect.top - bodyRect.top) : null,
    containerVisibleH: body ? Math.round(body.clientHeight) : null,
    leadText: lead ? lead.textContent.replace(/\\s+/g, ' ').trim() : null,
    axisTitle: (q('.rs-axis-h') || {}).textContent || null,
    axisEnds: (q('.rs-axis-ends') || {}).textContent || null,
    axisFoot: (q('.rs-axis-f') || {}).textContent || null,
    moreSummary: (q('.rs-more > summary') || {}).textContent || null,
    crossCount: qa('.rs-cross').length,
    nomatchCount: qa('.rs-nomatch').length,
    rowCount: qa('.rs-row').length,
    priceRow: qa('.rs-price b').map(e => e.textContent),
  };
})()`;

(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page') ;
  if (!page) { console.log('NO PAGE'); process.exit(1); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const evl = async e => {
    const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    const d = r.result;
    if (d && d.exceptionDetails) { throw new Error(d.exceptionDetails.text + ' ' + JSON.stringify(d.exceptionDetails.exception || {})); }
    return d && d.result ? d.result.value : null;
  };
  await send('Runtime.enable'); await send('Page.enable');

  // ---- 注入「手机」真实抓取结果（走应用自己的 localStorage 恢复通道） ----
  const injectExpr = `(() => {
    const prices = ${JSON.stringify(PHONE)};
    const items = prices.map((p, i) => ({
      sku: 'sku' + i, source: ['网易严选','慢慢买比价','当当网'][i % 3],
      source_host: 'x', platform: ['网易严选','淘宝','当当'][i % 3],
      title: '手机 ' + i + ' 全网通5G智能手机 12GB+256GB 大电池长续航双卡双待',
      price: p, original: null, shop: '店铺' + i, reviews: (i * 41) % 880,
      reviews_label: '销量', url: 'https://example.com/p/' + i, image: '',
      page: 1 + (i % 3), material: null, target: '通用', feature: []
    }));
    const meta = {
      source: '网易严选 + 慢慢买比价 + 当当网', source_host: 'multi', keyword: '手机',
      scraped_at: '2026-10-31 01:00:00', pages_scraped: [1,2,3,4,5,6],
      total_parsed: 132, relevant: 30, dropped: 102, price_range: [1817.3, 10999],
      shop_count: 14, from_cache: false,
      sources: [
        {name:'网易严选', host:'you.163.com', note:'', count:10},
        {name:'慢慢买比价', host:'s.manmanbuy.com', note:'', count:10},
        {name:'当当网', host:'dangdang.com', note:'', count:10}],
      page_urls: ['https://example.com/search?q=phone']
    };
    localStorage.setItem('ai_jizhang_real_search_v1', JSON.stringify({meta: meta, items: items}));
    return 'stored ' + items.length;
  })()`;
  console.log('inject:', await evl(injectExpr));

  await send('Page.navigate', { url: HTML });
  await sleep(3000);

  console.log('open hub:', await evl(`(function(){var b=document.getElementById('btnSaveHub'); if(!b) return 'NO btnSaveHub'; b.click(); return 'ok';})()`));
  await sleep(900);
  console.log('to compare:', await evl(`(function(){var b=document.querySelector('[data-deal-tab="compare"]'); if(b){b.click(); return 'ok';} return 'NO compare tab';})()`));
  await sleep(1200);

  const rows = await evl(`document.querySelectorAll('.rs-row').length`);
  console.log('rs-row count after open =', rows);
  if (!rows) { console.log('FAIL: 面板里没有 rs-row，可能没走到比价 tab'); process.exit(2); }

  const out = {};
  for (const [w, h] of [[360, 800], [390, 844], [420, 900], [480, 900], [1280, 900]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
    await sleep(700);
    const r = await evl(PROBE);
    out[w + 'x' + h] = r;
    console.log(`\n===== ${w}x${h} =====`);
    console.log('  sheet-body  scrollW=' + r.bodyScrollW + ' clientW=' + r.bodyClientW + ' 溢出=' + r.bodyOverflowX);
    console.log('  .rs-lead    scrollW=' + r.leadScrollW + ' clientW=' + r.leadClientW + ' 溢出=' + r.leadOverflow + ' 高=' + r.leadH + 'px');
    console.log('  .rs-axis-track overflow=' + r.trackOverflow + ' (scrollW=' + r.trackScrollW + ' clientW=' + r.trackClientW + ')');
    console.log('  .rs-list 距容器顶 = ' + r.listTopInContainer + 'px，容器可视高 = ' + r.containerVisibleH + 'px');
    if (w === 1280) {
      console.log('  首屏贵贱条实测占比 = ' + JSON.stringify(r.barPcts));
      console.log('  条注 = ' + JSON.stringify(r.barNotes));
      console.log('  圆点数 = ' + r.dotCount + '，落在左25%的 = ' + r.dotsInLeft25 + ' (' + Math.round(r.dotsInLeft25 / r.dotCount * 100) + '%)');
      console.log('  轴标题 = ' + r.axisTitle);
      console.log('  轴端点 = ' + r.axisEnds);
      console.log('  轴注脚 = ' + r.axisFoot);
      console.log('  折叠summary = ' + r.moreSummary);
      console.log('  cross/nomatch 顶层数 = ' + r.crossCount + '/' + r.nomatchCount);
      console.log('  lead = ' + r.leadText);
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log('\nWROTE ' + OUT);
  process.exit(0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
