/**
 * onboard.js — 新手引导状态机（纯逻辑，零 DOM，UMD）
 *
 * 定位：把「新手引导走到第几步、看过没、跳过了哪步」抽成可单测的纯逻辑，
 *       渲染层（app.js 的 ob* 函数）只负责按 currentStep() 画遮罩和气泡。
 *
 * 浏览器：通过 <script> 加载，挂载到 window.AJ.onboard（必须在 app.js 之前）
 * Node  ：require('./onboard.js') 直接返回 API
 *
 * 为什么进度按 UI 类型分两份（full / simple）：
 *   完整版（chat/dash/dazai/coach/goals）与简洁版（shome/slist/ssave/sprofile）
 *   的锚点元素完全不同。用户在手机上看完第 3 步，回电脑打开时第 1、2 步的
 *   锚点在当前界面根本不存在，共用一个 step 会指到空气。故各存一份。
 *
 * 对外 API（window.AJ.onboard）：
 *   GUIDE_VERSION   引导内容版本号（跟新增大功能挂钩，升级后可再弹一次）
 *   STEPS           步骤表（见下）
 *   count()         总步数
 *   get(i)          第 i 步（越界返回 null）
 *   load()          读存档 + 归一化，永不抛错
 *   save(patch)     合并写盘，永不抛错
 *   status(mode)    该模式的状态：idle / running / done / skipped
 *   stepIndex(mode) 该模式当前步序
 *   current(mode)   当前步骤对象（idle 时返回第 0 步）
 *   isActive(mode)  是否正在引导中（渲染层与「静音宠物」判定都用它）
 *   shouldOffer(mode) 是否该自动弹（idle，或内容版本升级过）
 *   start(mode)     开始 / 续逛
 *   goTo(mode,i)    跳到第 i 步
 *   next(mode)      下一步；末步再 next 即 done
 *   prev(mode)      上一步（不低于 0）
 *   skipStep(mode)  跳过当前这步（记入 skippedSteps）并前进
 *   skipAll(mode)   整段跳过（skipped）
 *   finish(mode)    走完（done）
 *   replay(mode)    重新查看（回到第 0 步，replays++，不动 doneAt）
 *   notify(mode,kind) 业务事件上报；若命中当前步的 completeOn 返回 true
 *   anchorOf(step,mode) 取该步在当前 UI 下的选择器（无锚点返回 null）
 */
