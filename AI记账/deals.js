/**
 * deals.js — 省钱雷达（商家活动日历 + 比价口径引擎 + 品类价格带）
 *
 * 定位：把「今天有什么优惠」「哪天是会员日」「三家谁便宜」做成可计算、可复现的本地能力。
 *
 * 三条数据来源，严格分开标注，绝不混着说：
 *   ① 规律型活动（肯德基疯狂星期四 = 每周四、京东 PLUS 会员日 = 每月 8 号）
 *      —— 由 date.weekday 直接算真实日期，不联网，不会过期；
 *   ② 大促节点（双 11 / 618 / 38 节…）
 *      —— 固定月日 + 预热天数，按年滚动算下一次是哪天；
 *   ③ 商品实时价
 *      —— 本模块**不编造**。只用「用户抄来的价 / 传进来的报价」做口径换算，
 *         没有报价就返回价格带参考 + 明确告诉用户还差什么。
 *
 * 对外 API（window.AJ.deals）：
 *   MERCHANTS / PROMOS                  商家与打促基础数据
 *   dealsOn(date)                       当天所有活动（限时 + 常驻 + 大促预热）
 *   upcoming(days, from)                未来 N 天逐日活动
 *   nextOf(merchantId, from)            某个活动的下一次日期
 *   nextPromo(from)                     最近一场大促 + 倒计时
 *   todayCardHtml(date) / kfcCardHtml() 聊天卡片 HTML
 *   compareOffers(offers, opts)         比价：到手价 / 单价折算 / 可比性判定 / 排名
 *   findBand(item) / judgePrice()       品类价格带 + 这个价属于哪一档
 *   timingAdvice(price, date)           现在买还是等大促
 *   calendarCsv(from, days)             真实商家日历 CSV（日期由代码算出）
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);

  /* ================================================================== */
  /* 一、商家活动：规律型（按周 / 按月），日期由代码算，永不过期            */
  /* ================================================================== */

  /**
   * rule.type
   *   weekly  : weekday 1=周一 … 7=周日
   *   monthly : day 1-28（避开月末缺日）
   *   always  : 常驻活动，每天有效
   * certainty
   *   'stable' 规律稳定（周几固定）
   *   'varies' 档期/力度常调，只能说"哪天有"，具体单品与价格以官方为准
   */
  var MERCHANTS = [
    {
      id: 'kfc', name: '肯德基', emoji: '🍗', cat: '快餐',
      place: '校门口商业街',
      title: '疯狂星期四',
      rule: { type: 'weekly', weekday: 4 },
      what: '每周四的限定特价套餐日',
      how: '校门口商业街店，走过去就行；App 里先领券再下单',
      tip: '比点外卖便宜至少 15 元（省了配送费），建议步行前往；热门单品中午就卖完了',
      coach: '疯狂星期四确实比外卖便宜 15 元以上，但每月控制在 1-2 次，别每周都去。',
      certainty: 'stable',
      source: '肯德基 App / 门店活动'
    },
    {
      id: 'mcd', name: '麦当劳', emoji: '🍟', cat: '快餐',
      place: '阳光广场',
      title: '13.9 元随心配（周一）',
      rule: { type: 'weekly', weekday: 1 },
      what: '每周一的 13.9 元套餐组合',
      how: '阳光广场店，周一点「1+1 随心配 / 13.9 元专区」，比单点省 10 元左右',
      tip: '适合月初手头紧的时候去吃；先看组合内容，别为了凑套餐加购不需要的东西',
      coach: '月初预算紧张时的兜底方案；比单点省 10 元左右，但注意充餐里有没有本来不打算买的东西。',
      certainty: 'varies',
      source: '麦当劳 App / 阳光广场门店'
    },
    {
      id: 'luckin', name: '瑞幸 / 库迪', emoji: '☕', cat: '饮品',
      place: '阳光广场',
      title: '9.9 元两杯 / 8.8 元券（周二）',
      rule: { type: 'weekly', weekday: 2 },
      what: '周二 9.9 元两杯活动，另有不定期 8.8 元券',
      how: '和舍友拼单，人均不到 5 元；走过去也就几分钟',
      tip: '每周最多 2 杯；用瑞幸 / 库迪代替喜茶、奈雪，单杯省 15-20 元',
      coach: '和舍友拼单，人均不到 5 元，是奶茶的最优解；但每周控制在 2 杯以内。',
      certainty: 'varies',
      source: '瑞幸 / 库迪 App 活动页'
    },
    /* —— 以下为「省钱图谱」同步过来的品牌固定活动，统一进雷达日历（每周几 / 每月几号） —— */
    {
      id: 'mcd-member', name: '麦当劳会员日', emoji: '🍔', cat: '快餐',
      place: '门店 / 外卖 App',
      title: '会员日领券（周一）',
      rule: { type: 'weekly', weekday: 1 },
      what: '每周一麦当劳会员日，App 领券后部分单品更便宜',
      how: '周一打开麦当劳 App 先领「会员日券」，再点单；和 13.9 随心配专区可叠加看哪个更划算',
      tip: '券的面额每周会变，先比再买；别为了用券多买不需要的东西',
      coach: '会员日券通常比平时便宜几元，周一吃麦当劳前先领券，但别为凑券加购。',
      certainty: 'varies',
      source: '麦当劳 App 会员日'
    },
    {
      id: 'dominos-mon', name: '达美乐', emoji: '🍕', cat: '快餐',
      place: '外卖 App',
      title: '外卖 8 折（周一）',
      rule: { type: 'weekly', weekday: 1 },
      what: '每周一达美乐外卖 8 折',
      how: '周一在达美乐小程序 / App 点外卖，结算自动 8 折；比平时下单省约 20%',
      tip: '仅外卖、自取不一定参与；满减与折扣不同享时选更省的',
      coach: '周一想吃披萨就等这天，8 折比平时省一笔；别每周都点。',
      certainty: 'stable',
      source: '达美乐官方活动'
    },
    {
      id: 'tastien', name: '塔斯汀', emoji: '🍔', cat: '快餐',
      place: '门店 / 外卖 App',
      title: '会员日（周二）',
      rule: { type: 'weekly', weekday: 2 },
      what: '每周二塔斯汀会员日，部分单品会员价',
      how: '周二在塔斯汀小程序领会员券，买汉堡 / 披萨更便宜',
      tip: '会员日力度每周略有不同，先看好再凑单',
      coach: '周二想吃塔斯汀就这天去，但控制在 1 次。',
      certainty: 'varies',
      source: '塔斯汀会员日'
    },
    {
      id: 'heytea-topping', name: '喜茶 / CoCo', emoji: '🧋', cat: '饮品',
      place: '门店 / 外卖 App',
      title: '免费加小料（周二）',
      rule: { type: 'weekly', weekday: 2 },
      what: '每周二喜茶 / CoCo 免费加小料（珍珠、椰果等）',
      how: '周二点单时勾选「免费加料」，奶茶口感升级不加价',
      tip: '只免基础小料，别顺手加收费配料；想省钱就用它替代周三的付费升杯',
      coach: '周二想喝奶茶就靠免费加料白嫖，比平时省 3-5 元。',
      certainty: 'varies',
      source: '喜茶 / CoCo 会员活动'
    },
    {
      id: 'dominos-wed', name: '达美乐', emoji: '🍕', cat: '快餐',
      place: '外卖 App',
      title: '外卖 7 折（周三）',
      rule: { type: 'weekly', weekday: 3 },
      what: '每周三达美乐外卖 7 折（比周一 8 折更狠）',
      how: '周三下单自动 7 折，大单更划算；和周一 8 折择低选一天',
      tip: '力度常变，以结算页为准；自取可能不参与',
      coach: '周三披萨更便宜，但每周最多 1 次，别因为打折就多吃。',
      certainty: 'stable',
      source: '达美乐官方活动'
    },
    {
      id: 'pizza', name: '必胜客', emoji: '🍕', cat: '快餐',
      place: '门店 / 外卖 App',
      title: '尖叫星期三（周三）',
      rule: { type: 'weekly', weekday: 3 },
      what: '每周三必胜客「尖叫星期三」特价',
      how: '周三在必胜客 App 看本周尖叫单品，部分半价或买一送一',
      tip: '指定单品才参与，先确认再点；别为了特价硬凑人数',
      coach: '周三想吃必胜客就等尖叫日，但每月 1-2 次足够。',
      certainty: 'varies',
      source: '必胜客官方活动'
    },
    {
      id: 'mixue', name: '蜜雪冰城', emoji: '🍦', cat: '饮品',
      place: '门店',
      title: '满 12 减 2（周三）',
      rule: { type: 'weekly', weekday: 3 },
      what: '每周三蜜雪冰城满 12 减 2',
      how: '周三凑满 12 元自动减 2，和同学拼单很容易达标',
      tip: '本就便宜，满减是锦上添花；别为凑单多喝',
      coach: '周三想喝蜜雪就凑满减，省 2 元也是省。',
      certainty: 'stable',
      source: '蜜雪冰城门店活动'
    },
    {
      id: 'chabaidao-up', name: '茶百道', emoji: '🧋', cat: '饮品',
      place: '门店 / 外卖 App',
      title: '会员升杯（周三）',
      rule: { type: 'weekly', weekday: 3 },
      what: '每周三茶百道会员升杯（中杯升大杯等）',
      how: '周三会员点单勾选升杯，免费大一号；比平时更值',
      tip: '仅会员、指定饮品；想喝就这天，但别天天喝',
      coach: '周三茶百道升杯白赚，替代平时的付费大杯。',
      certainty: 'varies',
      source: '茶百道会员活动'
    },
    {
      id: 'chabaidao-88', name: '茶百道', emoji: '🧋', cat: '饮品',
      place: '门店 / 外卖 App',
      title: '88 折（周四）',
      rule: { type: 'weekly', weekday: 4 },
      what: '每周四茶百道 88 折',
      how: '周四在茶百道点单自动 88 折，比平时省约 12%',
      tip: '和周三升杯择一即可，别两天都喝；力度以结算页为准',
      coach: '周四茶百道 88 折，但奶茶一周控制在 2 杯内。',
      certainty: 'stable',
      source: '茶百道会员活动'
    },
    {
      id: 'wallace', name: '华莱士', emoji: '🐔', cat: '快餐',
      place: '门店 / 外卖 App',
      title: '会员日买一送一（周五）',
      rule: { type: 'weekly', weekday: 5 },
      what: '每周五华莱士会员日，指定单品买一送一',
      how: '周五华莱士会员点单，汉堡 / 鸡块常买一送一，和同学拼最划算',
      tip: '指定单品参与，先确认品类；别为凑买一送一硬吃两份',
      coach: '周五华莱士买一送一适合拼单，但别每周都冲。',
      certainty: 'varies',
      source: '华莱士会员日'
    },
    {
      id: 'guming', name: '古茗', emoji: '🍵', cat: '饮品',
      place: '门店 / 外卖 App',
      title: '会员日（每月 20 号）',
      rule: { type: 'monthly', day: 20 },
      what: '每月 20 号古茗会员日，领券 / 折扣',
      how: '每月 20 号打开古茗小程序领会员券，部分饮品更便宜',
      tip: '券额每月不同，先比再买；别囤券',
      coach: '想喝古茗就等 20 号会员日，省几元。',
      certainty: 'varies',
      source: '古茗会员日'
    },
    {
      id: 'yihetang', name: '益禾堂', emoji: '🥤', cat: '饮品',
      place: '门店 / 外卖 App',
      title: '半价 / 买一送一（每月 18 号）',
      rule: { type: 'monthly', day: 18 },
      what: '每月 18 号益禾堂半价或买一送一',
      how: '每月 18 号益禾堂会员活动，指定饮品半价 / 买一送一',
      tip: '指定单品参与，拼单更值；别为凑单多喝',
      coach: '益禾堂 18 号活动力度大，但每月 1 次足够。',
      certainty: 'varies',
      source: '益禾堂会员日'
    },
    {
      id: 'haoxianglai', name: '好想来', emoji: '🛒', cat: '零食',
      place: '门店',
      title: '88 折（每月 8 号）',
      rule: { type: 'monthly', day: 8 },
      what: '每月 8 号好想来全场 88 折',
      how: '每月 8 号去好想来囤零食，结算 88 折；比平时省 12%',
      tip: '零食是隐形支出，只在清单内的东西上享受折扣，别顺手多拿',
      coach: '好想来 8 号 88 折适合囤清单零食，但别逛着逛着拿一堆。',
      certainty: 'stable',
      source: '好想来会员日'
    },
    {
      id: 'dicos', name: '德克士', emoji: '🍗', cat: '快餐',
      place: '门店 / 外卖 App',
      title: '买一送一（每月 18 号）',
      rule: { type: 'monthly', day: 18 },
      what: '每月 18 号德克士指定单品买一送一',
      how: '每月 18 号德克士会员活动，鸡块 / 汉堡常买一送一',
      tip: '指定单品参与，拼单更值；和益禾堂 18 号错峰安排',
      coach: '德克士 18 号买一送一适合拼单，但别每月都冲。',
      certainty: 'varies',
      source: '德克士会员日'
    },
    {
      id: 'haidilao', name: '海底捞', emoji: '🍲', cat: '聚餐',
      place: '门店（需学生认证）',
      title: '大学生 69 折（工作日 14-17 & 22 后）',
      rule: { type: 'weekly', weekday: [1, 2, 3, 4, 5] },
      what: '工作日 14:00-17:00 及 22:00 后，大学生认证 69 折',
      how: '用学生证 / 学信网认证后，工作日下午茶段或夜宵段去海底捞打 69 折',
      tip: '仅工作日、且限指定时段；周末和饭点不打折。先确认门店参与再约人',
      coach: '海底捞大学生 69 折很香，但只在工作日非饭点，约人前先算好时段。',
      certainty: 'stable',
      source: '海底捞大学生优惠'
    },
    {
      id: 'zym', name: '赵一鸣零食', emoji: '🍬', cat: '零食',
      place: '阳光广场',
      title: '会员日折扣 / 满减',
      rule: { type: 'always' },
      what: '不定期会员日折扣与满减',
      how: '囤零食去赵一鸣比校内便利店便宜；只买清单上的东西',
      tip: '别囤太多——零食是隐形支出，逛着逛着拿一堆最容易超支',
      coach: '比校内便利店便宜，但零食是隐形支出：只买清单上的，别逛着逛着拿一堆。',
      certainty: 'varies',
      source: '赵一鸣门店会员日公告'
    },
    {
      id: 'zunte', name: '尊特优选', emoji: '🏬', cat: '超市',
      place: '第二饭堂三楼',
      title: '校内最大超市',
      rule: { type: 'always' },
      what: '校内最大的超市，东西最全',
      how: '急用才去，不急的等网购（拼多多百亿补贴）',
      tip: '价格不一定最优，图的是方便；同样的东西润泰超市通常更便宜',
      coach: '着急用才去，价格不一定最优；不急的下单网购，价格通常更便宜。',
      certainty: 'stable',
      source: '校内实地'
    },
    {
      id: 'convenience', name: '校内便利店', emoji: '🏪', cat: '超市',
      place: '各饭堂旁（一饭三、一饭四最方便）',
      title: '应急零食 / 水 / 纸巾',
      rule: { type: 'always' },
      what: '饭堂旁的校内便利店',
      how: '买水、买纸巾可以；别在这买整箱饮料',
      tip: '溢价明显，比润泰超市贵；整箱饮料拼多多送到菜鸟驿站更便宜',
      coach: '溢价最明显的点位，只适合应急；整箱饮料走网购，均价能省一半。',
      certainty: 'stable',
      source: '校内实地'
    },
    {
      id: 'runtop', name: '润泰超市', emoji: '🛒', cat: '超市',
      place: '正门斜对面 150 米',
      title: '日常生活用品',
      rule: { type: 'always' },
      what: '校外超市，日用品价格比校内便宜',
      how: '买洗发水、纸巾这类日用品可以走到校门对面去买',
      tip: '比校内尊特优选便宜；走过去也就几分钟，顺路蹲的话不亏',
      coach: '买日用品可以走过去，比校内超市便宜；周末顺便去买，一趟搞定一个月用量。',
      certainty: 'stable',
      source: '校内实地'
    },
    {
      id: 'dormstore', name: '宿舍楼下小卖部', emoji: '🏠', cat: '超市',
      place: '宿舍楼下',
      title: '应急泡面 / 水',
      rule: { type: 'always' },
      what: '深夜应急的泡面和水',
      how: '深夜饿了应急可以买一次',
      tip: '长期在这买零食会悄悄掏空钱包，记账时往往连笔记都懒得记',
      coach: '深夜应急可以，但长期在这买零食会悄悄掏空钱包——记得单独记一笔，月底复盘会吓你一跳。',
      certainty: 'stable',
      source: '校内实地'
    }
  ];

  /* ================================================================== */
  /* 二、大促节点：固定月日，按年滚动算下一次                            */
  /* ================================================================== */

  var PROMOS = [
    { id: 'double11', name: '双11', month: 11, day: 11, warmup: 12,
      depth: '全品类，全年深度最大', bestFor: '大件、囤货、服饰' },
    { id: 'double12', name: '双12', month: 12, day: 12, warmup: 5,
      depth: '约 5%-15%，力度弱于双11', bestFor: '补漏、小件' },
    { id: 'newyear', name: '年货节', month: 1, day: 10, warmup: 10,
      depth: '食品 / 礼盒约 10%-25%', bestFor: '食品、年礼' },
    { id: 'w38', name: '38节', month: 3, day: 8, warmup: 7,
      depth: '美妆个护约 15%-30%', bestFor: '美妆、个护' },
    { id: 'p618', name: '618', month: 6, day: 18, warmup: 20,
      depth: '数码家电约 15%-30%', bestFor: '数码、家电、大件' },
    { id: 'school', name: '开学季', month: 8, day: 25, warmup: 10,
      depth: '文具 / 数码约 10%-20%', bestFor: '学生用品、笔记本' }
  ];

  /* ================================================================== */
  /* 三、日期工具（全部本地时区，避免 UTC 偏移把"今天"算错一天）           */
  /* ================================================================== */

  var WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function toDate(d) {
    if (d instanceof Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
    if (typeof d === 'string') {
      var m = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) { return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); }
    }
    var t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }

  function dateKey(d) {
    var x = toDate(d);
    return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate());
  }

  function addDays(d, n) {
    var x = toDate(d);
    x.setDate(x.getDate() + n);
    return x;
  }

  function daysBetween(a, b) {
    var ms = toDate(b).getTime() - toDate(a).getTime();
    return Math.round(ms / 86400000);
  }

  /** JS 的 getDay(): 0=周日 … 6=周六；本模块统一用 1=周一 … 7=周日 */
  function isoWeekday(d) {
    var w = toDate(d).getDay();
    return w === 0 ? 7 : w;
  }

  /** 行内小图标（与 app.js 的 ic 同义；模块独立闭包不能跨文件取名） */
  function dlIcon(name, cls, label) {
    var D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : global.AJ.data;
    return D.inlineIcon('i-' + name, cls, label);
  }

  /**
   * 商户品牌瓦片：真实品牌标识优先，没有则用「品牌色 + 首字」字母章兜底。
   * 视觉与分类瓦片同一套语言：淡底（bg = 品牌色 14% 透明度）+ 深墨内容（ink）。
   * 真实标识来源：联网时从 SimpleIcons 取到麦当劳 / 肯德基的官方单色图标 path，
   * 其余中国品牌在本环境无网可拉，统一用字母章（等 logo 素材齐了，往 mark 字段填 path 即可）。
   */
  /* >>> LOGOS —— 品牌真实 logo，离线内联；由 _brand/build_logos.py 生成，勿手改 */
  var LOGOS = {
    "chabaidao-88": {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":0.75},
    "chabaidao-up": {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":0.75},
    "coco":        {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":2.8},
    "cotti":       {"u":"data:image/webp;base64,UklGRsYDAABXRUJQVlA4ILoDAABwFQCdASpgAEAAPjEYikOiIaESvf00IAMEsYBqCOiagXzVMDxdP1VywD0APKn/bf4Mv2w/YD2gKYX9a4EjDX8Nwg7wb+Xf4P5gM4U+e/5LdSfOY84O8GjN/w325fF9/sf2j8ZvaJ+Wf3L/kfar9gf8l/ov+n+37wM+ir+sxUdutjXTCYytinMFRLBFSzLAtL8PiMTwkp3a/EX8Jw2IlImaHoza1P4EBs3gSa0TgWr8sA2K/KAA/vohl84ArJ0f/5aF/8tC/+Whf8xMMSyAoZZ8PkMK9OcZsPF0yZh/gGl878zzt03Ap3wEUfP0s2ufBnqaCgonwVH62m9ymQuUssGSl3lFYkMeVVTjZR72Hzam7vEX3uj1c0d9rkAxL8ONwdPssscfMcQt//qRpHiMaWWWEjmOjmrTGvmxyFWTZwA1auPm2mTyAscgmPs2hAYMECWu5vfy4zAcye6uOItBj6TzN8rqjnba/93wn+XzJrVw31z99e3c77v6wL1O5hrAVnt4A4qeIVvhysJDAs+9fDXF/ceCv6dHHzjKMJCul1QcVSUQ5s2UMxyGCydmDAp4dAX6IX3L/jPHQ7eBGLfu5QarFJ6O4uX+odONJToODSv949KXDxTcl5aYlZ8XdNNQZeGkvf52btOvJR9xG/5ayrJ1svnDApVr4/68RXOt/bL//2OMJuNoNqFoBQLNakJ7zMsDNHqKsvuiHnfXtWPeFpcdh0w4mrbN89OaMIff7+b3oQs/9aGk7+0oE98XdgjwYiq4eqQLHtc8CdlIizv8R5CwO5m5eJgZBM6qfOpFSEhl3/MH9ZLJyPfps29/1cqAvtl3I1nzQ+MrWV2cuxPtMbXvEvcD42mjFi+Layo1/00ki6gpQJ1HL2DivL0Tyk7vtDRXIa5LttpOOpCMy76FYYXyhp/jfKpUfhcxzunFYg9s3Gd7vKTWG5e7C/+KQEhLaDx4h4zEh4GIQ//5vA9u4zOFE7PgNpiDPcD19ZsqTL/AjGwv9DeRfHHQ+tYXQSYYU9JgXrWFtrH/s/3Zdt6YSer+LMQ+WrQonucehVMVzZkgIpg/tVQTYf2ZYQSOKF+nVMOiFZQNRbt08qaZNJEaUb1zlIM6Zya/sI3301ECXs2ZVVnQUZxyB4ojJU/V0Q1JnarxQKIw8SY6vAT+QA1U6aVZo9CvQkobIsKLEMapFa7cI3/Qf67I4/PS/O2l48ReGgDbab10/sOZ//GunieGwV38yJ8ereJCXjN452QqdI3CSf4k062NB7qAAAA=","k":"full","b":"#A01C34","r":1.5},
    "dicos":       {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":2.52},
    "dominos-mon": {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1.4},
    "dominos-wed": {"u":"data:image/webp;base64,UklGRtYIAABXRUJQVlA4IMoIAACwKgCdASpgAEUAPjEUiEKiISEW+nYcIAMEthuALgAISKoP5n+IHTGYg6r+TnsvVR+gfhf1AfzPvA4d8pri3/Gfdz2j/tu9wD9J/9J/Tv7j7AH6ze5/zAfsJ+yvuzfzz9h/cv/w/UK/sf939XT1C/Qm/b30rv2w+Cn+y/7X9t/gI/Xb/1dYBnP/2jwz8cXiL1m/bLQMfXT6l+SH5N88fpJ8kn9v/Ib8jfYB/K+3P45/M/8R4WX8B6F9yV/hfS/wa5kf9k/1XpKf5H+N/Lv2d/ln+A/1X+B+AP+P/0P/Z/3D97P8v8tnr9/br2Rv18cICUCYS6T3OVmQezHeknJH9EBXOeLqKeVi34F6TqA42dcV0zLgF3SzsheGkPHZUX6azpvl/vXUMHOmG3Y1R8WNN70uvlagJiLQE6ISkg+TQncxv7FKhGGk5je4QsP9A51OitqIF0wBdNsoprpLypbkAAD+/1oAhayK8EWn/O/ysoZW3W1y3sliif4riO1vXHEfIYe4SODbw3lAeGvfu7xHUrj+wj4Ku59W3kPbM+MaaHCRPdkcO+XjYXGidtd++5o8eTH7TmCr1Wb87AAn478QOVunFTc9EuhaqASfihvVaXWTK2U7ncumi1KzIMr+RbPyfaXu2z+uUFF54FBfWXpu4xW/iZAXdErIUee7a56EDSIse/fMeXyNNLK2usEeQJmu7TKDgC+AzS8S4G444eztFnbwmG8atxMb1t4lvfSJCAAghBLIyzNPMFNgjeBY+92+vUxulq//F3VeYez80K5iP1Kwihy6NbIJDwCWJO/8h8xHfkyC5nPisa3L8dCKGFbqeF4hQ1mGRQmM+Kw91Y6g0nFD149saTaZemGjKDo2odv4HEFIIXgQwJ1gDVDL56q0Gdd02V+hmZFthD5ZLIqKWk6O+aWEqLCdS+SpeCElaNrMs5CLAlyBX62rH7uC+Vz2Pm8q/jX+Lyb1DQjSjLYcV1aYxi6VmSEC6Kofa49mE28yTaH5F9yTypthMautmTgxO1M4iWzY4V5a6cBokDBDYnixlEh3WhXIMtf/EPewr3JiTIo4B7onfByygRwKtiom/vGhcm/tMdAS36otAHLHahN0kKslrfxUnkihZlCTlkxL5jAs0/Ir42OmXP6sGAKuHUCTef57bJBnIf7d0B/4qfi933azBqv3MLnzxV5rBu/Sdg5ipK3U/Br4GRDc7i5PNjbN8Eh9gbDqFFsUi4h2SWmushoFRb9r+wJPCO0raHNqXhKlisZWvHuScpHUpbTTviUZ/3SsPd2uEQ5RE8HYvWsLHMwGMtBoH9OajVNwTqVFYskVnb1RPbCgPBDu1msYup3gfQPFgFYDm3RKkU7VdJxdTYPweD0T9GE0DhK6TjRiTxrQQfzAKHXS0mFY44SpLweNKk37DdmSeWlw0KcNbSViKQMRWCzi6BN1CBE1/t0Q9E8O9nz7LVggU8mBPsSvl+imGDL7TVsWp0ijJJMMlzbj/AZNkPpHOT3lSp+C2yH9hwh90oeHrPHWA06XiiEA8AcOeVp7n/zrxUifvm6sJW4kGIue9kL2OfnxeJr0GiSQgY+iScjtOvSxpIv4wGDtHyPL+8ALmfYALJubLooz260eatm+9WAMvZdoKWlWzDK56gB+AGHxQVzv77YigKXqVldIZZcVtK3lD6hMM8QfT5q+R7oNmha27grwuxL3M/8/scwtUcRg5+6Yl3venfrSBXa9cJuErGpH7fKeP0zN//jRcfBU9uw7g+ynNGk874u7M+985U04Yg1vj21tDe1HK0b+Y8zzIvlX+U+9pa0IBNzAPRUvWCTm2Wp8TrwDQEf/jJGiJw9u+RxoBIko47nzLuw7S27tlqnCOeUv9QsZKwCZo9k1NP90f2Im3s+Dqt/cubZMfHmW6214bKo6bN6saPz2M1ZkjFG18cL6+iWpI0y34tK9R0UuoI+5JfD8H/IGyJ+4Ebs0YK9puHBKiKlp4KQQzXSGeof4uUyr14/k+NmGdJZ1w4vWcQn8sduGzrn0CrDGz4gtI/BhehSva52PCv/fuPFGJe6t+iaSKysoylh/QhV8Ite63qIT/Lt+T9JclvFNzeROjAYSlBSZxUKS8tPIvVrR29pcu8nrM9Y5nRWz4BBx8xwOFJokArvLmTTfk7+i7xS/lJJk4emTwPwvHT+Yazl8mJngfHpJXxLUlHPo4bwkq/auNwIqT95UwXkj26/wtySNJUbrY+dzPf7tkt+o/u4++SnqcuGVLGT5ZzT+1g1FU3DjYVLSyvmS8ulc+EO/VcjEWWBKUIDoun0vN61fACpxAIQghL5iAaDaYYgLFfesoNDLdemthfGIWOibWgf/wu6VpANbIZLAfG06sqTBTvsnh7L2fPnW4C7o3JX8UWt88yekXzlJ40mT6SoyoC1JiyiepKh+EjgPrswUukABEN8Vm0Bi/wkTCaaZwQL+BtxQDf88INfFxei1AcEDUADZZLhyaUoIo+sZlp1cjG37fbwGERu/UNiyuN7DB6QdCSJbmssVOmMBRN2MWG87wZH0rUpYHyZ0pM3bcW6DIqzXqOeUf8RPy72g2Qe916uCMZ7Sg/YZvCO4TRAY9oMrb95QTvFDJYbYqUrAU20nyE7X2zns+5hXYXwfpDrli/3C7L2E20r/8vT/kCIPLqUz6bS6148fkP/dPc6t7TwxUKACevprlVXncGuVVec9uokLdPWHZZMGf9jNiV63aDk4Kv/0CQVMDgCgbAv/xSm8SljngTE8MCnUPeBGDydcZ7C0cSmzt540Wm9Eus5gCxvnrlIl8lRKxE6BJiQIvsOgzeNHfoE/gHWOW5vwbb1PyKsvYfm4KihoXekVAJ4GUO3cfIGc8x7k/8AhszUCLLISPR3voIf9AMI6mdSjDIBxe0S74D0G/k2uMFRxfrRH887sKAfUAcDDTrRTsK1mPQyWuZhJ44M3TCuxYf5yx1vWn6RdbWsAipOBmX91Tr8EOkqqpSlY8OFKH04hAAA=","k":"fit","b":"#FFFFFF","r":1.4},
    "guming":      {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":3.14},
    "haidilao":    {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1.21},
    "haoxianglai": {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":3.77},
    "heytea-topping": {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1.09},
    "kfc":         {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":2.29},
    "luckin":      {"u":"data:image/webp;base64,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","k":"full","b":"#303864","r":1.0},
    "mcd":         {"u":"data:image/webp;base64,UklGRjYGAABXRUJQVlA4ICoGAACQHQCdASpgAEwAPjEUiEKiISEU2c84IAMEtgBoYhf9r9V/HP8nvmGp387+7n7sf5fmkSa9fH2v81v9V9FfQj5gH62dIDzAfrj/pP6r7Qf6ze4X9XP97/gPgA/T/1afUj/br2B/1h9L39sPhX/cD9m/aKvCj9hZEvtP+v4k5UX828jaiPezWw/MfOn6E+lKFkEgNuAgF5hJzoCYuko557suq9/GQuXIOc/qhHTVq22q3ph4pjjXBsDuihDdxwFfkDlb3wq/2fpGQkN5ftgMAmAwfd/K35gIYnIle5djhh6zDzqSWjroxVSoswcdx788G+6axS6IgAD+//5iDjz3yixBTFlIbA0MouRU45gj/ZhMxifPYC3NH8V1ImajbrErjSDIbWuEPoltBGqzJOyuco5Mez/nKuvv6I5VsUMTb3Nd/Rfs6vbpUJPBjQMcwvJ3eVLfxdcTQdpEbeEmHRQl/gawu9jFs5iKF4/y5phtz0tth7KZTrqdFld9Frtn4hCfIG6+FmT+ZkjWD2mi5V+MHICBZfnwvkrAzvTsqcLlUFJ/hBySFpHRk/7O4o0ihMobJc5j/Qf3Aa4IRq72PvolDyAIBYROcKcD+oa1Krf+SAk+rVcqK5qVJEISjWNnCfE7lh++VewazMklzaWI5mS5TkB8kSIltlXGBISCN3otUfddQ1U1aW9uB+1TnwPH5lQ0QxONMzDVlIHqU3UWX5LvXk03i3CbqaIij+xuT565p2rPxWxQkkayCyrRY7wau8Ymw4N1ulHa7b2usrgPf5MKMZRH8TWj4qpayPix2tUd+BRuYCqmC3+CrMcl/tAC5bQtxVPAQ8x6k9QEriAilyfYcCaA2pQOOGp9ocAg+tbyoj0tz6fflGh+44xj8Ufcwb3UPHoertLWTgJdXT2kncqDBjcYX89lWjHZ+3fEQAJ4tpHFKxXmHhFBp8BnH85L5IlAzRwe1EdBPYIUu8mWcYxwSprP8hvbHuGx+VfHiD0q/nW8+EDb/lSV2k/7KDnH1dtzRfDephVteLpz5RaIH/q+FtNuA9q+dwbM4m1Q2PLFXsCb1IemV+4GINXM5JIs2bCugOcKtlNRf7piaPfMEdXPTV4WfPmOzTCcXrYFKdG97A4CnAGdymHz6zHDsBSqX6PVfq1UJ8l8CnyEjinjRGGyzRkU363j73qCB/9NZWsLaQgMZyTD/Z0DI9RDnWY1/88ij81TcGqv1lC6e21X14pg6fYE8cK/U6x/IbxVjZVY8v0io5K4VnhG3tiGZ/8VFkIv95YV389y4+6RU/oyhqfibqy2Sb1Gkd4vfEpVPfEZgRpK2wBy9VxmBPQUuY7t7y6ZynZ/QDTcx6DYNqspUTgdmFmDxpmraJ86ga+rQTuT/q/NJJz7R04b6VocoDOxFojZHAodxKAAsSbmv0XF+h9aIi0NjS5gAfmf7n/eKI0TV/0C82gvqg8V/IZ8G68tfqoSgOi00PmZzbsIw+ZwzyLOvpCfMW8j4ZnLlK6UhfdRmZ8b95G+IWLRgWaPpFdBn/vVEDoO3Spbu5OVK1nUyUE1xOxBoghmj/Z+89KNCsQPA4Defhf70g0p4vGQwBHRPrd6Z1br/LihYKYRuRrqel31FcyyrxsmxPdBXGcwpDldD+sXISHTI9qIgSDhx9alsRHzxko2E4TjvUqEDVSKmPZnqJpBMIRChgWjpnjfMJftVu1Hj9Bfhzww86d99h4kg5E0tqCOBgt9bvCXp6/lpVapwhyUr7NfNhWLUH6c527qkfjchbg7TBP34bd3lFXIJQAt/pu4L5x4MPC2C3R/zsNnJ9BQwOsi/w3E6k6zSPT48H+Z1/6r9uSb2TflCym9iBAICxzSEvz7awzaRgAMUR2NSrVjunLFKvyMlxMz6AVaxdidvE0MqQ7qUNZX97pBO9U0X9Iy//GFJ7hLDsaTvxpxw/n6ZSvkK4+GKWtxxxsvDlHUJ4J5swNcDr6GdLaE7TGfwcjJRSyxUtx0S393dghENXl5cj7IieD9z9Luz3G3Zaa93BdmLBgNeAo5lq15VoSzRWKSyjfVFlqJUIdfRHyiRwBi9c9iA82iMPqRc0a8Yke3WgHknAuY/wzaAAA=","k":"fit","b":"#FFFFFF","r":1.27},
    "mcd-member":  {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1.27},
    "mixue":       {"u":"data:image/webp;base64,UklGRnAFAABXRUJQVlA4IGQFAADwHACdASpgAEUAPjEYiUOiIaETy2ywIAMEoAzJIfQP+0nhwuWDqwzx9O/5L7gN4X/vX8a3gH6pfsr7GfqW9AD9h+sQ9AD+Af3n0qv2l+CP9j/1y+AP9dP+xWrOLnx77VaAHzNe4Zyz/G/kvwQXGv5X/sOMD6kf4D1Ifyj/D+Rn4N/x71AP4z/Kf77/ZP3K/0Xxcf5/lB+dP9/7gn8m/m/+h/O34pfYB+2/ssk8Yvr2XacV0H+Lvo0PPYPjGfe4AjVMPuVH6l69C/8aTpuDmzVNAtSWomqZV4/WJUZnYeZ29NbfR84m5KF9CYd18jlnqEAA/vnnARiCllYT//ksv/yFT/5LLuigQ4aks7bNOLq+H0gTlEeFU2GDzcEW/fXMioYP2VFYXKYPc1NSMQZ4F2Mvo+yF6S3j25nwHy9AZQ41UOCKURuZbVE9pPzlaoQn9mu/iut+E7/31t8rbqHvpS3kFBvoEIXAapcmZOontTwoBFjBJWP03N+AUtiyx/9C4KOOaFFL5PUX8eS8/RwobWOKoEPJ/3vo4fbmZnLNPTgrecMActfkCph/2uk81PTIHKMNnsdHt8fhPTWnfQ88H1tPkAr3ReHtzVQ2PwFN+TRzk7ijfdrNCwpTDEYI83Mh8Xn61w19nS/STULFWTi09QCfZP3hQuYJRHqvYduAQwW6vEwE9wnDwguTpL9ZD9ySZW2FQeW10K/DqLTUPdLcnUuaGWn4fR4z6fxqhK96zvaAIHL6wDLa5CUgMzUKF1tveR17RTi5qNfBEL6ly0NKrz3oxI2RhYi3k0qmstocw6qG6j6rPAqoMLcu3sumuyT94IGD1DUS/xkIgFGsnYe7f/hmL0HjHVoay7e4VKI1fPD/e7OZUMDybObIy2xG2/hTp/OkR8n37yuAGtYQIpLlm9uf/24vQKwA9DwdGaAV7/yV656PYz9wBVl2fV4iHLj9Du1nzWMrzzO1MnBtAkQRr5l/6CsjtFFcLF4x7os/uHWuI9a+yX//vrV7+Y230f8Tzdooo5FWy3VngxR4rv/kDqF0iBeBagCDlCufW2yyUzJBkwPpVFEq3wjgW9L6ffLYDQYTSg/D7lH8aZjHIhvyGzx+95Tn9rN/4xcNNZDWumnJt7Bm1nfP2JhuFERGgouTdfXPbA5NWO4lSMpM8GvO8/BfiUAmBhnAjlJci1W+3c+l3mC//6Uf8S5WWDfJc9z/8DgLRP+DHWsm2B7/1Ep1D0YW66BJoUBqg7O8f/vl6+jZV1I58Ws/X/6LJPn9hxfhmPwX+CHOb16kONjF+of5ASV5ceCTR1t11MCOCFeQ9VysAcFhv7qvyUInWjGVL+bz09v9IYbUqNQ/qv28Sjue/wBSSuoZ5bIufJQP20wLeL6fN9QKN2mhOGvZ9UcQ+oVFWi79r10Y+EkbYttyE/zoT/5pOTMXsU1Pv/jNA2Qt03+SVfRDyhSrafR2kJMxzmLldsnxjiJpPDSi+Ff7/WIFD99njghhvv9LJNm62no5DBLu7V+RfuLbj6vPletJtOrcbCu5KYBgzmWeN5TfWzXbCmT5zTks928CPU9G4KSr/UVVqK0FI7KMZuyI+lopYmw4nKzghk9Ke8EKZvZqfJ4dPYGUJO/Gyl3i/8ItfTBLCKKrIab22WIcDnvcmL7q968wAvAPmy2xl0AIXBqtGvuZ/Oa8ktXRRnvzczPlxYUo/2TO0KozBB/Pef4bDTRB46oUK8zdrBvlH922Of2q2KxvuDmYPLJNZvsA1zXdusra/PPKdkCqfV6ZVzNhjl9mBngIHlHZ4mr4fO4LUT8UJ6/WhWgJ0YKdfyvaZy76Fvq/HkuZyVy0gAA=","k":"full","b":"#E40058","r":1.38},
    "pizza":       {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1.25},
    "tastien":     {"u":"data:image/webp;base64,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","k":"full","b":"#E83C00","r":1.0},
    "wallace":     {"u":"data:image/webp;base64,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","k":"full","b":"#4C2428","r":1.0},
    "yihetang":    {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1.13},
    "zym":         {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":0.79},
    "alibaba1688":     {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "alipay":          {"u":"data:image/webp;base64,UklGRpIEAABXRUJQVlA4IIYEAACQGQCdASpgAGAAPmEwkkekIyGhI5QKAIAMCWwAzfSdUv+vfjX0IfGJj11r/xfQV/a/Zf+Vf7N7gH6K+ar+oHu6/ED2Afyn+xfrt7wHoi/4vqAf5jqKfQA8tL9qvhF/b70g///nAHYryM5+bZPvp/EBpPsY/ol6H/pxBn8BUtOO3rIR3J+FiV5I7KC6/HKQxOLIyqFAXgcS7sSgz6Wc41a7S+sgtcalUOoYHlfLxx3dqDPbA0FsALr6QuB1+kFbMKNfMQ9pWqNwblPpujtnlnib4j58WIAA/vz/Of977zGra+czE4R3/9+xKT1f/2ch1rSu6GXDGjXqTXbTiDXj8M2nYw+kqIKC+YejHAQbibB0ZGJ5oPvTsUt/mjHO8TGG1tB470LBuww4Y8b6CT/75EIeuoRnNq1vy8xar7P5PUh8nC6Ed15x3kMHvx0q4wwTreVVl/l4MtG0vA0ks2Qauq/IcSxC5lYb3IM9nrzdLsBDgznnwpLPCT35CtGpd5aAL3fIpKpR4QuYZfnfKeVQFZTUvzPZDijtPGM/Mg++y6fd/LYMl/39tPmAhUY6urv4FSTFY8j7eS15kraM3Y49tJ1KINeQ3s1H3MrFasDa5yrdCQooHSyA+jJ/+072W8aW+odN5b/7hfsi61oDX2v7quZYwTlbmqLOWdElHG/FcBLa9Lrf9LrgHcoxb72QMwdtx4WBgsH2C4rmAfFu7cTGDqPnRY2SgHkgd6uBWZVuQ9CVnB9321fGqhkiO89o6DBgD2sA8uFEp/sNT3/JRTA7B5lbwf+pMLLh1Rf0/uzX+Y5/oq9bsnBtXT2XK4dxhTU57dT7lvGL+DQ7ga4MskRMzhOUASWU4+7X/DkF4O51A+edAhuH0aFHeb728YrecCQ4Z1rWtAGOXIwPSQSkgUFPqkGY6j/355X7KLXfJAyGIj2sjitDV8ZB8z+hJ1v1UoTXeLjXWYCUW/NZSygQaBpGvdJaqF0E06PK8HTexUCesCLu9vmGcGHGcCn98CxO6StPjWuAmybu2XVWfp0wPRKmde7PCncdiDCSdmwAWyT6YxDDANNUMX95qWQjmhEwM5j6h9eAuaSqkC2oFoYPNqhU4lT/Des904/e1Sf3TWNx5Asykbd+6kWG0iO7KEpxqBL3bwyXgOc4d3JhN4am6htrlksPanJHAi8x20G/t8b2crQd7sYtMcykz8UnRn71TX9oxoVTaw+gZQRe0A5YHVOUnfOx26Xx/FmcbgkgRYu9QKbH/tzwbyHJo8LAruQP1QrA/Hdz67nsSWYKY29PgH9cd4Buip08a3E6CGKpqzKfO2nT1CBSz1pKmJRFDr1hJiwOsc5RcUilD82M9O1ixO59n8057cFST6nUORPHKY1Y019YXAGEExVr51Ve3oMXXiDA43r788r+2PjtFvBh71NI6drz15xzbZmTwak05XIV93amIvYF27UUvlHstMr+L3G35a2Plkhs5i6kQXKvMwQzNVMntqWmn+5dFZ+G0uMIUepMxv8IKVkWJGnmLRK3gw0w11Q9SGAAAAA=","k":"fit","b":"#FFFFFF","r":1},
    "amap":            {"u":"data:image/webp;base64,UklGRr4CAABXRUJQVlA4ILICAACwEwCdASpgAGAAPmEmkkWkIaGZWSTMQAYEsgBnOIAdZh3b0PL89HST93fL05JtQH66eu3uuv+x9iXecv2Z9I7VlCo1IOfzcu9qt/3M271hSFJgSWxujf5GeXkLAnukpoG2q1GC36s6ZGOVfXowwNaf6fKHI+enE9LLzqBFvXOWqWOdxpAPs6+aabpLfcmwd//mf/2/Jkos7hYEcWQBtHj4dmNourRgAP78UE//B5/+Def/6JMQkZz/8UV4jWbPBwTEtnZtG9xi223Uk0buq6joDl6UMk5B6NWqWP50MdA6qoBtCGQIOnFvt48ChWHPwZCrrNrsfp6p1dfyfDVr8gWmeycd2qP905/1wG0/jNNxcJ+9KpWOUrPfv+d7b4934hpLwskeHkX72NmIPxqbvyj2GkgL1S/fTn/r9x691D3SNWlfAHj/2napDsTNF58EU8F/vkPpBVpXJ5ib/dBRuAskaJkn7Y06nJM7z7Uv2nI0INI3/sXhul2DaeHUs2ouoTUCtbqTy7SmWvXQ7HobUmbvbnBAcIT21lOP5xazUudQfOV3gTR+K5eW1Mv/PGYKH/nSuByfLlrr0vuLEeBtsxUPlFs9lUKe/Cw4UBTp32/5dYVptw9RadSXhIuhXyfdx/18+qYAa4u27sD7qmWgDWL6Jb3V0Opdui2g6ydV3CX7X2qjLBOEzZ4TtvmCJ65ejCNYF8F86lvngPfr3s8tFlTkVbe3m6B0AsBQMDOsJ/90ElgwubDJwONxzPhv/y71UqT37OvBCPtV8FHQlHzP1u+UK/R426vq9jF2/sdngWgNRqBAJziQ5g/91j+yrkdFFTIugCEvaKCbJ3iNSt4wFgzLLcBJZAs8514OoVKT8+/t4rYeNOxpViIbtgXkw/tiW/LnXvxJFicA8ltv+2+gv9OgAAA=","k":"fit","b":"#FFFFFF","r":1},
    "apple":           {"u":"data:image/webp;base64,UklGRtYCAABXRUJQVlA4IMoCAAAQEQCdASpgAGAAPmEok0YkIqGhLVEbCIAMCWkAFtDshvsdkQ+oP6rORboRb3xgaTLGz56ecN599gz+U/1f9ZjyPX2+R+NtTdKS4RAISocOSjGabr5Og108IAT6yDkFwvHz3mnz57mn46BsaCPyEFbZfKjGilTqdCzzs/kVkCOC2F//rgE/qPDc7PW62jdQghwAAP789BS/xqq/4sO/166tTuqL0BKA7jsTfnJXAfoqC89xsxNwW64sjDnITxhk50h/UEn738Aoz7GJ3Snyl738w525G0/0co9hqVx89/2gd742alaYLpVRvEq0/ohkWueRBmD/KOlRVxhy6/XudJnfjpvsjlZBu1WNI/n5KJKayzJetZh0U5comxMds6lUjEybmsHy3oNJ0wa/UiiD/dLGdN0+ULhZ8Knb2llJ9BFn2Dq7s6flkdAWk99kfDlmHKfBVpvudm4OeY/4rErPDm2JkPGmXptJXjoZhfNWjF4ur/eov/uOpNQ94g8k9gimT1k8mc+bNPy/yLVkmyWJvSzYRsTfAdSzqTD9KO+JKlybC4ANEYbvaeKmceM4/w3RWCaNhj7T2IZDEA/hhRZ/aovOV/8LiPeZeZXhWTxuqdTuaJ2MIk8GkheIX3uv20g+8UXmqODhZWkxH0k9JceNydF+fpGRxAnuxoaIiXf5IJrkf+TDy4vN9q1k88QNqHrDdQ4hpEbHiMOLQP6FsaTzsQMHRqJoulqeFvEW/X3/fmNG59d8ef85fyiAPLyDEpUeYAunQwaWYE39S8P92gRdQAW6HfMhppm4aM0dAOPF6b2j808HmurEDXaoL5ktYX5gatXsAFg7eyay+ZZNLrNlERrC0DzoUhJ2UX/Z6IHlYJ+H/z3Y/ywAfhiOppRzEG9ZflYhF45YMCnbjsWtG/WCc8GF8gXqURk4k39MEeAr5eCOPZJS9ds/DlgAAAA=","k":"fit","b":"#FFFFFF","r":1},
    "bilibili":        {"u":"data:image/webp;base64,UklGRoYFAABXRUJQVlA4IHoFAAAwHQCdASpgAGAAPmEojkUkIqEZyuzcQAYEtABpzQCdZ/WuMh5DxAdk0YDrC0F+gDzAO8A9xP7X+oD9S/2A92v+AfqB7gPQA/pn+v6wD9Y/YA/Y31YP+h+53wZ/2b/gftV7Yuqy+M+yT/K64Czj/rPBAvP/x39L7vLUs70azsZL0A/WKFqoJnpXaje+N0QxwW0vPtLMKtdFw/NPe5G2ihVjp1V794b8NPPacUD6Y/AM9/z6ZPj8yktYk3Kr6v2bx2rQnV+iLHGgccrKjCy2MkJtNoly/fUUcOs5Hz88HqFt7T0BrK41ZOemQ1rdn980TiWfgAD+/cCpqTl30Qo4aS2qplD64ZtpyF9WcOJ4fbEW9Rkk2KHEyogicpWFNK4527Cj1e0J4fxOrVy5QkTowKnUYluHIUcRPBmn3/f63h55JwftyoFOlHjXWmZryJMSF8UU9IlifeP25D9e80DAwx8PVSUoB3oT8ic8vnn62+h9RvIraQhaSe0mPKZRN5ZYWdSNQQV50UzHtXEfXC3fhzLmQ3AZOafNB6S0bRpX5kvBuwJ08TfkkfhX7AZnFHVWbzqvSmFjDGvayfxiPL6mwjFPr5Y+52qHoqbfjNQTN9np8rP9viEDiHqBMRiJzO0mEcmCrkeuolxqrP7C+819ipPpn/eJKADu8PVk+7CBXMRfiifZEOGSx9Ed9HHWmFxbVVNorHvIKVAAuU70+VLtbwdqVFs45b5HaYCvw312t98jEwMfX8Or+78i4+xJ+k9uCNtUtTtiQAm9CiOOEuBMGOxOdI7QLe/MImhv4hhU9KBR+vxht/VbPquDmqsD3/w207Eitfy9/HTdtv4V5Mc0ynoDRGXbUBudlTQkM6nlrFGyN4qIPDWm/Ob3yzCK9jg16FabNcwQ/a+nwD5eF10Im+9wjJeAXipdlS8xMOjWyrT3mdoyZ5rhlbKfGH9RU6S94/cY5aR/+L6gRxJ7rjKAAQRUWzL4cdsFyGm+t+133evPkI4ow5EiQ6fWveNOYpyPSyNtTk4ycgdBe+Exs/oGUWOc/ESksY8wO8pZL+JFw+jn+IA7R/WHjS7yTjT6A8SnoRQiylVSXSMWIHrySrvEIuiAqajCeHh2jl/QESXlXtMyvfU8Yp4IKlxEkVGafIp8mxh9/98VmlVctzrFeBapew94TrXBAn7QMiziQ0FHXXad1mcrl5lwzUWnmBwrgslDe+SdAUtD1JS6vnLdIR52FfIIj64UGm2CtmAk3ACLX9pkYPJoR24bySNRN/KnwEe9yOhQL81+ZC0wi9smu3p6tz0DSdAXsjpEOGMSNZsGZCj4x5A4YMZlHfh5dNmJoKX+WgGZO9n3xoov/RCOrB7Agx2N5r2mrD+gb3KNkPi7YpyYIGodNbYAIkcGAfR4ih3hB6MEjImXqQKBS7y9svgtbaZv5cexKq5L4d4Xg+SidKf6ygOhbwz/Ad7sR7XZzo5iVgEKbT5fb3cotImMX3Abx5HDlDFcTmFKL50/yOXHHz/cOst3E4vEov+WhOffzsXjW2LTEYqlv9mqYaLKQRk5MevnGmkIyp4FaM4NGcR/VhFaFcpNTNSB1BwAEKiYnRjG0+9D/DQoJvrxu8bNW5C4XKJP9ja/dOaAf33BZwy+ZagqOuTLn8y++fyNFeSKBbC8Z6JBRHQUl9PTboGRLfIe2/5tx/IBon0kPkXLfLvcduRJH4RFWhCJo6ZJucwU7OI4ttdoFA4+wcsVnhd6RSKz/2ZxzJE2B6Do1hJizhUhL9lm3Ykn7q8rCM0rJ/de8/nI6FPvFSuCtqV2nPadOo4ubtzrXkw7nMyE1fi3ZT7zkBDesoVZM6bVRFfnDZc+hxedicTaOSIhLsyKAAAA","k":"fit","b":"#FFFFFF","r":1},
    "burgerking":      {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "cainiao":         {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "chagee":          {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "dewu":            {"u":"data:image/webp;base64,UklGRjoEAABXRUJQVlA4IC4EAAAwGQCdASpgAGAAPmEokUYkIiIhJlJPKIAMCWkAFtA+MP6f1K/xm/ZntuPLx7X94/J7RLf2T8ndtUkk/mP+C/oH7aeIBxnP+G5BCYV/T/+H6P//J/ePyA9vv47/d/+v/fvgH/lH9Q/439r7VXoxISPl2zQcDqIUSnoAGdRdqijTBXLGF6lpq0DA0kBmLUs9x4oEW5P+MYu+0GXOl2gmD9r68GPbZGrdkDI6bIibQ+UiX0McMssegasYD7edEQCQ/K5L7ZIs3GVVb0omb+Z0blMD9gAA/vVmE//XwNp+HfTjW9U7I0dWm+UfyRdfyZyr7oHGWPrejxflnUcgpATBrkvWR25HipT96oRcIznrgieEgo74BQhqy3zdyG5uyTQM1/dW5meA10+grgqvFjxDui/KISB9rP0ObtTIp8OEK+2R8xblwXs1QtD+hazgJniAbAbPjQ6DtFZdY/HxVW948116DpIaMF5NFeKW2P//kP/PgR/4H6+nKEgZXu9fLjfpIBLNo/vk8T8GZmHoZvZ5rPYoJzWttljOp3RnTcJl8/ahqcp+k5E4IO3wVqoV3wi/WtKAYQiyX+IU0Sf6UYi5zI5AiBL/WvglB/7JS1EhifH+iZ0QpbzW3nW1SphtVPkm6+2XS8eadDsxm8ZXiLO2gPWmoSf/oF/EDhNPJII9q1lNLLLwBuuAc60a/Av4kn2znDU/C6v+eQi9lFtS9unQUJKKn7QbUFw3D132nyH/Gzt7ja6y/+DwmyBvXM8+5OnyjzEhgb/2flnM3xZgfPmfkmQVnvFXrJiYxwBFY+rYl4axwFGZh6LXnrNXxyd4mjzU5ZMxDYf5v5e9sK/quoyghudgjYjU6gNg6/hdI1xzcd4F2+vDqE/gPoLW3DxPE11Zm884qaji8/Ub/KFgLsaIPKYomxieBHMsD32M/l5mGyCf/+wvKT7sf87VL+2qByDqaM+aS+KoyiIDoXj+XouQZ5uS9xtSWlA48coq7h7HqATxMOhwou9NNdv/5CLflN3qdxcnhffkeyEaT0VmLGfP8A/fZgf8+Yy+KajiZyxF891eNou9le69MeyVff/SGmS15MqWhr3yncg1wGTkNGSeK4yrhbIO+5ZRreJO+V6RIvCLlNwh5EyqwUyB5DH4NZ3J9qVkImLu07N8GfVARElvUezwTvR3br/P76rHKxZpaGjX8pPen7vCBjHQa47aNKFRg6Rd+a40TUuH3899u7VJVn4RaTMmkTyM1AkoHyZi/T+7/evBlmpYpNlQUZxQ5C2UU8kg2ZiN2Xyieo0GXZCotfvNZRfYjStIPV3MPAd3VLw1GL2DgFx6R3cS14HAWrDpYqronh/5GPvPragr+Nxmo4yI+hgefIlIaefyn54gDWsq9M024rs7NKz8QLBQ0Qr60M8MpbPiFWpsId6FAAAAAA==","k":"full","b":"#000000","r":1},
    "dianping":        {"u":"data:image/webp;base64,UklGRlIEAABXRUJQVlA4IEYEAABwGACdASpgAGAAPmEuk0ckIqIhI5gLwIAMCUASgBrNna+Oj3dMAunH8R/MPyV9+/MkdKDzAfqd+u/vY+gD0AP1k6wD9bvYA/ZX0wv2l+D/9yvSFit9QPfj3oymvrPmPpKZnHj3+rvYLKGg0GcvtD/f7/v50tCvx/4DswAvNQvWxbun30VskcZzyfMqMYEmSPjjbtQ0L2qJx+qZIpOxaSdGq7PwToajmGxi+yuFjbxg3y9YqPOKBNuxMV24ftGO/iYBiYhX/YBKR2Mpk+AA/vz0CIy3/UMyR8f6EuzZEbNSGwIaWhbR0Ooh+K/nrMxPPVm4Xni0YE1kyPDTOBvdP5OQbAkKFQwtucI6LUblpREKBM4In2xLcryDKisAYW52Ka4Kyz2ymBuLKYZ2UEgTUYWpuZ/3x0Me14zrg+EfDphK89GCMs3l3jHGQt/1Mgmfh86ftb/LbIeAve55VbytSTOyKblP0yMtVD3atr9n5w9WP/tJwgt3deSkwp6yvI38sq31ST996fh23ReqwHiyBiSnfy1d4w+90i1hqLBk73QTp0qyz4k8EqyHABQ/X9CVfVOZr6OQyb8CG4tAEy3O0ttEmvL61fPuxWJsN4l0UzmU8gYwp9yYGljIDa9cn6jOw/UlFjPng+k7+H3+IB6g+61YrVIIo8KW/72dNp1R6E3V4OjAkf6CZsbdbU3NFfrJpPSpg2df+YxXL08xXFMmoS2bqPf3EuEvhH/W/YS2GMPeLOBE/EGi7CvX/Czcr0splUT38oLI3lnXLdx4rFETopppqChofld3DJL0jU2tQjoJtnDAR6oILO+feXHy3a63X7YCHDTFTcT+HMJSdajoRs7zDT2s+bd4cLYnSPZc5B8wl2bbEaDVn/8icqeSVv83S8UdGmeSyvY/yfEdBQf3afmXXX1xq3FxpisF8Jv9chHCxgObsR+VADENN783dOKr8gf5oSQuQ9RE1bGNTajpwziO5U6OdNQu8Xl63cDYm7yJRMVpdMMR3C7H/7ZHh+X1xsCMEAXqpfGElGwQllvb/4OaY16dn+ee5XG+PBdRTqiwCAdXbbMmcIiJfhoPUXKY+IskegnXCP9WhSRpptqcRLGTk7OZ+HdZmPCPsznRoPfDFS9EbFqhL3bM2kr5wn3CU+rFtJ0QiqfV+pVY2dcZCa05ySHXb0Kz6PG0ipE/mFM/dLabRtfZ/00euVb9lvT0H+Xl52cI/uk/xUdau0IffqjIGwrfDaZ1DvuVe8q2vCK6+RY2pVEOXpEvrSQ6biCumZ4FstRLl+uAcWul2vJ981nytlgzUsuyt1BOzns8GUi8/v1Oh5npy/Ujlb+BC5yJ+DoHzAK2BWQsZntBeJbN1zb8QNo28xb2VtNq5q5tRvyj1kgvmLL/iGFvG0KadYmDr+qu7ax1u+UjT8K+Z8+mGP+eE/r7ZIHmOq3wZy8FimkmVCRUAAAAAA==","k":"fit","b":"#FFFFFF","r":1},
    "didi":            {"u":"data:image/webp;base64,UklGRjoDAABXRUJQVlA4IC4DAACQFACdASpgAGAAPl0okEUjoqGZy0TcOAXEswCRAwwNy+ufkhzn/DkcpHZGA9CXpgeYD9Zf1m96D0S/4v1AP8B1FfoAeWv7L/7lelA0WBqssDSXs8IU3Px6LAJqgZ9o7EaNyk8Y63hEVruV2oNwBMDZKhL8KjfIlwi/2MuzKlcnHkr2ECeyfi7lQ210+gn5Yzdb1JDgQ4qkmX7/hGUxroWv2lvUBhpkXv0/GNmsAAD+/XLnLjuxnfTyOILn4XftjbG77ljXwWy1r6zAUpaxj0i6JTRJE7TB29/lw08XUEU/5OUdB7yhTCmG9BvFNWBGS1hyH1pMj1CT9lX8fO1nRO8zLzw2NYNi/hAz/3ls3uEwEYcEHmtGLFOR3pzH8hDqOdW3ELoj5SrzbOb71/VOVHhpUL1bPbbXq54WcLkAcAhffr0TPxOp1zdynYvJ/o5K4HZNbunnyR2m43VCP2h61AufBbsSaN74whHlSoPDUhyUSM7VUgxYqASLPAah8nfODgOAeAtDGwGglJP2cP9bUKAfkt2X7tEILSNUPG+273/MrWvq0MpNRFwsVu73CN29YbYBPOWKbSdK2QiN/s1TVa9Jgwn3tlJ+hlMAB8B48ySirdT7w7vsSW9le16Fyn1jTxkAO/7XXV2YdDI91uH+55bFW1OW0fhscg6RkzK+W+gmjuHx1dg1na812He/aP/chCDdbamd4pPsv1Zih0vyJx6vgNM8OAu1DNLs5Cyqfznp0pJGP5ZksOHaftnkSUa+T69z3f6ZcCdvLVy2Hcj9karS3SaWRa9kibA34mPmwenrl7fveVDb+jIjRE6Y8scFj2gas61b7GjIoqe9db0wQn3t5S4N49xrk/A6dbdCCbU7OsfD66CcvSATgA4XdWhczX1OiD0HvNDPQu/mm24AorDjr4cdZmBlbl9XP+6OZK6niEeLQGkLDv6xPYGO2A78XFxIANs1gGqeANILK858E/sm2QmUiNhjOYtNLInW7xKVQV1KnFz7usvgaEL+cNlOFed2RRZ3BnoNtSdwjS3tigzv3DZ5SVLQPsWslMHBbXLvJhu0sgcGMjAjlwAAAAAA","k":"fit","b":"#FFFFFF","r":1},
    "douyin":          {"u":"data:image/webp;base64,UklGRpADAABXRUJQVlA4IIQDAADwFQCdASpgAGAAPlkkkEUjoiIZydbYOAWEtIAJ8f+02RD7Q/qflm5wdpXdCOR/1H/O/l3qTvHax2+gN/R/bT7Yvyn/Rf973Bf5X/Xv+DwGZZgBg6mpRsshfSpbA62oGE1os9ozTrN04IFpHT4ZvJFIAkhyiv4Ql6UPuXKrmf+Wm5H77c9/UMA79TtOy0E8E5gO2wypdSRcY622jsZ2gt1TAA8bN7lwT3Tuj6l1Ma6se293PN4CvZYAAP7/Eg2VihX7zsV/K9wmoyRvgpbwf928GV5bPgkO/qcoaEA9aZpKucHvqx5nPf/zPXmxlI1+MSySPY1OJXpuj2OTAlf1TyOf5WYdZQZ/0zV0KFQJ0TYLIXdGjtSQ6Vh3ykkUeWyIMb4xGDOqBRHlwWNOf35J+6kuJQra//rDV6z/3rrlKhQgjwan9la7/SrLc2FGiJqB3ewOyfqGUNXRuFfZtAdGURayDDoJVTmot/rHhKDLFP0OFHl/tovEHlxPxtiJCyAlnJpZ2wAMpj6pV+/nhcsVb//w1lO2L2z90MLxCzDQQArA5Xqx/6YXP8VIFpAwEnCmG+qFzBQYbqX4uhSC1K0voN1ialr7Vx3VsfpnwKC6bRpBQV9UXdTXAJrDPcqjJ+qcZYTLd5fwlEmQ6nlZoVwH/2rjnaTvDmpL5jShMf1vTtFmcoasa95VCmdSLMGdA7K+4Orj13ELlGjw+MRsbBKlVHiJdWbKokLBNiJCca0f1r1kfdgfQ6u0PjvSGY4flUMML8Iwhf7FIMrM81m377NrN23RJLMhX+mANfgPUb9WrHJnCJOQ9lELHcCdfKojzl4rSPkmKxxJgKjC+h3X/6W9UYKadKfjn/REfoXH7+muwwFFWa4jpbS3LXy6CD8Bb0kpzTNHLm/CrvZdSb21u3+e0o/o1u45yr01JfzExRudwq75PDLXEawAw4yWl+idNOYohxVPCxxR2QBTpA3XdEV1sx7lx+xapufe+DUXFCb63e4h3FEVArrmeE95LNngiSmm8k6X0ZsX1+qkzYl++CzP/iCv+OANZ5nYbwfON5se+TMZnSQwURV15xejLNrMdYu8wMy9T1bK0MQpob1UPgcnaMS84nWJCQGv//LpvbHWXhCwOlm+0CALnCCdVkOq/jUWHNkSrOs/zu+5HvWWiGO6QDNzikYi5+mh2N/4F3GmS+nVbEmAAAA=","k":"fit","b":"#FFFFFF","r":1},
    "eleme":           {"u":"data:image/webp;base64,UklGRvgEAABXRUJQVlA4IOwEAABQGgCdASpgAGAAPmEkkEWkIaGTnAeQQAYEtgBk4Iq6/b2zlUOW5YzxLl//QebP/Aew37QPcA5xHmH/af9YPez/oH6q+4D0AP8R1BnoJ9Lf+4DUT7+dpvd7YPXCpodepvYH6VSB2HII4HpyJ1vlaYkdualW8ylC4BWqjCXWN86BO/mHEbaiOhgNXwEVk17gevcUCJfUNtmFrah7rOEWdQFjQsuIVbiXUvAKHrSo/8yQLRVZEo4InhtZaBX0yHCJ14UJbDVzqp3Y41dRV+d3JN9sYUVHFBWPpG8uvwAA/v9dCuSmDv2nVaVTeXifE3TbGFVjOibOtCYS8Us+0tVmVdGmK7Am41dNZMqV6RGw+LhHueQOv4kEg9MR3M+gBQIxbeHTlyT96325/BkpplTilXwo17FwMBT3exqmnWmgTz+d64mZD0O3PrEItNumiaTTj/aaGRdfgNzGBU5khzcMn0HvWFXAU5ZCjMmnvwFbct4DRAo7XTwFYp7ZIHF9esS/+gfBzC9MpAzPwIYkICjA57TuxygB9EJPrqiqnlO8rDdyuxzN+NG3604vG8pEmwzxZVRZ1YvjsptkQHd+igPe4WcWrOPGPyqTjns23+H6HebrJ01FoHcARlUN/8CQCCozn5qfDppc85yEnd06e1L+iOMxb1GA0EZ89P59wAAuwmi9N6hxF0PwzigY+oMnWL/q3NKJ7mKTnd7Y2yZPkDZ4zBMoDx4gVPogcOzP5y2nqL8Hyf6dIa5Em6usRfPy+B8cYYe86w9P1wG1mW3YfHO6vK01Y3GbFpJ4RWpMi+HoFqJFbcC1/6KfqklxGWCuyXUxz+9UZaomxUVSw+cfAUglJ/c/tmbmhk5anby+bb9XzURHpAi2m6TlGbRzzJ1IJts4A9Se50nlHRGmh6kwMgH2Gdj/DjPLhHySkK0ToXzx+HBzJFqwSb++XMOP62nO7boKb7O2gQp9eIm9EtuDCuAX2BhBItj/KUMSyEj4mqu/j0td/OQtbff3AGcMxODX/LSiMuQutZ1Pl8muvRbnBeFDYmlmMly7jwCicdVG0beSxGQnoFno8fqrbvqFtQuzXIT3B1YRX94qR3V59CxOHaA1rpGt03JN9B248ENGpcmQmFhGAWd95wBnxjWXytH4Q56j2qX/oCY9aFXl804NLIXTcs5+cB/xSt9AIVw7y1IgDeVqbjXn+WZCozJzN1QA3G8slXWejsz8OdcSKRoCcbWg2lUqD+Wo7YwP05BzsSwd56Ne5OCtoFGSezywvIE7HYDT4Bj3yyEzoQleVijm7J89QtLYMHGbV+HhPmKAQ0cDXiyHGq0uU9lzhVPP9dv2yR5PzBeQIdfpM4LbzJkaN/rdmfiWPN/CP25y7y3ePffmHy7MRdMc/FeIHvbEMBlYn/Rm0j9QnLt7oYuzFTBQOhZGEZTcKg4SUIU6IJPlPxpNEjeePKaVnIi/YNo9w2bqNhgS52uOWR6X7JxpSyszwSTqERfZE5wRV6hl8geYbaxf75lPTN8bwUuzWB/cIMDm0+v5qugrAou4e2dzwnc1USGtyXwFZdnria0q0k7LESNrSR2bwsknWvo7RkvpGqKtwd8pwkoR5ngSZhJSkDpBK6dADnciVRgwvmlEm+8ZTW28LUw6X0VOZVnV+KK/cyJpQmSIBTnMaS+TH4J6pzhDAAA=","k":"fit","b":"#FFFFFF","r":1},
    "haotemai":        {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "hushang":         {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "iqiyi":           {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "juewei":          {"u":"data:image/webp;base64,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","k":"full","b":"#000000","r":1},
    "lanzhou":         {"u":"data:image/webp;base64,UklGRlYEAABXRUJQVlA4IEoEAACQFQCdASpgAGAAPmEqkkckIiGhKBOaYIAMCWMA1iRWLPu4BtoRviLdOLzAc9v5wHWgegB5cXsn/t16QF3W/d+WLko0nb4O1LvR2Sf9fxr8Bn4A0Lf1M85r1P7Af66b7wYWhWavyHoNBCcWyXGkW5IlGFhvM5Xqcn4RqA8lMWkG/hFM0Fgn5ezMutUqHpJveN0MZOtsn5vgPOlj/IPZE8HhGGPu/yGKjFICn7p6L/NKcR568y+AAP789AC1k0hSom4Uu566yQFaYxfVgtVBC3pqHGRXE/oe+sSYN/NHcM+CpMjJMzcWnF1G2Q4wTMUhpB4F36lzveFmCv1/uod2iCdnffLAjGz1DHondWju0/9aEDxIk8BWB/MQOhA4bcOtE/juc1Wnkfz/ZQHPH8nrqrlNlNwfGFU3oGnvXj6UtoxpHCWcA5embvgZmiSqlU4tcety24Eu8GUP35tofVEGLeJXnbsB6+C1/CLaDy2bGnefcX+LL47r3l/laZ7G3wavajnFjrAqhr7WglEhK+Vyvhx9dt9JGMlKl0SYcCWp7W341Pl0s0hsHmKqNorX4uLO4SUQ6n3+Vb21X5E6Awr6MjEkBI8LjF1mWgW6SNJumF4jT30lzn++DvA9dCvGvngNS3G7IfoA0256MVyAvAFOl7CBuoVtrzuatX6fq8oVgDhCtWyqygZoNIb/zbpON05YmZ8dGuEqPvpB7Ksc2Y6vAjnB6JqxEom+KKrV5WtRVxFC5TBjeQ22H6Xw40idVj5cBQxq89RmPL2Lxu8wZMPwwHE3mA1fgcIJI5/KYG280Q0oG0l0GvLO5sCBH3NjFyG+ou/Eg/5+0sTVfSNSdturQfszBiPnkk9aOwf/O3/FFNbEjj/IRCZSx6DXiuU7svxL3hPS2dJ4ZDQaaLww3TKekwZf/s/4IYl9OfyLlqwPoATm5ziO/cxgSwbEILF+hAOyU2xcnl38//s8q4eRewiM+c+Ka432nzKy/9PZihdLmy5plzVpvLBNl/lYvUCkcAfsu8gUtnc6PHNd2ooBcwyJvR3aZiaujnFA4HH/Pu+v7HPXpFT9t+SS0gfQ0oNF/Pvc4CrT/mLur1P+kXTLf+qtE8w6Vt9df2PBBJ2SDtYn0W6nBiT/mxYe/D/iLekKuo+UAbenOCEzeLS7+vsrzVtnDzm2cGPGOBjB2TTbeYnCC1bk6II1vd16Nzf6G2dhcnHCi81AKW0YUHtp1++338uephs69wwJVRpq/Xwao0nKl+XgfGV4DxfK5KKZbyVIK+5O7YHkBdwdqzRX9dAXc5HN+qKLaBcwB/nqeLsm1OZ5D5cpe3te/utEOK2DsdQp+U3ytRavGqxfyZM8jOlhl2zHMJEpEnkugax3Vvds8rrwP4R7+y1brprj4DR8tRLQ6mt51MTIT2/aqC/1PeeylM9ktDhtRFSSX0jSo5B+zXDIadaPuiJp8A26AAAAAAA=","k":"fit","b":"#FFFFFF","r":1},
    "laojiaji":        {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "meituan":         {"u":"data:image/webp;base64,UklGRlYFAABXRUJQVlA4IEoFAADQHQCdASpgAGAAPmEskUYkIqGhJzgM2IAMCWwAxQyKTb+h/jNzpnGnhXJW+fj9991XvZ9QHmAfpv0sPMB+0X7Se8t/lv1V9zv+Y9QD+ddRn+xnsH/t36bP7c/CN+3n7Xe1RR+Px7ymf5jOI/1z8qstN9pakP/tvof6CXo7/oe4R+s5f9Zu+ECIn3K8lwKqJ7N3ZqG3l2T1bXz7V93r/BLTTebbnsZHg87pTn/vYFHdjIeoS2dEhsOJBmH5koaJGE35c2vUk/Ys7CFS5vMNysm7WMs5DXMKGLhKxva3Ax5tYmz0VZ3tnLNEuFI7ao5uGDwT3JkxJAwAAP7/MkmxC/JZpgi3/bAljXg3wNNTn2FiZlauPEVnM7D4qldvT0NzqIEQMeJUH/D8i02pSHG+8u2sv9foog+ep2rBUFzYF4aVF0NQC3D6bC3qRjUm8/X7ItHn+7eLRzCexDo8IU8Hn4i8sfmExx8R5PHTsyX5bS2BoL0bJhJDI28qoILSGTEu+9uTgvWT7RwO7JMbF7JCSFDgHhGpFA9ub1jF4qbR/Ut8drmFHdiwjkZxVaTN4Mgn+0ECDEhKD4Pbs2YXNJJmjh7eZmvZ26SzPuzeOjUbQKd5OpIK//7GPBt0j0bdzccSh3+UXwLLwE6tZzqdhJjfrr/RW9b8dQaK4UBeD0/3xmZyVcIRxJQvQevec9DD3JDG25mNBWbilcMHfiKi0brdZseU/8UyYY+xgiPn0ZYt4eWbAZ0OH1PUFH14/Bm0Uj4MxZWT8dfnC/2uU+Ggd77Qvs9VqWla38NCvT6+2W+vajL70IXKbS9tFr/xMalELKJIMGpfO5hs7vhNCr7d8MkcOI0Vg3lCsnnriFakeJptsJwcXxh9NnNzl4afDzb6zSvcTTE0HU/SgCkqpLYSgo8z1qRfCNsSMOf+i822BkN5V29rqb7FSr36lnjNfg2Hl5gBd3/cZ03LtFjFzMLDl9nPrdBwdPM5a1Hp5khPPVI7Ej/qfYkpvd9pmjhlq+W+El7/bParP9uK0potK3Yh90veYtt6F6uZH+gvuf2W/4z8jih7Wu3fwwy9INOj8Kzb5Hj/W7HXIQ//9+txzC6CI82uXdLaXlA7TyOPGrSFkCu7OUzH5ATXkhOmrsuG7hN7IKV/XPQY3vA8j791JrCkbfh7IwCjXczdzEjrsRHKUdL41sNKEH1LoLafgQ5cr4Lb7GWsYh40mSL/ppCTpXwi0IzW28L+lHEnfcthHPueGEM9tJJNcYxmoC9pkYZ4+ZBeh96HZavFx5n5PgzBFsK9ozm10N9nosFhqKpd073MbPrX5q/UfsxOlv1ARZ6RhNiRWHENrsOzrWexUycieRgOpV/ZCGhA8AIMVTTSI8orO9C60n7261Mjew4DZ7ztldunE9jSHZMW/Zi8OQBtrs9i/e9NhDpsG6bVOoJQRhIoX0z89PXm4Uj05YuqQglLfbHzGkFr6RpNlAAeO5JQ39Bk011pr7fTzlVu5axsniHpH4yL4UPgIdxfYcBPI1p8GyLYPMb5rm6clOkcbeUQzPHMNuJ9gnR3OCo9YZ2naC/c3VP2U6vcE/qPv8kkCSEsoJkNzhfVeoaQs8ptXReC+aOQzD/UmUz33fbhZf8HAa2/MJLgqgOhONz+iXmtADhs4TBbYtTTQRpvscSJ5/LnwriOpjUAE4URuP0c+t81Heh5iNTSveYWd2d3BCJNXlj3NKxBjURzvzvHA2g1Fd8MS+8ObeMYTmhZfxxOQXOCEUpVtfuukx90m0qPebLG66TnW0f5m8EDOij7PmVxDph3AAAA","k":"fit","b":"#FFFFFF","r":1},
    "meituanbike":     {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "microsoft":       {"u":"data:image/webp;base64,UklGRuAFAABXRUJQVlA4INQFAABwIgCdASpgAGAAPmEokUWkIqGWqq20QAYEtRm/+f15/473+98if/+IFeq+pGpJ2n8keaJ4c7hfkx1I52u4L9D9xXvP9UX5h/0/uAc5fzAfrR+uXu1/4D1Hf4v1AP69/K+sA9AD9s/TN/cn4Uf3G9J3//61WwHafrw89HSH+194PwKnq62A2X9I+s6wMdg/1fMjxrWXLQirYB/tO88EzfnaefdSKtntu/ShEpOYOQGNiXIpF8JmOh+9r17lT5iW9z5fasau0f1YYW+a2HRinp7pitsqRgtLTim+fvznNe/CtlBE4SWQ/W1NzxZ9sFYmye+qvhDnhngzqS2oG8LBAKXtjaEFLOOo45QU5gjmj7CjvNhiFU27K9tgsEFgAAD+//b8N2k9T/foLNf107sL7Vq0tYoUWkD5Fgh7Mn12yqWmKwXSdDW7eflQzpU2hyv4+BJTzoUQzaeQ28xRii5Lh7ZLlTiw/T3AiM05wpJcdBTOG/TpstGD3ebtVNXTKEo76yfJ2+mR0yyz27s7tmPxllnt3cGuq20JYMpIIxZQ8LiFgebU2kWcNk7laVIXpXXCVZBmuKpOrX25Mg0J7pr5Nb7x4ykss6CMtZOtcs0WqvxaYqhzfMkV9oatTYqJytPnb3l9QqfB5xAYuY7bdcFhFtmIb5C9tKh4g4Wc6JiBQBwHcwQJKfvPAFC7PbpceZXU8e4HcKJxs04E4337JR3WN1GBZdpKNchT3LHbfVMOt603RihCiNUUMZHHpabZxgfhJzPuHjNVrpasBeHoPMVINB/8stDWbv5qkWbFJYq8FVFPsWBLON+3jjy0ec5zSPGMqrV1hPj8NnO+Ybt69DfPWj0zRwn0wC2EkbGDEIFs7UFO3RVabmvzl6vMzQe1sqPXWTL2pvLt02a5ti/OSWklZpmAdLpaIuT7vY8s5WPnmqH3OiAa1RYV9ErLkxkUpqyXYz8b1XklvnDiY0+jEhqhuxjgX1RYcd7PFtuqN7Pz6sAK9JoPZzEUNa4DohntiEPy+3c2PqE6aftth/a46QaDbimgKErIqTwMYBwGZoNtHI9YaiBLAsb3MMryE8FfQqJGVTVg37m9HR5f/+qpfm1NrJa3qNUqWI2yi7IFH/F0Dxc3ZtSGGM9vgulRlaSC7UxMK3sZVdAe72+nm98rYAzw3MMXLNiZKmCiEyGz6lAik0pCuIKuJlIRihm70GcrB0+Z2RMFNlY16Yu93Ytiob3lPbAc87xg3x5xGoV1y5ATJJNE1I/3+Q+0KTYm1ah6Y/39Q7lYapFFqwAozUzQig236EjBmwimynOXYfTzmEO8Llz73NK/xEdJHZV9I78n6mlYdz1Kc3ZJqWsG7WNoM/720LYOd7eGSgxUr/pCd0x6fgmIVM8f25p9ECQl/h4JtuQjI+di1yM7u/Qn/whb9bG2se06/+zjmt3p/muxb212WY0lPKzoeX3wFQXrdRc+iVrqDh+8K63F7ry1xWdewU0fr78rCCHZuSvV9O6GQk+u/b0sskdfFboguqsifR1O44W26/eIYQpKS+FCuCWimUeXszfg1taKLjGYk3RE0S+GZPQ6unmhTR/wp1cpVW2gfSDG2pwVCeHDkjj+VT9+WHDFn5ap8K56c+xNt0aAjzJEGlRn5hrQTNbjvWfJGL8nsXy7jRlbiLg2N2bFlWaA5UdKEI1s8Yv5MNgHbglKx0pbpQheDQAk/yiv3K04bTizLjOvAbzkkkB7DcDAgnpQOxVyQflQG0Vn2cK4vK7HVVAUsetwwa+uvpQ3is6wrOm2cXgP0RUxO8uH33X49LEnKxOmn9+TWOirgP+1Aqpf7kl2X7XxW6ILvCQw+DzWSOunDSZhby6stYkTrc8NoHmt7q4Tyl/WAisOhJLM0hueBIMhqjPuQatQAdLGujeplZ+j6In6U1JtNpaU8U8rEpc5Ad0+EnHAaWI9+mIsOKEog/SrjifdksgX0k1q5zoTSOVi6uwKSSAAAAAA","k":"fit","b":"#FFFFFF","r":1},
    "micun":           {"u":"data:image/webp;base64,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","k":"full","b":"#000000","r":1},
    "miniso":          {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "naixue":          {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "nanchengxiang":   {"u":"data:image/webp;base64,UklGRnwDAABXRUJQVlA4IHADAADQFgCdASpgAGAAPmEskkckIiGhJXgLeIAMCWMAzXzjR33PbffngPRtvKO8yZFX4v6Vv4b9EF6q5O37n+NOiZ/sOScfR/041A37S8hLGX56Ggv599gn+Uf0X/j+qr0ABUx842KLOwVFWZRK/6ZHBJuP1Wu3dkItw4JsAcmnPD5/Qfd6OJuWhm0DcvPt68DJyz9+1oE5p5RJmIibFXAla3lCKh0YqlXTRGmZ+qUx2UINCK7PtT0nzzXmCP3UI9Ty4AD+/u4/f/+mZ7FOYM6uYH7RbQSbxZumLCPwsIXC1pZDmAmWQlQhVEzOCKl+NevntC9fsVzAAFN8PHYra3clCYAUTr25rN730XvWVswQ10oVPWcRyze62Io9QTSsiwVY4p1vlw3/biYH+L4S/uwNpQHCK4x2yokCCBilBr2k/CrgxWLpj4D2VifNyeoEU9+HEjErUQNqmiwH/94MeYAR5QWRg/Jgt+fUpdOXAFxN/c1stfo5WnXo9QNQJRG5dYgA+K/5SMsgHOxtlOijBYBnspRiuh1aqUXqtNDMNK2RCboiFCzed8lwEdJbRjLDr7K+0wfM1LBtXYms+UoL3i1/bn6AfRmgZOVN6wWGkRxkFYERx/kyuQW4WZpWRfx+pKWZYxH96uaLDWqe0Ey78Z6p/3tnAXK+ViDuXM3PD32Le3ZjzrLj+m2q1GC/xsnKiD+HJMoszeteFreBtjdH1FatF15waCpZuWWLPisC7jx+azOJd11uCt8EFB1Q//IzkQRtWXjpUneu7k4EZB+/ps3fbCqGgQQ2GUc8P8Xqt39FfVPX8pKCYv+lFGXBusERDXi2OLMblU2t6B+uYtvZq9Ed2zba2/cYz2jVJg6gbwGsLbTG/v0OKAbURCuLyWPdfmuehn6L4z/Dke8BcQyxLECUMUDtZwOXoGe/D0hb78nChX/lOcfKnuRSbHutTHrPZTnCgJ7WyzV2m5/wFLU0zEf6nORsI7BRLV7aY4VuJK3iUWj+pECln3gQrabEA4o3PvHHJCHdh3Q2eUhBsbjeiayXkbGt2ezScsWVHF7H/Tn2XJtX5e3N1UfAryFzV7Y4/o8wr9pFL+gyt8jV1QoC8RrILa5kw1CIvfSV6qT3uTPSU28s+/HRZgTc8BrEE0v/xuYIxv9fmiSroZY6PT/ZZCMLwAAA","k":"fit","b":"#FFFFFF","r":1},
    "neteasemusic":    {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "pdd":             {"u":"data:image/webp;base64,UklGRqwEAABXRUJQVlA4IKAEAAAwGQCdASpgAGAAPmEulUckIqIhJzYJIIAMCWIAeWn2TkZOQvHORP8f0gOWA9SHmA/UT9o+wb6AHkq+wt+x3sAfrd6X37cfBl/eP+R6XF3YYoOPv12fkfp/HvvX9wabDtK7HeTR8s/xngM6gXSrr7B1D+Y/6flQ+eP+97g/65/8nsVLEzMzMzMsKolwWg+3KfSML8zDCZXXiGZjV3do2sGz97soc3ex67N51QxbmD27JtRn0xq9GZhPmxadsMvDGs/8VmFPiZcbgazN8whPd3d3dgAA/v3AgBaaYs+72JaeM7GF5D7aqYD5xQdVSV24SZmvh/FvDXHu7eBqlQvN45ni/0I0G84l7LJCPPDCp/+4wP2Vq6r1f8//89hneM45WvpiH4dwVsOtGo0oATmg8tB0g7X3nb654oBlEnv4t3P3bvgq/BqSN330W3/L8+9HfVQT1BN1fDZaplam8n8L0TjVlrIWjuWfc7ebGMYAdU9qCUWzrZkSSDe/wMN6rgwF+TWKFqTlu0RZgObkLb95vPXgF5N2IVOjQ4UPWSwlmUn4j51M7f5Owkni7RSQzwmCfhvdp6hCShmR6FJ2V7+Go0gCvwM3JWR/bG+fusnsFvY3zW+/5g3c1NW8KXV6B+B++wHGIN0/INI7wHJFqSSuHWCyLKoc8/eiG4hpp9XQHcpgAf+CQ7DAdgsoPK0wUSU+pvRmclfZWlfnF/XstwyXT97QDRLjbs6TgQ+vRH8UCRBmbiIx3SUSIZdMgYdE3294Do1HWT/6n5vlbgFGp5rN9YyHD4LJ6q5m2vYy08gSYyCvb8UNxU0rfR0aJKBX+ktyLsMzowYsmDh0FxuisMTzrp2pHc6N1Y0Etb3iPzGbUzYJ8S66i54EExePGOKiWo6mDM2gpGbSDHcqOkBWGT3ykI2nM6mJyHxS3vup1ynVnf3yRaDxWBUFvJ32laL4G6ebrlFjXOuq3wcL/hgt94hZi6nnaozSDBLnquT26IVCzcevo5lrc8mKhB/yKKbqHwdCwufjXd8cebwfvjiodUmMec8AxtBD3W7TeQhindbjooSn9KEZMZnxq1MdOX2Scuz72c12zyn7O8fTVhrY3boz7qRU5xQRs/l8G+OI6RAckSe7FPgdlA19oL+xovDlndRM4Q7ca16jz+52P4C7Uk94vySLfIvzLAem18tLrXnqVOuEYaGGb1x+QRg0n8htfea6JRMFAZr91AFJx7vzQdHU9zM2C5n94UQaKknQvYUAlZ2YZ4U/kecG5QeKoo6luT+eutP7eK/YOFhBArxdyk1Je293yequYcppDO4XTuJF0zlceqLhzOf49a+93q3Gs062nQtJISX1tvRo9zVO3lRrprD/aAnKUwP2wLGcwDBqGM/N7ec/RxHrQYqTUgHgB3TrWogRBoSTJORbgG2ZJ/7P3y3xUV2+g1847TeFy43X5CQqOTv9lT0MN3NTSF01A+h8Z+dRA47/z5aXeGVeXjE8Vm1zbNqmlnLf0S+LRNsw1KNMVZSkXnsmdhF1wamFzgzbLXYKjCgfsblX3Fe/Xz9gW1xdtTKOwdjBlJBuFXJ7AAAAAA==","k":"fit","b":"#FFFFFF","r":1},
    "qingju":          {"u":"data:image/webp;base64,UklGRugDAABXRUJQVlA4INwDAACQFACdASpgAGAAPmEskkakIqGhKBVbQIAMCWMA0/mrHDv63b6r1kvoAeWF7JH7ZekBSDeHEyn+6fkByZ6/m+zXL4iT4b/gHqK/3H/efbN8en95+WPsS+mf+v6of+9MABXkt3kkgE5V+59UXNwiV0qN6MWbX+ppjV1OhkelZSvVWk7W0jNkP4RLyBKATX+dAn0FkkFCBjOkdCzWt6pkdDiKcGRupVcu+LihA0mtAAD+/PQAAFZScDxDoIVan1kpvCNZAqclIEObLre8NKBuQY/ocFjb7BSgai/oMQ4qE0TGPTOgGtkk/sAy/953oQcu58zNU/yvvRxSjT8ky+3gcTmGLsAuVBRWjNt5atMLg3BfeW6JifbuN1RkY9GPQttuo6yLn2E3PuViMMBPv52z/9nlRuwB2vdvffTjIemEhr9Lk9C3cNcyuYzpF7p0g8MzuFhn/naX2rNgduYROBRpJakix70epFSR4jetwAX3CuQFLGuhU4010Z0F7RpaPVX3hPkvXJR2yUpZgYqH9/GRkG4u3uR+PbrLrejCD/DaNIRn1vhY2ja2LZDkVDnk6Kl4KW/vsV8RzP10/0b8BkRFRyko35wPM/3rm/0OmfFNktzuMM+jbpoR79b/BzaKPU478FWL/xJ5PUz/iTA1jsTlLrcHXzU+jSvgPMdD/0QBhcrziM+oR1tD5dHPm7eYE1FxPbRmfwJu/3lxEFQV/1cl0yatj5nIcxhdkE6fPkysetzsSnLquIE6QxIMLLV1myILVaVvEb3x/+PW/tH2Ym27/6W1yr7DrVw22/3D6BhKSv85n/E2A/Baj4Wxa0nRHF2Lgy6Kug9SPa3L1bz/t/OPyD2qVv96SP73OIBz/p29MEb5rBSWBiPQ7NLG1jwqSq0YiR/+jACkzMdHr4q5hUTRv48kvU3+FQjc9AiZS2l9fswaQ4jUOZ1eEbivXR/faZxpryxRSrtJtY6lppJJMDnfn/leUEhgmYr29f5/+srI5ekIVB/89Fk/D0XcjBj9tbrIvN9noP/6yIsmRmpFyzs9voEgT66//mYAiQ1rW/nRJFm5xrw3dJXnxNujeG7duGvp62vnW+SFFDm9b0uozJMeEUf2f7ExIUX/L8//+fjBVuY7S67Y3uTxnxte5Ka2U1S/L/EldtFIAWIWPhf/v7Yh+ng106NbFMkEzg6bhpIzekcHuQe73KqcL6j+OjL7D60VYitv/eYNSg7VcoHEGAcz+Chvjh/9pre/4k0kaLsLIsOLt/f/lyVTbCvf7hm3CVtjbSPnKyLl1DVjW7OFlDREc5b1pWag7JrqKCCAAAAA","k":"fit","b":"#FFFFFF","r":1},
    "rail12306":       {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "rtmart":          {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "saizeriya":       {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "shaxian":         {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "starbucks":       {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "steam":           {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "taobao":          {"u":"data:image/webp;base64,UklGRkwFAABXRUJQVlA4IEAFAADQGACdASpgAGAAPmEukEWkIqOTnv7YQAYEtgBi4BWUd+MHPtDM+7Pq/631JeBz1M/MB5vPoI6ID1DfQA8uT2M/7R/3Jr5BV7WyIbkg7m/5DyWbsXh3gufU+7y1HVUozHx6fVPsFmba6QPu5JIrptp/pBJqTK1B75V+Bn4T+hEwG+9y33OH0E4aTGj+/NF5yRjW1AQhg/xbWtr6vIxT2p6gC0iiYqrzVj8WiRHL3mPptm9bNhz3BXg8NMr4ciNr0AhXOg2fpR2DRzdRSGFSuYAA/v9dC3K5rui52nufEytbflkCulvb/+d/ZXcx3m65N1//BqnTkT3p6NCIBwW7Hg9jVW2pVdcXvKcfCvDfKRIn8kgZ3kRFTqbnFCwUGX+pwSy/DxnUIqtDxtQDlw1Z3P3LR/B9Bu0AuPNcmTn6JrHIZI6BD/2epHmLxjooHAz9Fk0SSjZgnpQ6vCvLs+awHYbbcIzSB/yqJ+x+/4Ezjn41IQ4R/orPOU+GKbgykvu/8BA8E5FI8rQwRjNgXCx2W1fCcysyY7TkD5P9nUvpRvei0qPmKswYvQxwfky6YQJKUIq3QIElnFvEOXLKLw+DZ8d+2tChhG8u1VPGeJKc+xDRP1XUze+AS5zZ23uFhWzWaP4Owh3hcLLwgjku1od/ouAj5FDvzGLSiOLYd5PaNJh649T0S2JpQ9qgKE6qw9AouRVXYg8mn3sklOuRuExw4vSKilMc4A0BeySJGP2iqLOSeFWfc98BsG1sbhGanypCsFdcJAx0N/39DRDz1hGTEHCHpsnJoyvXPJJplqdDoIywPbpxnu+uY9l6l/rp+/gqBjKn6gcZqcv1Q4jdNk8BsUwZkZzu2c7/YUoBfdbs3xIDgkHuEJoZdj5GG4u8GeW29ovC+kkTTOPAoe5HjZ8ZqGVtLeW7jCYD2UrHk4QkJub/ki1dQ+weOlCCR7hjNl0VBHKeTL82raRd/P/O7NpUzcvro/GGQx7+q0xDknDB9BUtvij3GJxLKIRtnzjtW4lIsqCAFTsmrsJ7k5UKD5qlO9HfcUt3vK/C2a05r+X7U991YMY+rX/JDlVOE02S/QAtmg/f0C3GGwiiOy3dwNNtEe20CNYeT3ez8lBxJG6J7fZx3vLGHrm+UAq4t5YEXQ6kLwDzYbeHjzrup2dgQpPF6QaVdcFWb2EZW/+EDCg6dd+bdQwQ0N8cFQ9KpxuUp4d1TeQadtfsSR7ZnRHGNuKjAToYaJlZKHVMAn+dfef0+d7gkS09N40EX88HooVoq1M3DFJk3YYpfEb/EMb5C7arFfnO7JknMwi/T3N8FtXhpyfTHWmKALREsL2lQQwCKRYojZZ5t19CWuwfjTd+9sXiu5YzC9MCIt8KY57oEhqbo5ckFeLF80oOqbrIuC7H5bNweImG0bHeW46PK5TWjzwh8nHm4WBNheJt47cCS/5w9qKd4kP5AIKtZcvt1VaIphrxh+vbHRjaAtef1aPo057M5xJ+pjWJw4rUZOUE8/zKpXhd+zgmiUu1QPQ3flFyz+9+mxsTd2TxMODgjGR7z2PNhIhKLt89S/JNxFkf6T9MYvdI+ibeZijOjM+vtY+vdLGc23RtOrEbr+Z5N2aSaUh0zpR1j57PBzopAXkjD2JzFzYInQhg03PSUw1VT+W2+WjXuBnqvzlyPW82XtKsoj8Z1g0sb5bg1GSdUYlfd0um4Dzz8Fj/JjA7htxW+KGvWKVuoxDiGOh+QXulPQkXm+5E6vk2gCYGH6W9hXBQ+xtvroHc7W4QPzKmrdyscJUAPl0QAAA=","k":"fit","b":"#FFFFFF","r":1},
    "tmall":           {"u":"data:image/webp;base64,UklGRvADAABXRUJQVlA4IOQDAACQFgCdASpgAGAAPmEokkYkIiGhKPM8SIAMCWJEdyEF9z+S/kBtLsB8le2W8wGOgbyj+0H7HYhhn8fsvlEPvXCvsAb/Rj//W/kBzAdxN/qOOnmO/1Xz8c7P0x+vfwEfyj+nnEtBB+H7S2C4nWMfkp04V22I+zYTX8ZNo6O0MeK2DRh/oDE+Dnh1dOjbnlf8OBGJHAht7xegL/19J2Q3b7G9KlHWww2X2sokl7gLaqX52530cXatPfEB/lNBJ4gA/vz0AAiv9uvvXWEjmAptv28icqfmv/rX3kevSMIcJgZ+AUtD+eJwiv/9tRQqJt8EHr0BuzX7viy7/6GQq3WY0lrej/fT8gSP8qiboo3h3uWc2E9Wg33RB/9YNNmu7DD2FJVbXMOb33fkXbMn9j2Lu2ccGx3LC8DnQYXsSDvcGfxmAiOj0oECZv2E/Xq+1OvmxFF/H6q/Vt6J4yPk3qzBEcLtWmXWli5HTtoAF9TgG+IXSyV9iHmVe/XI1JnE9mHqdGWO+7DcLe7MnLpv8uVM811Bezq8Vr9ojAIzEu0Zbys8VxoGL5vm6X8JQithgN7obq+z+Ir/T32ZdR8qEAZcea5KpSwaeneRs/g25KqTdFowFW93Dg/Wtow42mJDF2fOBeVE09mueLSOHAyOgmZ9QEunIR788/tThI4XRMhfZm0Qs+eUnn7kqu8FKlpr1funYvLOyUUOQdZYrBOmRAiR9K8a/EVNvowBNySfqseGpAn2XMG09/zUfuvaN/6crzGNjtF0hDvBBu/nqN9/xgbrAa+GxJuZi5pRHm8fwGkGP5ir31FHsxp+cB1K0Ni5c+Fs8QA+n+Ni/6v27GNnec1JGx8ePiHbr1unov+vMtjODPZhr/fX0+a3rXilUE7jDy9n9foLbBI6pv7IBaFWe9N6g5OkR7wnl1NgWkrHfgVA6x9KmRbpz/4RvNGOExTite2Oi+X0fH8GHpFksH8jPBsdcXnK05PgAmwi15yViYkTGd8INeVCCZvkFGnVgzJlekPuQRA9pIbQIudFj+qj//0goduFpHnLYBRU//BpuP+1re+lHF6dbWtYNKd+DkxSambfY5MQ+i2Tn5zLYewCvhihp931YzQ8TdbnwIkbWsO6gobuAYX6fGkssV/nFt308lA7DUHzFiE80OVYTGi3HzSUR3/wF2Ub8tP/BZA5aCKEYBOsUlj2kddRtdiZB5ifAvl0Pf2F/TRtTZuVt82S1M83CCUbuSC9csxC7xGYP4V53nmHBcr5EzDbW+CCrvWlfFn5hJIuvGFJrDWro7O3VakbEkXLPv6g+Xvt/d6Pw5h/cT8GwAAAAAA=","k":"fit","b":"#FFFFFF","r":1},
    "unionpay":        {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "uniqlo":          {"u":"data:image/webp;base64,UklGRrgFAABXRUJQVlA4IKwFAAAQHwCdASpgAGAAPmEsk0akIqGhKPgI6IAMCWwAzjUAOo+3x5n8Secl4W8P84fSHk+cof537gPfT6gPuK9wD+5fzLpE+YD9hP2q90f/Gf7z+3e7X9e/1d/t3yAfrJ1qv7Y+wt+yfpw/rh8J/7ifs77Teapf1rUhHmftz+jzj262cm4QO8vxCBmDRn+W/6VDSAVj1efE+dhdUpqWe14z62riIXSXhlUJb9rHF/XSBQh7gT71WzutBQ4itVwq5QpwxpGYMZ136+HlJpxDbc5SUHnQH7SvXfhM95Rk8Q5fDVYyJx/y9aoq3YYSwEBjyukxDdvuvW9xU6x2McS4QNnoKjyIAAD+9AkN839OaiY/g9dRUV8mEoj/lEEs/9HnieGpcQnlxrHwGU+UH5/Ex8ZM6wRfydrI/L6GMbjRf6caexDAoPgJ2krJJvaulHO3XtbQNJO6c1ip6Q6ipL0xphW5yQFV8Jzp+D5X/CU8GbT0vzpgverKwxmgf6ErXGbCf4252+Uy/3i/P/SMSHxByt1rKEG/1BPmNzjMtm2S0M7OrFRtSu8F28t7+qNX3v4OJn68QiVlXyryidRlcDKCLV4eNFJh/5UIR3AoHQ6NZzd8rfqWfzkGnWXWXS48z8WxSsrqeGBXMhIiev4GQxloVJw4Z6ow4ozWsIhe9oLzJSi4yr7HsUmKHiRc6OHh1B1fZa/k6VvomN451eus9iOqqsPTTdFqhBanYrC33SMBSx6Szyi569mV1RxE/QUUFNzIvOuRg5/fReyd5ujamDS1AlynvrqQxJJaATr/IyqjTekCk/RnVYCsdNxy4IfjAH1MpinRMIhMDL+nmFGu9hf2fbY1ZCcds5JnPPvMcgiopKWunUf/56hWTbi9Zs/Rx5Cye472BBEeMUw+bYIowpWddlxDJUR9OEVdWTS/50cUd31B3r68wY/8PLqjgCWep9DB3rnsDkrU/RrN/ocb9T5qkWMthNMluQj8s0+DhE4Jvezbmz0xapLNUdE03Fl9Q/HdKZbuHb9m+J187xp8pD++nrOmQ5vUXSQzKP2/OVaVumc1MkZ3Mt8PjtdVPUWQa/SkAzOIsV5p8yX6WTWXbETjP3b4BXz3hEi6dRs7olxOfA9yz4f2Fi3Xe2y5BHDqtXZZ82KC5PKR3RKuNQAZgDBqVvF3TF5z65U7/avKFkYNkHjj0KgwSdq3uUBB0Vh/d9DlC1T+AXhUgWSdZMWstWON0yVr8Kjp2kH/2DuMouLheHR8hvc//BgjDitFKFhxIb6JPRaeR/+xrPRw5LmP8LAPAdKdTr5zSnYKvI+/Frhj8bFZtnTnzvpYZmP4sdFAgIKzLoNLt6Zd5GaRjVvZHTtEawTQfaqRtqGljo/nrLXnBTVT1sxh7SNT/sZlVJd5RARH0gqSdTo0gn++QGAx7Mp6v082AS9SVVVN6AyljWULmWHaHHVb9vXXVhx7J7FKHlUsF3Yrt0bJkU+VyaMlIt6A/vE//VaEdP0XIE9nG88L8sAJBZcuIMEhqv6Jw6R5ig7jRfFxAcm7j8WQFm7Vs3Q76k5kMTWipfkbofPFm7Idzh4jzD9L71Bi1MrK089dvIRuJxW79aoAwGnaVnWLfbU+D1C3OS2hYpehq+w/VsKigooHCKeCe6GssHF6C4mFhpAQD0+gs1b87VMX7J6/1+fGu1gUcK76oLDkV3tws6QdPRsXz2OWVnd40Ugred5B9VGPDi4nPcIn22zJsc/lAy4FKDoO+aCHuL8gLWXZoqoNLDb4KeuVpmVjfHVT7kswW2IRaYv8ZoauH/ZMGYpyb3xX8falcej8gw/QXDo+PjQl255FzpgWHzBXht1+pmRwxRomnpCpo8ILpbxdan3pjad1RwGQ/J+rzA06MvdUOgt0mNpRpOfGs6sMv4m+8RTIho4oTCjVqI+Nn51B3XwSdpiAAAA=","k":"fit","b":"#FFFFFF","r":1},
    "vipshop":         {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "vqqvideo":        {"u":"data:image/webp;base64,UklGRsYEAABXRUJQVlA4ILoEAADQGwCdASpgAGAAPmEokEWkIqGXHAVkQAYEtgBofdi+L83ep/0b77/jt1N0Z+ax41+nf6/7tO0B5hH6Qf4/+ufuN2jPMB/Jv8P+3XtJfpX7zP1m9gD/B9QR6AH6genD7F/7W/uD7OWajvu1cXGk63U2dqauwhK6CcinP5nI/o2aOlY0ZmtVVQ/13obPCPf+gVWHr3hNeInVCRAVfVQgCK0imQ8OXSlZJNWngu+pI4wW+wVmYwqFlVGnY6Lv2+1Ctvpr+mIDhgOmMjOKqQHrZSf/hEG7Z2fJ7H26vQ5Gl+EdhSSO2JYmCAAA/v12cW0KrdUHmou7CX0Tb0ffVcBdkEO2u39t0qKBgv8z/Ssm240GrwqGDgbS/6nFZStj94SSEb/wfOYy2Bdl2PoElekEEgeaiGaHRUpb0hLToyxGdfENV2zH0l/Q9VaOLk+tG6gQsUn/+f4kDrowWWYWny5wFjNP5O8LwH/9h/5cT0wW53sNI7XitB6QCsnPfVZINZ0PI3RO+4isKUw5koA5MpuQt/owEeUYYUkldBO/Ch+RrOSuZgJpnCsFZ1m/GmisZqol2oqLpIsuP8Js2ujmpNS9zNPIqVeRk91JtUQe/8ciZnZkysAAtdzbOAAGTcDc9C6D9kD3O8zlO/SzmGTxcILbW6FC4dRpod7m4RdjHL6TiZVUvli9gW/BKFwVOVPI5fgtO2iKTeo9r0xz8j6fwhHHfmbmmVhGyl7aiGY3nijz2WOFUoS6Gmd2OQw4ryu4JN3fzuwCgSiszsswz4bGY5wJNgigCupLn8ReUqfYMI3zG9o+7n78S5KmuPa7h5hpHf+M49R0famlk4QTiQsW1ME3FD6h5w0fvIpP5XJNyER1vRZd/yDedue+RlRb+YNeN6XJ4vIUeYu24pxUvN+ajhOl7sFZ7b6OPmavmAL/ngjp2ZIhUDN2mfYN0Nr6NN4YB4p8Z8hAw/saplQdQjuaam/0ZnmA6cuZG/bZ/7sJm/JckzPV/O5U/UNYvs/dDHv7yITyMSxfezwRor8UbmEW4Q/LVuwtOTTBGqYcK356jfYYAfXi84kdGE0m3kVpSdZ/mBtFQJiBHUiRdttuIh4Jm0Y5tom8pJSiw9pt9opgmKg150gTIOxMlBj2QOnmOv8TRf+K/v9tIVTAPOIi7m848kAy25kMyBlhS75bVytTiZCEWF3JYko90pWiQouSe8WM4sgP07L+JsU536bnzmXUIRm2PGhJ6yxz88fFdbs3GbfhDlMVgiZHv/pd+JUAVlx0tXooWdhl06QWL+4/bv8Z0Oa5HrTNUezCQflH1GcSwv7sp7VJ4AT113h+anhhy/Bk9+noPaqO152aEzlCdypsUREQBb8chttZpA092oK001/yRCAf7acpA5uvOSp6ZiEsBCvtuZgiU+0bvlhFE6Om9d5+leJVXE6QO6BrkfiqoKZu8Uq8khRBWXrKdf4q7AVoaFH8jYZZdjdqX7TDuJnka74+qvgq+8Bp6MegEAt7tiQNb8dD/aMo8yWa9fOiCHK0EagxVM77O1nJPPjju0TB3wbVOOU/r/UnDB3SCVgIYEko1gK3zIaFMkGIQ4epQahQVQfNDAKxFsgG0CwAAAAA","k":"fit","b":"#FFFFFF","r":1},
    "xiangcunji":      {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "xianyu":          {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "xiaohongshu":     {"u":"data:image/webp;base64,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","k":"fit","b":"#FFFFFF","r":1},
    "zhengxin":        {"u":"data:image/webp;base64,UklGRuAEAABXRUJQVlA4INQEAADwGgCdASpgAGAAPmEokUYkIiGhJzgMSIAMCWwA013afqv4V7LZ0f8T+aJ4xMbuwH8l6DvUB9sHqk9JbzEfsB+xHvVehT9YP1N+ADpAP1d9gDy1v25+C/9n/SZ//+tjsF5x7xj7FZPKME2S+TD/Fb09kTiA0gU6X/D+Lv6F/8XuFfyz+r760eMukv3Y2EX4GfXOcGMSIHezmz6FdMHw3GYEsiIw8AuDUtf7rwqm25kh6H4y1vPSIA4Ta5ZgS2cACv9DJ0+CV9Txo2SxSII+uOHne0Lp/+UU6rGK8csdiFuvQAD+/TnQD1/jmf/0sP7idP9XTysakFn+Ws7OPejBP4hVszixf5VOdl+Ctl/3/r+kwXRXAqHu7sZJK+HDP/o3A/yLHDmkuqzVD6vwspxcAzrG0OS46EtnJiOC3jZ2GP5AT+XbF1vdxfdPm7hhnj+Ipg0h+KRfVw+eV7GfLIGcJQ3as/YE/Upa6nLkdtcUWGtTJgt68JM2VAAAlnkoeCR0FVzupFRDvmXD62vV1BP6L1YnKHolp4lju79Pns2GzqowrkR3qhOSnq7wbDKyC+lHP7EIrAK3PBJ3ir177OIsVKdOWx+L6A2CWc8B8Yu3Us3M00nHptkezKVtV3j8il1Bo7frG9RkvK3YdEOr/RjD6G60SFa3Dyyd6ayejcP//8haVPw87LyAudwzYcybRbzR5YhzNyOMpsL7EH/quiU/zHdqDlV57TD+JX71Kbr0aW9KMKQZBGSp5ETKa5VQFGSf52x/3cF9WevUfASsxTzqn5I7PB014csvtyKkLMLM5js43AMfg2UpKWKS34paVt0knn61yn8xFUv3CLSrv+k0Ux1b3u7M4xcjlCEW3byPVoIRib//FSGvNMMpZj/ceK0dcP8jlCErjQ4YsY+Qafiac+WXIPxMtcQGJYXTv+vM4i544rL/8l42af/eUswq26kRPWlD0wP4F3nNFD//iZQ0zq0ECNR7fmcLsqcuy0jdg5Q1Cf0edCrCZpVIN/vcm2+DlZ3Puf0rx1ZyNy4MkPR7vji6d2ts2+Vq2LcXDrHpFOWOAbuai6VgDNAI08D8Dv/CIyFnAnhn8Lg/EPNWG98p9Wras54TFxCTpRpYUMPBh9WrZjG/+Yw2RPmNycuaKh8s1/jUn4uEn9jvkLKynGxlTcKSLJVbKx/ARYH3F9BunQRQelEfdf4Ae8+vRmrw4cMTwlUF6gWp8g+vJ8WONCBlIsihAyjL23DGd2Dliem0FfWQe93qTdp6f9i9g/hzFhqUfW7xRIs335DzCgc34ctM/nmSv8wXbOF4FqyM72LJua2UnGvdcdtoZd/ziI2pHB7Peci/yzOo8pOHuK1CGtH5eDCHqwtGo6i1uiW7b/qxPmJBlF4No5lYl/Uz/+/v8axifgrG7h7FjcUBAb10jg1nY97jWw26Xc2t5eBYE2HOMXj3X85FtFuAr92BNRJD9/uAYHEIPm8el8i8me7GY+LqNqrR9rx95v729D01Q+cSfvffituv/VGJApMqkpG3Z1zMiadqkYpS6vDso/aUkA+KoSOYvqjmzJkKSet3nM4INZxJeDlOh/VEAVEu2Uz3p/kzR0knFiVMe+PVpOIbrKu1uxk6HAPBSz07eyBRfpA19A0efQAAAAA=","k":"fit","b":"#FFFFFF","r":1},
  };
  /* <<< LOGOS */

  var BRANDS = {
    'kfc':          { char: '肯', bg: '#E2231A24', ink: '#8A120F', mark: 'M21.893 8.23c-4.187.001-5.249 2.365-5.42 3.97-.194 1.802 1.053 3.57 4.127 3.57 1.294 0 2.14-.225 2.44-.32a.215.215 0 00.147-.166l.173-.91a.184.184 0 00-.236-.21c-.336.106-.93.252-1.685.252-1.469 0-2.53-.882-2.395-2.4.13-1.47 1.121-2.59 2.485-2.59.82 0 1.183.43 1.156 1.003v.033a.184.184 0 00.182.193h.557c.086 0 .16-.06.18-.143l.39-1.76a.215.215 0 00-.15-.255 7.21 7.21 0 00-1.95-.266zm-20.157.116a.2.2 0 00-.195.156l-.108.484a.198.198 0 00.13.23l.033.01c.208.082.45.266.348.748l-.792 3.62c-.207.987-.542 1.19-.86 1.226h-.01a.2.2 0 00-.176.157l-.102.464a.192.192 0 00.187.233h3.487c.085 0 .159-.06.177-.142l.12-.543a.184.184 0 00-.112-.21l-.022-.01c-.177-.07-.418-.224-.356-.51l.405-1.85c1.389 2.535 1.848 3.266 3.514 3.265H8.91a.181.181 0 00.177-.142l.105-.47a.195.195 0 00-.186-.238c-.376-.006-.56-.093-.935-.575l-1.932-2.614 2.51-2.088c.337-.264.748-.338.976-.368l.022-.002a.185.185 0 00.163-.144l.103-.464a.184.184 0 00-.18-.223h-3.02a.199.199 0 00-.193.155l-.102.46a.2.2 0 00.138.235c.178.069.217.24.063.366L4.046 11.7l.44-2.014a.683.683 0 01.477-.487l.025-.008a.199.199 0 00.135-.147l.106-.477a.181.181 0 00-.177-.22zm8.88 0a.2.2 0 00-.194.156l-.107.483a.19.19 0 00.122.221l.02.008c.204.077.487.274.364.758l-1.21 5.48a.182.182 0 00.178.222h2.777c.086 0 .16-.06.179-.143l.12-.547a.174.174 0 00-.098-.196 1.558 1.558 0 01-.027-.013c-.176-.086-.438-.285-.35-.67.009-.05.27-1.24.27-1.24h2.362c.086 0 .16-.06.18-.143l.221-1a.183.183 0 00-.18-.224h-2.28l.427-1.94 1.592-.003c.515 0 .672.27.642.728l-.002.024a.184.184 0 00.183.205h.587c.086 0 .16-.06.178-.144l.4-1.8a.184.184 0 00-.18-.222z' },
    'mcd':          { char: '麦', bg: '#DA291C24', ink: '#8A160E', mark: 'M17.243 3.006c2.066 0 3.742 8.714 3.742 19.478H24c0-11.588-3.042-20.968-6.766-20.968-2.127 0-4.007 2.81-5.248 7.227-1.241-4.416-3.121-7.227-5.231-7.227C3.031 1.516 0 10.888 0 22.476h3.014c0-10.763 1.658-19.47 3.724-19.47 2.066 0 3.741 8.05 3.741 17.98h2.997c0-9.93 1.684-17.98 3.75-17.98Z' },
    'mcd-member':   { char: '麦', bg: '#DA291C24', ink: '#8A160E' },
    'luckin':       { char: '瑞', bg: '#002D7224', ink: '#001A45' },
    'dominos-mon':  { char: '达', bg: '#00649124', ink: '#003D5C' },
    'dominos-wed':  { char: '达', bg: '#00649124', ink: '#003D5C' },
    'tastien':      { char: '塔', bg: '#D7282F24', ink: '#7E1419' },
    'heytea-topping': { char: '喜', bg: '#0C8A4E24', ink: '#064B2A' },
    'pizza':        { char: '必', bg: '#D8232A24', ink: '#7E1419' },
    'mixue':        { char: '蜜', bg: '#E6001224', ink: '#7E1419' },
    'chabaidao-up': { char: '茶', bg: '#1AAD1924', ink: '#0E5E0E' },
    'chabaidao-88': { char: '茶', bg: '#1AAD1924', ink: '#0E5E0E' },
    'wallace':      { char: '华', bg: '#E2231A24', ink: '#8A120F' },
    'guming':       { char: '古', bg: '#0E7A3B24', ink: '#064B2A' },
    'yihetang':     { char: '益', bg: '#C8102E24', ink: '#6E0A19' },
    'haoxianglai':  { char: '好', bg: '#F0830024', ink: '#8A4A00' },
    'dicos':        { char: '德', bg: '#E2231A24', ink: '#8A120F' },
    'haidilao':     { char: '海', bg: '#C8102E24', ink: '#6E0A19' },
    'zym':          { char: '赵', bg: '#E6001224', ink: '#7E1419' },
    'zunte':        { char: '尊', bg: '#2B6CB024', ink: '#173E66' },
    'convenience':  { char: '便', bg: '#4755692E', ink: '#1E293B' },
    'runtop':       { char: '润', bg: '#2563EB24', ink: '#173E66' },
    'dormstore':    { char: '宿', bg: '#4755692E', ink: '#1E293B' },
    'cotti':           { char: '库', bg: '#A01C3424', ink: '#6B0E20' },
    'coco':            { char: 'Co', bg: '#6B3E1E24', ink: '#43260F' },
    'alibaba1688':     { char: '1', bg: '#FFFFFF24', ink: '#575757' },
    'alipay':          { char: '支', bg: '#FFFFFF24', ink: '#575757' },
    'amap':            { char: '高', bg: '#0091FF24', ink: '#00508C' },
    'apple':           { char: '苹', bg: '#1F1F2324', ink: '#111113' },
    'bilibili':        { char: 'B', bg: '#00AEEC24', ink: '#006082' },
    'burgerking':      { char: '汉', bg: '#FF00FF24', ink: '#8C008C' },
    'cainiao':         { char: '菜', bg: '#FFFFFF24', ink: '#575757' },
    'chagee':          { char: '霸', bg: '#FFFFFF24', ink: '#575757' },
    'chinaums':        { char: '银', bg: '#0A4B9C', ink: '#083566' },
    'cnki':            { char: '知', bg: '#0B4C8C', ink: '#0A3A66' },
    'dewu':            { char: '得', bg: '#11111124', ink: '#090909' },
    'dianping':        { char: '大', bg: '#FF663324', ink: '#A82A00' },
    'didi':            { char: '滴', bg: '#FFFFFF24', ink: '#575757' },
    'douyin':          { char: '抖', bg: '#11111124', ink: '#090909' },
    'eleme':           { char: '饿', bg: '#0095FF24', ink: '#00528C' },
    'haotemai':        { char: '好', bg: '#FFFFFF24', ink: '#575757' },
    'hellobike':       { char: '哈', bg: '#00B0F0', ink: '#0079A8' },
    'hushang':         { char: '沪', bg: '#E8324C24', ink: '#8B1021' },
    'iqiyi':           { char: '爱', bg: '#00BE0624', ink: '#006903' },
    'jd':              { char: '京', bg: '#E1251B', ink: '#8E1A14' },
    'juewei':          { char: '绝', bg: '#B5120524', ink: '#640A03' },
    'lanzhou':         { char: '兰', bg: '#00FFFF24', ink: '#008C8C' },
    'laojiaji':        { char: '老', bg: '#FFFFFF24', ink: '#575757' },
    'meituan':         { char: '美', bg: '#FFC30024', ink: '#8C6B00' },
    'meituanbike':     { char: '美', bg: '#FFD10024', ink: '#8C7300' },
    'microsoft':       { char: '微', bg: '#FFFFFF24', ink: '#575757' },
    'micun':           { char: '米', bg: '#FF00FF24', ink: '#8C008C' },
    'miniso':          { char: '名', bg: '#F3000F24', ink: '#860008' },
    'naixue':          { char: '奈', bg: '#FFFFFF24', ink: '#575757' },
    'nanchengxiang':   { char: '南', bg: '#C8102E24', ink: '#6E0919' },
    'neteasemusic':    { char: '网', bg: '#C20C0C24', ink: '#6B0707' },
    'pdd':             { char: '拼', bg: '#FFFFFF24', ink: '#575757' },
    'qingju':          { char: '青', bg: '#00B2A924', ink: '#00625D' },
    'rail12306':       { char: '1', bg: '#0B4C8C24', ink: '#062A4D' },
    'rtmart':          { char: '大', bg: '#FF00FF24', ink: '#8C008C' },
    'saizeriya':       { char: '萨', bg: '#00840024', ink: '#004900' },
    'shaxian':         { char: '沙', bg: '#00994624', ink: '#005427' },
    'starbucks':       { char: '星', bg: '#00FFFF24', ink: '#008C8C' },
    'steam':           { char: 'S', bg: '#1B283824', ink: '#0F161F' },
    'taobao':          { char: '淘', bg: '#FF500024', ink: '#8C2C00' },
    'tmall':           { char: '天', bg: '#FFFFFF24', ink: '#575757' },
    'unionpay':        { char: '云', bg: '#FFFFFF24', ink: '#575757' },
    'uniqlo':          { char: '优', bg: '#F7192524', ink: '#91050D' },
    'vipshop':         { char: '唯', bg: '#E6008024', ink: '#7F0046' },
    'vqqvideo':        { char: '腾', bg: '#FFFFFF24', ink: '#575757' },
    'walmart':         { char: '沃', bg: '#0071CE', ink: '#00548F' },
    'wechat':          { char: '微', bg: '#07C160', ink: '#05683C' },
    'xiangcunji':      { char: '乡', bg: '#00FFFF24', ink: '#008C8C' },
    'xianyu':          { char: '闲', bg: '#FFFFFF24', ink: '#575757' },
    'xiaohongshu':     { char: '小', bg: '#FF000024', ink: '#8C0000' },
    'zhengxin':        { char: '正', bg: '#FFFFFF24', ink: '#575757' },
  };

  /* >>> BRAND_NAMES —— 中文品牌名 → logo key 反查表；由 _brand/apply_layer3_logos.py 生成，勿手改 */
  /* 长名优先匹配：「美团单车」必须先于「美团」命中 */
  var BRAND_NAMES = {
    '宿舍楼下小卖部': 'dormstore',
    'CoCo都可': 'coco',
    '12306': 'rail12306',
    'Steam': 'steam',
    '校内便利店': 'convenience',
    '1688': 'alibaba1688',
    'CoCo': 'coco',
    '兰州拉面': 'lanzhou',
    '名创优品': 'miniso',
    '大众点评': 'dianping',
    '尊特优选': 'zunte',
    '正新鸡排': 'zhengxin',
    '沪上阿姨': 'hushang',
    '润泰超市': 'runtop',
    '米村拌饭': 'micun',
    '美团单车': 'meituanbike',
    '腾讯视频': 'vqqvideo',
    '蜜雪冰城': 'mixue',
    '霸王茶姬': 'chagee',
    'KFC': 'kfc',
    '乡村基': 'xiangcunji',
    '云闪付': 'unionpay',
    '优衣库': 'uniqlo',
    '华莱士': 'wallace',
    '南城香': 'nanchengxiang',
    '唯品会': 'vipshop',
    '塔斯汀': 'tastien',
    '大润发': 'rtmart',
    '好想来': 'haoxianglai',
    '好特卖': 'haotemai',
    '小红书': 'xiaohongshu',
    '德克士': 'dicos',
    '必胜客': 'pizza',
    '拼多多': 'pdd',
    '支付宝': 'alipay',
    '星巴克': 'starbucks',
    '汉堡王': 'burgerking',
    '沃尔玛': 'walmart',
    '海底捞': 'haidilao',
    '爱奇艺': 'iqiyi',
    '益禾堂': 'yihetang',
    '网易云': 'neteasemusic',
    '老乡鸡': 'laojiaji',
    '肯德基': 'kfc',
    '茶百道': 'chabaidao-up',
    '萨莉亚': 'saizeriya',
    '赵一鸣': 'zym',
    '达美乐': 'dominos-mon',
    '金拱门': 'mcd',
    '饿了么': 'eleme',
    '麦当劳': 'mcd',
    'B站': 'bilibili',
    '京东': 'jd',
    '古茗': 'guming',
    '哈啰': 'hellobike',
    '喜茶': 'heytea-topping',
    '天猫': 'tmall',
    '奈雪': 'naixue',
    '库迪': 'cotti',
    '得物': 'dewu',
    '微信': 'wechat',
    '微软': 'microsoft',
    '抖音': 'douyin',
    '沙县': 'shaxian',
    '淘宝': 'taobao',
    '滴滴': 'didi',
    '瑞幸': 'luckin',
    '知网': 'cnki',
    '绝味': 'juewei',
    '美团': 'meituan',
    '苹果': 'apple',
    '菜鸟': 'cainiao',
    '蜜雪': 'mixue',
    '银联': 'chinaums',
    '闲鱼': 'xianyu',
    '青桔': 'qingju',
    '高德': 'amap',
  };
  /* <<< BRAND_NAMES */

  /** 渲染一个品牌瓦片：真实 logo > 内置图标 > 品牌色字母章（最多三级回落） */
  function brandTile(id, size) {
    var b = BRANDS[id];
    var L = LOGOS[id];
    if (!b && !L) { return ''; }
    /* size: 'md' 24px（活动行首） / 'sm' 20px（胶囊、日历芯片） / true 兼容旧调用 = sm / 省略 = 30px */
    var sz = (size === 'md' || size === 'sm') ? ' ' + size : (size === true ? ' sm' : '');
    /* kind=full 的 logo 自带品牌色实底：瓦片底色直接用图自身边色并贴边，
       这样非正方形的实底图标（库迪、蜜雪）等比缩放后也不会露出白缝 */
    var cls = 'brand-tile' + sz + (L ? ' has-logo' : '') +
      (L && L.k === 'full' ? ' bt-full' : '');
    var style = '--bc:' + (L ? L.b : b.bg) + ';--bi:' + (b ? b.ink : '#374151');
    var inner;
    if (L) {
      inner = '<img class="bt-logo" src="' + L.u + '" alt="" aria-hidden="true" decoding="async">';
    } else if (b.mark) {
      inner = '<svg class="bt-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="' + b.mark + '"></path></svg>';
    } else {
      inner = esc(b.char);
    }
    return '<span class="' + cls + '" style="' + style + '">' + inner + '</span>';
  }

  /** 条目图标：有品牌瓦片就用品牌瓦片（真实 logo / 字母章），否则退回 emoji / 线性 svg */
  function itemIcon(it, cls) {
    if (it && (BRANDS[it.id] || LOGOS[it.id])) { return brandTile(it.id, cls === 'sm'); }
    return it && it.icon ? dlIcon(it.icon, null, null) : esc(it && it.emoji ? it.emoji : '');
  }

  function weekdayCn(d) { return WEEK_CN[toDate(d).getDay()]; }

  /* ================================================================== */
  /* 四、活动计算                                                        */
  /* ================================================================== */

  function merchantById(id) {
    for (var i = 0; i < MERCHANTS.length; i++) {
      if (MERCHANTS[i].id === id) { return MERCHANTS[i]; }
    }
    return null;
  }

  /** 某个商家活动是否落在这一天 */
  function matchRule(m, d) {
    var r = m.rule || {};
    if (r.type === 'always') { return true; }
    if (r.type === 'weekly') {
      if (Array.isArray(r.weekday)) { return r.weekday.indexOf(isoWeekday(d)) !== -1; }
      return isoWeekday(d) === r.weekday;
    }
    if (r.type === 'monthly') { return toDate(d).getDate() === r.day; }
    return false;
  }

  /** 下一次（含今天）命中该活动的日期 */
  function nextOf(merchantId, from) {
    var m = merchantById(merchantId);
    if (!m) { return null; }
    var start = toDate(from || new Date());
    if (m.rule.type === 'always') { return start; }
    for (var i = 0; i < 400; i++) {
      var d = addDays(start, i);
      if (matchRule(m, d)) { return d; }
    }
    return null;
  }

  /** 最近一场大促：{promo, date, days, warming} */
  function nextPromo(from) {
    var start = toDate(from || new Date());
    var best = null;
    for (var y = start.getFullYear(); y <= start.getFullYear() + 1; y++) {
      for (var i = 0; i < PROMOS.length; i++) {
        var p = PROMOS[i];
        var dt = new Date(y, p.month - 1, p.day);
        var d = daysBetween(start, dt);
        if (d < 0) { continue; }
        if (!best || d < best.days) {
          best = { promo: p, date: dt, days: d, warming: d <= p.warmup };
        }
      }
    }
    return best;
  }

  /** 当天活动列表：[{type:'weekly'|'monthly'|'always'|'promo', merchant?, promo?, title, ...}] */
  function dealsOn(date) {
    var d = toDate(date);
    var out = [];
    var i;
    for (i = 0; i < MERCHANTS.length; i++) {
      var m = MERCHANTS[i];
      if (!matchRule(m, d)) { continue; }
      var isAlways = m.rule.type === 'always';
      out.push({
        type: isAlways ? 'always' : (m.rule.type === 'weekly' ? 'weekly' : 'monthly'),
        id: m.id, name: m.name, emoji: m.emoji, cat: m.cat,
        place: m.place || '', coach: m.coach || '',
        title: m.title, what: m.what, how: m.how, tip: m.tip,
        certainty: m.certainty, source: m.source,
        tag: isAlways ? '常驻' : (m.rule.type === 'weekly' ? (Array.isArray(m.rule.weekday) ? '工作日' : '每周' + WEEK_CN[m.rule.weekday % 7]) : '每月 ' + m.rule.day + ' 号')
      });
    }
    var np = nextPromo(d);
    if (np && np.days === 0) {
      out.push({ type: 'promo', id: np.promo.id, name: '电商大促', icon: 'spark', cat: '电商',
        title: np.promo.name + ' 当天', what: np.promo.depth, how: '当天为正式活动日，注意尾款与满减门槛',
        tip: '大促当天不是所有品类都最便宜，先看历史价再下单', certainty: 'stable',
        source: '平台官方活动页', tag: '今天' });
    } else if (np && np.days === np.promo.warmup) {
      out.push({ type: 'promo', id: np.promo.id, name: '电商大促', icon: 'clock', cat: '电商',
        title: np.promo.name + ' 预热开始（还有 ' + np.days + ' 天）', what: np.promo.depth,
        how: '先加购物车、领券，正式开卖再付；注意预售价与定金规则',
        tip: '预热期的"预售价"未必最低，别被倒计时催着下单', certainty: 'stable',
        source: '平台官方活动页', tag: '预热' });
    }
    return out;
  }

  /** 未来 N 天逐日：只有限时活动才进日历，常驻活动单独列一次，避免日历全是噪音 */
  function upcoming(days, from) {
    var start = toDate(from || new Date());
    var list = [];
    for (var i = 0; i < (days || 14); i++) {
      var d = addDays(start, i);
      var all = dealsOn(d).filter(function (x) { return x.type !== 'always'; });
      list.push({ date: dateKey(d), weekday: weekdayCn(d), offset: i, items: all });
    }
    return list;
  }

  /** 常驻活动（不进逐日日历，单独展示） */
  function alwaysDeals() {
    return dealsOn(new Date()).filter(function (x) { return x.type === 'always'; });
  }

  /* ================================================================== */
  /* 五、品类价格带（素人模式第一句回答用；不是报价）                      */
  /* ================================================================== */

  /**
   * 口径：为日常主流价位经验区间，只用于"这个价大概在什么档"，
   * 精确比价必须用真实报价（compareOffers）。充电宝一行按 10000mAh 主流容量估。
   */
  var BANDS = [
    { keys: ['充电宝', '移动电源', '充电电池'], name: '充电宝（10000mAh）', low: [40, 80], mid: [80, 150], high: [150, 300], channel: '拼多多百亿补贴 / 京东大促' },
    { keys: ['蓝牙耳机', '无线耳机', '耳机', 'airpods'], name: '蓝牙耳机', low: [50, 150], mid: [150, 500], high: [500, 1500], channel: '拼多多百亿补贴（标品）' },
    { keys: ['保温杯', '水杯', '杯子'], name: '保温杯（500ml）', low: [30, 60], mid: [60, 150], high: [150, 400], channel: '拼多多百亿补贴 / 淘宝第三方' },
    { keys: ['洗衣液'], name: '洗衣液（3L 装）', low: [15, 25], mid: [25, 45], high: [45, 80], channel: '拼多多 / 抖音直播间' },
    { keys: ['洗发水', '洗发露'], name: '洗发水（500ml）', low: [20, 40], mid: [40, 80], high: [80, 200], channel: '拼多多百亿补贴' },
    { keys: ['电动牙刷'], name: '电动牙刷', low: [80, 150], mid: [150, 350], high: [350, 800], channel: '拼多多百亿补贴' },
    { keys: ['空气炸锅'], name: '空气炸锅', low: [150, 300], mid: [300, 600], high: [600, 1200], channel: '拼多多 / 京东大促' },
    { keys: ['电饭煲', '电饭锅'], name: '电饭煲', low: [100, 250], mid: [250, 600], high: [600, 1500], channel: '京东自营大促 / 拼多多' },
    { keys: ['运动鞋', '跑鞋', '球鞋'], name: '运动鞋', low: [100, 250], mid: [250, 600], high: [600, 1500], channel: '唯品会 / 淘宝第三方' },
    { keys: ['笔记本', '电脑', '平板'], name: '笔记本（学生本）', low: [2500, 3500], mid: [3500, 5500], high: [5500, 9000], channel: '京东教育优惠 / 618' },
    { keys: ['显示器'], name: '显示器（27 寸）', low: [500, 800], mid: [800, 1500], high: [1500, 3000], channel: '京东自营 / 618' },
    { keys: ['扫地机器人', '扫地机'], name: '扫地机器人', low: [800, 1500], mid: [1500, 3000], high: [3000, 6000], channel: '京东自营大促' }
  ];

  function findBand(item) {
    var s = String(item || '').toLowerCase();
    if (!s) { return null; }
    for (var i = 0; i < BANDS.length; i++) {
      var b = BANDS[i];
      for (var j = 0; j < b.keys.length; j++) {
        if (s.indexOf(b.keys[j].toLowerCase()) !== -1) { return b; }
      }
    }
    return null;
  }

  /** 把一个价按价格带分档：入门 / 中档 / 高档 / 偏贵 */
  function judgePrice(item, price) {
    var b = findBand(item);
    var p = Number(price);
    if (!b || !isFinite(p) || p <= 0) { return null; }
    var level, label, note;
    if (p <= b.low[1]) {
      level = 'entry'; label = '入门档';
      note = '属于「' + b.name + '」的入门价位，' + b.low[0] + '-' + b.low[1] + ' 元区间内';
    } else if (p <= b.mid[1]) {
      level = 'mid'; label = '中档';
      note = '落在中档价位（' + b.mid[0] + '-' + b.mid[1] + ' 元），通常是主力款';
    } else if (p <= b.high[1]) {
      level = 'high'; label = '高档';
      note = '已到高档价位（' + b.high[0] + '-' + b.high[1] + ' 元），为品牌/功能溢价买单';
    } else {
      level = 'over'; label = '偏贵';
      note = '高于「' + b.name + '」的主流高档上限（' + b.high[1] + ' 元），先确认是不是新款/大容量版本';
    }
    return { band: b.name, bandObj: b, level: level, label: label, text: note, channel: b.channel };
  }

  /** 现在买还是等大促（口径：不承诺大促一定更便宜） */
  function timingAdvice(price, from) {
    var np = nextPromo(from);
    var p = Number(price) || 0;
    var advice;
    if (!np) {
      return { text: '按需买就行，暂时算不出最近的大促节点。', promo: null, days: null };
    }
    var days = np.days;
    var name = np.promo.name;
    if (p >= 500) {
      if (days <= 30) { advice = '单价 ' + p + ' 元属大件，距 ' + name + ' 只剩 ' + days + ' 天——不急就等，大促通常有直降或满减。'; }
      else { advice = '单价 ' + p + ' 元属大件，但距 ' + name + ' 还有 ' + days + ' 天，等下去时间成本过高——现在买，记得看有没有价保。'; }
    } else if (p > 0 && p < 100) {
      advice = '单价 ' + p + ' 元属小件，跨平台价差通常只有几块——不用为省这点钱等 ' + days + ' 天，现在比完价就买。';
    } else if (days <= 20) {
      advice = '距 ' + name + ' 还有 ' + days + ' 天——不急着用可以等；急用现在买。';
    } else {
      advice = '距最近的 ' + name + ' 还有 ' + days + ' 天，比较远——按需买就行。';
    }
    return {
      text: advice,
      promo: np.promo.name,
      days: days,
      date: dateKey(np.date),
      warming: np.warming,
      depth: np.promo.depth
    };
  }

  /* ================================================================== */
  /* 六、比价口径引擎                                                     */
  /* ================================================================== */

  var RE_MULTI = /(\d+)\s*[包瓶罐盒装袋提]?\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*(ml|毫升|l|升|g|克|kg|千克|公斤)/;
  var RE_MULTI_REV = /(\d+(?:\.\d+)?)\s*(ml|毫升|l|升|g|克|kg|千克|公斤)\s*[xX×*]\s*(\d+)\s*[包瓶罐盒装袋]?/;
  var RE_PREFIX = /(\d+(?:\.\d+)?)\s*[包瓶罐盒袋箱筒听提条支]\s*装\s*(\d+(?:\.\d+)?)\s*(ml|毫升|l|升|g|克|kg|千克|公斤)/;
  var RE_COUNT_MULTI = /(\d+(?:\.\d+)?)\s*(抽|张|片|卷|包|袋|盒|瓶|罐|听|筒|条|个|只|支|枚|件)\s*[xX×*]?\s*(\d+(?:\.\d+)?)\s*(提|箱|组|套|袋|包|盒|件)/;
  var RE_JIN_MULTI = /(\d+(?:\.\d+)?)\s*斤\s*[xX×*]\s*(\d+)/;
  var RE_JIN = /(\d+(?:\.\d+)?)\s*斤/;
  /* 充电宝/电池容量：10000mAh —— 单列一类，按元/1000mAh 折算才直观 */
  var RE_MAH = /(\d+(?:\.\d+)?)\s*(mah|毫安时|毫安)/i;
  var RE_VOL = /(\d+(?:\.\d+)?)\s*(ml|毫升|l|L|升|g|克|kg|千克|公斤)/;
  var RE_COUNT = /(\d+(?:\.\d+)?)\s*(包|抽|张|提|片|枚|卷|条|双|只|个|支|盒|袋|瓶|罐|听|筒|箱|组|套|件)/;
  var RE_NEED1 = /(?:需买|需购买|需要买|必须买|至少买|最少买|买够|买满|满|囤)\s*(\d+)\s*(?:件|个|盒|包|提|瓶|罐|袋|组|箱|套)/;
  var RE_NEED2 = /(\d+)\s*(?:件|个|盒|包|提|瓶|罐|袋|组|箱|套)\s*(?:起|以上|起售|起购)/;

  var CN_DIGIT = { '零': '0', '一': '1', '二': '2', '两': '2', '三': '3', '四': '4', '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10' };

  /** 价格清洗：'¥39.9' / '39.9元' / '1,299.00' / 全角 都能读 */
  function toNum(v, dft) {
    if (v === null || v === undefined || v === '') { return dft === undefined ? null : dft; }
    if (typeof v === 'number') { return isFinite(v) ? v : (dft === undefined ? null : dft); }
    var s = String(v)
      .replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
      .replace(/[．]/g, '.').replace(/,/g, '');
    var m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) { return dft === undefined ? null : dft; }
    var n = parseFloat(m[0]);
    return isFinite(n) ? n : (dft === undefined ? null : dft);
  }

  function normSpecText(spec) {
    var s = String(spec || '').replace(/\s+/g, '');
    s = s.replace(/包邮|包运费|免邮|包退|包换|包安装|包配送/g, '');
    s = s.replace(/[零一二两三四五六七八九十](?=[包瓶罐盒袋箱筒听提条支个只张片抽卷])/g, function (ch) {
      return CN_DIGIT[ch] || ch;
    });
    return s;
  }

  /** 规格 -> {qty, unit}；unit 为 ml / g / 计数单位，可直接横向比单价 */
  function parseSpec(spec) {
    var s = normSpecText(spec);
    if (!s) { return { qty: null, unit: null }; }
    var m, cnt, val, u;
    m = s.match(RE_MULTI);
    if (m) {
      cnt = parseFloat(m[1]); val = parseFloat(m[2]); u = m[3].toLowerCase();
      if (u === 'l' || u === '升') { return { qty: cnt * val * 1000, unit: 'ml' }; }
      if (u === 'kg' || u === '千克' || u === '公斤') { return { qty: cnt * val * 1000, unit: 'g' }; }
      return { qty: cnt * val, unit: (u === 'ml' || u === '毫升') ? 'ml' : 'g' };
    }
    m = s.match(RE_MULTI_REV);
    if (m) {
      val = parseFloat(m[1]); u = m[2].toLowerCase(); cnt = parseFloat(m[3]);
      if (u === 'l' || u === '升') { return { qty: cnt * val * 1000, unit: 'ml' }; }
      if (u === 'kg' || u === '千克' || u === '公斤') { return { qty: cnt * val * 1000, unit: 'g' }; }
      return { qty: cnt * val, unit: (u === 'ml' || u === '毫升') ? 'ml' : 'g' };
    }
    m = s.match(RE_PREFIX);
    if (m) {
      cnt = parseFloat(m[1]); val = parseFloat(m[2]); u = m[3].toLowerCase();
      if (u === 'l' || u === '升') { return { qty: cnt * val * 1000, unit: 'ml' }; }
      if (u === 'kg' || u === '千克' || u === '公斤') { return { qty: cnt * val * 1000, unit: 'g' }; }
      return { qty: cnt * val, unit: (u === 'ml' || u === '毫升') ? 'ml' : 'g' };
    }
    m = s.match(RE_COUNT_MULTI);
    if (m) { return { qty: parseFloat(m[3]), unit: m[4] }; }
    m = s.match(RE_JIN_MULTI);
    if (m) { return { qty: parseFloat(m[1]) * 500 * parseFloat(m[2]), unit: 'g' }; }
    m = s.match(RE_JIN);
    if (m) { return { qty: parseFloat(m[1]) * 500, unit: 'g' }; }
    m = s.match(RE_MAH);
    if (m) { return { qty: parseFloat(m[1]), unit: 'mAh' }; }
    m = s.match(RE_VOL);
    if (m) {
      val = parseFloat(m[1]); u = m[2].toLowerCase();
      if (u === 'l' || u === '升') { return { qty: val * 1000, unit: 'ml' }; }
      if (u === 'kg' || u === '千克' || u === '公斤') { return { qty: val * 1000, unit: 'g' }; }
      return { qty: val, unit: (u === 'ml' || u === '毫升') ? 'ml' : 'g' };
    }
    m = s.match(RE_COUNT);
    if (m) { return { qty: parseFloat(m[1]), unit: m[2] }; }
    return { qty: null, unit: null };
  }

  /** 购买门槛：「需买 4 件」「4 件起」-> 4；没写 -> 1 */
  function parseNeed(text) {
    var s = String(text || '');
    var m = s.match(RE_NEED1) || s.match(RE_NEED2);
    if (!m) { return 1; }
    var n = parseInt(m[1], 10);
    return (isFinite(n) && n >= 1) ? n : 1;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function fmt(n) {
    if (n === null || n === undefined || !isFinite(n)) { return '—'; }
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  function fmt3(n) {
    if (n === null || n === undefined || !isFinite(n)) { return '—'; }
    return (Math.round(n * 1000) / 1000).toFixed(3);
  }

  /** 折合单价的展示文案：ml/g 给每 100 单位，mAh 给每 1000mAh，其余给每个计数单位 */
  function perLabel(r) {
    if (!r || r.per === null || r.per === undefined || !isFinite(r.per)) { return '—'; }
    if (r.unit === 'ml' || r.unit === 'g') { return fmt(r.per * 100) + ' 元/100' + r.unit; }
    if (r.unit === 'mAh') { return fmt(r.per * 1000) + ' 元/1000mAh'; }
    return fmt3(r.per) + ' 元/' + r.unit;
  }

  /**
   * 比价主函数
   * @param {Array} offers [{platform,title,price,ship,coupon,spec,needQty}]
   * @param {Object} opts   {item, budget, today}
   * @return {Object} 结果（含 headline / rows / warnings / timing / budget）
   */
  function compareOffers(offers, opts) {
    opts = opts || {};
    var item = opts.item || '未命名商品';
    var today = opts.today ? toDate(opts.today) : new Date();
    var rows = [], skipped = [], i;

    offers = Array.isArray(offers) ? offers.slice(0, 20) : [];
    for (i = 0; i < offers.length; i++) {
      var o = offers[i] || {};
      var price = toNum(o.price);
      if (price === null || price <= 0 || !isFinite(price)) {
        skipped.push('第 ' + (i + 1) + ' 条：没读到有效价格，已跳过');
        continue;
      }
      var ship = toNum(o.ship, 0) || 0;
      var coupon = toNum(o.coupon, 0) || 0;
      var need = toNum(o.needQty, null);
      if (!need) { need = parseNeed((o.title || '') + ' ' + (o.spec || '')); }
      need = Math.max(1, Math.round(need || 1));
      var sp = parseSpec(o.spec);
      if (need === 1) {
        var need2 = parseNeed(String(o.spec || ''));
        if (need2 > 1) { need = need2; }
      }
      var eff = Math.max(0, price * need + ship - coupon);
      rows.push({
        platform: String(o.platform || '未知平台'),
        title: String(o.title || '').trim(),
        link: String(o.link || '').trim(),
        price: price, ship: ship, coupon: coupon, needQty: need,
        spec: String(o.spec || ''),
        eff: eff, qty: sp.qty, unit: sp.unit,
        per: (sp.qty && sp.qty > 0) ? eff / (sp.qty * need) : null
      });
    }

    if (!rows.length) {
      return {
        ok: false, item: item, rows: [], mode: 'empty', comparable: false,
        headline: '这几条里没读到有效价格——按「平台 + 价格 + 规格」给我，例如：淘宝 89 包邮 10000mAh。',
        sublines: [], warnings: skipped, skipped: skipped, timing: null, budget: null
      };
    }

    /* ---- 可比性判定：先找最大可比子集（单位相同的条目才能放一起比） ---- */
    var groups = {}, j;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.qty && r.unit) {
        if (!groups[r.unit]) { groups[r.unit] = []; }
        groups[r.unit].push(r);
      }
    }
    var mainGroup = [], mainUnit = null;
    for (var u in groups) {
      if (!Object.prototype.hasOwnProperty.call(groups, u)) { continue; }
      if (groups[u].length > mainGroup.length) { mainGroup = groups[u]; mainUnit = u; }
    }
    var covered = (mainGroup.length === rows.length && mainGroup.length > 0);
    var qtyKeys = {};
    for (j = 0; j < mainGroup.length; j++) { qtyKeys[Math.round(mainGroup[j].qty * 100)] = true; }
    var sameQty = covered && Object.keys(qtyKeys).length === 1;
    // 「需买N件」不一致时不能比整单总价：京东 99 元需买 2 件，整单 198 元，
    // 直接跟单件 89 元比会得出"贵 109 元"的假结论 —— 必须切到单价口径。
    var needKeys = {};
    for (j = 0; j < mainGroup.length; j++) { needKeys[mainGroup[j].needQty] = true; }
    var sameNeed = covered && Object.keys(needKeys).length === 1;

    var mode;
    if (rows.length === 1) { mode = 'single'; }
    else if (mainGroup.length >= 2 && covered && sameQty && sameNeed) { mode = 'total'; }
    else if (mainGroup.length >= 2 && covered) { mode = 'unit'; }
    else if (mainGroup.length >= 2) { mode = 'partial'; }
    else if (mainGroup.length === 0) { mode = 'total_nospec'; }
    else { mode = 'mixed'; }

    rows.sort(function (a, b) {
      if (mode === 'unit' || mode === 'partial') {
        var pa = a.per === null ? Infinity : a.per;
        var pb = b.per === null ? Infinity : b.per;
        if (pa !== pb) { return pa - pb; }
      }
      return a.eff - b.eff;
    });

    var best = rows[0], worst = rows[rows.length - 1];
    var save = worst.eff - best.eff;
    var multi = rows.length >= 2 && save > 0.005;

    function tag(r) {
      return '[' + r.platform + ']' + (r.title ? ' ' + r.title : '');
    }
    function perUnit(r) { return perLabel(r); }

    var headline = '', sublines = [], warnings = [];
    if (mode === 'unit') {
      var cands = mainGroup.slice().sort(function (a, b) { return a.per - b.per; });
      headline = '按折合单价，' + tag(cands[0]) + ' 最划算：' + perUnit(cands[0]) +
        '；最贵的是 [' + cands[cands.length - 1].platform + '] ' + perUnit(cands[cands.length - 1]) + '。';
      sublines.push('各家规格数量不一样，只比总价会看错——总价最低的那家单价未必最低。');
      best = cands[0];
    } else if (mode === 'partial') {
      var mainCands = mainGroup.slice().sort(function (a, b) { return a.per - b.per; });
      headline = '能对上的 ' + mainGroup.length + ' 条（都是「' + mainUnit + '」）里，' +
        tag(mainCands[0]) + ' 最划算：' + perUnit(mainCands[0]) + '。';
      var others = rows.filter(function (r) { return mainGroup.indexOf(r) === -1; });
      sublines.push('另有 ' + others.length + ' 条规格不同或没写（' +
        others.map(function (r) { return '[' + r.platform + ']'; }).join('、') +
        '），没法放进来一起比——补上规格我再算。');
      best = mainCands[0];
    } else if (mode === 'mixed') {
      headline = '这几条规格口径对不上（有的是「包」、有的是「提/瓶/克」，或者根本没写规格），没法直接说谁更便宜。';
      sublines.push('把规格对齐再看：要么都比「每包多少钱」，要么都按同一件数比总价。');
    } else if (mode === 'total_nospec') {
      headline = tag(best) + ' 到手价最低 ' + fmt(best.eff) + ' 元' +
        (multi ? '，比最贵的 [' + worst.platform + '] 省 ' + fmt(save) + ' 元' : '') + '。';
      sublines.push('你没给规格（多少包 / 多少 ml），如果各家规格不一样，这个总价差没意义——补上规格我按单价重算。');
    } else if (multi) {
      headline = tag(best) + ' 到手价最低 ' + fmt(best.eff) + ' 元，比最贵的 [' + worst.platform + '] 省 ' + fmt(save) + ' 元。';
    } else if (rows.length >= 2) {
      headline = '各家到手价基本持平（差不到 5 分钱），按运费、售后、发货地选即可。';
    } else {
      headline = '只收到 1 条报价（' + tag(best) + ' 到手 ' + fmt(best.eff) + ' 元），暂时没法比出贵不贵——再给我一个平台的价格就能比。';
    }

    /* ---- 隐性成本 ---- */
    var hasShip = rows.some(function (r) { return r.ship > 0; });
    var hasFree = rows.some(function (r) { return r.ship === 0; });
    if (hasShip && hasFree) { sublines.push('有的包邮有的要运费——运费算进来才是到手价（上面已算）。'); }
    if (rows.length >= 2 && save <= 3) { sublines.push('价差不到 3 块，这种情况优先选运费险 / 七天无理由 / 旗舰店，退货成本比差价重要。'); }
    if (rows.some(function (r) { return r.coupon > 0; })) { sublines.push('券有门槛和有效期；跨店满减要凑单的话，别为了凑单买用不上的东西。'); }
    if (rows.some(function (r) { return r.needQty > 1; })) { sublines.push('有的平台要一次买够 N 件才给这个价（明细里标了「需买N件」）——囤不了那么多，它的单价可能不如看着便宜。'); }

    /* ---- 预警：按"当前口径"的中位数找异常，避免拿 12 包的价格去比 24 包的中位价 ---- */
    var usePer = (mode === 'unit' || mode === 'partial');
    var pool = [];
    (usePer ? mainGroup : rows).forEach(function (r) {
      var v = usePer ? r.per : r.eff;
      if (v !== null && v !== undefined && isFinite(v) && v > 0) { pool.push(v); }
    });
    pool.sort(function (a, b) { return a - b; });
    var med = 0;
    if (pool.length >= 3) {
      med = pool.length % 2 ? pool[(pool.length - 1) / 2] : (pool[pool.length / 2 - 1] + pool[pool.length / 2]) / 2;
    }
    rows.forEach(function (r) {
      var v = usePer ? r.per : r.eff;
      var shown = usePer ? perLabel(r) : fmt(r.eff) + ' 元';
      if (med > 0 && v !== null && v < 0.5 * med) {
        warnings.push('[' + r.platform + '] ' + shown + ' 明显低于同口径中位价——可能规格不同 / 临期 / 二手 / 仿品，下单前核对店铺资质与规格。');
      } else if (med > 0 && v !== null && v > 1.6 * med) {
        warnings.push('[' + r.platform + '] ' + shown + ' 明显高于同口径中位价，没有品牌 / 售后优势可以放弃。');
      }
      if (r.coupon > 0 && r.coupon >= r.price * r.needQty + r.ship) {
        warnings.push('[' + r.platform + '] 券额 ≥ 应付款，数据异常，请核对活动真实性。');
      }
    });
    if (mode === 'mixed') { warnings.push('本次规格口径不一致，上面的排序只能参考，不能当作「谁更便宜」的依据。'); }

    /* ---- 预算判断 ---- */
    var budget = toNum(opts.budget, null);
    var budgetInfo = null;
    if (budget && budget > 0) {
      var cost = (mode === 'unit' || mode === 'partial') ? best.eff : best.eff;
      if (cost <= budget) {
        budgetInfo = { budget: budget, diff: round2(budget - cost), ok: true,
          text: '最低到手 ' + fmt(cost) + ' 元，比你的预算 ' + fmt(budget) + ' 元还低 ' + fmt(budget - cost) + ' 元——预算内。' };
      } else {
        budgetInfo = { budget: budget, diff: round2(cost - budget), ok: false,
          text: '最低到手 ' + fmt(cost) + ' 元，超预算 ' + fmt(cost - budget) + ' 元——要么降规格，要么等大促。' };
      }
    }

    /* ---- 时机 ---- */
    var timing = timingAdvice(best.eff, today);

    /* ---- 价格带参考 ---- */
    var bandInfo = judgePrice(item, best.eff);

    return {
      ok: true,
      item: item,
      rows: rows,
      mode: mode,
      comparable: mode !== 'mixed',
      best: best,
      worst: worst,
      save: round2(save),
      headline: headline,
      sublines: sublines,
      warnings: warnings,
      skipped: skipped,
      budget: budgetInfo,
      timing: timing,
      band: bandInfo
    };
  }

  /* ================================================================== */
  /* 七、真实商家日历 CSV（日期由代码算，不是手写）                        */
  /* ================================================================== */

  function csvCell(v) {
    var s = String(v === undefined || v === null ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** 生成未来 days 天的商家日历 CSV 文本（带 BOM，Excel 打开不乱码） */
  function calendarCsv(from, days) {
    var start = toDate(from || new Date());
    var total = days || 56;
    var rows = [['日期', '星期', '活动类型', '商家/平台', '地点', '活动名称', '怎么用', '教练建议', '核实渠道']];
    rows.push(['（生成时间）', dateKey(start), '代码计算', '—', '—', '未来 ' + total + ' 天', '常驻活动只在首日列一次', '—', '本地日历算法']);

    var alwaysList = alwaysDeals();
    var first = true;
    for (var i = 0; i < total; i++) {
      var d = addDays(start, i);
      var list = dealsOn(d).filter(function (x) { return x.type !== 'always'; });
      var k;
      for (k = 0; k < list.length; k++) {
        var it = list[k];
        rows.push([
          dateKey(d), weekdayCn(d),
          it.type === 'promo' ? '大促' : (it.type === 'monthly' ? '每月固定' : '每周固定'),
          it.name, it.place || '—', it.title, it.how, it.coach || '—', it.source
        ]);
      }
      if (first) {
        for (k = 0; k < alwaysList.length; k++) {
          var a = alwaysList[k];
          rows.push([dateKey(d), weekdayCn(d), '常驻（每日）', a.name, a.place || '—', a.title, a.how, a.coach || '—', a.source]);
        }
      }
      first = false;
    }
    var lines = [];
    for (var r = 0; r < rows.length; r++) {
      lines.push(rows[r].map(csvCell).join(','));
    }
    return '\ufeff' + lines.join('\r\n');
  }

  /* ================================================================== */
  /* 八、聊天卡片 HTML                                                    */
  /* ================================================================== */

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** 今天有什么优惠：限时活动 + 最近三场 + 大促倒计时 */
  function todayCardHtml(date) {
    var d = toDate(date || new Date());
    var list = dealsOn(d);
    var limited = list.filter(function (x) { return x.type !== 'always'; });
    var always = list.filter(function (x) { return x.type === 'always'; });
    var np = nextPromo(d);

    var html = '<div class="deals-card">';
    html += '<div class="deals-card-head"><b>' + dlIcon('radar') + '省钱雷达</b><span>' + dateKey(d) + ' ' + weekdayCn(d) + '</span></div>';

    if (np) {
      html += '<div class="deals-promo">' +
        '<span>' + esc(np.promo.name) + (np.days === 0 ? ' 就是今天' : ' 还有 ' + np.days + ' 天') + '</span>' +
        '<small>' + esc(np.promo.depth) + ' · 适合：' + esc(np.promo.bestFor) + '</small>' +
        '</div>';
    }

    if (limited.length) {
      html += '<div class="deals-sec">今天的限时活动</div>';
      limited.forEach(function (it) {
        html += '<div class="deals-item">' +
          '<div class="di-top">' + itemIcon(it) +
          '<b>' + esc(it.name) + ' · ' + esc(it.title) + '</b>' +
          '<span class="di-tag">' + esc(it.tag) + '</span></div>' +
          '<p>' + esc(it.what) + '</p>' +
          '<p class="di-how">' + dlIcon('bulb', 'bico-brand', '怎么做') + esc(it.how) + '</p>' +
          '<p class="di-tip">' + dlIcon('alert', 'bico-warn', '提醒') + esc(it.tip) + '</p>' +
          '</div>';
      });
    } else {
      html += '<div class="deals-empty">今天没有固定的限时活动（肯德基疯狂星期四在周四、必胜客在周三）。要去的话，我帮你查下一次是哪天。</div>';
    }

    if (always.length) {
      html += '<div class="deals-sec">常驻优惠（不用等）</div><div class="deals-always">';
      always.slice(0, 5).forEach(function (it) {
        html += '<span class="deals-pill">' + itemIcon(it, 'sm') + ' ' + esc(it.name) + '·' + esc(it.title) + '</span>';
      });
      html += '</div>';
    }

    html += '<div class="deals-actions">' +
      '<button type="button" class="btn-mini primary" data-deal-act="open-today">看 14 天日历</button>' +
      '<button type="button" class="btn-mini" data-deal-act="open-compare">比一比价格</button>' +
      '</div>';
    html += '<p class="deals-note">活动日期由本地日历按周/按月算出，真实有效；具体单品、价格与参与门店以官方页面为准，我不编价格。</p>';
    html += '</div>';
    return html;
  }

  /** 疯狂星期四专项卡片 */
  function kfcCardHtml(date) {
    var d = toDate(date || new Date());
    var next = nextOf('kfc', d);
    var isToday = isoWeekday(d) === 4;
    var delta = daysBetween(d, next);
    var html = '<div class="deals-card">';
    html += '<div class="deals-card-head"><b>' + dlIcon('cat-food') + '疯狂星期四</b><span>' + dateKey(d) + ' ' + weekdayCn(d) + '</span></div>';
    if (isToday) {
      html += '<p class="deals-hl">今天就是周四——想吃就今天去，别拖到明天。</p>';
    } else {
      html += '<p class="deals-hl">今天是' + weekdayCn(d) + '，最近一次是 <b>' + dateKey(next) + '（' + weekdayCn(next) +
        '）</b>，还有 ' + delta + ' 天。</p>';
    }
    html += '<p>规律很硬：<b>每周四</b>，不需要联网也不会记错日期。但要吃对，注意三件事：</p>' +
      '<ul class="deals-ul">' +
      '<li>当天在 App / 小程序「疯狂星期四」专区看<b>当日单品</b>，每周不一样；</li>' +
      '<li>热门单品中午就卖完，晚上去经常只剩冷门款；</li>' +
      '<li>先领券再下单，外卖价和堂食价不同，别拿外卖价当堂食价。</li>' +
      '</ul>' +
      '<p class="deals-note">具体单品与价格以肯德基官方页面为准；本卡片只负责把日子算准，不编价格。</p>' +
      '<div class="deals-actions">' +
      '<button type="button" class="btn-mini primary" data-deal-act="open-calendar">看未来 14 天</button>' +
      '</div></div>';
    return html;
  }

  /** 比价引导卡：只给价格带 + 明确还差什么，不编价格 */
  function compareIntroHtml(item, budget, date) {
    var band = findBand(item);
    var t = timingAdvice(budget || 0, date);
    var html = '<div class="deals-card">';
    html += '<div class="deals-card-head"><b>' + dlIcon('scale') + '比价 · ' + esc(item || '这个商品') + '</b><span>' + dateKey(date || new Date()) + '</span></div>';
    if (band) {
      html += '<p class="deals-hl">「' + esc(band.name) + '」主流价格带：入门 ' + band.low[0] + '-' + band.low[1] +
        ' 元 / 中档 ' + band.mid[0] + '-' + band.mid[1] + ' 元 / 高档 ' + band.high[0] + '-' + band.high[1] + ' 元。</p>';
      html += '<p>这类东西通常 <b>' + esc(band.channel) + '</b> 更便宜，同款跨平台能差 20%-40%。</p>';
    } else {
      html += '<p class="deals-hl">这个品类我没有价格带参考，但不影响比价——只要你把三家的价给我，我照样能算到手价和单价。</p>';
    }
    if (budget) {
      var j = judgePrice(item, budget);
      html += '<p>你的预算 <b>' + fmt(budget) + ' 元</b>' + (j ? '落在「' + j.label + '」档：' + esc(j.text) : '') + '。</p>';
    }
    html += '<p class="deals-note">我这边不抓电商实时价（会过期、也不合规），所以下一步要你帮一把：把看到的价按「平台 + 价格 + 规格」发我，' +
      '例如「淘宝 89 包邮 10000mAh / 拼多多 79 / 京东 99 需买 2 件」，我立刻算到手价、折单价、排最便宜的。</p>';
    html += '<div class="deals-actions">' +
      '<button type="button" class="btn-mini primary" data-deal-act="open-compare">打开比价计算器</button>' +
      '<button type="button" class="btn-mini" data-deal-act="open-today">今天有什么优惠</button>' +
      '</div>';
    if (t && t.days !== null) {
      html += '<p class="deals-timing">⏰ ' + esc(t.text) + '</p>';
    }
    html += '</div>';
    return html;
  }

  /* ================================================================== */
  /* 七、真实搜索快照（当当网公开搜索结果页，抓取时间见 meta）           */
  /*     由 deals_scrape.py 真实请求 search.dangdang.com 解析得到，      */
  /*     不含任何模拟数据；抓不到就是空数组。                            */
  /* ================================================================== */
  /* ================================================================== */
  /* 七、内置搜索快照（网易严选 + 当当，真实抓取，时间见 meta）          */
  /*     由 deals_scrape.py 真实请求电商搜索接口解析得到，不含模拟数据； */
  /*     在线抓取可用时前端优先用在线结果，这份只作离线兜底。           */
  /* ================================================================== */
  /* ================================================================== */
  /* 七、内置搜索快照（网易严选 + 当当，真实抓取，时间见 meta）          */
  /*     由 deals_scrape.py 真实请求电商搜索接口解析得到，不含模拟数据； */
  /*     在线抓取可用时前端优先用在线结果，这份只作离线兜底。           */
  /* ================================================================== */
  var REAL_SEARCH = {
  "meta": {
    "source": "网易严选 24条 + 慢慢买比价 24条 + 当当网 24条",
    "source_host": "s.manmanbuy.com, search.dangdang.com, you.163.com",
    "keyword": "保温杯",
    "scraped_at": "2026-10-28 20:52:41",
    "scraped_at_iso": "2026-10-28T20:52:41+08:00",
    "pages_scraped": [
      {
        "page": 1,
        "parsed": 40,
        "source": "网易严选"
      },
      {
        "page": 2,
        "parsed": 40,
        "source": "网易严选"
      },
      {
        "page": 1,
        "parsed": 31,
        "source": "慢慢买比价"
      },
      {
        "page": 2,
        "parsed": 31,
        "source": "慢慢买比价"
      },
      {
        "page": 1,
        "parsed": 60,
        "source": "当当网"
      },
      {
        "page": 2,
        "parsed": 60,
        "source": "当当网"
      }
    ],
    "page_urls": [
      "https://you.163.com/xhr/search/search.json?keyword=%E4%BF%9D%E6%B8%A9%E6%9D%AF&page=1&style=json&size=40",
      "https://you.163.com/xhr/search/search.json?keyword=%E4%BF%9D%E6%B8%A9%E6%9D%AF&page=2&style=json&size=40",
      "https://s.manmanbuy.com/pc/search/result?keyword=%E4%BF%9D%E6%B8%A9%E6%9D%AF&pageId=1",
      "https://s.manmanbuy.com/pc/search/result?keyword=%E4%BF%9D%E6%B8%A9%E6%9D%AF&pageId=2",
      "https://search.dangdang.com/?key=%B1%A3%CE%C2%B1%AD&act=input&page_index=1",
      "https://search.dangdang.com/?key=%B1%A3%CE%C2%B1%AD&act=input&page_index=2"
    ],
    "errors": [],
    "sources": [
      {
        "name": "网易严选",
        "host": "you.163.com",
        "count": 24,
        "price_range": [
          33.0,
          269.0
        ],
        "error": null,
        "note": null,
        "dropped": 0
      },
      {
        "name": "慢慢买比价",
        "host": "s.manmanbuy.com",
        "count": 24,
        "price_range": [
          19.9,
          65.29
        ],
        "error": null,
        "note": null,
        "dropped": 0
      },
      {
        "name": "当当网",
        "host": "search.dangdang.com",
        "count": 24,
        "price_range": [
          49.0,
          208.0
        ],
        "error": null,
        "note": null,
        "dropped": 34
      }
    ],
    "total_parsed": 261,
    "relevant": 227,
    "dropped": 34,
    "price_range": [
      19.9,
      246.0
    ],
    "price_median": 58.25,
    "shop_count": 5,
    "picked": 24
  },
  "items": [
    {
      "sku": "302056556",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "网易严选 大容量吸管保温保冷杯 冰霸杯 316L内胆【限时免邮】",
      "price": 79.0,
      "original": 99.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 66,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=302056556",
      "image": "https://yanxuan-item.nosdn.127.net/5bfed13a82faf1ca6942cd094466e64b.png",
      "page": 1,
      "capacity_ml": 6000,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [
        "吸管杯",
        "大容量"
      ],
      "unit_price_per_100ml": 1.32,
      "relevance": 40
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "京东",
      "title": "富光 500ml 316L不锈钢保温杯 睿智黑 滤网",
      "price": 29.5,
      "original": null,
      "shop": "京东商城",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_597414280.aspx",
      "image": "https://img14.360buyimg.com/pop/jfs/t1/510136/34/2549/76524/6a884668Fdba68ac3/08ee320320ffd5c1.png",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 500,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [],
      "unit_price_per_100ml": 5.9,
      "relevance": 170
    },
    {
      "sku": "302047685",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "江湖豪饮 巨无霸316不锈钢保温杯1.25L",
      "price": 159.0,
      "original": 159.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 293,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=302047685",
      "image": "https://yanxuan-item.nosdn.127.net/44fcc282ba3cfbe8f4ad54aab04ef9b0.png",
      "page": 1,
      "capacity_ml": 5000,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [],
      "unit_price_per_100ml": 3.18,
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "京东",
      "title": "富光 316L不锈钢大容量保温杯620ml",
      "price": 28.7,
      "original": null,
      "shop": "京东自营",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_598673377.aspx",
      "image": "https://img14.360buyimg.com/pop/jfs/t20270803/83622/17/26504/25907/66ad9db6F41080a36/60e60eef259b043f.png",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 620,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [
        "大容量"
      ],
      "unit_price_per_100ml": 4.63,
      "relevance": 170
    },
    {
      "sku": "301098860",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "绿珠泡茶咖啡保温杯",
      "price": 38.0,
      "original": 59.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 2320,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=301098860",
      "image": "https://yanxuan-item.nosdn.127.net/ecfee9d59c9c879d82a101385f1552f4.png",
      "page": 1,
      "capacity_ml": 0,
      "material": "材质未标注",
      "target": "通用",
      "feature": [
        "泡茶杯"
      ],
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "京东",
      "title": "需换购：京东京造 304不锈钢保温杯 400ml 便携保冷",
      "price": 19.9,
      "original": null,
      "shop": "京东自营",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_596057189.aspx",
      "image": "https://img14.360buyimg.com/pop/jfs/t1/173842/8/51747/15787/67407a08F5ecc8056/f6738a735a8aceed.png",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 400,
      "material": "304不锈钢",
      "target": "通用",
      "feature": [],
      "unit_price_per_100ml": 4.97,
      "relevance": 170
    },
    {
      "sku": "301003183",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "杯具熊 IP联名316内胆运动直饮保温杯",
      "price": 88.0,
      "original": 128.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 352,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=301003183",
      "image": "https://yanxuan-item.nosdn.127.net/1c9f8818161289f2ed6337dd19be1370.jpg",
      "page": 1,
      "capacity_ml": 0,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [
        "直饮"
      ],
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "京东",
      "title": "富光 316不锈钢保温杯 月光白 500ml",
      "price": 34.95,
      "original": null,
      "shop": "京东商城",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_597421125.aspx",
      "image": "https://img14.360buyimg.com/pop/jfs/t20270108/245959/25/1527/12360/659ca0c0F2367541e/917c7e81805348db.png",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 500,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [],
      "unit_price_per_100ml": 6.99,
      "relevance": 170
    },
    {
      "sku": "302554082",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "捷安玺 大容量户外健身水杯便携双饮保温杯",
      "price": 45.0,
      "original": 69.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 585,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=302554082",
      "image": "https://yanxuan-item.nosdn.127.net/7249df1ad24cabad9453eb7148d1aaec.jpg",
      "page": 1,
      "capacity_ml": 0,
      "material": "材质未标注",
      "target": "通用",
      "feature": [
        "大容量"
      ],
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "天猫",
      "title": "GERM格米 运动保温杯 柠檬黄 650ml（多颜色样式任选）",
      "price": 29.55,
      "original": null,
      "shop": "天猫旗舰店",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_594723613.aspx",
      "image": "https://zhekou-background.manmanbuy.com/image_resize/20261012/e57d7366b68e4df7a7d0e6842ae1802c.jpg?x-oss-process=image%2Fformat%2Cjpg%2Fquality%2Cq_80",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 650,
      "material": "材质未标注",
      "target": "通用",
      "feature": [],
      "unit_price_per_100ml": 4.55,
      "relevance": 170
    },
    {
      "sku": "300239562",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "【网易严选】一秒速开 弹盖随行保温杯",
      "price": 119.0,
      "original": 119.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 740,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=300239562",
      "image": "https://yanxuan-item.nosdn.127.net/f9628fcef4a7006970e9fe4cb1797e75.png",
      "page": 1,
      "capacity_ml": 0,
      "material": "材质未标注",
      "target": "通用",
      "feature": [],
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "京东",
      "title": "富光 316L不锈钢保温杯 520ml 茶水分离",
      "price": 29.6,
      "original": null,
      "shop": "京东自营",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_598669193.aspx",
      "image": "https://img14.360buyimg.com/pop/jfs/t1/154002/36/28723/36708/66d5751eF13116ebf/6f5ed278fdcb2ad0.png",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 520,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [
        "茶水分离"
      ],
      "unit_price_per_100ml": 5.69,
      "relevance": 170
    },
    {
      "sku": "302410718",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "【网易严选】畅萌随行 大容量双饮316保温杯",
      "price": 199.0,
      "original": 199.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 75,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=302410718",
      "image": "https://yanxuan-item.nosdn.127.net/8439ad95349e90410b85b3c8f7f18c0a.png",
      "page": 1,
      "capacity_ml": 0,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [
        "大容量"
      ],
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "天猫",
      "title": "THERMOS/膳魔师 JNR系列304不锈钢真空保温杯 500ml 多颜色可选",
      "price": 60.47,
      "original": null,
      "shop": "天猫国际",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_597838014.aspx",
      "image": "https://img.alicdn.com/i4/2549841410/O1CN01MaHwOO1MHpXxbkSq3_!!2549841410.jpg",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 500,
      "material": "304不锈钢",
      "target": "通用",
      "feature": [],
      "unit_price_per_100ml": 12.09,
      "relevance": 170
    },
    {
      "sku": "302489288",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "Stanley史丹利咖啡杯保温杯随行水杯时尚",
      "price": 179.0,
      "original": 198.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 791,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=302489288",
      "image": "https://yanxuan-item.nosdn.127.net/43247fba7f0ed295199d69f0ceec7674.jpg",
      "page": 1,
      "capacity_ml": 0,
      "material": "材质未标注",
      "target": "通用",
      "feature": [],
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "京东",
      "title": "富光 316L不锈钢保温杯 500ml 丹青绿",
      "price": 34.95,
      "original": null,
      "shop": "京东商城",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_597419715.aspx",
      "image": "https://img14.360buyimg.com/pop/jfs/t1/89476/21/48721/13280/671b54a6Fdfffd425/2ed3d213bd3710e2.png",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 500,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [],
      "unit_price_per_100ml": 6.99,
      "relevance": 170
    },
    {
      "sku": "302337283",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "T字弹跳盖保温杯  特美刻高颜值随行水杯",
      "price": 114.0,
      "original": 139.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 117,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=302337283",
      "image": "https://yanxuan-item.nosdn.127.net/d1848aca53584e16a7a2fed42a7cdce9.png",
      "page": 1,
      "capacity_ml": 0,
      "material": "材质未标注",
      "target": "通用",
      "feature": [
        "弹跳盖"
      ],
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "天猫",
      "title": "膳魔师 JNL系列304不锈钢真空保温杯 500ml 多颜色任选",
      "price": 58.25,
      "original": null,
      "shop": "天猫国际",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_596628066.aspx",
      "image": "https://img.alicdn.com/bao/uploaded/O1CN01sz614F21diO2ruozv_!!6000000007008-2-yinhe.png",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 500,
      "material": "304不锈钢",
      "target": "通用",
      "feature": [],
      "unit_price_per_100ml": 11.65,
      "relevance": 170
    },
    {
      "sku": "302489248",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "Stanley史丹利时尚多色巨无霸杯PRO吸管杯保温杯便携",
      "price": 246.0,
      "original": 298.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 995,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=302489248",
      "image": "https://yanxuan-item.nosdn.127.net/b0bce856994ebfc180af500d3ccef4c0.jpg",
      "page": 1,
      "capacity_ml": 0,
      "material": "材质未标注",
      "target": "通用",
      "feature": [
        "吸管杯"
      ],
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "京东",
      "title": "富光 316不锈钢保温杯 大容量双饮 保冷便携",
      "price": 24.59,
      "original": null,
      "shop": "京东自营",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_595254910.aspx",
      "image": "https://img14.360buyimg.com/pop/jfs/t1/85906/12/48923/17982/66d55e33F0437e5b7/c4709fb5ed85210a.png",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 0,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [
        "大容量"
      ],
      "relevance": 170
    },
    {
      "sku": "302307626",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "捷安玺 一盖两用保温杯大容量商务车载必备",
      "price": 57.0,
      "original": 89.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 947,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=302307626",
      "image": "https://yanxuan-item.nosdn.127.net/18a159723a866e28c3302cf17f4b1e61.jpg",
      "page": 1,
      "capacity_ml": 0,
      "material": "材质未标注",
      "target": "成人",
      "feature": [
        "大容量"
      ],
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "京东",
      "title": "富光 316L不锈钢咖啡杯 保温茶杯 便携水杯",
      "price": 27.4,
      "original": null,
      "shop": "京东自营",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_598666379.aspx",
      "image": "https://img14.360buyimg.com/pop/jfs/t1/44145/14/24706/31141/66ceec98F7f619ea9/32dff2268f2428e2.png",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 6000,
      "material": "316不锈钢",
      "target": "通用",
      "feature": [],
      "unit_price_per_100ml": 0.46,
      "relevance": 40
    },
    {
      "sku": "302300235",
      "source": "网易严选",
      "source_host": "you.163.com",
      "platform": "网易严选",
      "title": "杯具熊双饮保温杯上学用车载水杯送礼物",
      "price": 128.0,
      "original": 158.0,
      "shop": "严选自营",
      "brand": "",
      "reviews": 1015,
      "reviews_label": "销量",
      "url": "https://you.163.com/item/detail?itemId=302300235",
      "image": "https://yanxuan-item.nosdn.127.net/a64797a9164a37c84aa954775f97b6cf.png",
      "page": 1,
      "capacity_ml": 0,
      "material": "材质未标注",
      "target": "成人",
      "feature": [],
      "relevance": 170
    },
    {
      "sku": "",
      "source": "慢慢买比价",
      "source_host": "s.manmanbuy.com",
      "platform": "天猫",
      "title": "膳魔师 500ml 雾粉不锈钢保温杯 冷暖长效",
      "price": 65.29,
      "original": null,
      "shop": "天猫国际",
      "brand": "",
      "reviews": null,
      "reviews_label": "评论",
      "url": "https://cu.manmanbuy.com/discuxiao_598306284.aspx",
      "image": "https://img.alicdn.com/bao/uploaded/O1CN01egaCwe1KMkU7UiE7c_!!6000000001150-0-yinhe.jpg",
      "price_label": "到手价",
      "page": 1,
      "capacity_ml": 500,
      "material": "材质未标注",
      "target": "通用",
      "feature": [],
      "unit_price_per_100ml": 13.06,
      "relevance": 170
    }
  ]
};

  /* ================================================================== */
  /* 导出                                                                */
  /* ================================================================== */

  var API = {
    VERSION: '1.0.0',
    MERCHANTS: MERCHANTS,
    PROMOS: PROMOS,
    BANDS: BANDS,
    /* 日期 */
    toDate: toDate, dateKey: dateKey, addDays: addDays, daysBetween: daysBetween,
    isoWeekday: isoWeekday, weekdayCn: weekdayCn,
    /* 活动 */
    dealsOn: dealsOn, upcoming: upcoming, alwaysDeals: alwaysDeals,
    nextOf: nextOf, nextPromo: nextPromo, merchantById: merchantById,
    /* 价格 */
    findBand: findBand, judgePrice: judgePrice, timingAdvice: timingAdvice,
    compareOffers: compareOffers, parseSpec: parseSpec, parseNeed: parseNeed,
    toNum: toNum, fmt: fmt, perLabel: perLabel,
    /* 导出与卡片 */
    calendarCsv: calendarCsv,
    todayCardHtml: todayCardHtml, kfcCardHtml: kfcCardHtml, compareIntroHtml: compareIntroHtml,
    brandTile: brandTile, BRANDS: BRANDS, LOGOS: LOGOS, BRAND_NAMES: BRAND_NAMES,
    /* 真实搜索快照（当当网，抓取时间见 meta.scraped_at） */
    REAL_SEARCH: REAL_SEARCH
  };

  if (isNode) {
    module.exports = API;
  } else {
    global.AJ = global.AJ || {};
    global.AJ.deals = API;
  }
})(typeof window !== 'undefined' ? window : this);
