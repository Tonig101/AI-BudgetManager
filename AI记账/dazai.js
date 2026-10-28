/* ============================================================
 * dazai.js · 凑单搭子
 * ------------------------------------------------------------
 * 由「省钱搭子」单文件应用实装进 AI记账，不是 iframe 嵌入，而是
 * 重写成 AI记账 的一个原生视图（同一套设计变量、同一条底部导航）：
 *
 *   ① 凑单计算器 —— 五步算价：商品券 → 品类券 → 跨店满减
 *      → 88VIP 消费券 → 逐件结算（最后打 95 折）
 *   ② 审批宝     —— 逐件表决 + 留言，分享给好友跨设备表决
 *   ③ 记进账本   —— 算出的实付金额一键走 startFlow 入账
 *
 * 从原版移植并保留的关键修复：
 *   · 品类统一注册表（中文类目 ↔ 券规则 code 双向互认）
 *   · 稳定 uid（重新分享后好友的票不会变孤儿）
 *   · 券按「剩余可优惠额」占比分摊 + 单件封顶 + 溢出再分配
 *     （保证任一件实付不为负，且优惠明细之和恒等于「原价 − 实付」）
 *
 * 架构约定（铁律 9）：函数调用构成有向无环图。
 *   数据层 rewrite → 计算层 computePlan → 渲染层 renderXxx
 *   渲染函数之间互不调用，统一由 refresh() 调度。
 * ============================================================ */
