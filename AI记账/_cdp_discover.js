'use strict';
const PORT = 9412;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pend = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  await new Promise(r => ws.addEventListener('open', r));
  const send = (m, p = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  const evl = async e => {
    const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
    const d = r.result;
    if (d && d.exceptionDetails) { return 'ERR ' + d.exceptionDetails.text + ' ' + JSON.stringify((d.exceptionDetails.exception || {}).description || ''); }
    return d && d.result ? d.result.value : null;
  };
  await send('Runtime.enable'); await send('Page.enable');
  console.log('btnSaveHub:', await evl(`(function(){var b=document.getElementById('btnSaveHub'); if(!b) return 'absent'; b.click(); return 'clicked';})()`));
  await sleep(1000);
  console.log('\n-- 面板里所有带 data-* 的可点元素 --');
  console.log(await evl(`(function(){
    var pane = document.getElementById('dealsPane') || document.getElementById('saveHubView');
    var scope = pane || document;
    var out = [];
    scope.querySelectorAll('[data-deal-tab],[data-hub-tab],[data-real-tab],[data-tab],button,[role="tab"]').forEach(function(b){
      var attrs = Array.from(b.attributes).filter(a=>a.name.indexOf('data-')===0).map(a=>a.name+'='+a.value).join(' ');
      out.push((b.tagName)+'['+(b.id||'')+'] "'+(b.textContent||'').trim().slice(0,12)+'" '+attrs);
    });
    return out.slice(0,60).join('\\n');
  })()`));
  console.log('\n-- dealsPane innerHTML 头部 --');
  console.log(String(await evl(`(function(){var p=document.getElementById('dealsPane'); return p? p.innerHTML.slice(0,600) : 'no dealsPane';})()`)));
  console.log('\n-- 面板可见性 --');
  console.log(await evl(`(function(){
    function vis(e){ if(!e) return 'null'; var s=getComputedStyle(e); var r=e.getBoundingClientRect();
      return s.display+'/'+s.visibility+' '+Math.round(r.width)+'x'+Math.round(r.height); }
    return JSON.stringify({
      saveHubView: vis(document.getElementById('saveHubView')),
      dealsPane: vis(document.getElementById('dealsPane')),
      bodyClass: (document.body.className||''),
    });
  })()`));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
