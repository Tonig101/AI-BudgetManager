/**
 * region.js — 地域物价锚点与动态换算（默认服务对象：广东轻工职业技术大学 · 佛山南海北区）
 *
 * 为什么要有这一层：priceradar 的基准表是「全国二三线经验区间」，宽到能盖住很多城市，
 * 但学生对「贵不贵」的判断是按自己学校周边长出来的。同一个 12 元的一荤一素，
 * 在南海北区是正常价，在深圳就是捡便宜。所以尺子必须能换。
 *
 * 口径三条（写死在这里，不散落到提示词）：
 *   ① 默认锚点 = 佛山南海 / 广轻大，用户没提城市就按这套评估；
 *   ② 用户说了别的城市，按城市等级**整把尺子**换算：一线 +50%~80%、二线 +20%~30%、
 *      三四线 / 县城 −20%~40%（例如一碗面 8~10 元）；
 *   ③ 用户去了市中心（祖庙 / 天河 / 商圈），不改基准，但必须提醒「商圈溢价 30% 以上」。
 *
 * 对外 API（window.AJ.region，Node 下 require 同名）：
 *   HOME              默认锚点（佛山南海 · 广轻大）
 *   ANCHORS           校内 / 周边锚点表（食堂、简餐、水电、交通、租房）
 *   TIERS             城市等级与换算区间
 *   CITIES            城市 → 等级（广东地市基本收全，广轻大学生源就在这些地方）
 *   detect(text)      -> {code, city, label, mult, downtown, note}
 *   label(det)        -> '北京（一线）' / '佛山南海 · 广轻大'
 *   band(det)         -> null（=不折算）| {label, mult, note}  ← 给 priceradar.analyze
 *   scale(low, high, det) -> {low, high}     按等级折算一个区间
 *   anchors(group)    -> 该组锚点（不传 group 返回全部）
 *   anchorLine(group, det) -> 一句话锚点（含折算说明）
 *   downtownNote(det) -> 市中心溢价提醒（没去市中心返回 ''）
 *   sceneNote(scene, det)  -> 生存场景（租房/水电/数码）的地域脚注
 *   say(det)          -> 一句口径说明（给面板头 / 卡片角标用）
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);

  /* ================================================================== */
  /* 一、默认锚点：佛山南海 / 广轻大                                      */
  /* ================================================================== */

  var HOME = {
    code: 'home',
    city: '佛山',
    label: '佛山南海 · 广轻大',
    short: '南海北区',
    mult: [1, 1]
  };

  /**
   * 锚点表：用户没特别说明时，这一张就是唯一基准。
   * low/high 是**校园周边的常见价**，不是全市均价，也不是实时报价。
   * unit 只用于展示；id 供场景与测试引用。
   */
  var ANCHORS = [
    { g: '食堂', id: 'canteen_1v1', name: '一荤一素', low: 10, high: 12, unit: '份' },
    { g: '食堂', id: 'canteen_2v1', name: '两荤一素', low: 14, high: 16, unit: '份' },
    { g: '食堂', id: 'baozi', name: '早餐包子', low: 1.5, high: 2, unit: '个' },
    { g: '校外简餐', id: 'zhujiao', name: '猪脚饭 / 烧腊饭', low: 15, high: 18, unit: '份' },
    { g: '校外简餐', id: 'lanzhou', name: '兰州拉面', low: 12, high: 15, unit: '碗' },
    { g: '校外简餐', id: 'xiaochao', name: '快餐小炒', low: 18, high: 25, unit: '份' },
    { g: '水电', id: 'power', name: '宿舍民电', low: 0.6, high: 0.7, unit: '度' },
    { g: '水电', id: 'water', name: '水费', low: 3, high: 4, unit: '吨' },
    { g: '交通', id: 'bus', name: '公交车', low: 2, high: 2, unit: '次' },
    { g: '交通', id: 'metro', name: '地铁起步价', low: 2, high: 2, unit: '次' },
    { g: '交通', id: 'bikecard', name: '共享单车月卡', low: 10, high: 15, unit: '月' },
    { g: '租房', id: 'room', name: '周边单间（城中村 / 大学城）', low: 600, high: 1200, unit: '月' }
  ];

  /* ================================================================== */
  /* 二、城市等级与换算                                                   */
  /* ================================================================== */

  var TIERS = {
    tier1: { key: 'tier1', label: '一线城市', mult: [1.5, 1.8], say: '上浮 50%~80%' },
    tier2: { key: 'tier2', label: '二线城市', mult: [1.2, 1.3], say: '上浮 20%~30%' },
    tier34: { key: 'tier34', label: '三四线 / 县城', mult: [0.6, 0.8], say: '下调 20%~40%' }
  };

  /** 城市 → 等级。佛山是本部，单列 home；广东地市按三四线处理（生源大头）。 */
  var CITIES = {
    '北京': 'tier1', '上海': 'tier1', '广州': 'tier1', '深圳': 'tier1',
    '杭州': 'tier2', '成都': 'tier2', '武汉': 'tier2', '南京': 'tier2',
    '西安': 'tier2', '重庆': 'tier2', '苏州': 'tier2', '天津': 'tier2',
    '长沙': 'tier2', '郑州': 'tier2', '青岛': 'tier2', '厦门': 'tier2',
    '福州': 'tier2', '合肥': 'tier2', '宁波': 'tier2', '东莞': 'tier2',
    '珠海': 'tier2', '中山': 'tier2', '无锡': 'tier2', '昆明': 'tier2',
    '佛山': 'home',
    '湛江': 'tier34', '茂名': 'tier34', '汕头': 'tier34', '揭阳': 'tier34',
    '梅州': 'tier34', '韶关': 'tier34', '清远': 'tier34', '肇庆': 'tier34',
    '阳江': 'tier34', '云浮': 'tier34', '河源': 'tier34', '潮州': 'tier34',
    '汕尾': 'tier34', '江门': 'tier34', '惠州': 'tier34', '罗定': 'tier34'
  };

  /** 没说城市名、但说了「老家 / 县城」这类：按三四线算 */
  var T34_WORDS = /老家|县城|县里|县上|镇上|小镇|乡下|村里|回村|三线|四线|十八线|小地方/;

  /** 市中心 / 商圈：不改基准（避免把整月开销算错），但必须提示溢价 */
  var DOWNTOWN = /祖庙|千灯湖|岭南天地|南海万科|万科广场|万达|天河|珠江新城|体育西|北京路|上下九|正佳|太古汇|万象城|市中心|市区|商圈|步行街/;

  /* ================================================================== */
  /* 三、识别                                                             */
  /* ================================================================== */

  function detect(text) {
    var t = String(text == null ? '' : text);
    var code = '';
    var city = '';
    var k;

    /* 城市名：长的先匹配（「佛山」「南海」这类两字词不会互相吃掉，但按长度排更稳） */
    var names = Object.keys(CITIES).sort(function (a, b) { return b.length - a.length; });
    for (k = 0; k < names.length; k++) {
      if (t.indexOf(names[k]) !== -1) { city = names[k]; code = CITIES[city]; break; }
    }
    /* 说了「南海」没说佛山：本部学生常用说法 */
    if (!code && /南海|大学城|狮山/.test(t)) { city = '佛山'; code = 'home'; }
    if (!code && T34_WORDS.test(t)) { code = 'tier34'; city = ''; }
    if (!code) { code = 'home'; city = '佛山'; }

    var downtown = DOWNTOWN.test(t);
    var tier = TIERS[code] || null;
    var det = {
      code: code,
      city: city,
      downtown: downtown,
      mult: code === 'home' ? [1, 1] : (tier ? tier.mult.slice() : [1, 1]),
      label: '',
      note: ''
    };
    det.label = label(det);
    det.note = say(det);
    return det;
  }

  function label(det) {
    if (!det || !det.code || det.code === 'home') { return HOME.label; }
    var tier = TIERS[det.code];
    if (!tier) { return HOME.label; }
    /* 没点名城市的（「回老家县城」）直接用等级当标签，别写成「县城（三四线 / 县城）」 */
    return det.city ? (det.city + '（' + tier.label + '）') : tier.label;
  }

  /* ================================================================== */
  /* 四、换算                                                             */
  /* ================================================================== */

  function round2(n) {
    var v = Number(n);
    if (!isFinite(v)) { return 0; }
    return Math.round(v * 100) / 100;
  }

  /** 折算一个区间：<10 的保留一位小数（电费 0.6→0.9），≥10 的取整（12→21） */
  function scale(low, high, det) {
    var m = (det && det.mult) || [1, 1];
    if (m[0] === 1 && m[1] === 1) { return { low: round2(low), high: round2(high) }; }
    var fmt = function (x) { return x < 10 ? Math.round(x * 10) / 10 : Math.round(x); };
    return { low: fmt(Number(low) * m[0]), high: fmt(Number(high) * m[1]) };
  }

  /**
   * 给 priceradar.analyze 的入参：{label, mult, note, home}。
   * 本部也返回对象（卡片要标出「基准：佛山南海」），但 home=true 时不折算，
   * 输出与以前逐字一致 —— 默认场景绝不能因为多了一层而变数。
   */
  function band(det) {
    var d = det || detect('');
    var home = (d.code === 'home');
    var tier = TIERS[d.code];
    if (!home && !tier) { home = true; }
    return {
      label: label(d),
      mult: home ? [1, 1] : d.mult.slice(),
      note: say(d),
      home: home,
      downtown: !!d.downtown
    };
  }

  /* ================================================================== */
  /* 五、话术                                                             */
  /* ================================================================== */

  function fmtNum(n) {
    var v = Math.round(Number(n) * 100) / 100;
    if (Math.abs(v - Math.round(v)) < 1e-9) { return String(Math.round(v)); }
    return String(v);
  }

  function anchors(group) {
    if (!group) { return ANCHORS.slice(); }
    return ANCHORS.filter(function (a) { return a.g === group; });
  }

  function rangeText(a, det) {
    var s = scale(a.low, a.high, det);
    var pre = (det && det.code && det.code !== 'home') ? '≈ ' : '';
    return pre + fmtNum(s.low) + (s.low === s.high ? '' : '~' + fmtNum(s.high)) + ' 元/' + a.unit;
  }

  /**
   * 一组锚点的人话（默认本部）。折算过的话，把「原尺子 → 折算后」都写出来，
   * 让用户知道这个数字是怎么变的，而不是凭空换了一组价。
   */
  function anchorLine(group, det) {
    var list = anchors(group);
    if (!list.length) { return ''; }
    var d = det || detect('');
    var parts = list.map(function (a) {
      if (d.code === 'home') { return a.name + ' ' + fmtNum(a.low) + '~' + fmtNum(a.high) + ' 元/' + a.unit; }
      var o = scale(a.low, a.high, d);
      return a.name + ' ' + fmtNum(a.low) + '~' + fmtNum(a.high) + ' → ' + fmtNum(o.low) + '~' +
        fmtNum(o.high) + ' 元/' + a.unit;
    });
    var head = '📍 ' + label(d) + '：';
    return head + parts.join('；') + (d.code === 'home' ? '（校园周边常见价，经验区间）' : '（已按' +
      (TIERS[d.code] ? TIERS[d.code].say : '同档') + '折算）');
  }

  /** 口径说明：面板头 / 卡片角标 / 回复末尾都能用 */
  function say(det) {
    var d = det || detect('');
    if (d.code === 'home') { return '基准：' + HOME.label + '（校内食堂 / 大学城周边经验价，不是实时报价）'; }
    var tier = TIERS[d.code];
    if (!tier) { return '基准：' + HOME.label; }
    return '基准：' + HOME.label + ' → ' + label(d) + '，整把尺子' + tier.say;
  }

  /** 市中心溢价：用户明确去了商圈才说，且只说一次 */
  function downtownNote(det) {
    if (!det || !det.downtown) { return ''; }
    return '🏙 市中心商圈存在溢价，同样的东西通常比大学城贵 30% 以上，建议回学校周边消费。';
  }

  /**
   * 生存场景的地域脚注（租房 / 水电 / 数码 / 通勤）。
   * 只给「这个场景最吃地域差」的那一条，不整段搬锚点表。
   */
  function sceneNote(scene, det) {
    var d = det || detect('');
    var s = String(scene || '');
    if (s === 'rent' || s === 'secondhand' || s === 'usedbuy') {
      return anchorLine('租房', d);
    }
    if (s === 'utility') { return anchorLine('水电', d); }
    if (s === 'telecom') { return anchorLine('交通', d); }
    if (s === 'medical' || s === 'hairstyle' || s === 'gym') {
      return d.code === 'home' ? '' : ('📍 ' + label(d) + '：这些服务类开销同样按' +
        (TIERS[d.code] ? TIERS[d.code].say : '同档') + '折算，办卡前先按这个数谈价。');
    }
    return '';
  }

  /* ================================================================== */
  /* 六、面板用的预设（把「尺子」做成可点的四个档，不用输入城市名）        */
  /* ================================================================== */

  var PRESETS = [
    { key: 'home', sample: '', label: '佛山南海（默认）' },
    { key: 'tier1', sample: '北京', label: '一线' },
    { key: 'tier2', sample: '成都', label: '二线' },
    { key: 'tier34', sample: '老家县城', label: '县城' }
  ];

  function preset(key) {
    var p = PRESETS[0];
    var i;
    for (i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].key === key) { p = PRESETS[i]; break; }
    }
    return detect(p.sample);
  }

  /* ================================================================== */
  /* 七、示例：把用户的话直接判成一句评估（供测试与话术复用）              */
  /* ================================================================== */

  /**
   * 「这价贵吗」的地域口径补充句：先给尺子，再给对比。
   * 不做完整判定（那件事归 priceradar），只补「在你这个地方算不算贵」。
   */
  function compare(anchorId, price, det) {
    var a = null;
    var i;
    for (i = 0; i < ANCHORS.length; i++) {
      if (ANCHORS[i].id === anchorId) { a = ANCHORS[i]; break; }
    }
    if (!a) { return ''; }
    var d = det || detect('');
    var s = scale(a.low, a.high, d);
    var p = Number(price);
    if (!isFinite(p)) { return ''; }
    var tail;
    if (p < s.low * 0.9) { tail = '比' + label(d) + '常见价还低，算便宜'; }
    else if (p <= s.high) { tail = '在' + label(d) + '算正常价'; }
    else if (p <= s.high * 1.3) { tail = '在' + label(d) + '算正常偏贵一点'; }
    else { tail = '明显高于' + label(d) + '的常见价，先别急着买'; }
    return a.name + ' ' + fmtNum(p) + ' 元/' + a.unit + '，' + label(d) + '常见 ' +
      fmtNum(s.low) + '~' + fmtNum(s.high) + ' 元/' + a.unit + '，' + tail;
  }

  var API = {
    HOME: HOME,
    ANCHORS: ANCHORS,
    TIERS: TIERS,
    CITIES: CITIES,
    PRESETS: PRESETS,
    preset: preset,
    detect: detect,
    label: label,
    band: band,
    scale: scale,
    anchors: anchors,
    rangeText: rangeText,
    anchorLine: anchorLine,
    say: say,
    downtownNote: downtownNote,
    sceneNote: sceneNote,
    compare: compare,
    fmtNum: fmtNum
  };

  if (isNode) {
    module.exports = API;
  } else {
    global.AJ = global.AJ || {};
    global.AJ.region = API;
  }
})(typeof window !== 'undefined' ? window : this);