(function (global) {
  'use strict';

  var KEY = 'ai_jizhang_onboard_v1';
  /* v3：反馈「教程没覆盖所有功能」。改为「一页一步 + 该页全部入口清单」，
     补上流水筛选 / 账单分析 / 设置页 / 全功能地图；每步带 3-5 条 points，
     不再只讲一件事。已看过 v1/v2 的用户会再收到一次（shouldOffer 检测版本落后）。 */
  var GUIDE_VERSION = 3;

  /* 内存兜底：隐私模式 / 存储被禁时，本次会话内仍然正常走完 */
  var memory = null;

  /* ---------------- 步骤表 ----------------
   * kind   : welcome（欢迎）/ step（分步）/ map（全功能地图）/ finish（结束）
   * mode   : 'do'   解锁目标，等用户真操作（completeOn 命中则自动前进）
   *          'demo' 纯讲解，锁住目标
   * view   : 进入该步前要切到的视图（null = 停在当前页）
   * anchor : 两种 UI 各自的高亮目标
   * points : 【这页还能做什么】清单，每步 3-5 条，覆盖该页全部入口
   *          （v3 起：不再让用户点十几下，而是每页一次讲全）
   * bodySimple / tipSimple : 简洁版文案覆盖（默认沿用完整版）
   * pos    : 气泡位置偏好 auto / top / center
   */
  var STEPS = [
    {
      id: 'welcome',
      kind: 'welcome',
      pos: 'center',
      title: '欢迎，我是阿账',
      sub: 'AI 校园记账管家 · 10 步认识全部功能',
      points: [
        ['说一句话就记好', '「中午食堂 15」，金额、分类、日期它自己拆'],
        ['预算天天算给你看', '还剩多少、日均能花多少，一眼就知道'],
        ['省钱、攒钱都有去处', '155 条省钱条目 · 心愿单冷静期 · 攒钱目标 · 存钱罐']
      ],
      cta: '带我逛一遍 · 约 2 分钟',
      alt: '我自己看看'
    },
    {
      id: 'bill',
      kind: 'step',
      tag: '记账',
      title: '先记一笔试试',
      body: '点这儿打一句话 —— 「中午食堂 15」「奶茶 18 用花呗」都行，' +
        '一次说好几笔也能拆开。金额、分类、日期它自己填，不用选下拉框。',
      bodySimple: '点「＋ 记一笔」记一笔，或直接在下面的对话框里打一句话 —— ' +
        '「中午食堂 15」都行，金额、分类、日期它自己填。',
      points: [
        ['说话也能记', '输入框左边麦克风，说一句就落账，比打字快'],
        ['截图也能记', '顶部相机：传一张外卖/付款截图，自动认出金额'],
        ['补记前几天的', '顶部「＋ 记一笔」能改日期，漏记的补上'],
        ['记错了一键撤', '输入框上方「撤回上一步」，删掉刚才那笔']
      ],
      tip: '「⋯」里还有：存钱罐、心愿单、导入账单、导出 CSV、重置演示数据。',
      fill: '中午食堂 15',
      cta: '我记好了 · 下一步',
      view: { full: 'chat', simple: 'shome' },
      anchor: { full: '#chatInput', simple: '#spBtnAdd' },
      mode: 'do',
      completeOn: 'bill_logged',
      pos: 'auto'
    },
    {
      id: 'budget',
      kind: 'step',
      tag: '预算',
      title: '预算是一条活的线',
      body: '顶上这条是本月剩余预算。日均可用 = 剩余 ÷ 剩余天数，' +
        '绿色还安全、黄色该收着点、红色已经超了。',
      points: [
        ['点一下看详情', '剩余、日均、剩余天数、这个周期从哪天算起'],
        ['预算随时能改', '设置 → 预算设置：月预算、发薪日、日均上限'],
        ['快超了会提醒', '设置里可以开关「超支提醒」']
      ],
      cta: '知道了 · 下一步',
      view: { full: 'dash', simple: 'shome' },
      anchor: { full: '#budgetBar', simple: '#spRemain' },
      mode: 'demo',
      pos: 'auto'
    },
    {
      id: 'detail',
      kind: 'step',
      tag: '流水',
      title: '每笔钱都翻得出来',
      body: '看板下半部分是流水，右上「筛选」能按类目、金额、关键词，' +
        '把想找的那几笔挑出来。',
      bodySimple: '「明细」页按月翻，左右箭头换月份，右上「筛选」按类目、金额、关键词挑。',
      points: [
        ['账单分析', '顶部柱状图图标：把微信/支付宝/银行的 CSV 拖进来，出分类饼图、月报、重复项检查，再决定要不要并入账本'],
        ['导入历史账单', '「⋯ → 导入账单」把几个月前的流水一次并进来，自动排重'],
        ['导出 CSV', '「⋯ → 导出 CSV」拿去 Excel 里自己算'],
        ['消费诊断', '看板里有几道题，答完给你一份「钱都去哪了」的诊断']
      ],
      tip: '账单分析默认只看不写账本，确认无误再点「并入账本」。',
      cta: '下一步',
      view: { full: 'dash', simple: 'slist' },
      anchor: { full: '#btnBillFilter', simple: '#btnSpBillFilter' },
      mode: 'demo',
      pos: 'auto'
    },
    {
      id: 'wish',
      kind: 'step',
      tag: '冷静期',
      title: '想买先放一放',
      body: '犹豫的东西丢进心愿单，先过 24 小时冷静期。到点它会回来问你：' +
        '还想要吗？不要了，这笔钱就等于省下了。',
      points: [
        ['到点回来问你', '冷静期时长能在设置里改（默认 24 小时）'],
        ['省下的有账', '放弃的金额记进「冷静期省下」，累计攒了多少看得见'],
        ['购物车先过一遍', '拿不准的整单丢给搭子页的「审批宝」逐件审']
      ],
      cta: '下一步',
      open: '看完关掉，点这里继续',
      /* 上一步「流水」在简洁版会切到明细页，心愿单入口在首页四宫格里，必须先切回去 */
      view: { full: 'chat', simple: 'shome' },
      anchor: { full: '#btnWishTop', simple: '#spFeatureGrid [data-goto-wish]' },
      mode: 'do',
      completeOn: 'wish_sheet_open',
      pos: 'auto'
    },
    {
      id: 'save',
      kind: 'step',
      tag: '省钱',
      title: '能省的钱在这儿',
      body: '省钱雷达按你的位置找周边正在搞活动的店；省钱图谱有 155 条、12 类' +
        '能立刻做的动作 —— 食堂怎么吃、外卖怎么凑、话费怎么降。',
      points: [
        ['省钱雷达', '今天有哪些活动、接下来 14 天的优惠日历'],
        ['155 条省钱图谱', '按类目翻，每条都写清怎么操作、能省多少'],
        ['懒得翻就直接问', '「今天有啥优惠」「疯狂星期四」「话费怎么降」'],
        ['团购省钱卡', '在理财专家页，常买的店先看有没有券']
      ],
      cta: '下一步',
      open: '看完关掉，点这里继续',
      view: null,
      anchor: { full: '#btnSaveHub', simple: '#tabbarSimple [data-view="ssave"]' },
      mode: 'do',
      completeOn: 'save_hub_open',
      pos: 'auto'
    },
    {
      id: 'dazai',
      kind: 'step',
      tag: '搭子',
      title: '凑单不用自己算',
      body: '「搭子」页两件工具：凑单计算器算满减怎么拼最划算；' +
        '审批宝逐件审你的购物车，把冲动的那几件挑出来砍掉。',
      points: [
        ['凑单计算器', '填总价和满减门槛，直接告诉你还差多少、怎么拼最省'],
        ['审批宝', '一件件问「这个真的需要吗」，砍掉的金额当场累计'],
        ['右上角有教程', '「教程」按钮里是图文步骤，忘了点开看']
      ],
      tip: '双十一、618 下单前先来这儿算一遍，常常能省出一顿饭钱。',
      cta: '下一步',
      view: { full: 'dazai', simple: 'ssave' },
      anchor: { full: '#panelDazai .dz-tabs', simple: '#spBtnDazai' },
      mode: 'demo',
      pos: 'auto'
    },
    {
      id: 'coach',
      kind: 'step',
      tag: '理财专家',
      title: '小衡替你看账',
      body: '理财专家按你本机账单给建议：这个月哪类涨了、哪笔最该砍。' +
        '还有消费性格测试、团购省钱卡和理财学院微课。',
      points: [
        ['消费性格测试', '10 道题（可选 30/50 题加长版），测出你是囤积型还是月光型'],
        ['专属建议', '跟着账单变：哪类在涨、哪笔最该砍，都点名'],
        ['理财学院', '分章节的微课，从记账、预算到省钱攒钱一步步来'],
        ['直接问专家', '「问专家」可以问「怎么把饭钱压到 600」']
      ],
      cta: '下一步',
      view: { full: 'coach', simple: 'shome' },
      anchor: { full: '#personaCard', simple: '#spFeatureGrid [data-view="scoach"]' },
      mode: 'demo',
      pos: 'auto'
    },
    {
      id: 'goals',
      kind: 'step',
      tag: '目标',
      title: '给自己存个目标',
      body: '想买的东西、想去的地方，设成目标填金额和日期，它按天告诉你要存多少；' +
        '存钱罐是随手往里丢零钱的地方。',
      points: [
        ['目标随时加', '填金额和截止日期，它算「每天该存多少」'],
        ['进度跟预算联动', '不会让你为了存钱把饭钱省没了'],
        ['存钱罐丢零钱', '今天省下的、凑单省的，随手丢进去，看着数字涨']
      ],
      cta: '下一步',
      view: { full: 'goals', simple: 'shome' },
      anchor: { full: '#goalCard', simple: '#spFeatureGrid [data-view="sgoals"]' },
      mode: 'demo',
      pos: 'auto'
    },
    {
      id: 'settings',
      kind: 'step',
      tag: '设置',
      title: '所有开关都在这页',
      body: '点右上角齿轮进设置。预算、主题、字号、宠物形象、说话风格、' +
        '数据备份，全在这一页，往下滑还有很多。',
      bodySimple: '在「我的」页点「设置」。预算、主题、宠物形象、说话风格、' +
        '数据导出，全在这一页。',
      points: [
        ['预算与发薪日', '月预算、每月几号发钱、日均上限、冷静期时长'],
        ['界面与字体', '深浅主题、字号；还能整站切「简洁版 / 完整版」'],
        ['数据与隐私', '导出备份、清缓存；换手机前一定要先导出'],
        ['说话风格 · 截图识别', '改阿账的语气；截图记账要填自己的 OCR key'],
        ['新手引导', '就是这儿，随时能把这个教程重看一遍']
      ],
      tip: '看不清小字可以把字号调大，设置会记住。',
      cta: '下一步',
      open: '看完关掉，点这里继续',
      view: { full: 'chat', simple: 'sprofile' },
      anchor: { full: '#btnSettings', simple: '#spMenuSettings' },
      mode: 'do',
      completeOn: 'settings_open',
      pos: 'auto'
    },
    {
      id: 'map',
      kind: 'map',
      pos: 'center',
      title: '全功能地图',
      sub: '想不起来什么在哪，随时回这儿找 —— 点带箭头的能直接跳过去',
      cta: '继续',
      groups: [
        {
          name: '记一笔',
          items: [
            { t: '一句话记账', s: 'bill' },
            { t: '语音记账', n: '输入框左边麦克风' },
            { t: '截图记账', n: '顶部相机' },
            { t: '补记前几天', n: '顶部「＋ 记一笔」' },
            { t: '撤回上一步', n: '输入框上方' }
          ]
        },
        {
          name: '看账',
          items: [
            { t: '剩余预算 / 日均', s: 'budget' },
            { t: '流水筛选、按月翻', s: 'detail' },
            { t: '账单分析（导入 CSV）', s: 'detail' },
            { t: '导入历史账单、导出 CSV', n: '「⋯」菜单' },
            { t: '消费诊断', n: '看板内' }
          ]
        },
        {
          name: '省钱与攒钱',
          items: [
            { t: '心愿单 · 冷静期', s: 'wish' },
            { t: '省钱雷达 + 155 条图谱', s: 'save' },
            { t: '攒钱目标', s: 'goals' },
            { t: '存钱罐', s: 'goals' }
          ]
        },
        {
          name: '花钱之前',
          items: [
            { t: '凑单计算器', s: 'dazai' },
            { t: '审批宝（逐件审购物车）', s: 'dazai' }
          ]
        },
        {
          name: '专家与设置',
          items: [
            { t: '消费性格测试', s: 'coach' },
            { t: '理财学院微课', s: 'coach' },
            { t: '预算 / 主题 / 字号', s: 'settings' },
            { t: '数据导出与备份', s: 'settings' },
            { t: '新手引导（重看）', s: 'settings' }
          ]
        }
      ]
    },
    {
      id: 'finish',
      kind: 'finish',
      pos: 'center',
      title: '逛完了，功能都在你手上',
      cta: '开始记账',
      alt: '60 秒速查',
      extra: '去理财学院',
      again: '回功能地图看看'
    }
  ];

  var STEP_IDS = [];
  (function () {
    for (var i = 0; i < STEPS.length; i++) { STEP_IDS.push(STEPS[i].id); }
  })();

  function blankMode() {
    return { status: 'idle', step: 0, updatedAt: null, doneAt: null };
  }

  function blank() {
    return {
      v: 1,
      firstSeenAt: null,
      full: blankMode(),
      simple: blankMode(),
      skippedSteps: [],
      replays: 0,
      guideVersion: GUIDE_VERSION
    };
  }

  function isMode(m) { return m === 'simple' ? 'simple' : 'full'; }

  function clampIdx(i) {
    i = parseInt(i, 10);
    if (isNaN(i) || i < 0) { return 0; }
    if (i > STEPS.length - 1) { return STEPS.length - 1; }
    return i;
  }

  function normMode(raw) {
    var m = (raw && typeof raw === 'object') ? raw : {};
    var st = String(m.status || 'idle');
    if (st !== 'running' && st !== 'done' && st !== 'skipped') { st = 'idle'; }
    var out = {
      status: st,
      step: clampIdx(m.step),
      updatedAt: Number(m.updatedAt) || null,
      doneAt: Number(m.doneAt) || null
    };
    /* idle 一律回第 0 步，避免存档脏了以后停在中途 */
    if (out.status === 'idle') { out.step = 0; }
    return out;
  }

  /** 把任意输入（含损坏存档）整理成安全结构：绝不抛异常，只重置引导自身 */
  function normalize(raw) {
    var src = (raw && typeof raw === 'object') ? raw : {};
    var st = blank();
    st.v = 1;
    st.firstSeenAt = Number(src.firstSeenAt) || null;
    st.full = normMode(src.full);
    st.simple = normMode(src.simple);
    st.replays = Math.max(0, parseInt(src.replays, 10) || 0);
    st.guideVersion = Math.max(0, parseInt(src.guideVersion, 10) || 0);
    st.skippedSteps = [];
    if (Object.prototype.toString.call(src.skippedSteps) === '[object Array]') {
      for (var i = 0; i < src.skippedSteps.length; i++) {
        var id = String(src.skippedSteps[i] || '');
        if (id && STEP_IDS.indexOf(id) >= 0 && st.skippedSteps.indexOf(id) < 0) {
          st.skippedSteps.push(id);
        }
      }
    }
    return st;
  }

  function load() {
    if (memory) { return normalize(memory); }
    var raw = null;
    try {
      raw = global.localStorage ? global.localStorage.getItem(KEY) : null;
    } catch (e) {
      raw = null;                       /* 隐私模式：读也不让读 */
    }
    if (!raw) { return blank(); }
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e2) { return blank(); } /* 坏存档 → 只重置引导 */
    return normalize(parsed);
  }

  function save(patch) {
    var cur = load();
    if (patch && typeof patch === 'object') {
      for (var k in patch) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) { cur[k] = patch[k]; }
      }
    }
    memory = cur;
    try {
      if (global.localStorage) { global.localStorage.setItem(KEY, JSON.stringify(cur)); }
    } catch (e) {
      /* 写不进去就留在 memory 里，本次会话照常走完 */
    }
    return cur;
  }

  function status(mode) { return load()[isMode(mode)].status; }
  function stepIndex(mode) { return load()[isMode(mode)].step; }
  function count() { return STEPS.length; }
  function get(i) { return STEPS[clampIdx(i)] || null; }
  function current(mode) { return STEPS[stepIndex(mode)] || STEPS[0]; }
  function isActive(mode) { return status(mode) === 'running'; }

  function shouldOffer(mode) {
    var st = load();
    var cur = st[isMode(mode)];
    if (cur.status === 'idle') { return true; }
    if (cur.status === 'running') { return true; }          /* 断点续逛 */
    return st.guideVersion < GUIDE_VERSION;                /* 内容升级过 → 再弹一次 */
  }

  function start(mode) {
    var m = isMode(mode);
    var st = load();
    if (st[m].status === 'running') { return st[m]; }      /* 续逛：不重置步序 */
    st[m] = { status: 'running', step: 0, updatedAt: Date.now(), doneAt: null };
    if (!st.firstSeenAt) { st.firstSeenAt = Date.now(); }
    st.guideVersion = GUIDE_VERSION;
    save(st);
    return st[m];
  }

  function goTo(mode, i) {
    var m = isMode(mode);
    var st = load();
    st[m] = {
      status: 'running',
      step: clampIdx(i),
      updatedAt: Date.now(),
      doneAt: st[m].doneAt || null
    };
    if (!st.firstSeenAt) { st.firstSeenAt = Date.now(); }
    save(st);
    return st[m];
  }

  function next(mode) {
    var m = isMode(mode);
    var st = load();
    var i = st[m].step;
    if (i >= STEPS.length - 1) { return finish(m); }
    st[m] = { status: 'running', step: i + 1, updatedAt: Date.now(), doneAt: st[m].doneAt || null };
    save(st);
    return st[m];
  }

  function prev(mode) {
    var m = isMode(mode);
    return goTo(m, load()[m].step - 1);
  }

  function skipStep(mode) {
    var m = isMode(mode);
    var st = load();
    var id = STEPS[st[m].step] ? STEPS[st[m].step].id : '';
    if (id && st.skippedSteps.indexOf(id) < 0) { st.skippedSteps.push(id); }
    save(st);
    return next(m);
  }

  function skipAll(mode) {
    var m = isMode(mode);
    var st = load();
    st[m] = { status: 'skipped', step: st[m].step, updatedAt: Date.now(), doneAt: st[m].doneAt || null };
    st.guideVersion = GUIDE_VERSION;
    save(st);
    return st[m];
  }

  function finish(mode) {
    var m = isMode(mode);
    var st = load();
    st[m] = { status: 'done', step: STEPS.length - 1, updatedAt: Date.now(), doneAt: Date.now() };
    st.guideVersion = GUIDE_VERSION;
    save(st);
    return st[m];
  }

  function replay(mode) {
    var m = isMode(mode);
    var st = load();
    st[m] = { status: 'running', step: 0, updatedAt: Date.now(), doneAt: st[m].doneAt || null };
    st.replays = (st.replays || 0) + 1;
    save(st);
    return st[m];
  }

  /** 业务事件上报：命中当前步的 completeOn 就返回 true（渲染层据此前进） */
  function notify(mode, kind) {
    var m = isMode(mode);
    var st = load();
    if (st[m].status !== 'running') { return false; }
    var s = STEPS[st[m].step];
    if (!s || !s.completeOn) { return false; }
    return String(s.completeOn) === String(kind);
  }

  function anchorOf(step, mode) {
    if (!step || !step.anchor) { return null; }
    return step.anchor[isMode(mode)] || null;
  }

  function viewOf(step, mode) {
    if (!step || !step.view) { return null; }
    return step.view[isMode(mode)] || null;
  }

  function wasSkipped(state, id) {
    var st = state || load();
    return st.skippedSteps.indexOf(id) >= 0;
  }

  /* 仅供单测：清掉内存兜底 */
  function _resetMemory() { memory = null; }

  var API = {
    KEY: KEY,
    GUIDE_VERSION: GUIDE_VERSION,
    STEPS: STEPS,
    count: count,
    get: get,
    load: load,
    save: save,
    normalize: normalize,
    status: status,
    stepIndex: stepIndex,
    current: current,
    isActive: isActive,
    shouldOffer: shouldOffer,
    start: start,
    goTo: goTo,
    next: next,
    prev: prev,
    skipStep: skipStep,
    skipAll: skipAll,
    finish: finish,
    replay: replay,
    notify: notify,
    anchorOf: anchorOf,
    viewOf: viewOf,
    wasSkipped: wasSkipped,
    _resetMemory: _resetMemory
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.AJ = global.AJ || {};
    global.AJ.onboard = API;
  }
})(typeof window !== 'undefined' ? window : this);
