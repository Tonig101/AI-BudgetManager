/* 桌面端引导回归探针（1280x900，完整版）。注入到 AI记账.html 副本的 </body> 前执行。
   覆盖 v3 全链路：欢迎 → 记账 → 预算 → 流水/分析 → 心愿单 → 省钱 → 搭子 → 理财专家
   → 目标 → 设置 → 全功能地图 → 结束 → 设置重看 */
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
    while (t < (ms || 4000)) { if (fn()) { return true; } await wait(120); t += 120; }
    return fn();
  }
  async function run() {
    try {
      await wait(700);
      log('引导已启动', document.body.classList.contains('ob-on'));
      log('欢迎页文案', pt().indexOf('欢迎，我是阿账') >= 0);
      log('欢迎页3个价值点', document.querySelectorAll('#obRoot .ob-points li').length === 3);
      q('[data-ob="next"]').click();

      /* 1 记账 */
      log('第1步·记账锚点', await until(function () { return pt().indexOf('先记一笔试试') >= 0 && ringOk('#chatInput'); }));
      log('第1步·4条入口清单', dots() === 4, dots());
      log('清单含语音/截图/撤回', pt().indexOf('说话也能记') >= 0 && pt().indexOf('截图也能记') >= 0 && pt().indexOf('一键撤') >= 0);
      log('动手步镂空可点', q('#obRoot .ob-block').hidden === true);
      log('有填例子按钮', !!q('[data-ob="fill"]'));
      var inp = q('#chatInput');
      inp.value = '中午食堂 15';
      q('#btnSend').click();
      log('记完自动前进', await until(function () { return pt().indexOf('预算是一条活的线') >= 0; }, 5000), pt().slice(0, 12));

      /* 2 预算 */
      log('视图切到看板', document.body.getAttribute('data-view') === 'dash', document.body.getAttribute('data-view'));
      log('第2步·预算条高亮', await until(function () { return ringOk('#budgetBar'); }));
      log('讲解步锁住镂空', q('#obRoot .ob-block').hidden === false);
      q('[data-ob="next"]').click();

      /* 3 流水 / 账单分析 */
      log('第3步·流水筛选锚点', await until(function () { return pt().indexOf('每笔钱都翻得出来') >= 0 && ringOk('#btnBillFilter'); }));
      log('第3步·覆盖账单分析与导出', pt().indexOf('账单分析') >= 0 && pt().indexOf('导出 CSV') >= 0);
      q('[data-ob="next"]').click();

      /* 4 心愿单 */
      log('第4步·冷静期锚点', await until(function () { return pt().indexOf('想买先放一放') >= 0 && ringOk('#btnWishTop'); }));
      q('#btnWishTop').click();
      log('心愿单已打开', await until(function () { return q('#wishMask') && !q('#wishMask').hidden; }));
      log('弹层时气泡退成底部提示条', await until(function () {
        return q('#obRoot .ob-pop').classList.contains('ob-dock') && q('#obRoot .ob-mask').hidden === true;
      }));
      log('提示条没盖住弹层标题', q('#obRoot .ob-pop').getBoundingClientRect().top > window.innerHeight * 0.6,
        q('#obRoot .ob-pop').getBoundingClientRect().top.toFixed(0) + '/' + window.innerHeight);
      q('[data-ob="next"]').click();

      /* 5 省钱 */
      log('第5步·省钱锚点', await until(function () { return q('#wishMask').hidden === true && ringOk('#btnSaveHub'); }));
      q('#btnSaveHub').click();
      log('省钱助手已打开', await until(function () { return q('#saveHubMask') && !q('#saveHubMask').hidden; }));
      q('[data-ob="next"]').click();

      /* 6 搭子 */
      log('第6步·搭子锚点', await until(function () {
        return q('#saveHubMask').hidden === true && pt().indexOf('凑单不用自己算') >= 0 &&
          document.body.getAttribute('data-view') === 'dazai' && ringOk('#panelDazai .dz-tabs');
      }), document.body.getAttribute('data-view'));
      q('[data-ob="next"]').click();

      /* 7 理财专家 */
      log('第7步·理财专家锚点', await until(function () {
        return pt().indexOf('小衡替你看账') >= 0 && document.body.getAttribute('data-view') === 'coach' && ringOk('#personaCard');
      }), document.body.getAttribute('data-view'));
      log('第7步·覆盖性格测试与学院', pt().indexOf('消费性格测试') >= 0 && pt().indexOf('理财学院') >= 0);
      q('[data-ob="next"]').click();

      /* 8 目标 */
      log('第8步·目标锚点', await until(function () {
        return pt().indexOf('给自己存个目标') >= 0 && document.body.getAttribute('data-view') === 'goals' && ringOk('#goalCard');
      }), document.body.getAttribute('data-view'));
      log('第8步·提到存钱罐', pt().indexOf('存钱罐') >= 0);
      q('[data-ob="next"]').click();

      /* 9 设置（用户报过的场景：齿轮点开后引导要退成提示条） */
      log('第9步·设置锚点', await until(function () {
        return pt().indexOf('所有开关都在这页') >= 0 && ringOk('#btnSettings');
      }));
      log('第9步·覆盖预算/主题/备份', pt().indexOf('预算与发薪日') >= 0 && pt().indexOf('界面与字体') >= 0 && pt().indexOf('数据与隐私') >= 0);
      q('#btnSettings').click();
      log('设置面板已打开', await until(function () { return q('#settingsMask') && !q('#settingsMask').hidden; }));
      log('设置打开后气泡退成提示条', await until(function () {
        return q('#obRoot .ob-pop').classList.contains('ob-dock');
      }));
      log('提示条没盖住设置标题', q('#obRoot .ob-pop').getBoundingClientRect().top > window.innerHeight * 0.6);
      q('[data-ob="next"]').click();

      /* 10 全功能地图 */
      log('设置已收掉并进地图', await until(function () { return q('#settingsMask').hidden === true && pt().indexOf('全功能地图') >= 0; }));
      log('地图含 5 个分组', document.querySelectorAll('#obRoot .ob-map-g').length === 5);
      log('地图列全 21 个入口', document.querySelectorAll('#obRoot .ob-map li').length === 21,
        document.querySelectorAll('#obRoot .ob-map li').length);
      log('地图里 15 项可点直达', document.querySelectorAll('#obRoot [data-ob="map-go"]').length === 15,
        document.querySelectorAll('#obRoot [data-ob="map-go"]').length);
      log('地图有 5 个分组名', (q('#obRoot .ob-map').textContent || '').indexOf('记一笔') >= 0 &&
        (q('#obRoot .ob-map').textContent || '').indexOf('专家与设置') >= 0);

      /* 地图跳转：点「预算 / 主题 / 字号」应落回设置步，再 next 回到地图 */
      q('#obRoot [data-ob="map-go"][data-step="settings"]').click();
      log('地图可跳回设置步', await until(function () { return pt().indexOf('所有开关都在这页') >= 0; }), pt().slice(0, 10));
      q('[data-ob="next"]').click();
      log('跳转后能回到地图', await until(function () { return pt().indexOf('全功能地图') >= 0; }));
      q('[data-ob="next"]').click();

      /* 11 结束页 */
      log('进入结束页', await until(function () { return pt().indexOf('逛完了') >= 0; }));
      log('结束页9条清单', document.querySelectorAll('#obRoot .ob-done li').length === 9,
        document.querySelectorAll('#obRoot .ob-done li').length);
      log('结束页有刚才那笔提示', pt().indexOf('刚才那笔记了') >= 0);
      log('结束页有备份提醒', pt().indexOf('导出备份') >= 0);
      log('结束页有回地图入口', !!q('#obRoot [data-ob="map"]'));
      q('[data-ob="done"]').click();
      log('收尾移除遮罩', await until(function () { return q('#obRoot').hidden === true && !document.body.classList.contains('ob-on'); }));
      log('状态 done', AJ.onboard.status('full') === 'done', AJ.onboard.status('full'));
      log('不再自动弹', AJ.onboard.shouldOffer('full') === false);
      log('设置入口存在', !!q('#rowOnboard'));
      log('简洁版菜单入口存在', !!q('#spMenuOnboard'));

      /* 用户反馈的场景：从设置页点「新手引导」，设置面板原来会压在引导下面 */
      q('#settingsMask').hidden = false;
      q('#rowOnboard').click();
      log('重看时设置面板被收掉', await until(function () {
        return q('#settingsMask').hidden === true && q('#obRoot').hidden === false;
      }), 'settings hidden=' + q('#settingsMask').hidden);
      log('设置重看回欢迎页', pt().indexOf('欢迎，我是阿账') >= 0);
      log('replays 计数', AJ.onboard.load().replays === 1, AJ.onboard.load().replays);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      log('Esc 可退出', await until(function () { return q('#obRoot').hidden === true; }));
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