(function (global) {
  'use strict';

  var DOC = global.document;
  var KEY = 'ai_jizhang_dazai_v1';
  var MAX_ITEMS = 20;
  var MAX_WISH = 10;

  /* ============================ 工具 ============================ */

  function $(id) { return DOC.getElementById(id); }

  function num(v) {
    var n = parseFloat(v);
    return isNaN(n) || n < 0 ? 0 : n;
  }
  function r2(n) { return Math.round(n * 100) / 100; }
  function fmt(n) {
    n = r2(n);
    return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : n.toFixed(2);
  }
  function yuan(n) { return '¥' + fmt(n); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function timeAgo(ts) {
    var d = Date.now() - ts;
    if (d < 60e3) { return '刚刚'; }
    if (d < 3600e3) { return Math.floor(d / 60e3) + ' 分钟前'; }
    if (d < 86400e3) { return Math.floor(d / 3600e3) + ' 小时前'; }
    return Math.floor(d / 86400e3) + ' 天前';
  }

  /* ====================== 品类统一注册表 ======================
   * 商品库用中文类目，券规则用 code（beauty/food）。两套必须能互认，
   * 否则从商品库选来的品永远命中不了品类券。
   * ============================================================ */

  var CAT_CODE_OF = {
    '护肤': 'beauty', '彩妆': 'beauty', '食品': 'food',
    '个护': '', '家清': '', '其他': ''
  };
  var CAT_LABEL_OF = { beauty: '护肤', food: '食品', '': '' };
  var CAT_COUPON_LABEL = { beauty: '美妆', food: '食品' };

  function catCode(cat) {
    if (cat == null) { return ''; }
    var s = String(cat).trim();
    if (!s) { return ''; }
    if (Object.prototype.hasOwnProperty.call(CAT_CODE_OF, s)) { return CAT_CODE_OF[s]; }
    if (s === 'beauty' || s === 'food') { return s; }
    return '';
  }
  function catLabel(cat) {
    var code = catCode(cat);
    if (!code) { return catCode(cat) === '' && String(cat || '').trim() ? String(cat).trim() : ''; }
    return CAT_LABEL_OF[code] || code;
  }
  /** 任意品类 → 展示用 {emoji, label, tint} */
  function catMeta(cat) {
    var code = catCode(cat);
    if (code === 'beauty') {
      return { emoji: '\u{1F9F4}', label: '美妆', tint: 'linear-gradient(135deg,#FFE9EC,#FFD6DE)' };
    }
    if (code === 'food') {
      return { emoji: '\u{1F96B}', label: '食品', tint: 'linear-gradient(135deg,#FFF3E2,#FFE6C7)' };
    }
    return { emoji: '\u{1F6CD}', label: '其他', tint: 'linear-gradient(135deg,#F2F3F5,#E7E9ED)' };
  }

  /* 券规则 */
  var CAT_COUPONS = {
    beauty: { name: '美妆 500-50', threshold: 500, off: 50 },
    food: { name: '食品 200-20', threshold: 200, off: 20 }
  };
  var VIP_COUPONS = [
    { value: '500-50', threshold: 500, off: 50 },
    { value: '1500-150', threshold: 1500, off: 150 },
    { value: '3000-300', threshold: 3000, off: 300 }
  ];
  var CAT_OPTIONS = ['护肤', '彩妆', '个护', '家清', '食品', '其他'];

  /* ===================== 稳定 uid =====================
   * 好友的表决以商品 uid 为 key。若 uid 每次重建，重新分享后旧票全成孤儿。
   * 用「来源 + 商品名 + 品类」派生确定性标识，同一件商品永远同一个 uid。
   * ==================================================== */

  function stableUid(source, key) {
    var h = 5381;
    var str = source + '|' + String(key);
    for (var i = 0; i < str.length; i++) {
      h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
    }
    return 's' + source.charAt(0) + h.toString(36);
  }

  /* ============== 券分摊：按剩余额占比 + 单件封顶 + 溢出再分配 ==============
   * 这是原版最重要的一处修复。旧实现按原价占比摊，低价件摊后为负会被
   * Math.max(0,·) 静默截断，导致「共省」与「明细合计」对不上。
   * 现在保证：① 任一件实付不为负；② Σ明细 === 原价 − 实付。
   * ===================================================================== */

  function allocateByRemain(items, off) {
    var res = {};
    var left = num(off);
    if (left <= 0 || !items.length) { return res; }
    var active = items.filter(function (r) { return num(r.rem) > 0; });
    var guard = 0;
    while (left > 1e-9 && active.length && guard++ < 64) {
      var base = active.reduce(function (s, r) { return s + num(r.rem); }, 0);
      if (base <= 0) { break; }
      var tentative = active.map(function (r) {
        return { r: r, share: left * num(r.rem) / base };
      });
      var over = tentative.filter(function (t) { return t.share >= num(t.r.rem); });
      if (!over.length) {
        tentative.forEach(function (t) { res[t.r._k] = num(res[t.r._k]) + t.share; });
        left = 0;
        break;
      }
      over.forEach(function (t) {
        res[t.r._k] = num(res[t.r._k]) + num(t.r.rem);
        left -= num(t.r.rem);
      });
      active = tentative.filter(function (t) { return t.share < num(t.r.rem); })
        .map(function (t) { return t.r; });
    }
    return res;
  }

  /* ========================= 五步算价 ========================= */

  function vipCouponRule(snap) {
    if (snap.isVip !== 'yes' || !snap.vipCoupon) { return { ok: false, threshold: 0, off: 0 }; }
    var c = VIP_COUPONS.filter(function (v) { return v.value === snap.vipCoupon; })[0];
    return c ? { ok: true, threshold: c.threshold, off: c.off } : { ok: false, threshold: 0, off: 0 };
  }

  function computePlan(snap) {
    var A = num(snap.crossA), B = num(snap.crossB);
    var hasA = String(snap.crossA == null ? '' : snap.crossA).trim() !== '';
    var hasB = String(snap.crossB == null ? '' : snap.crossB).trim() !== '';
    var cr = { ok: hasA && hasB && A > 0 && B > 0 && A > B, A: A, B: B };

    var isVip = snap.isVip === 'yes';
    var vc = vipCouponRule(snap);

    var rows = (snap.items || []).map(function (it, idx) {
      var o = {};
      for (var k in it) { if (Object.prototype.hasOwnProperty.call(it, k)) { o[k] = it[k]; } }
      o._k = idx;
      return o;
    });

    rows.forEach(function (r) {
      r.cat = catCode(r.cat);
      if (!isVip) { r.vipC = false; r.vip95 = false; }
      if (!cr.ok) { r.cross = false; }
      if (!vc.ok) { r.vipC = false; }
    });

    var active = rows.filter(function (r) { return r.checked; });

    /* ① 商品券：逐件抵扣 */
    active.forEach(function (r) {
      r.cp = Math.min(num(r.coupon), num(r.price));
      r.rem = num(r.price) - r.cp;
    });

    /* ② 品类券：门槛按类目原价合计，摊销按剩余额 */
    var catShare = {};
    Object.keys(CAT_COUPONS).forEach(function (k) {
      var g = active.filter(function (r) { return r.cat === k; });
      var sum = g.reduce(function (s, r) { return s + num(r.price); }, 0);
      if (sum > 0 && sum >= CAT_COUPONS[k].threshold) {
        var alloc = allocateByRemain(g, CAT_COUPONS[k].off);
        g.forEach(function (r) {
          var v = alloc[r._k] || 0;
          catShare[r._k] = v;
          r.rem -= v;
        });
      }
    });

    /* ③ 跨店满减：每满 A 减 B */
    var crossShare = {};
    if (cr.ok) {
      var gc = active.filter(function (r) { return r.cross; });
      var sumC = gc.reduce(function (s, r) { return s + num(r.price); }, 0);
      var offC = Math.floor(sumC / cr.A) * cr.B;
      if (offC > 0 && sumC > 0) {
        var allocC = allocateByRemain(gc, offC);
        gc.forEach(function (r) {
          var v = allocC[r._k] || 0;
          crossShare[r._k] = v;
          r.rem -= v;
        });
      }
    }

    /* ④ 88VIP 消费券 */
    var vipShare = {};
    if (vc.ok) {
      var gv = active.filter(function (r) { return r.vipC; });
      var sumV = gv.reduce(function (s, r) { return s + num(r.price); }, 0);
      if (sumV > 0 && sumV >= vc.threshold) {
        var allocV = allocateByRemain(gv, vc.off);
        gv.forEach(function (r) {
          var v = allocV[r._k] || 0;
          vipShare[r._k] = v;
          r.rem -= v;
        });
      }
    }

    /* ⑤ 逐件结算：券扣完，最后打 95 折 */
    var t = { origin: 0, coupon: 0, cat: 0, cross: 0, vipC: 0, vip95: 0, final: 0 };
    rows.forEach(function (r) {
      var p = num(r.price);
      if (!r.checked) {
        r.final = Math.max(0, p - Math.min(num(r.coupon), p));
        r.origin = p;
        return;
      }
      var ct = catShare[r._k] || 0;
      var cs = crossShare[r._k] || 0;
      var vs = vipShare[r._k] || 0;
      var sub = num(r.rem);
      var d95 = 0;
      if (r.vip95 && isVip && sub > 0) { d95 = sub * 0.05; sub -= d95; }
      if (sub < 0) { sub = 0; }
      r.final = sub;
      r.origin = p;
      r.catOff = ct;
      r.crossOff = cs;
      r.vipOff = vs;
      r.d95 = d95;
      t.origin += p; t.coupon += r.cp || 0; t.cat += ct;
      t.cross += cs; t.vipC += vs; t.vip95 += d95; t.final += sub;
    });
    Object.keys(t).forEach(function (k) { t[k] = r2(t[k]); });
    return { rows: rows, cr: cr, vc: vc, isVip: isVip, t: t };
  }

  /* ========================== 状态 ========================== */

  function blankItem() {
    return {
      uid: '', name: '', price: 0, coupon: 0, cat: '护肤',
      checked: true, cross: true, vipC: true, vip95: true, qty: 1
    };
  }

  function defaultState() {
    return {
      v: 1,
      tab: 'calc',
      snap: {
        crossA: '300', crossB: '30',
        isVip: 'yes', vipCoupon: '500-50',
        items: [
          { name: '蓝铜胜肽修护精华露 30ml', price: 469, coupon: 0, cat: '护肤', checked: true, cross: true, vipC: true, vip95: true, qty: 1 },
          { name: '空刻意面 经典番茄 3 盒', price: 168, coupon: 0, cat: '食品', checked: true, cross: true, vipC: true, vip95: true, qty: 1 },
          { name: '氨基酸温和洁面乳 120g', price: 129, coupon: 20, cat: '护肤', checked: true, cross: true, vipC: true, vip95: true, qty: 1 }
        ]
      },
      wish: { items: [], shareId: '' },
      approvals: [],
      me: { name: '' }
    };
  }

  var state = null;

  function load() {
    try {
      var raw = global.localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        if (d && d.snap && d.snap.items) {
          /* 老数据补齐缺省字段，避免新版字段 undefined 引发渲染异常 */
          if (!d.wish) { d.wish = { items: [], shareId: '' }; }
          if (!d.approvals) { d.approvals = []; }
          if (!d.me) { d.me = { name: '' }; }
          if (!d.tab) { d.tab = 'calc'; }
          return d;
        }
      }
    } catch (e) { /* 数据坏了就当首次打开 */ }
    return defaultState();
  }

  function save() {
    try { global.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式忽略 */ }
  }

  function snap() { return state.snap; }

  /** 给方案里的每件补上稳定 uid（uid 只依赖名称 + 品类，改价格不会让票失效） */
  function ensureUids() {
    snap().items.forEach(function (it) {
      it.uid = stableUid('dz', String(it.name || '').trim() + '#' + catCode(it.cat));
    });
  }

  function plan() {
    ensureUids();
    return computePlan(snap());
  }

  /* ========================== 渲染 ========================== */

  function renderTabs() {
    var box = DOC.querySelectorAll('#panelDazai [data-dz-tab]');
    for (var i = 0; i < box.length; i++) {
      var on = box[i].getAttribute('data-dz-tab') === state.tab;
      box[i].className = 'dz-tab' + (on ? ' on' : '');
      box[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function renderCalc() {
    var p = plan();
    var t = p.t;
    var items = snap().items;

    var html = '';

    /* ---- 参数卡 ---- */
    html += '<div class="dz-card">' +
      '<div class="dz-card-h">凑单规则</div>' +
      '<div class="dz-row2">' +
        '<label class="dz-field"><span>每满</span>' +
          '<input type="number" inputmode="decimal" data-dz-set="crossA" value="' + esc(snap().crossA) + '" placeholder="300" />' +
        '</label>' +
        '<label class="dz-field"><span>减</span>' +
          '<input type="number" inputmode="decimal" data-dz-set="crossB" value="' + esc(snap().crossB) + '" placeholder="30" />' +
        '</label>' +
      '</div>' +
      '<div class="dz-row2 dz-vip-row">' +
        '<label class="dz-field"><span>88VIP 身份</span>' +
          '<select data-dz-set="isVip">' +
            '<option value="yes"' + (snap().isVip === 'yes' ? ' selected' : '') + '>是</option>' +
            '<option value="no"' + (snap().isVip !== 'yes' ? ' selected' : '') + '>不是</option>' +
          '</select>' +
        '</label>' +
        '<label class="dz-field"><span>消费券</span>' +
          '<select data-dz-set="vipCoupon"' + (snap().isVip === 'yes' ? '' : ' disabled') + '>' +
            VIP_COUPONS.map(function (v) {
              return '<option value="' + v.value + '"' +
                (snap().vipCoupon === v.value ? ' selected' : '') + '>' +
                v.value.replace('-', ' 减 ') + '</option>';
            }).join('') +
          '</select>' +
        '</label>' +
      '</div>' +
      '<p class="dz-hint">' + (p.cr.ok
        ? '跨店规则：每满 ' + p.cr.A + ' 减 ' + p.cr.B
        : '跨店满减未启用（需填写 A、B 且 A > B）') +
        (p.vc.ok ? ' · 88VIP 券门槛 ' + p.vc.threshold : ' · 88VIP 券不可用') +
      '</p>' +
    '</div>';

    /* ---- 商品清单 ---- */
    html += '<div class="dz-card">' +
      '<div class="dz-card-h">凑单商品 <span class="dz-count">' + items.length + ' 件</span></div>';
    if (!items.length) {
      html += '<p class="dz-empty">还没有商品。点下面「＋ 加一件」开始凑单。</p>';
    }
    items.forEach(function (it, i) {
      var r = p.rows[i] || {};
      var m = catMeta(it.cat);
      html += '<div class="dz-item' + (it.checked ? '' : ' is-off') + '">' +
        '<button class="dz-check' + (it.checked ? ' on' : '') + '" data-dz-act="toggle" data-i="' + i + '" ' +
          'aria-label="' + (it.checked ? '取消计入' : '计入') + '">' +
          (it.checked ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '') +
        '</button>' +
        '<div class="dz-item-main">' +
          '<input class="dz-name" type="text" data-dz-item="name" data-i="' + i + '" value="' + esc(it.name) + '" placeholder="商品名，比如 蓝铜精华 30ml" />' +
          '<div class="dz-item-sub">' +
            '<label class="dz-mini"><span>¥</span><input type="number" inputmode="decimal" data-dz-item="price" data-i="' + i + '" value="' + esc(it.price) + '" /></label>' +
            '<label class="dz-mini"><span>券</span><input type="number" inputmode="decimal" data-dz-item="coupon" data-i="' + i + '" value="' + esc(it.coupon) + '" /></label>' +
            '<select class="dz-cat" data-dz-item="cat" data-i="' + i + '">' +
              CAT_OPTIONS.map(function (c) {
                return '<option value="' + c + '"' + (String(it.cat) === c ? ' selected' : '') + '>' + c + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="dz-item-flags">' +
            '<button class="dz-flag' + (it.cross ? ' on' : '') + '" data-dz-act="flag" data-i="' + i + '" data-f="cross" title="参与跨店满减">跨店</button>' +
            '<button class="dz-flag' + (it.vipC ? ' on' : '') + '" data-dz-act="flag" data-i="' + i + '" data-f="vipC" title="计入 88VIP 消费券">VIP券</button>' +
            '<button class="dz-flag' + (it.vip95 ? ' on' : '') + '" data-dz-act="flag" data-i="' + i + '" data-f="vip95" title="享 95 折">95折</button>' +
            (it.checked && r.final != null
              ? '<span class="dz-item-final">实付 ' + yuan(r.final) + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<button class="dz-del" data-dz-act="del" data-i="' + i + '" aria-label="删除">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</div>';
    });
    html += '<div class="dz-actions">' +
      '<button class="dz-btn ghost" data-dz-act="add">＋ 加一件</button>' +
      '<button class="dz-btn ghost" data-dz-act="to-wish">导入到审批宝</button>' +
    '</div>' +
    '</div>';

    /* ---- 结果卡 ---- */
    html += '<div class="dz-card dz-result">' +
      '<div class="dz-result-top">' +
        '<div class="dz-result-num"><span>实付</span><b>' + yuan(t.final) + '</b></div>' +
        '<div class="dz-result-save">共省 <b>' + yuan(r2(t.origin - t.final)) + '</b>' +
          '<small>原价 ' + yuan(t.origin) + '</small></div>' +
      '</div>' +
      '<ul class="dz-breakdown">' +
        '<li><span>商品券</span><b>−' + yuan(t.coupon) + '</b></li>' +
        '<li><span>品类券</span><b>−' + yuan(t.cat) + '</b></li>' +
        '<li><span>跨店满减</span><b>−' + yuan(t.cross) + '</b></li>' +
        '<li><span>88VIP 券</span><b>−' + yuan(t.vipC) + '</b></li>' +
        '<li><span>95 折</span><b>−' + yuan(t.vip95) + '</b></li>' +
      '</ul>' +
      '<p class="dz-check-line' + (Math.abs(r2(t.coupon + t.cat + t.cross + t.vipC + t.vip95) - r2(t.origin - t.final)) < 0.011 ? ' ok' : ' bad') + '">' +
        '明细合计 ' + yuan(r2(t.coupon + t.cat + t.cross + t.vipC + t.vip95)) +
        ' ＝ 原价 − 实付 ' + yuan(r2(t.origin - t.final)) +
      '</p>' +
      '<div class="dz-actions">' +
        '<button class="dz-btn primary" data-dz-act="to-bill" data-amt="' + r2(t.final) + '">记进账本</button>' +
      '</div>' +
    '</div>';

    $('dzBody').innerHTML = html;
  }

  /* ---- 审批宝 ---- */

  function wishTotal(items) {
    return r2(items.reduce(function (s, it) { return s + num(it.price) * (it.qty || 1); }, 0));
  }

  function itemTally(list, uid) {
    var y = 0, n = 0;
    (list || []).forEach(function (a) {
      var v = a.votes && a.votes[uid];
      if (v === 'yes') { y++; } else if (v === 'no') { n++; }
    });
    return { y: y, n: n };
  }

  function renderWish() {
    var w = state.wish;
    var html = '';

    html += '<div class="dz-card">' +
      '<div class="dz-card-h">我的审批单 <span class="dz-count">' + w.items.length + ' 件 · ' + yuan(wishTotal(w.items)) + '</span></div>';

    if (!w.items.length) {
      html += '<p class="dz-empty">审批单还是空的。先在「凑单计算器」里配好商品，点「导入到审批宝」。</p>';
    }

    w.items.forEach(function (it, i) {
      var m = catMeta(it.cat);
      var tal = itemTally(state.approvals, it.uid);
      html += '<div class="dz-witem">' +
        '<span class="dz-wtile" style="background:' + m.tint + '">' + m.emoji + '</span>' +
        '<div class="dz-wmain">' +
          '<p class="dz-wname">' + esc(it.name) + '</p>' +
          '<p class="dz-wsub">' + yuan(it.price) + ' × ' + (it.qty || 1) +
            ' · ' + esc(m.label) + '</p>' +
          (tal.y || tal.n
            ? '<p class="dz-wtally">好友意见：<b class="ok">赞 ' + tal.y + '</b> / <b class="no">踩 ' + tal.n + '</b></p>'
            : '<p class="dz-wtally dim">还没有好友表决</p>') +
        '</div>' +
        '<button class="dz-del" data-dz-act="wdel" data-i="' + i + '" aria-label="移除">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>' +
        '</button>' +
      '</div>';
    });

    html += '</div>';

    /* 分享卡 */
    html += '<div class="dz-card">' +
      '<div class="dz-card-h">发给好友把关</div>' +
      '<p class="dz-hint">好友打开链接就能逐件投「同意 / 不同意」并留言，不用注册。' +
        '表决结果会存到本机后端，换设备也能看到。</p>' +
      '<div class="dz-actions">' +
        '<button class="dz-btn primary" data-dz-act="share"' + (w.items.length ? '' : ' disabled') + '>生成分享链接</button>' +
        (w.shareId ? '<button class="dz-btn ghost" data-dz-act="refresh-votes">刷新好友表决</button>' : '') +
      '</div>' +
      (w.shareId ? '<div class="dz-link"><code id="dzShareLink">' + esc(shareLink(w.shareId)) + '</code>' +
        '<button class="dz-btn ghost sm" data-dz-act="copy-link">复制</button></div>' : '') +
      '<p class="dz-hint dim" id="dzShareState"></p>' +
    '</div>';

    /* 好友表决明细 */
    if (state.approvals.length) {
      html += '<div class="dz-card"><div class="dz-card-h">好友意见</div>';
      state.approvals.forEach(function (a) {
        html += '<div class="dz-ap">' +
          '<div class="dz-ap-h"><b>' + esc(a.name || '好友') + '</b>' +
            '<span>' + timeAgo(a.at || Date.now()) + '</span></div>';
        w.items.forEach(function (it) {
          var v = a.votes && a.votes[it.uid];
          var c = a.comments && a.comments[it.uid];
          if (!v && !c) { return; }
          html += '<p class="dz-ap-line">' +
            '<span class="dz-ap-vote ' + (v === 'yes' ? 'ok' : (v === 'no' ? 'no' : '')) + '">' +
              (v === 'yes' ? '同意' : (v === 'no' ? '不同意' : '—')) + '</span>' +
            esc(it.name) + (c ? '：' + esc(c) : '') + '</p>';
        });
        html += '</div>';
      });
      html += '</div>';
    }

    $('dzBody').innerHTML = html;
  }

  /** 统一刷新入口：各渲染函数互不调用，只在这里按固定顺序调度（铁律 9） */
  function refresh() {
    if (!$('dzBody')) { return; }
    renderTabs();
    if (state.tab === 'wish') { renderWish(); } else { renderCalc(); }
  }

  /* ========================== 交互 ========================== */

  function recalcAndRefresh() {
    ensureUids();
    save();
    refresh();
  }

  function addItem() {
    if (snap().items.length >= MAX_ITEMS) { toast('最多 ' + MAX_ITEMS + ' 件，先删几条'); return; }
    snap().items.push(blankItem());
    recalcAndRefresh();
  }

  function importToWish() {
    var p = plan();
    var picked = p.rows.filter(function (r) { return r.checked && String(r.name || '').trim(); });
    if (!picked.length) { toast('先填几件有名字的商品'); return; }
    var w = state.wish;
    var added = 0;
    picked.forEach(function (r) {
      if (w.items.length >= MAX_WISH) { return; }
      var exists = w.items.some(function (x) { return x.uid === r.uid; });
      if (exists) { return; }
      w.items.push({
        uid: r.uid, name: String(r.name).trim(), price: num(r.price),
        cat: catCode(r.cat), qty: 1
      });
      added++;
    });
    save();
    state.tab = 'wish';
    refresh();
    toast(added ? ('已加入审批单 ' + added + ' 件') : '这些商品都已在审批单里了');
  }

  function toBill(amount) {
    var amt = num(amount);
    if (amt <= 0) { toast('实付为 0，没什么可记的'); return; }
    var bridge = global.AJ_BRIDGE;
    if (!bridge || typeof bridge.startFlow !== 'function') {
      toast('记账模块还没就绪，稍后再试');
      return;
    }
    var names = snap().items.filter(function (it) { return it.checked && String(it.name || '').trim(); })
      .map(function (it) { return String(it.name).trim(); });
    var note = names.length === 1 ? names[0] : ('凑单 ' + names.length + ' 件');
    bridge.startFlow([{
      date: bridge.today(),
      amount: r2(amt),
      category: '购物',
      note: note,
      motivation: '刚需',
      want: false,
      type: 'expense'
    }]);
  }

  /* ---------------- 审批宝 · 跨设备 ---------------- */

  function apiBases() {
    var list = [];
    var loc = global.location || {};
    if (loc.protocol === 'http:' || loc.protocol === 'https:') { list.push(''); }
    list.push('http://127.0.0.1:8010');
    return list;
  }

  function shareLink(id) {
    var loc = global.location || {};
    if (loc.protocol === 'file:') { return 'http://127.0.0.1:8010/?dz=' + id; }
    return (loc.origin || '') + (loc.pathname || '/') + '?dz=' + id;
  }

  /** 依次试后端地址，返回第一个成功响应。
   * 区分两类失败：
   *   · 后端明确回复（4xx/5xx 带 JSON 原因）→ 原样上报，不再换地址（换也没用）
   *   · 连不上（网络错误）→ 换下一个地址，全试完才报「连不上后端」
   * 不区分就会出现「审批单不存在」被说成「连不上后端」，把人引到错的方向去查。
   */
  function dzFetch(path, opts) {
    var bases = apiBases();
    var init = opts || {};
    function attempt(i) {
      if (i >= bases.length) {
        var err = new Error('连不上本机后端（127.0.0.1:8010）。先运行 python deals_api.py');
        err.network = true;
        return Promise.reject(err);
      }
      return global.fetch(bases[i] + path, init).then(function (r) {
        if (!r.ok) {
          return r.json().catch(function () { return null; }).then(function (j) {
            var e = new Error((j && j.error) || ('后端返回 HTTP ' + r.status));
            e.business = true;
            throw e;
          });
        }
        return r.json();
      }).catch(function (e) {
        if (e && e.business) { throw e; }
        return attempt(i + 1);
      });
    }
    return attempt(0);
  }

  function doShare() {
    var w = state.wish;
    if (!w.items.length) { return; }
    var id = w.shareId || ('dz' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    var body = {
      from_name: state.me.name || '我',
      items: w.items.map(function (it) {
        return { uid: it.uid, name: it.name, price: num(it.price), cat: it.cat, qty: it.qty || 1 };
      }),
      total: wishTotal(w.items),
      at: Date.now()
    };
    setShareState('正在写入后端…');
    dzFetch('/api/dazai/share/' + encodeURIComponent(id), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function () {
      w.shareId = id;
      save();
      refresh();
      setShareState('已写入后端，链接发给好友即可（好友无需注册）');
      toast('分享链接已生成');
    }).catch(function (e) {
      setShareState('写入失败：' + (e && e.message ? e.message : '未知原因'));
    });
  }

  function refreshVotes() {
    var id = state.wish.shareId;
    if (!id) { return; }
    setShareState('正在读取好友表决…');
    dzFetch('/api/dazai/share/' + encodeURIComponent(id) + '/votes')
      .then(function (j) {
        var list = (j && j.votes) || [];
        state.approvals = list.map(function (v) {
          return {
            name: v.by_name || '好友',
            votes: v.votes || {},
            comments: v.comments || {},
            at: v.created_at ? new Date(v.created_at).getTime() : Date.now()
          };
        });
        /* 好友发来的商品列表可能比本机新（换了设备），以服务端为准补齐名字/价格 */
        if (j && j.share && j.share.items && j.share.items.length) {
          var byUid = {};
          state.wish.items.forEach(function (it) { byUid[it.uid] = it; });
          j.share.items.forEach(function (si) {
            if (!byUid[si.uid]) { state.wish.items.push(si); }
          });
        }
        save();
        refresh();
        setShareState('已更新，共 ' + state.approvals.length + ' 位好友表态');
      })
      .catch(function (e) {
        setShareState('读取失败：' + (e && e.message ? e.message : '未知原因'));
      });
  }

  function setShareState(text) {
    var el = $('dzShareState');
    if (el) { el.textContent = text; }
  }

  function copyLink() {
    var id = state.wish.shareId;
    if (!id) { return; }
    var link = shareLink(id);
    var done = function () { toast('链接已复制'); };
    if (global.navigator && global.navigator.clipboard) {
      global.navigator.clipboard.writeText(link).then(done, function () { toast(link); });
    } else {
      toast(link);
    }
  }

  /* ---- 好友模式：?dz=<id> 打开 → 逐件表决 ---- */

  var friend = { id: '', share: null, votes: {}, comments: {}, name: '', busy: false, err: '' };

  function friendId() {
    var loc = global.location || {};
    var m = /[?&]dz=([^&]+)/.exec(String(loc.search || ''));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function renderFriend() {
    var box = $('dzBody');
    if (!box) { return; }
    if (friend.err) {
      box.innerHTML = '<div class="dz-card"><div class="dz-card-h">打不开这张审批单</div>' +
        '<p class="dz-hint">' + esc(friend.err) + '</p></div>';
      return;
    }
    if (!friend.share) {
      box.innerHTML = '<div class="dz-card"><p class="dz-empty">正在读取审批单…</p></div>';
      return;
    }
    var sh = friend.share;
    var html = '<div class="dz-card">' +
      '<div class="dz-card-h">' + esc(sh.from_name || '好友') + ' 邀请你逐件把关</div>' +
      '<p class="dz-hint">' + (sh.items || []).length + ' 件 · 合计 ' + yuan(sh.total || wishTotal(sh.items || [])) +
        ' · 免登录，你的表决会同步给发起人</p>' +
      /* 称呼用输入框而不是 prompt()：移动端与内嵌浏览器会拦 prompt，
         而且输入框能留住上次填过的名字，不用每次都重填。 */
      '<label class="dz-field dz-name-field"><span>你的称呼</span>' +
        '<input type="text" maxlength="12" data-dz-friend="name" value="' + esc(friend.name) + '" ' +
        'placeholder="好友会看到这个名字" /></label>' +
      '</div>';

    html += '<div class="dz-card">';
    (sh.items || []).forEach(function (it, i) {
      var m = catMeta(it.cat);
      var v = friend.votes[it.uid] || '';
      html += '<div class="dz-witem">' +
        '<span class="dz-wtile" style="background:' + m.tint + '">' + m.emoji + '</span>' +
        '<div class="dz-wmain">' +
          '<p class="dz-wname">' + esc(it.name) + '</p>' +
          '<p class="dz-wsub">' + yuan(it.price) + ' × ' + (it.qty || 1) + '</p>' +
          '<div class="dz-vote">' +
            '<button class="dz-vbtn' + (v === 'yes' ? ' on yes' : '') + '" data-dz-act="vote" data-i="' + i + '" data-v="yes">同意</button>' +
            '<button class="dz-vbtn' + (v === 'no' ? ' on no' : '') + '" data-dz-act="vote" data-i="' + i + '" data-v="no">不同意</button>' +
          '</div>' +
          '<input class="dz-comment" type="text" data-dz-item="comment" data-i="' + i + '" ' +
            'value="' + esc(friend.comments[it.uid] || '') + '" placeholder="想说的话（选填）" />' +
        '</div>' +
      '</div>';
    });
    html += '</div>';

    var done = 0;
    (sh.items || []).forEach(function (it) { if (friend.votes[it.uid]) { done++; } });
    html += '<div class="dz-card">' +
      '<p class="dz-hint">表决进度 ' + done + ' / ' + (sh.items || []).length + ' 件</p>' +
      '<div class="dz-actions">' +
        '<button class="dz-btn primary" data-dz-act="submit-vote"' +
          (done === (sh.items || []).length && done > 0 ? '' : ' disabled') + '>提交我的审批</button>' +
      '</div>' +
      '<p class="dz-hint dim" id="dzFriendState"></p>' +
    '</div>';

    box.innerHTML = html;
  }

  function loadFriend(id) {
    friend.id = id;
    friend.err = '';
    dzFetch('/api/dazai/share/' + encodeURIComponent(id))
      .then(function (j) {
        if (!j || !j.share) { throw new Error('这张审批单不存在或已失效'); }
        friend.share = j.share;
        renderFriend();
      })
      .catch(function (e) {
        friend.err = (e && e.message) || '读取失败';
        renderFriend();
      });
  }

  function submitVote() {
    if (friend.busy) { return; }
    var nameEl = DOC.querySelector('[data-dz-friend="name"]');
    if (nameEl) { friend.name = String(nameEl.value || '').trim().slice(0, 12); }
    if (!friend.name) {
      toast('先填一下你的称呼，好友才知道是谁的意见');
      if (nameEl && nameEl.focus) { nameEl.focus(); }
      return;
    }
    friend.busy = true;
    dzFetch('/api/dazai/share/' + encodeURIComponent(friend.id) + '/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        by_name: friend.name,
        votes: friend.votes,
        comments: friend.comments
      })
    }).then(function () {
      friend.busy = false;
      var el = $('dzFriendState');
      if (el) { el.textContent = '已提交，' + (friend.share.from_name || '发起人') + '那边能看到你的意见了'; }
      toast('审批已提交');
    }).catch(function (e) {
      friend.busy = false;
      var el = $('dzFriendState');
      if (el) { el.textContent = '提交失败：' + ((e && e.message) || '未知原因'); }
    });
  }

  /* ========================== 事件 ========================== */

  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-dz-act],[data-dz-tab]') : null;
    if (!el) { return; }

    var tab = el.getAttribute('data-dz-tab');
    if (tab) {
      if (friend.id) { return; }   /* 好友模式不给切 */
      state.tab = tab;
      save();
      refresh();
      return;
    }

    var act = el.getAttribute('data-dz-act');
    var i = parseInt(el.getAttribute('data-i'), 10);

    if (act === 'add') { addItem(); return; }
    if (act === 'del') {
      snap().items.splice(i, 1);
      recalcAndRefresh();
      return;
    }
    if (act === 'toggle') {
      var it = snap().items[i];
      if (it) { it.checked = !it.checked; }
      recalcAndRefresh();
      return;
    }
    if (act === 'flag') {
      var it2 = snap().items[i];
      var f = el.getAttribute('data-f');
      if (it2 && f) { it2[f] = !it2[f]; }
      recalcAndRefresh();
      return;
    }
    if (act === 'to-wish') { importToWish(); return; }
    if (act === 'to-bill') { toBill(el.getAttribute('data-amt')); return; }
    if (act === 'wdel') {
      state.wish.items.splice(i, 1);
      save();
      refresh();
      return;
    }
    if (act === 'share') { doShare(); return; }
    if (act === 'refresh-votes') { refreshVotes(); return; }
    if (act === 'copy-link') { copyLink(); return; }
    if (act === 'vote') {
      var item = (friend.share.items || [])[i];
      if (item) { friend.votes[item.uid] = el.getAttribute('data-v'); }
      renderFriend();
      return;
    }
    if (act === 'submit-vote') { submitVote(); return; }
  }

  function onInput(e) {
    var el = e.target;
    if (!el || !el.getAttribute) { return; }

    /* 好友模式：称呼（只记在临态里，提交时才用） */
    if (el.getAttribute('data-dz-friend') === 'name') {
      friend.name = String(el.value || '').slice(0, 12);
      return;
    }

    /* 凑单规则参数 */
    var setKey = el.getAttribute('data-dz-set');
    if (setKey) {
      snap()[setKey] = el.value;
      /* 改动规则只重算不清状态；重绘会让输入框失焦，所以只在需要时重绘数值区 */
      ensureUids();
      save();
      debouncedRefresh();
      return;
    }

    /* 商品字段 */
    var field = el.getAttribute('data-dz-item');
    if (field) {
      var i = parseInt(el.getAttribute('data-i'), 10);

      /* 好友模式的留言 */
      if (field === 'comment') {
        var fitem = (friend.share.items || [])[i];
        if (fitem) { friend.comments[fitem.uid] = el.value; }
        return;
      }

      var it = snap().items[i];
      if (!it) { return; }
      it[field] = field === 'name' || field === 'cat' ? el.value : num(el.value);
      if (field === 'name' || field === 'cat') { ensureUids(); }
      save();
      debouncedRefresh();
    }
  }

  /* 输入时重绘会把焦点打掉：只重算数字区，不做整块 innerHTML 重建 */
  var _t = null;
  function debouncedRefresh() {
    if (_t) { clearTimeout(_t); }
    _t = setTimeout(function () {
      _t = null;
      var active = DOC.activeElement;
      var keepId = active && active.getAttribute ? (active.getAttribute('data-dz-item') || '') : '';
      var keepIdx = active && active.getAttribute ? (active.getAttribute('data-i') || '') : '';
      refresh();
      /* 还原焦点与光标位置（只对商品名/价格这类文本输入做，避免打断连续输入） */
      if (keepId) {
        var back = DOC.querySelector('[data-dz-item="' + keepId + '"][data-i="' + keepIdx + '"]');
        if (back && back.focus) {
          try {
            back.focus();
            var v = back.value;
            if (back.setSelectionRange && typeof v === 'string') {
              back.setSelectionRange(v.length, v.length);
            }
          } catch (err) { /* 忽略 */ }
        }
      }
    }, 320);
  }

  function toast(msg) {
    if (global.AJ_BRIDGE && typeof global.AJ_BRIDGE.toast === 'function') {
      global.AJ_BRIDGE.toast(msg);
      return;
    }
    var el = $('dzToast');
    if (!el) {
      el = DOC.createElement('div');
      el.id = 'dzToast';
      el.className = 'dz-toast';
      DOC.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, 2200);
  }

  /* ========================== 对外 ========================== */

  function mount() {
    state = load();
    var id = friendId();
    if (id) {
      /* 好友模式：只显示审批单，不给看自己的凑单数据 */
      friend.id = id;
      friend.err = '';
      var tabs = DOC.querySelector('.dz-tabs');
      if (tabs) { tabs.hidden = true; }
      loadFriend(id);
      return;
    }
    refresh();
  }

  global.DAZAI = {
    mount: mount,
    refresh: function () { if (state) { refresh(); } },
    isFriend: function () { return !!friendId(); },
    /* 供无头浏览器自检用（纯函数，不改状态） */
    _compute: function (s) { return computePlan(s); },
    _state: function () { return state; }
  };

  /* 事件委托挂在面板上，节点重建后依然有效 */
  function bind() {
    var panel = $('panelDazai');
    if (!panel) { return; }
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', onInput);
    panel.addEventListener('change', onInput);
  }

  if (DOC.readyState === 'loading') {
    DOC.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }

})(typeof window !== 'undefined' ? window : this);
