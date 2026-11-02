/* 手机端引导回归探针（390x844，简洁版）。注入到 AI记账.html 副本的 </body> 前执行。
   覆盖 v3 全链路：欢迎 → 记账 → 预算 → 明细筛选 → 心愿单 → 省钱 → 搭子
   → 理财专家 → 目标 → 设置 → 全功能地图 → 结束 */
(function () {
  var out = [], errs = [];
  window.addEventListener('error', function (e) { errs.push(String(e.message)); });
  function log(n, ok, x) { out.push({ n: n, ok: !!ok, x: String(x === undefined ? '' : x) }); }
  function q(s) { return document.querySelector(s); }
  function pt() { var p = q('#obRoot .ob-pop'); return p ? p.textContent : ''; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function ringOk(sel) {
    var el = q(sel), rb = q('#obRoot .ob-ring');
    if (!el || !rb || rb.hidden) { return false; }
    var st = rb.style;
    if (!st.left) { return false; }
    var a = el.getBoundingClientRect();
    return Math.abs(parseFloat(st.left) - (a.left - 8)) < 2 &&
      Math.abs(parseFloat(st.top) - (a.top - 8)) < 2 &&
      Math.abs(parseFloat(st.width) - (a.width + 16)) < 2;
  }
  function dots() { return document.querySelectorAll('#obRoot .ob-mini li').length; }
  async function until(fn, ms) {
    var t = 0;
    while (t < (ms || 4500)) { if (fn()) { return true; } await wait(120); t += 120; }
    return fn();
  }
  async function run() {
    try {
      await wait(800);
      log('自动进简洁版', document.body.getAttribute('data-ui-mode') === 'simple', document.body.getAttribute('data-ui-mode'));
      log('引导已启动', document.body.classList.contains('ob-on'));
      log('欢迎页在', pt().indexOf('欢迎，我是阿账') >= 0);
      q('[data-ob="next"]').click();

      /* 1 记账 */
      log('第1步·记一笔锚点', await until(function () { return pt().indexOf('先记一笔试试') >= 0 && ringOk('#spBtnAdd'); }));
      log('第1步用简洁版文案', pt().indexOf('＋ 记一笔') >= 0 && pt().indexOf('点这儿打一句话') < 0);
      log('第1步·4条入口清单', dots() === 4, dots());
      log('简洁版不显示填例子', !q('[data-ob="fill"]'));
      q('[data-ob="next"]').click();

      /* 2 预算 */
      log('第2步·剩余金额锚点', await until(function () { return pt().indexOf('预算是一条活的线') >= 0 && ringOk('#spRemain'); }));
      q('[data-ob="next"]').click();

      /* 3 明细 / 筛选（简洁版锚点换到明细页的「筛选」） */
      log('第3步·明细页切换', await until(function () { return document.body.getAttribute('data-view') === 'slist'; }),
        document.body.getAttribute('data-view'));
      log('第3步·明细筛选锚点', await until(function () { return pt().indexOf('每笔钱都翻得出来') >= 0 && ringOk('#btnSpBillFilter'); }));
      log('第3步用简洁版文案', pt().indexOf('「明细」页按月翻') >= 0);
      q('[data-ob="next"]').click();

      /* 4 心愿单 */
      log('第4步·四宫格心愿单', await until(function () {
        return pt().indexOf('想买先放一放') >= 0 && ringOk('#spFeatureGrid [data-goto-wish]');
      }));
      q('#spFeatureGrid [data-goto-wish]').click();
      log('心愿单打开', await until(function () { return q('#wishMask') && !q('#wishMask').hidden; }));
      log('弹层时气泡退成提示条', await until(function () {
        return q('#obRoot .ob-pop').classList.contains('ob-dock') && q('#obRoot .ob-mask').hidden === true;
      }));
      q('[data-ob="next"]').click();

      /* 5 省钱 */
      log('第5步·省钱Tab锚点', await until(function () {
        return q('#wishMask').hidden === true && pt().indexOf('能省的钱在这儿') >= 0 &&
          ringOk('#tabbarSimple [data-view="ssave"]');
      }));
      q('#tabbarSimple [data-view="ssave"]').click();
      log('点省钱Tab已切屏', await until(function () { return document.body.getAttribute('data-view') === 'ssave'; }),
        document.body.getAttribute('data-view'));
      log('气泡未被改成关弹层文案', pt().indexOf('看完关掉') < 0);
      q('[data-ob="next"]').click();

      /* 6 搭子 */
      log('第6步·凑单搭子锚点', await until(function () {
        return pt().indexOf('凑单不用自己算') >= 0 && ringOk('#spBtnDazai');
      }));
      q('[data-ob="next"]').click();

      /* 7 理财专家 */
      log('第7步·理财专家锚点', await until(function () {
        return pt().indexOf('小衡替你看账') >= 0 &&
          document.body.getAttribute('data-view') === 'shome' &&
          ringOk('#spFeatureGrid [data-view="scoach"]');
      }), document.body.getAttribute('data-view'));
      q('[data-ob="next"]').click();

      /* 8 目标 */
      log('第8步·攒钱目标锚点', await until(function () {
        return pt().indexOf('给自己存个目标') >= 0 && ringOk('#spFeatureGrid [data-view="sgoals"]');
      }));
      q('[data-ob="next"]').click();

      /* 9 设置：切到「我的」页，点菜单里的设置 */
      log('第9步·我的页切换', await until(function () { return document.body.getAttribute('data-view') === 'sprofile'; }),
        document.body.getAttribute('data-view'));
      log('第9步·设置菜单锚点', await until(function () {
        return pt().indexOf('所有开关都在这页') >= 0 && ringOk('#spMenuSettings');
      }));
      log('第9步用简洁版文案', pt().indexOf('在「我的」页点「设置」') >= 0);
      q('#spMenuSettings').click();
      log('设置面板已打开', await until(function () { return q('#settingsMask') && !q('#settingsMask').hidden; }));
      log('设置打开后气泡退成提示条', await until(function () {
        return q('#obRoot .ob-pop').classList.contains('ob-dock');
      }));
      q('[data-ob="next"]').click();

      /* 10 全功能地图 */
      log('设置已收掉并进地图', await until(function () { return q('#settingsMask').hidden === true && pt().indexOf('全功能地图') >= 0; }));
      log('地图列全 21 个入口', document.querySelectorAll('#obRoot .ob-map li').length === 21,
        document.querySelectorAll('#obRoot .ob-map li').length);
      q('[data-ob="next"]').click();

      /* 11 结束页 */
      log('进入结束页', await until(function () { return pt().indexOf('逛完了') >= 0; }));
      log('结束页9条清单', document.querySelectorAll('#obRoot .ob-done li').length === 9,
        document.querySelectorAll('#obRoot .ob-done li').length);
      q('[data-ob="done"]').click();
      log('简洁版状态独立 done', await until(function () { return AJ.onboard.status('simple') === 'done'; }),
        AJ.onboard.status('simple'));
      log('完整版未被影响', AJ.onboard.status('full') === 'idle', AJ.onboard.status('full'));
      log('遮罩已撤', q('#obRoot').hidden === true);
      log('无运行时异常', errs.length === 0, errs.join(';'));
    } catch (e) {
      log('异常: ' + (e && e.message), false);
    }
    var pre = document.createElement('pre');
    pre.id = 'OBRESULT';
    pre.textContent = JSON.stringify(out);
    document.body.appendChild(pre);
  }
  window.addEventListener('load', function () { setTimeout(run, 300); });
})();
