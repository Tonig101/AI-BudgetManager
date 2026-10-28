/**
 * gu.js — 买谷指南（二次元谷子理财）· 交互逻辑与数据（纯逻辑 + UMD）
 *
 * 定位：给「省钱图谱 → 吃谷避坑」这一类提供**能动手**的工具，
 *       而不是只有一段文字说明。五个工具：
 *         1. 谷圈黑话速查   glossarySearch()   —— 看不懂交易帖先查词
 *         2. 渠道分级清单   CHANNELS           —— 绿/黄/红三档下单前对一遍
 *         3. 拼团防跑路     GROUP_CHECKS       —— 5 项打勾清单，全过再跟团
 *         4. 盲盒冷静器     GACHA_QUESTIONS    —— 3 问自检，答不上就别抽
 *         5. 吃谷罐         jar*()             —— 月度专项额度隔离，超额就拦
 *
 * 为什么单独一个模块 + 独立存储键：
 *   ① 勾选状态 / 额度设置是「用户自己的进度」，不该塞进图谱条目或账单；
 *   ② 存储坏了只应重置吃谷罐，不能连累主账本与存钱罐（与 piggy 同原则）；
 *   ③ 金额一律用**分**的整数存储，避免 0.1+0.2 这类浮点误差。
 *
 * 对外 API（window.AJ.gu）：
 *   GLOSSARY / CHANNELS / GROUP_CHECKS / GACHA_QUESTIONS   静态数据
 *   searchGlossary(q)         黑话搜索 → 命中词条数组
 *   getChecks() / setCheck(id, on) / allGroupChecked()     拼团勾选
 *   getJar() / setQuota(yuan) / spend(yuan, note) / addFunds(yuan, note)
 *   remainingCents() / usedThisMonthCents() / monthKey()
 *   reset()                   清空吃谷罐（供「重置演示数据」调用）
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);

  var KEY = 'ai_jizhang_gu_v1';
  var VERSION = 1;
  /** 单笔上限：10 万元（分） */
  var MAX_CENTS = 10000000;

  /* ================================================================== */
  /* 一、黑话词条（模块1）                                                */
  /* ================================================================== */

  /**
   * 词条结构：{ w 词, m 释义, t 避坑提示 }
   * t 字段是刻意保留的 —— 只解释不给建议，等于把用户又送回坑里。
   */
  var GLOSSARY = [
    { w: '谷子', m: '二次元周边的统称（徽章、立牌、痛包、小卡等）', t: '泛称不代表正版，标「祖国版」的一律按盗版。' },
    { w: '吧唧', m: '圆形/异形徽章，又叫马口铁、痛签', t: '金属边缘容易割手，收到的先看有没有毛边。' },
    { w: '立牌', m: '亚克力立牌，可插在展示板上', t: '亚克力有厚度差，太薄的一捏就裂；别贪便宜买薄片。' },
    { w: '流麻', m: '内部有流沙、会晃动的挂件/立牌', t: '流沙漏了就成废品，看评论有没有「漏沙」反馈。' },
    { w: '小卡', m: '印刷小卡片（多为赠品或抽奖产出）', t: '小卡是盗版重灾区，纸质偏薄、印刷发灰的基本可判假。' },
    { w: '色纸', m: '印刷色卡/插画卡', t: '色纸印刷批次不同颜色会有色差，别把「色差」当盗版而退货。' },
    { w: '痛包', m: '用来挂满谷子的展示包', t: '痛包算谷子支出的一部分，别只算谷本体而漏掉痛包。' },
    { w: '痛袋', m: '收纳谷子的透明内袋/卡砖', t: '痛袋同属吃谷开销，一起算进吃谷罐额度。' },
    { w: '海景谷', m: '稀有、绝版或大幅溢价的谷', t: '价格虚高且假货最多，低于市价 30% 的基本是假。' },
    { w: '烫谷', m: '被炒起来的高价谷（原ami限定等）', t: '泡沫价居多，入手等于给下一个人接盘。' },
    { w: '热谷', m: '需求旺盛、流通快的谷', t: '热谷溢价高，先看闲鱼近期成交均价再决定。' },
    { w: '温谷', m: '需求一般、价格接近发行价的谷', t: '温谷最适合收，出手不亏但也别指望升值。' },
    { w: '冷谷', m: '需求低迷、低于发行价还难出手的谷', t: '冷谷最占钱，能单买就绝不被「捆」。' },
    { w: '捆', m: '把冷门谷和热门谷绑在一起打包卖', t: '捆里的冷谷很可能砸手里，单买更划算。' },
    { w: '肾', m: '「慎」的谐音，代指付款（出肾=出 money）', t: '交易帖里的「出肾」就是「付款」，看到先确认是买还是卖。' },
    { w: '出谷', m: '把自己手里的谷卖掉', t: '出谷是正向现金流，记得在记账里记成「收入 → 闲置回血」。' },
    { w: '回血', m: '卖谷换回钱', t: '回血的钱建议进吃谷罐，形成「买谷-回血」闭环。' },
    { w: '跑单', m: '团长收钱后不发货、人间蒸发', t: '这是最大风险，见 GROUP_CHECKS 五项清单。' },
    { w: '拼团', m: '多人一起下单凑团购价/凑满减', t: '只走平台担保的团，私转的一律不跟。' },
    { w: '团长', m: '组织拼团并负责下单发货的人', t: '看开团成功记录，少于 3 次的直接放弃。' },
    { w: '尾单', m: '工厂/品牌剩余的尾货', t: '官方尾单也是盗版风险项，正版渠道不会以「尾单」名义流通。' },
    { w: '散货', m: '无官方渠道来源的散装货', t: '来源不可追溯的一律按盗版处理。' },
    { w: '祖国版', m: '未经授权的国内仿制品', t: '名字里带「祖国版」就是盗版，别自欺欺人。' },
    { w: '禁无', m: '禁止无授权二次销售的正规周边', t: '正规商品会写「禁止无授权」，写这句的才是正版。' },
    { w: '盲盒', m: '款式随机、看不到具体内容的盒子', t: '盲盒概率必须公示；商家不公示就别下单。' },
    { w: '抽赏', m: '线上付费抽奖，可能实物也可能虚拟', t: '抽赏本质是概率游戏，先算期望值再决定要不要充。' },
    { w: '隐藏款', m: '低概率抽中的款式', t: '「可能抽到稀有」是多巴胺陷阱，算下来常比直收贵。' },
    { w: '通贩', m: '普通版、人人都能买到的常规商品', t: '通贩最保值，急用就买通贩，别为限定加价。' },
    { w: '限定', m: '限量发行、带编号或特定渠道的版本', t: '限定≠保值，先确认官方是否真的限量。' },
    { w: '代购', m: '帮你在境外或特殊渠道下单', t: '要实物图 + 对光视频 + 平台担保，三样缺一不做。' },
    { w: '吃谷', m: '买谷、收谷的整个行为', t: '最容易「吃土也要买」，先把吃谷罐额度锁死。' },
    { w: '邮费', m: '寄件费用，常被混进团费', t: '跟团前先问清邮费谁出、有无偏远地区加价。' },
    { w: '预售', m: '先收定金、后期才发货的团购形式', t: '预售期超 6 个月的团风险高，定金要能退。' }
  ];

  /**
   * 黑话搜索。
   * 命中规则：词本身命中、或释义/避坑里出现关键词。
   * 空查询返回全部（按词长度降序，长的更有信息量）。
   */
  function searchGlossary(q) {
    var s = String(q === null || q === undefined ? '' : q).trim();
    if (!s) {
      return GLOSSARY.slice().sort(function (a, b) { return b.w.length - a.w.length; });
    }
    var low = s.toLowerCase();
    var hits = [];
    for (var i = 0; i < GLOSSARY.length; i++) {
      var g = GLOSSARY[i];
      if (g.w.toLowerCase().indexOf(low) >= 0 ||
        g.m.toLowerCase().indexOf(low) >= 0 ||
        g.t.toLowerCase().indexOf(low) >= 0) {
        hits.push(g);
      }
    }
    return hits;
  }

  /* ================================================================== */
  /* 二、渠道分级（模块2）                                                */
  /* ================================================================== */

  /**
   * 三档渠道。level: green / yellow / red
   * items 每项都带一句「怎么验」，不能只给结论。
   */
  var CHANNELS = [
    {
      level: 'green', label: '闭眼入', tone: '安全',
      items: [
        { t: '官方旗舰店', v: '品牌或厂牌自营，认准店铺名与授权书' },
        { t: '授权线下谷店', v: '能当场出示授权方/厂商名单与中文标识' },
        { t: '漫展官方摊位', v: '主办方名录里能查到的展位才买' }
      ]
    },
    {
      level: 'yellow', label: '谨慎', tone: '有条件',
      items: [
        { t: '闲鱼（仅平台担保）', v: '走担保交易，要实物图 + 对光视频' },
        { t: '有实绩的代购店', v: '≥50 单、有历史评价、能提供购买凭证' },
        { t: '老牌拼团', v: '团长 ≥3 次成功开团，费用明细公开' }
      ]
    },
    {
      level: 'red', label: '别碰', tone: '高风险',
      items: [
        { t: '微信 / QQ 私转', v: '脱离平台，团长跑路你连投诉都无从下手' },
        { t: '无监管拼团小程序', v: '没有担保、没有仲裁，卷款概率高' },
        { t: '评论区留联系方式的代购', v: '九成是诈骗，同行引流或直接跑路' },
        { t: '低于市价 30% 的海景谷', v: '价格不成立，基本可判定为假货' }
      ]
    }
  ];

  /* ================================================================== */
  /* 三、拼团防跑路清单（模块3）                                          */
  /* ================================================================== */

  /** 五项全部打勾才能跟团；顺序就是检查顺序 */
  var GROUP_CHECKS = [
    { id: 'g1', t: '团长有 ≥3 次成功开团记录', v: '超话 / 小红书可查' },
    { id: 'g2', t: '支持平台担保交易', v: '闲鱼链接，不接受微信 / 支付宝私转' },
    { id: 'g3', t: '公开购买凭证、物流、费用明细', v: '包括邮费与额外收费' },
    { id: 'g4', t: '提前说明发货时间、捆物规则、退款政策', v: '口头承诺不算，要落在文字上' },
    { id: 'g5', t: '团规模 ≤50 人、预售期 ≤6 个月', v: '规模越大、周期越长，跑路概率越高' }
  ];

  /* ================================================================== */
  /* 四、盲盒抽赏冷静器（模块4）                                          */
  /* ================================================================== */

  /**
   * 三问自检。每问给 2~3 个选项，其中一个标 `bad`（答不上来的那一档）。
   * 三问全过 → 可以抽；有 bad → 先别抽，去闲鱼收确认款。
   */
  var GACHA_QUESTIONS = [
    {
      q: '这个角色的热 / 温 / 冷，你查了吗？',
      hint: '先在闲鱼搜「角色名 + 谷」，看近期成交均价',
      opts: [
        { t: '查过了，认准是温谷 / 冷谷', good: true },
        { t: '查过了，确认是热门款', good: true },
        { t: '还没查，就是想抽', bad: true }
      ]
    },
    {
      q: '商家公示隐藏款概率了吗？',
      hint: '消协规定盲盒概率必须公示，8 岁以下禁售',
      opts: [
        { t: '公示了，明明白白写着概率', good: true },
        { t: '没公示，但宣传页写了「必中」', bad: true },
        { t: '根本没找到概率说明', bad: true }
      ]
    },
    {
      q: '抽到不想要的款，你愿意花多少精力去出二手？',
      hint: '算上时间成本，出手价通常低于发行价',
      opts: [
        { t: '愿意，愿意花时间慢慢出', good: true },
        { t: '不愿意，出了就打折', bad: true },
        { t: '没想过，抽到再说', bad: true }
      ]
    }
  ];

  /**
   * 冷静器判定。
   * @param {number[]} answers 每问选中的选项下标
   * @return {{ok:boolean, pass:number, total:number, verdict:string, reason:string}}
   */
  function gachaVerdict(answers) {
    var arr = Array.isArray(answers) ? answers : [];
    var total = GACHA_QUESTIONS.length;
    var pass = 0;
    var badIdx = [];
    for (var i = 0; i < total; i++) {
      var q = GACHA_QUESTIONS[i];
      var pick = arr[i];
      if (typeof pick !== 'number' || !q.opts[pick]) { continue; }
      if (q.opts[pick].good) { pass++; } else { badIdx.push(i); }
    }
    if (badIdx.length === 0 && pass === total) {
      return {
        ok: true, pass: pass, total: total,
        verdict: '可以抽，但先设好吃谷罐额度',
        reason: '三问都过了：价格你心里有数、概率商家公示了、抽到不想要的也认。' +
          '抽之前把这次要花的金额先从额度里划出来，超了就不抽。'
      };
    }
    return {
      ok: false, pass: pass, total: total,
      verdict: '先别抽，去闲鱼直接收确认款',
      reason: badIdx.length
        ? '第 ' + badIdx.map(function (x) { return x + 1; }).join('、') + ' 问没答上来。' +
          '盲抽的「可能抽到稀有」是多巴胺陷阱，算下来往往比直接收确认款贵。'
        : '还有 ' + (total - pass) + ' 问没答上来，先补齐再决定。'
    };
  }

  /* ================================================================== */
  /* 五、吃谷罐（模块5）                                                  */
  /* ================================================================== */

  /**
   * 库结构：
   *   quota      月度专项额度（分），0 = 还没设
   *   used       { 'YYYY-MM': 分 }，按月记已用额度（跨月自动清零）
   *   logs       流水（展示用），{ id, date, type:'out'|'in', cents, note, at }
   *   checks     { checkId: true }，拼团清单勾选状态
   */
  var db = { v: VERSION, quota: 0, used: {}, logs: [], checks: {}, updatedAt: 0 };
  var ready = true;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function dateKey(value) {
    var d = (value === undefined || value === null) ? new Date() : new Date(value);
    if (isNaN(d.getTime())) { d = new Date(); }
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 当前自然月键 YYYY-MM（跨月时已用额度自动归零） */
  function monthKey(value) {
    var d = (value === undefined || value === null) ? new Date() : new Date(value);
    if (isNaN(d.getTime())) { d = new Date(); }
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }

  function toCents(yuan) {
    var v = Number(yuan);
    if (!isFinite(v) || v < 0) { return null; }
    return Math.round(v * 100);
  }

  function fmtCents(cents) {
    var v = Math.round(Number(cents) || 0);
    var neg = v < 0;
    var abs = Math.abs(v);
    var s = Math.floor(abs / 100) + '.' + pad2(abs % 100);
    var parts = s.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '-¥' : '¥') + parts[0] + '.' + parts[1];
  }

  function uid() {
    return 'g_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 100000).toString(36);
  }

  /* ------------------------------ 持久化 ------------------------------ */

  var memStore = null;
  function storage() {
    if (isNode) {
      if (!memStore) {
        memStore = {
          _d: {},
          getItem: function (k) {
            return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null;
          },
          setItem: function (k, v) { this._d[k] = String(v); }
        };
      }
      return memStore;
    }
    try {
      return global.localStorage || null;
    } catch (e) {
      return null;
    }
  }

  function emptyDb() {
    return { v: VERSION, quota: 0, used: {}, logs: [], checks: {}, updatedAt: 0 };
  }

  function normalizeDb(obj) {
    var o = (obj && typeof obj === 'object') ? obj : {};
    var used = {};
    if (o.used && typeof o.used === 'object') {
      for (var k in o.used) {
        if (!Object.prototype.hasOwnProperty.call(o.used, k)) { continue; }
        var c = Math.round(Number(o.used[k]));
        if (isFinite(c) && c >= 0) { used[k] = c; }
      }
    }
    var logs = [];
    var src = Array.isArray(o.logs) ? o.logs : [];
    for (var i = 0; i < src.length; i++) {
      var r = src[i];
      if (!r || typeof r !== 'object') { continue; }
      var cents = Math.round(Number(r.cents));
      if (!isFinite(cents) || cents <= 0) { continue; }
      logs.push({
        id: (typeof r.id === 'string' && r.id) ? r.id : uid(),
        date: (typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)) ? r.date : dateKey(),
        type: r.type === 'in' ? 'in' : 'out',
        cents: Math.min(cents, MAX_CENTS),
        note: typeof r.note === 'string' ? r.note.slice(0, 40) : '',
        at: isFinite(Number(r.at)) ? Number(r.at) : Date.now()
      });
    }
    if (logs.length > 300) { logs = logs.slice(logs.length - 300); }
    var checks = {};
    if (o.checks && typeof o.checks === 'object') {
      for (var cid in o.checks) {
        if (!Object.prototype.hasOwnProperty.call(o.checks, cid)) { continue; }
        if (o.checks[cid]) { checks[cid] = true; }
      }
    }
    var quota = Math.round(Number(o.quota));
    if (!isFinite(quota) || quota < 0 || quota > MAX_CENTS) { quota = 0; }
    return {
      v: VERSION,
      quota: quota,
      used: used,
      logs: logs,
      checks: checks,
      updatedAt: isFinite(Number(o.updatedAt)) ? Number(o.updatedAt) : 0
    };
  }

  function load() {
    var ls = storage();
    if (!ls) { ready = false; db = emptyDb(); return db; }
    var raw = null;
    try {
      raw = ls.getItem(KEY);
    } catch (e) {
      ready = false; db = emptyDb(); return db;
    }
    if (!raw) { db = emptyDb(); return db; }
    try {
      db = normalizeDb(JSON.parse(raw));
    } catch (e2) {
      db = emptyDb();   // 存档坏了只重置吃谷罐，不动主账本
    }
    return db;
  }

  function save() {
    var ls = storage();
    if (!ls) { ready = false; return false; }
    try {
      db.updatedAt = Date.now();
      ls.setItem(KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      ready = false;
      return false;
    }
  }

  /* ------------------------------ 勾选 ------------------------------ */

  function getChecks() {
    if (!db.checks) { db.checks = {}; }
    return db.checks;
  }

  /** 设置某项勾选状态；返回最新状态 */
  function setCheck(id, on) {
    var key = String(id || '');
    if (!key) { return false; }
    if (on) { db.checks[key] = true; } else { delete db.checks[key]; }
    if (!save()) { return false; }
    return true;
  }

  /** 五项是否全过 */
  function allGroupChecked() {
    var c = getChecks();
    for (var i = 0; i < GROUP_CHECKS.length; i++) {
      if (!c[GROUP_CHECKS[i].id]) { return false; }
    }
    return true;
  }

  /** 已勾选数量 */
  function checkedCount() {
    var c = getChecks();
    var n = 0;
    for (var i = 0; i < GROUP_CHECKS.length; i++) {
      if (c[GROUP_CHECKS[i].id]) { n++; }
    }
    return n;
  }

  /* ------------------------------ 吃谷罐 ------------------------------ */

  function getJar() {
    return { quota: db.quota || 0, used: db.used || {}, logs: db.logs || [] };
  }

  /** 本月已用（分） */
  function usedThisMonthCents(mk) {
    var k = mk || monthKey();
    return Math.round(Number((db.used || {})[k]) || 0);
  }

  /** 本月剩余额度（分）；没设额度时返回 null（表示「不限」） */
  function remainingCents(mk) {
    if (!db.quota) { return null; }
    return db.quota - usedThisMonthCents(mk);
  }

  /**
   * 设置月度额度（元）。
   * @return {{ok:boolean, quotaCents:number, reason:?string}}
   */
  function setQuota(yuan) {
    var c = toCents(yuan);
    if (c === null) { return { ok: false, quotaCents: db.quota || 0, reason: 'amount' }; }
    if (c > MAX_CENTS) { return { ok: false, quotaCents: db.quota || 0, reason: 'toolarge' }; }
    db.quota = c;
    if (!save()) { return { ok: false, quotaCents: db.quota || 0, reason: 'store' }; }
    return { ok: true, quotaCents: c, reason: null };
  }

  /**
   * 记一笔买谷消费，从本月额度里扣。
   * 超额度 → 拒绝（reason:'over'），这是「隔离额度」的核心：不是提醒，是拦住。
   */
  function spend(yuan, note) {
    var c = toCents(yuan);
    if (c === null || c <= 0) { return { ok: false, reason: 'amount' }; }
    var mk = monthKey();
    var left = remainingCents(mk);
    if (left !== null && c > left) {
      return { ok: false, reason: 'over', leftCents: left, needCents: c };
    }
    var log = {
      id: uid(), date: dateKey(), type: 'out', cents: c,
      note: typeof note === 'string' ? note.slice(0, 40) : '', at: Date.now()
    };
    db.logs.push(log);
    if (db.logs.length > 300) { db.logs = db.logs.slice(db.logs.length - 300); }
    db.used[mk] = usedThisMonthCents(mk) + c;
    if (!save()) {
      db.logs.pop();
      db.used[mk] = usedThisMonthCents(mk) - c;
      return { ok: false, reason: 'store' };
    }
    return { ok: true, log: log, leftCents: remainingCents(mk), reason: null };
  }

  /**
   * 往吃谷罐里补钱（从生活费划进来）。
   * 补进来不增加额度，只记录「本月已准备多少钱」，
   * 额度是「允许花多少」，两者不是一回事。
   */
  function addFunds(yuan, note) {
    var c = toCents(yuan);
    if (c === null || c <= 0) { return { ok: false, reason: 'amount' }; }
    var log = {
      id: uid(), date: dateKey(), type: 'in', cents: c,
      note: typeof note === 'string' ? note.slice(0, 40) : '', at: Date.now()
    };
    db.logs.push(log);
    if (db.logs.length > 300) { db.logs = db.logs.slice(db.logs.length - 300); }
    if (!save()) { db.logs.pop(); return { ok: false, reason: 'store' }; }
    return { ok: true, log: log, reason: null };
  }

  /** 流水（新的在前） */
  function listLogs(limit) {
    var n = (limit === undefined || limit === null) ? db.logs.length : Math.max(0, Math.round(limit));
    var arr = db.logs.slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    return n >= arr.length ? arr : arr.slice(0, n);
  }

  function reset() {
    db = emptyDb();
    return save();
  }

  /* ================================================================== */

  var API = {
    KEY: KEY,
    VERSION: VERSION,

    /* 数据 */
    GLOSSARY: GLOSSARY,
    CHANNELS: CHANNELS,
    GROUP_CHECKS: GROUP_CHECKS,
    GACHA_QUESTIONS: GACHA_QUESTIONS,

    /* 模块1 */
    searchGlossary: searchGlossary,
    /* 模块4 */
    gachaVerdict: gachaVerdict,
    /* 模块3 */
    getChecks: getChecks, setCheck: setCheck,
    allGroupChecked: allGroupChecked, checkedCount: checkedCount,
    /* 模块5 */
    getJar: getJar, setQuota: setQuota, spend: spend, addFunds: addFunds,
    remainingCents: remainingCents, usedThisMonthCents: usedThisMonthCents,
    monthKey: monthKey, listLogs: listLogs,

    /* 通用 */
    isReady: function () { return ready && !!storage(); },
    load: load, reset: reset,
    fmtCents: fmtCents, dateKey: dateKey,
    __store: storage
  };

  if (isNode) {
    module.exports = API;
  } else {
    global.AJ = global.AJ || {};
    global.AJ.gu = API;
  }
})(typeof window !== 'undefined' ? window : this);
