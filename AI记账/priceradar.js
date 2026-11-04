/**
 * priceradar.js — 物价雷达（生活物价测算：单位换算 + 基准线 + 单价测算 + 避坑）
 *
 * 定位：把「这个价贵不贵」从「模型凭印象报价」变成「本地可复算的三步」。
 *   ① 拆单位：斤 / 公斤 / 克 / 度 / 吨 / 升 / 个 / 杯 / 顿 / 月…，能换就换到基准单位；
 *   ② 算单价：总价 ÷ 数量 = 实际单价，换算过程写死在返回值里，谁都能手算复核；
 *   ③ 对标基准：落进「便宜 / 正常 / 偏贵 / 刺客价」四档，并给出对应避坑建议。
 *
 * 口径纪律（和 deals.js 的价格带同一条）：
 *   基准区间是**生活经验区间**（2026 年校园周边 / 二三线城市的常见零售价），
 *   **不是实时报价**。卡片与回复都必须标明这一点，不许说成「今天市场价」。
 *   同一件东西地区差异大（尤其房租），所以区间给得宽，只在明显偏离时才判刺客。
 *
 * 补充场景（同一个模块的 API.survival，不是另一个功能）：
 *   雷达只回答「这一笔单价贵不贵」，但房租 2000 只是标价，真实月开销还压着
 *   水电、网费、物业，签约那天还要一次掏掉押金 + 首期。所以这里补上
 *   「一组开销怎么拼」：租房 / 水电 / 通勤 / 数码 / 衣服 / 买药六个场景，
 *   算的是月开销与首付现金，共用同一套经验口径、同一张卡片语言。
 *
 * 对外 API（window.AJ.priceradar，Node 下 require 同名）：
 *   BASELINES                 基准表（可数、可断言，不散落在提示词里）
 *   findItem(text)            从一句话里认出是哪件东西
 *   parse(text)               -> {item, qty, unit, total, perUnit}
 *   parseQty(text)            -> {qty, unit} | null
 *   analyze({item,qty,unit,total}) -> 测算结果（含 ok:false 的缺件说明）
 *   looksLikePriceAsk(text)   -> {kind:'compute'|'band'|'ask', parsed} | null
 *   cardHtml(r)               聊天卡片
 *   say(r)                    人话回复（含避坑与下一步）
 *   survival.*                补充场景：detect / rentPlan / utilityPlan /
 *                             transportPlan / digitalPlan / clothesPlan /
 *                             medicalPlan / fromText / cardHtml / say
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);

  /* ================================================================== */
  /* 一、单位表：只做「同类换算」，跨类不猜                               */
  /* ================================================================== */

  /**
   * kind 决定能不能换：
   *   weight 斤/公斤/克/两   volume 升/毫升   power 度   water 吨
   *   gas 立方               count 个/杯/顿/次/月…（各自为政，不互转）
   * f = 换到该类基准单位的倍数（weight 基准=斤，volume=升，power=度，water=吨）
   */
  var UNITS = {
    '斤': { kind: 'weight', f: 1 },
    '市斤': { kind: 'weight', f: 1 },
    '两': { kind: 'weight', f: 0.1 },
    '公斤': { kind: 'weight', f: 2 },
    '千克': { kind: 'weight', f: 2 },
    'kg': { kind: 'weight', f: 2 },
    '克': { kind: 'weight', f: 0.002 },
    'g': { kind: 'weight', f: 0.002 },
    '升': { kind: 'volume', f: 1 },
    'l': { kind: 'volume', f: 1 },
    '毫升': { kind: 'volume', f: 0.001 },
    'ml': { kind: 'volume', f: 0.001 },
    '度': { kind: 'power', f: 1 },
    '千瓦时': { kind: 'power', f: 1 },
    'kwh': { kind: 'power', f: 1 },
    '吨': { kind: 'water', f: 1 },
    '立方': { kind: 'water', f: 1 },
    'm3': { kind: 'water', f: 1 },
    '个': { kind: 'count', f: 1 },
    '只': { kind: 'count', f: 1 },
    '根': { kind: 'count', f: 1 },
    '袋': { kind: 'count', f: 1 },
    '盒': { kind: 'count', f: 1 },
    '瓶': { kind: 'count', f: 1 },
    '桶': { kind: 'count', f: 1 },
    '杯': { kind: 'count', f: 1 },
    '碗': { kind: 'count', f: 1 },
    '顿': { kind: 'count', f: 1 },
    '份': { kind: 'count', f: 1 },
    '单': { kind: 'count', f: 1 },
    '次': { kind: 'count', f: 1 },
    '张': { kind: 'count', f: 1 },
    '件': { kind: 'count', f: 1 },
    '月': { kind: 'count', f: 1 }
  };

  /* 「一个月」「三个月」在口语里就是按月计价：单列出来，否则会被「个」抢先吃掉 */
  UNITS['个月'] = { kind: 'count', f: 1, canon: '月' };
  /* 「打印 50 页」里的「页」和基准的「张」在日常口语里是同义（印一张纸 = 一页），
     不认它就会反问「买了多少张」，把一句本来能算的话问成废话。 */
  UNITS['页'] = { kind: 'count', f: 1, canon: '张' };
  /* 「一小盒」「一小份」：量词前常夹个「小」字，不认就整句没有数量（果切实测踩过） */
  UNITS['小盒'] = { kind: 'count', f: 1, canon: '盒' };
  UNITS['小份'] = { kind: 'count', f: 1, canon: '份' };

  /** 长单位优先匹配（「公斤」不能被「斤」抢先，「毫升」不能被「升」抢先） */
  var UNIT_WORDS = ['千瓦时', '公斤', '千克', '毫升', '立方', '个月', '小盒', '小份', 'kwh', 'kg', 'ml', '斤',
    '两', '克', 'g', 'l', '升', '度', '吨', '个', '只', '根', '袋', '盒', '瓶', '桶',
    '杯', '碗', '顿', '份', '单', '次', '张', '页', '件', '月'];

  /* ================================================================== */
  /* 二、基准表：只放「有共识」的大路货                                   */
  /* ================================================================== */

  /**
   * unit  基准单位（单价按它给出）
   * low/high 正常区间（元 / 基准单位）——经验区间，不是报价
   * countPer 数量单位 → 基准单位的估算比（如 1 斤 ≈ 2.5 个苹果），用于「两个苹果」这类口述
   * alias 同义词（只放多字词，避免「米」「蛋」这种单字误伤）
   * tips  该品类专属避坑（两句以内，能照着做）
   * skip  命中但实际指的是别的东西时的排除正则（如「苹果 16pro」是手机不是水果）
   */
  var BASELINES = [
    {
      id: 'pork', name: '猪肉', unit: '斤', low: 12, high: 26,
      alias: ['猪肉', '五花肉', '里脊', '前腿肉', '后腿肉'],
      channel: '菜市场 / 超市生鲜区',
      tips: ['超市切好装盒的比菜市场散称贵 3~5 元/斤，还含包装重量',
        '早市 10:30 后收摊前常打折，同样的肉能便宜两成']
    },
    {
      /* 排骨比同部位猪肉贵一档，不该和五花肉共用一条线：
         用户问「35 一斤排骨贵吗」，套 12~26 会判成「刺客价」，其实只是偏贵。
         区间按大学城周边菜市场取（佛山南海常见 28~32，收摊价能到 25）。 */
      id: 'ribs', name: '排骨', unit: '斤', low: 25, high: 32,
      alias: ['排骨', '肋排', '小排'],
      channel: '菜市场肉档 / 超市生鲜区',
      tips: ['大学城周边菜市场通常 28~32 元/斤，35 往上多半是精品超市或切好装盒的',
        '要砍价就问「多少钱一斤」而不是「这条多少钱」，按条卖最容易多算二三两']
    },
    {
      id: 'beef', name: '牛肉', unit: '斤', low: 30, high: 55,
      alias: ['牛肉', '牛腩', '牛腱'],
      channel: '菜市场 / 超市生鲜区',
      tips: ['注水牛肉按压会渗水，买前按一下', '牛腩比牛腱便宜 5~8 元/斤，炖着吃没必要买贵的']
    },
    {
      id: 'chicken', name: '鸡肉', unit: '斤', low: 8, high: 18,
      alias: ['鸡腿', '鸡胸肉', '鸡肉', '鸡翅'],
      channel: '菜市场 / 超市冷柜',
      tips: ['冷冻鸡腿常年比冷鲜便宜三成，做熟吃口感差别不大', '临期冷柜傍晚打折，当天吃没问题']
    },
    {
      id: 'egg', name: '鸡蛋', unit: '斤', low: 5, high: 9, countPer: { n: 9, unit: '个' },
      alias: ['鸡蛋', '土鸡蛋'],
      channel: '超市 / 菜市场',
      tips: ['一斤鸡蛋大约 9 个，按个卖的先换算成斤再比',
        '「土鸡蛋」溢价常在 1 倍以上，营养差别没有价格那么大']
    },
    {
      id: 'apple', name: '苹果', unit: '斤', low: 4, high: 8, countPer: { n: 2.5, unit: '个' },
      alias: ['苹果', '红富士'],
      /* 只排除「苹果 16pro / 苹果 15 手机」这类机型；「苹果 12 块」是水果，别一起排掉
         （第一版写成 苹果\s*\d 就把「两个苹果12块贵不贵」整句挡掉了，实测踩过） */
      skip: /iphone|ipad|苹果手机|苹果\s*(?:1[0-9]|se)\s*(?:pro|plus|max|代|寸|款|手机)/i,
      channel: '菜市场 / 流动水果摊',
      tips: ['超市礼盒装含包装和损耗，同品质散称通常便宜三成',
        '按盒卖的先看克数，大盒子常常只有半盒果']
    },
    {
      id: 'banana', name: '香蕉', unit: '斤', low: 3, high: 6, countPer: { n: 4, unit: '根' },
      alias: ['香蕉'],
      channel: '菜市场 / 水果摊',
      tips: ['带黑点的熟蕉最便宜也最甜，当天吃完全没问题',
        '整把买比拆开单根买便宜，宿舍分着吃更划算']
    },
    {
      id: 'fruit', name: '水果', unit: '斤', low: 4, high: 10,
      alias: ['水果', '葡萄', '橘子', '橙子', '梨'],
      channel: '菜市场 / 流动水果摊',
      tips: ['超市冷柜水果有包装与损耗溢价，菜市场散称便宜两三成',
        '吃多少买多少，宿舍放两天就烂，扔掉的才是真贵']
    },
    {
      id: 'watermelon', name: '西瓜', unit: '斤', low: 1.5, high: 3.5, countPer: { n: 0.18, unit: '个' },
      alias: ['西瓜'],
      channel: '菜市场 / 水果摊（整瓜按斤称）',
      tips: ['夏天整瓜常 1~2 元/斤，切成盒装立刻涨到 4~6 元/斤',
        '按个卖的先称一下，8 斤以上才划算；半个瓜要问是不是当天切的']
    },
    {
      id: 'instantnoodle', name: '泡面', unit: '袋', low: 2.5, high: 6,
      alias: ['泡面', '方便面', '桶面'],
      channel: '超市 / 便利店',
      tips: ['便利店比超市贵 1~2 元/袋，囤五连包最便宜',
        '桶装比袋装贵一半，宿舍有碗就买袋装']
    },
    {
      id: 'veg', name: '青菜', unit: '斤', low: 2, high: 5,
      alias: ['青菜', '小白菜', '生菜', '菠菜', '油菜', '油麦菜'],
      channel: '菜市场 / 早市',
      tips: ['菜市场比超市便宜一半是常态，晚饭前去还能再砍价',
        '净菜（洗好切好）价格翻倍，宿舍没灶的话再看净菜']
    },
    {
      id: 'tomato', name: '西红柿', unit: '斤', low: 3, high: 6,
      alias: ['西红柿', '番茄'],
      channel: '菜市场',
      tips: ['反季能贵一倍，冬天买番茄不如买当季菜']
    },
    {
      id: 'rice', name: '大米', unit: '斤', low: 2.5, high: 5,
      alias: ['大米', '东北米', '丝苗米'],
      channel: '超市 / 粮油店',
      tips: ['10 斤装比 5 斤装单价低两成，宿舍四个人分一袋最划算',
        '散装米不比袋装差，认准生产日期即可']
    },
    {
      id: 'milk', name: '牛奶', unit: '升', low: 8, high: 16,
      alias: ['牛奶', '纯牛奶'],
      channel: '超市 / 电商整箱',
      tips: ['按 250ml 算，单盒 2~4 元是正常价；超过 5 元/盒就是买包装',
        '整箱买通常比单盒便宜三成，注意保质期别囤太多']
    },
    {
      id: 'water', name: '水费', unit: '吨', low: 2.5, high: 4.5,
      alias: ['水费', '水费单', '自来水费'],
      channel: '自来水公司（民用第一档）',
      tips: ['先看账单里有没有公摊、垃圾处理费、污水处理费，这些常被算进「水费」',
        '宿舍水费突然翻倍，先查漏水（马桶水箱最常见），一个晚上能漏掉一吨']
    },
    {
      id: 'power', name: '电费', unit: '度', low: 0.5, high: 0.8,
      alias: ['电费', '电费单', '电费钱'],
      channel: '民用电第一档（0.5~0.6 元/度），商业/合表常 1 元以上',
      tips: ['超过 0.8 元/度先问是不是商业电价或合表加价，别直接认',
        '电费偏高先查大功率：空调 26℃ 比 22℃ 省三成、电热水器别常开保温、吹风机与电磁炉最费电']
    },
    {
      id: 'gas', name: '燃气', unit: '立方', low: 2, high: 4,
      alias: ['燃气', '燃气费', '煤气', '天然气'],
      channel: '燃气公司（民用第一档）',
      tips: ['燃气抄表一般是两月一次，单月突然翻倍先确认是不是补抄']
    },
    {
      id: 'rent', name: '房租', unit: '月', low: 600, high: 1200,
      alias: ['房租', '租房', '单间', '合租', '宿舍费'],
      /* 区间与 region.js 的「周边单间 600~1200」对齐：同一条链上不能出现两把房租尺子。
         一线城市由 region 折算（×1.5~1.8 → 900~2160），不在这里写宽区间。 */
      channel: '城中村 / 大学城周边单间（一线城市按地域折算约 1.5~1.8 倍）',
      tips: ['除了租金还要问清：水电是否民用价、有没有中介费/服务费、押几付几',
        '合租看清是不是二房东，签约前确认房东身份证与房产证一致']
    },
    {
      id: 'broadband', name: '宽带', unit: '月', low: 30, high: 80,
      alias: ['宽带', '网费', '宽带费'],
      channel: '运营商融合套餐',
      tips: ['和手机套餐绑在一起的融合价通常比单装宽带便宜一半',
        '宿舍四个人分摊，一人 10~20 元/月是正常水平']
    },
    {
      id: 'laundry', name: '洗衣', unit: '次', low: 2, high: 6,
      alias: ['洗衣机', '洗衣', '洗衣服', '烘干'],
      channel: '宿舍楼下自助洗衣房',
      tips: ['攒够一桶再洗，单件洗一次等于白花钱',
        '脱水另收费的机器先看清标价，别一件一件刷']
    },
    {
      id: 'haircut', name: '理发', unit: '次', low: 15, high: 40,
      alias: ['理发', '剪头发', '剪发', '洗剪吹'],
      channel: '校园周边小店',
      tips: ['进店先问价再坐下，办卡与「总监剪」是最常见的加价点',
        '学生证常有折扣，结账前问一句']
    },
    {
      id: 'print', name: '打印', unit: '张', low: 0.1, high: 0.3,
      alias: ['打印', '复印', '打印费'],
      channel: '校内打印店（校内 0.1 元/面，校外 0.3~0.5 元/面）',
      tips: ['校内打印店 0.1 元/面，校外普遍 0.5 元/页起：50 页资料差价够两杯瑞幸',
        '先问「按面还是按页」：双面打印一张纸两页，按页计价会被多收一倍']
    },
    {
      id: 'subway', name: '地铁', unit: '次', low: 2, high: 6,
      alias: ['地铁', '地铁票'],
      channel: '城市轨道交通',
      tips: ['通勤超过每天两次就办月卡/次卡，通常省两成']
    },
    {
      id: 'bus', name: '公交', unit: '次', low: 1, high: 2,
      alias: ['公交', '公交车', '巴士'],
      channel: '城市公交',
      tips: ['学生卡/月票常打五折，别忘了办']
    },
    {
      id: 'bike', name: '共享单车', unit: '次', low: 1, high: 2,
      alias: ['共享单车', '单车', '骑车'],
      channel: '共享单车（单次）',
      tips: ['月卡普遍 10~20 元，比单次骑便宜一半以上',
        '别买季卡，考试周骑不了几次']
    },
    {
      id: 'canteen', name: '食堂一顿', unit: '顿', low: 8, high: 15,
      alias: ['食堂', '食堂吃饭', '饭堂', '食堂一顿'],
      channel: '高校食堂（一荤一素）',
      tips: ['18:30 后很多窗口半价清仓，同样的菜便宜一半',
        '套餐比单点便宜，先看窗口右上角的套餐牌']
    },
    {
      id: 'takeout', name: '外卖一顿', unit: '单', low: 15, high: 30,
      alias: ['外卖', '点外卖', '外卖一顿'],
      channel: '美团 / 饿了么（含配送与包装）',
      tips: ['先搜「拼好饭」，同店 10~15 元能吃饱',
        '配送费 + 包装费常占三成，凑单满减前先算自己吃不吃得下']
    },
    {
      id: 'noodle', name: '一碗面', unit: '碗', low: 8, high: 18,
      alias: ['面条', '牛肉面', '拉面', '一碗面', '面馆'],
      channel: '校内 / 校外面馆',
      tips: ['校内面馆 8~12 元是正常价，超过 18 元通常在为地段买单',
        '加面加卤的价格先问清，有的店加面比原价还贵']
    },
    {
      id: 'milktea', name: '奶茶', unit: '杯', low: 6, high: 18,
      alias: ['奶茶', '果茶', '柠檬茶', '珍珠奶茶'],
      channel: '连锁奶茶店（中杯）',
      tips: ['蜜雪 6~10 元、喜茶奈雪 18~28 元，同一杯的差价一半是品牌',
        '加料 3 元一份最容易失控，两样加料就够再买一杯']
    },
    {
      id: 'coffee', name: '咖啡', unit: '杯', low: 10, high: 28,
      alias: ['咖啡', '拿铁', '美式', '瑞幸'],
      channel: '连锁咖啡（含券后价）',
      tips: ['先领券再下单，券后 9.9~13 元是常态，原价 30 元不建议买',
        '挂耳/冻干自己冲，一杯成本 2~4 元']
    },
    {
      id: 'waterjug', name: '桶装水', unit: '桶', low: 8, high: 15,
      /* 「矿泉水」原本挂在这里，结果「景区一瓶矿泉水 6 块」被套进「8~15 元/桶」，
         算出来是「很便宜」——语义完全反了。桶装与瓶装分成两条线。 */
      alias: ['桶装水', '大桶水', '桶水'],
      channel: '校内水站送货',
      tips: ['送到宿舍通常加 2 元，自己去水站搬能省这笔',
        '押桶费要留收据，毕业退桶能退钱']
    },
    {
      /* 瓶装水：单价低、场景溢价极高，是最典型的「场景定价」商品。
         景区 / 场馆里 3~4 倍是常态，所以基准按「便利店」取，不按景区取。 */
      id: 'bottlewater', name: '瓶装水', unit: '瓶', low: 1.5, high: 3,
      alias: ['瓶装水', '矿泉水', '纯净水', '饮用水', '农夫山泉', '怡宝', '百岁山'],
      channel: '便利店 / 超市（景区与场馆内另算）',
      tips: ['景区、影院、演唱会场馆里 3~4 倍是常态：出门前在门口便利店买好，一瓶就省 4 块',
        '实在没带就找直饮水机 / 卫生间外的饮水点，或者忍到出园再喝 2 块的水']
    },
    {
      /* 情景一：校园超市日用品。校内便利店有「便利 + 垄断」双重溢价，
         校外超市 / 电商才是常态价 —— 基准带按常态取，校内价高出 30%~50% 属可解释但仍不该当正常价。 */
      id: 'shampoo', name: '洗发水', unit: '瓶', low: 28, high: 35,
      alias: ['洗发水', '洗发露', '沐浴露', '护发素', '洗面奶'],
      channel: '校外超市 / 电商（拼多多百亿补贴、京东自营）',
      tips: ['校内便利店日用品普遍比校外贵 30%~50%，同样牌子校外超市、百亿补贴只要 30 上下',
        '这种「重、保质期长、必用」的东西整箱囤，寄到菜鸟驿站，均价能砍一半']
    },
    {
      id: 'detergent', name: '洗衣液', unit: '瓶', low: 18, high: 32,
      alias: ['洗衣液', '洗衣凝珠', '柔顺剂', '洗衣粉'],
      channel: '电商整箱 / 校外超市',
      tips: ['2kg 装电商常 20~30 元，校内单瓶卖 45 以上就别买了',
        '按「每次成本」比价：浓缩型看着贵，一次用量只要三分之一']
    },
    {
      id: 'tissue', name: '纸巾', unit: '包', low: 3, high: 6,
      alias: ['纸巾', '抽纸', '卷纸', '卫生纸', '手帕纸'],
      channel: '电商整箱 / 校外超市',
      tips: ['整箱买单价能到 1.5~2 元/包，校内单包 5 块以上属于纯便利溢价',
        '看克重不看层数：同样「3 层」，120 抽和 90 抽差的是钱']
    },
    {
      /* 情景二：水果切盒。整果按斤卖 1.5~3.5 的西瓜，切成盒立刻 8~15 元/斤。
         一盒通常半斤上下（countPer），所以「25 元一小盒」= 50 元/斤，直接刺客价。 */
      id: 'fruitcut', name: '果切', unit: '斤', low: 8, high: 15, countPer: { n: 2, unit: '盒' },
      alias: ['果切', '西瓜果切', '水果切盒', '鲜切水果', '水果拼盘'],
      channel: '水果店 / 超市果切柜',
      tips: ['整瓜当季 1.5~3.5 元/斤，切盒通常卖到 8~15 元/斤：多出来的全是刀工和损耗',
        '果切是水果店毛利最高的品类，常用临期果；晚上 8 点后超市黄标常打半价']
    }
  ];

  /* ================================================================== */
  /* 三、解析：认东西 / 认数量 / 认钱                                     */
  /* ================================================================== */

  function norm(s) {
    return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function fmt(n) {
    var v = round2(Number(n) || 0);
    return (Math.abs(v - Math.round(v)) < 1e-9) ? String(Math.round(v)) : v.toFixed(2).replace(/0$/, '');
  }

  function toNumber(v) {
    if (v === null || v === undefined || v === '') { return null; }
    if (typeof v === 'number') { return isFinite(v) ? v : null; }
    var s = String(v).replace(/[０-９]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
    }).replace(/[^\d.]/g, '');
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  /** 中文数字 → 数字（只覆盖日常口述：两/三/十五/二十/半） */
  function cnNum(s) {
    var t = String(s || '');
    if (/^[0-9.]+$/.test(t)) { return parseFloat(t); }
    if (t === '半') { return 0.5; }
    var map = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    if (t.indexOf('十') !== -1) {
      var p = t.split('十');
      var hi = p[0] ? (map[p[0]] || 0) : 1;
      var lo = p[1] ? (map[p[1]] || 0) : 0;
      return hi * 10 + lo;
    }
    var v = 0;
    for (var i = 0; i < t.length; i++) {
      if (map[t[i]] === undefined) { return null; }
      v = v * 10 + map[t[i]];
    }
    return v;
  }

  /** 数量 + 单位（"两个" / "一斤半" / "3.5公斤" / "200度"） */
  function parseQty(text) {
    var t = norm(text);
    if (!t) { return null; }
    var re = new RegExp('([0-9]+(?:\\.[0-9]+)?|[一二两三四五六七八九十半]+)\\s*(' +
      UNIT_WORDS.join('|') + ')');
    var m = t.match(re);
    if (!m) { return null; }
    var qty = cnNum(m[1]);
    if (qty === null || !isFinite(qty) || qty <= 0) { return null; }
    /* 「一斤半」的后缀半：把 1 修正成 1.5 */
    var after = t.slice(m.index + m[0].length);
    if (/^半/.test(after)) { qty += 0.5; }
    return { qty: round2(qty), unit: canonicalUnit(m[2]), index: m.index, len: m[0].length };
  }

  /** 「个月」在语义上就是「月」 */
  function canonicalUnit(u) {
    var k = norm(u);
    var d = UNITS[k];
    return (d && d.canon) ? d.canon : k;
  }

  /**
   * 金额：先认带钱单位的，再认「30 一斤」这类按量报价，最后认「排骨 68」这种裸数字。
   * 数量表达式（「两斤」）先遮掉，否则 2 会被当成钱。
   */
  function parseTotal(text, qty) {
    var t = norm(text);
    var mask = t;
    if (qty && qty.index !== undefined && qty.len) {
      mask = t.slice(0, qty.index) + new Array(qty.len + 1).join(' ') +
        t.slice(qty.index + qty.len);
    }
    var cands = [];
    var re = /[0-9]+(?:\.[0-9]+)?/g;
    var m;
    while ((m = re.exec(mask))) {
      var after = mask.slice(m.index + m[0].length, m.index + m[0].length + 4);
      var before = mask.slice(Math.max(0, m.index - 4), m.index);
      var score;
      if (/^(元|块钱|块|rmb|人民币|毛)/.test(after)) { score = 100; }
      else if (/^(一斤|一公斤|一杯|一份|一顿|一度|一吨|一升|一张|一次|一桶|一个月|每月)/.test(after)) { score = 90; }
      else if (/(花了|付了|一共|总共|共计|消费|合计|收了|交了|充了)$/.test(before)) { score = 80; }
      else if (/^(号|日|月|年|点|岁|折|折后|%|％)/.test(after)) { score = 5; }
      else { score = 50; }
      cands.push({ v: parseFloat(m[0]), i: m.index, score: score });
    }
    if (!cands.length) { return null; }
    /* 分高者胜；同分取靠后的（「12块…36」里 36 才是实际支付） */
    cands.sort(function (x, y) { return (y.score - x.score) || (y.i - x.i); });
    return cands[0].v;
  }

  /** 认东西：长词优先，命中 skip 正则的直接放过（苹果 16pro ≠ 水果苹果） */
  function findItem(text) {
    var t = norm(text);
    if (!t) { return null; }
    var hits = [];
    var i;
    var j;
    for (i = 0; i < BASELINES.length; i++) {
      var b = BASELINES[i];
      if (b.skip && b.skip.test(t)) { continue; }
      for (j = 0; j < b.alias.length; j++) {
        var k = norm(b.alias[j]);
        var at = t.indexOf(k);
        if (at !== -1) { hits.push({ b: b, len: k.length, at: at }); }
      }
    }
    if (!hits.length) { return null; }
    hits.sort(function (x, y) { return (y.len - x.len) || (x.at - y.at); });
    return hits[0].b;
  }

  function parse(text) {
    var t = String(text == null ? '' : text);
    var entry = findItem(t);
    var q = parseQty(t);
    var total = parseTotal(t, q);
    /* 「12 每斤」这种是单价口述：有单位没数量 → 数量记 1 */
    var perUnit = false;
    if (!q && entry && total !== null) {
      var um = t.match(/(每斤|每公斤|每度|每吨|每杯|每顿|每张|每月|一斤|一公斤|一度|一吨|一杯|一顿|一张)/);
      if (um) {
        var u0 = parseQty(um[1]);
        if (u0) { q = { qty: 1, unit: u0.unit, index: um.index, len: um[1].length }; perUnit = true; }
      }
    }
    return {
      item: entry ? entry.name : '',
      entry: entry,
      qty: q ? q.qty : null,
      unit: q ? q.unit : '',
      total: total,
      perUnit: perUnit
    };
  }

  /* ================================================================== */
  /* 四、测算：总价 ÷ 数量 = 单价，再对标基准                              */
  /* ================================================================== */

  var LEVELS = {
    cheap: { label: '很便宜', icon: '🤑', cls: 'cheap',
      text: '明显低于常见区间，先确认品质和日期' },
    normal: { label: '正常价', icon: '✅', cls: 'normal',
      text: '落在常见区间里，这个价可以下手' },
    pricey: { label: '偏贵', icon: '🤔', cls: 'pricey',
      text: '高于常见区间，换个渠道大概率能便宜两三成' },
    rip: { label: '刺客价', icon: '🚨', cls: 'rip',
      text: '远高于常见区间，先别急着付钱' }
  };

  function verdictOf(per, low, high) {
    if (!isFinite(per) || per <= 0) { return null; }
    if (per < low * 0.7) { return 'cheap'; }
    if (per <= high) { return 'normal'; }
    if (per <= high * 1.5) { return 'pricey'; }
    return 'rip';
  }

  /** 把「用户说的量」换算成基准单位的量；换不了返回 null */
  function toBaseQty(qty, unit, entry) {
    var u = UNITS[unit];
    var b = UNITS[entry.unit];
    if (!u) { return null; }
    if (unit === entry.unit) { return { value: qty, approx: false, note: '' }; }
    if (u.kind === b.kind && u.kind !== 'count') {
      return {
        value: qty * u.f / b.f, approx: false,
        note: '1 ' + unit + ' = ' + fmt(u.f / b.f) + ' ' + entry.unit
      };
    }
    /* 数量词换重量（「两个苹果」→ 斤）只认基准里写明的那个量词：
       苹果的 countPer 是「个」，用户说「2 件」不能套用同一个比值 */
    if (u.kind === 'count' && entry.countPer && unit === entry.countPer.unit) {
      var n = entry.countPer.n;
      return {
        value: qty / n, approx: true,
        note: '按 1 ' + entry.unit + ' ≈ ' + fmt(n) + ' ' + entry.countPer.unit + '估'
      };
    }
    return null;
  }

  function unitCn(u) {
    var m = { kg: '公斤', g: '克', l: '升', ml: '毫升', kwh: '度', m3: '立方' };
    return m[u] || u;
  }

  /** 一次就是一个整体的单位：没说数量时按 1 算（「点外卖 35」＝1 单，不必追问）。
   *  斤/公斤/度/吨/升/张 这类量级差异大的不在其中 —— 猜错会把结论算反。 */
  var ONE_IS_NORMAL = { '顿': 1, '单': 1, '杯': 1, '碗': 1, '次': 1, '月': 1, '桶': 1, '瓶': 1, '盒': 1 };

  /**
   * 测算主入口。
   * @param {{item?:string, entry?:Object, qty?:number|string, unit?:string, total?:number|string, text?:string}} input
   * @return {Object} ok:false 时带 code：NO_TOTAL / NO_QTY / NO_ITEM
   */
  function analyze(input) {
    var a = input || {};
    var entry = a.entry || findItem(a.item || a.text || '');
    var total = toNumber(a.total);
    var qty = toNumber(a.qty);
    var unit = String(a.unit == null ? '' : a.unit).trim();
    var un = UNITS[unit] ? canonicalUnit(unit) : (UNITS[norm(unit)] ? canonicalUnit(norm(unit)) : '');
    var assumed = false;

    /* 缺件：先说清缺什么，绝不替用户假定数量或单位 */
    if (!entry) {
      return {
        ok: false, code: 'NO_ITEM',
        message: '没认出是哪件东西，基准表里没有对应品类',
        hint: '直接问用户「是什么东西、多少钱、多少量」，或按普通比价处理'
      };
    }
    if (total === null || total <= 0) {
      return {
        ok: false, code: 'NO_TOTAL', item: entry.name,
        message: '没说多少钱',
        hint: '问用户「' + entry.name + '花了多少钱」'
      };
    }
    if ((!un || qty === null || qty <= 0) && ONE_IS_NORMAL[entry.unit]) {
      qty = 1;
      un = entry.unit;
      assumed = true;
    }
    if (!un || qty === null || qty <= 0) {
      return {
        ok: false, code: 'NO_QTY', item: entry.name, unit: entry.unit,
        message: '没说数量和单位',
        hint: '问用户买了多少 ' + entry.unit + '（' + entry.name + '的基准价是按 ' +
          entry.unit + '算的），不要替用户假定',
        choices: askChoices(entry)
      };
    }

    var conv = toBaseQty(qty, un, entry);
    var unitPrice = round2(total / qty);
    var basePrice = conv ? round2(total / conv.value) : null;
    /* 地域尺子（region.js 传来）：本部 home=true 不折算，输出逐字不变；
       说了别的城市就整条基准带按等级缩放后再判档 —— 同样是 12 元的一荤一素，
       在南海北区是正常价，在深圳就是便宜。判定与展示必须用同一把尺子。 */
    var reg = a.region || null;
    var scaled = !!(reg && !reg.home && reg.mult && reg.mult.length === 2);
    var bandLow = scaled ? round2(entry.low * reg.mult[0]) : entry.low;
    var bandHigh = scaled ? round2(entry.high * reg.mult[1]) : entry.high;
    var level = basePrice === null ? null : verdictOf(basePrice, bandLow, bandHigh);
    var lv = level ? LEVELS[level] : null;
    var noBaseReason = basePrice === null
      ? ('单位对不上：' + entry.name + '的参考价按「' + entry.unit + '」算，你说的是「' +
        unitCn(un) + '」，两者换不过来')
      : '';

    var formula = fmt(total) + ' 元 ÷ ' + fmt(qty) + ' ' + unitCn(un) + ' = ' +
      fmt(unitPrice) + ' 元/' + unitCn(un);
    var baseFormula = '';
    if (basePrice !== null) {
      baseFormula = (un === entry.unit)
        ? ''
        : '≈ ' + fmt(basePrice) + ' 元/' + entry.unit +
          (conv.approx ? '（' + conv.note + '）' : '（' + conv.note + '）');
    }

    var tips = tipsFor(entry, level, basePrice, qty, un);
    var r = {
      ok: true,
      item: entry.name,
      entry: entry,
      qty: qty, unit: unitCn(un), total: round2(total),
      unitPrice: unitPrice, basePrice: basePrice, baseUnit: entry.unit,
      approx: !!(conv && conv.approx),
      /* 数量是「按 1 单/1 顿算」推出来的：卡片要写出来，不能让人以为用户说过 */
      assumed: assumed,
      formula: formula, baseFormula: baseFormula,
      band: { low: bandLow, high: bandHigh, unit: entry.unit, scaled: scaled },
      region: reg,
      channel: entry.channel,
      hasBaseline: basePrice !== null,
      noBaseReason: noBaseReason,
      level: level,
      levelLabel: lv ? lv.label : '没有基准',
      levelIcon: lv ? lv.icon : '📏',
      levelText: lv ? lv.text : noBaseReason,
      tips: tips
    };
    r.say = say(r);
    return r;
  }

  function askChoices(entry) {
    var u = entry.unit;
    if (u === '斤') { return ['按 1 斤算', '按 2 斤算', '按 3 斤算']; }
    if (u === '度') { return ['用了 100 度', '用了 200 度', '用了 300 度']; }
    if (u === '吨') { return ['用了 5 吨', '用了 10 吨', '用了 20 吨']; }
    if (u === '月') { return ['1 个月', '3 个月', '半年']; }
    if (u === '升') { return ['1 升', '2 升', '1 箱']; }
    return ['1 ' + u, '2 ' + u, '3 ' + u];
  }

  /** 避坑建议：品类专属 + 档位专属，最多三条，宁少勿凑。
   *  只有「很便宜 / 刺客价」这两档才追加通用提醒 —— 「偏贵」已经由判断句说明，
   *  再塞一条「换渠道」会把外卖 / 奶茶这类场景建议带成菜市场话术（实测踩过）。 */
  function tipsFor(entry, level, basePrice, qty, unit) {
    var out = (entry.tips || []).slice(0, 2);
    if (level === 'rip') {
      out.unshift('这个价已经偏离常见区间太多，先别急着付：问清单价、克重，以及有没有加工费/服务费');
    } else if (level === 'cheap') {
      out.unshift('便宜得有点反常，先看生产日期、是不是临期或处理品');
    }
    return out.slice(0, 3);
  }

  /* ================================================================== */
  /* 五、人话与卡片                                                       */
  /* ================================================================== */

  /** 回复正文：判断一句 + 避坑 2~3 条 + 下一步（不复述卡片上的算式） */
  function say(r) {
    if (!r || !r.ok) {
      return (r && r.message) ? r.message : '';
    }
    var head = r.levelIcon + ' **' + r.levelLabel + '**：';
    if (r.basePrice === null) {
      head += '算下来 ' + fmt(r.unitPrice) + ' 元/' + r.unit + '，但' +
        (r.noBaseReason || ('基准表里没有「' + r.item + '」')) + '，只能给你单价，没法判断贵不贵。';
    } else if (r.level === 'normal') {
      head += '这个价在正常区间（' + r.item + ' ' + fmt(r.band.low) + '~' +
        fmt(r.band.high) + ' 元/' + r.baseUnit + '），没被坑。';
    } else if (r.level === 'cheap') {
      head += '比常见区间（' + fmt(r.band.low) + '~' + fmt(r.band.high) + ' 元/' +
        r.baseUnit + '）还低，属于捡到便宜了。';
    } else {
      var ratio = r.basePrice && r.band.high ? (r.basePrice / r.band.high) : 0;
      head += '按' + r.baseUnit + '算 ' + fmt(r.basePrice) + ' 元/' + r.baseUnit +
        '，常见区间 ' + fmt(r.band.low) + '~' + fmt(r.band.high) + ' 元/' + r.baseUnit + '，' +
        (ratio >= 2 ? '贵了一倍多。' : '高出一截。');
    }
    var lines = [head];
    /* 地域口径：换过尺子就必须说清「区间为什么变了」，否则用户会以为基准表在乱跳 */
    if (r.region && r.region.label) {
      lines.push(r.region.home
        ? '📍 基准：' + r.region.label + '（校内 / 大学城周边经验价）'
        : '📍 ' + (r.region.note || '') + '（上面的区间已折算）');
    }
    lines.push('');
    if (r.tips && r.tips.length) {
      lines.push('🫂 **避坑**');
      for (var i = 0; i < r.tips.length; i++) {
        lines.push((i + 1) + '. ' + r.tips[i]);
      }
      lines.push('');
    }
    lines.push('👉 **下一步**：把这笔记进账本，攒几次就能看出常买的那几样是不是一直在最贵的那家买。' +
      '参考价是生活经验区间，不是今天的实时报价。');
    return lines.join('\n');
  }

  /** 只说「多少钱算贵」时的基准线回答（用户没给价）。region 可选：换城市就换尺子。 */
  function bandSay(entry, region) {
    if (!entry) { return ''; }
    var lo = entry.low;
    var hi = entry.high;
    var where = '佛山南海 · 广轻大';
    if (region && region.label) { where = region.label; }
    if (region && !region.home && region.mult) {
      lo = round2(entry.low * region.mult[0]);
      hi = round2(entry.high * region.mult[1]);
    }
    return '📏 **' + entry.name + '的参考线**（' + where + '）：正常 ' + fmt(lo) + '~' +
      fmt(hi) + ' 元/' + entry.unit +
      '（' + entry.channel + '，经验区间、不是实时报价）。\n' +
      '超过 ' + fmt(Math.round(hi * 1.5)) + ' 元/' + entry.unit +
      ' 就算贵得离谱了。把你实际花的钱和数量说给我，我算给你看。';
  }

  /** 卡片：只放数字与位置，判断与避坑留给正文，避免同一句话说两遍 */
  function cardHtml(r) {
    if (!r || !r.ok) { return ''; }
    var lv = r.level ? LEVELS[r.level] : null;
    var cls = lv ? lv.cls : 'none';
    var h = [];
    h.push('<div class="pr-card pr-' + cls + '">');
    h.push('<div class="pr-head"><span class="pr-badge">📡 物价雷达</span>' +
      '<span class="pr-lv">' + esc(r.levelIcon + ' ' + r.levelLabel) + '</span></div>');
    /* 地域角标：换过尺子要标出乘数，本部只标基准地 —— 一眼知道这把尺子在哪量 */
    if (r.region && r.region.label) {
      h.push('<div class="pr-region">📍 ' + esc(r.region.label) +
        (r.band && r.band.scaled
          ? ' · 已按 ×' + fmt(r.region.mult[0]) + '~' + fmt(r.region.mult[1]) + ' 折算'
          : ' · 默认基准') + '</div>');
    }
    h.push('<div class="pr-eq"><span>' + esc(r.formula) + '</span></div>');
    if (r.assumed) {
      h.push('<div class="pr-eq2">数量按 1 ' + esc(r.unit) + '算（你没说几份，说个数我再核一遍）</div>');
    } else if (r.baseFormula) {
      h.push('<div class="pr-eq2">' + esc(r.baseFormula) + '</div>');
    }
    if (r.basePrice !== null) {
      /* 位置条：区间 [low*0.5, high*1.5] 线性映射，正常带涂绿，指针落在实付上 */
      var lo = r.band.low;
      var hi = r.band.high;
      var min = Math.max(0, lo * 0.5);
      /* 上界要能容下实际单价，否则远超区间时圆点被钉在最右端，看着像「正好等于上限」 */
      var max = Math.max(hi * 1.5, r.basePrice * 1.08);
      var span = max - min || 1;
      var dot = Math.min(100, Math.max(0, (r.basePrice - min) / span * 100));
      var zl = Math.min(100, Math.max(0, (lo - min) / span * 100));
      var zw = Math.min(100 - zl, Math.max(2, (hi - lo) / span * 100));
      h.push('<div class="pr-bar"><i class="pr-zone" style="left:' + zl.toFixed(1) +
        '%;width:' + zw.toFixed(1) + '%"></i><i class="pr-dot" style="left:' +
        dot.toFixed(1) + '%"></i></div>');
      h.push('<div class="pr-axis"><span>&lt;' + fmt(lo) + '</span><span>正常 ' +
        fmt(lo) + '~' + fmt(hi) + '</span><span>&gt;' + fmt(hi) + '</span></div>');
    }
    h.push('<div class="pr-ref">' + esc(r.item) + ' 参考线 ' + fmt(r.band.low) + '~' +
      fmt(r.band.high) + ' 元/' + esc(r.baseUnit) + ' · ' + esc(r.channel) +
      '，经验区间不是实时报价</div>');
    h.push('</div>');
    return h.join('');
  }

  /* ================================================================== */
  /* 六、触发判定：什么算「问物价」                                        */
  /* ================================================================== */

  /** 评价词：问「贵不贵」才是物价问题；「买了 12 块」只是记账 */
  var ASK_WORDS = ['贵不贵', '贵不贵啊', '贵吗', '贵不', '太贵', '好贵', '贵了', '贵嘛',
    '有点贵', '挺贵', '偏贵', '贵不少', '贵得离谱', '离谱',
    '便宜吗', '便宜不', '划算吗', '划算不', '值不值', '值这个价', '值得吗',
    '被坑', '坑了', '坑吗', '被宰', '宰了', '被忽悠',
    '合理吗', '正常吗', '正常么', '正常价', '正常价格', '算正常', '合适吗', '是不是贵', '算贵', '多少钱算贵',
    /* 抱怨式比价：学生不会说「请问这个价格合理吗」，说的是「好亏」「不对劲」「心疼」。
       只在认出基准品类时才算询价（looksLikePriceAsk 还会再要求有金额），所以不会把记账抢走。 */
    '好亏', '亏了', '亏死', '不对劲', '心疼', '肉疼',
    '物价', '这个价', '这价格', '贵一点', '贵多少'];

  /**
   * 判断一句话是不是物价咨询。
   * @return {?{kind:string, parsed:Object}} kind：
   *   compute —— 有东西 + 有钱（+ 量）→ 直接测算
   *   ask     —— 有东西 + 有钱，但缺数量/单位 → 按基准单位追问
   *   band    —— 只问了「多少钱算贵」，没给价 → 给参考线
   */
  function looksLikePriceAsk(text) {
    var t = String(text == null ? '' : text).trim();
    var c = norm(t);
    if (!c || c.length > 120) { return null; }
    var asked = false;
    for (var i = 0; i < ASK_WORDS.length; i++) {
      if (c.indexOf(ASK_WORDS[i]) !== -1) { asked = true; break; }
    }
    if (!asked) { return null; }
    var p = parse(t);
    if (!p.entry) { return null; }
    if (p.total !== null && p.qty !== null) { return { kind: 'compute', parsed: p }; }
    if (p.total !== null) { return { kind: 'ask', parsed: p }; }
    return { kind: 'band', parsed: p };
  }

  /* 下面这段是「物价雷达」的补充场景：一次交易的对标之外，
     还要回答「一个月到底要花多少」。同属一个模块，共用口径与卡片语言。 */
  var SVX = (function () {
    /* ================================================================== */
    /* 一、费率：所有数字集中在这里，改一处就够                              */
    /* ================================================================== */

    /**
     * 这些是「民用水电 + 校园周边」的常见口径。
     * 一线城市、商水商电、城中村会明显不同，所以只在卡片上标区间，不给唯一答案。
     */
    var RATES = {
      /* 电价：民用第一档约 0.5~0.6 元/度，商业/合表 1 元往上（规格口径 0.6 / 1.2） */
      powerCivil: 0.6,
      powerComm: 1.2,
      /* 水价：约 3 元/吨（含污水处理费的城市会到 4~5） */
      water: 3,
      /* 单人单间月用量：水 4 吨、电 100 度（不开空调）/ 180 度（夏天开空调） */
      waterUse: 4,
      powerUse: 100,
      powerUseAC: 180,
      /* 宽带：单拉 60 元/月，合租可分摊 */
      net: 60,
      /* 物业：1.2 元/㎡·月（普通小区 0.5~3） */
      property: 1.2,
      /* 中介费：常见为半个月租金 */
      agencyMonths: 0.5,
      /* 通勤：默认单程打车 3 公里约 15 元，地铁 4 元，公交 2 元，每月 22 个工作日 */
      taxiFare: 15,
      metroFare: 4,
      busFare: 2,
      workDays: 22,
      /* 服装：单次穿着成本的默认预估次数 */
      wears: 10
    };

    /* 租金区间的口径与 priceradar 的 rent 条目保持一致，避免同一句话两个答案 */
    var RENT_BAND = { low: 600, high: 2000, unit: '月' };

    /* 每个场景在聊天里的「发射头」图标 + 启动语（面板页签的 tab 版不受影响） */
    var ICON = {
      rent: '🏠', utility: '⚡', transport: '🚕', digital: '💻',
      clothes: '👕', medical: '💊', grocery: '🥩',
      telecom: '📱', hairstyle: '💈', gym: '🏋️', secondhand: '🐟',
      usedbuy: '🎮', promo: '🛒', subs: '📺', playbook: '🗺️'
    };
    var LAUNCH = {
      rent: '生存成本测算雷达启动！',
      utility: '水电刺客排查启动！',
      transport: '出行降本雷达启动！',
      digital: '数码防割雷达启动！',
      clothes: '穿衣性价比雷达启动！',
      medical: '医疗防割雷达启动！',
      grocery: '物价刺客雷达启动！',
      telecom: '话费降本雷达启动！',
      hairstyle: '校园预付卡防割雷达启动！',
      gym: '健身卡防反悔雷达启动！',
      secondhand: '闲鱼防坑雷达启动！',
      usedbuy: '二手验机雷达启动！',
      promo: '凑单防反薅雷达启动！',
      subs: '订阅防背刺雷达启动！',
      playbook: '大促攻略雷达启动！'
    };

    /* ================================================================== */
    /* 二、场景表                                                          */
    /* ================================================================== */

    /**
     * words  —— 命中即「这个话题」；
     * strong —— 强信号词，即使带金额也按咨询处理（这些词本身就在问怎么签/怎么防）；
     * 顺序即优先级：越具体的场景放前面，避免「交房租」被「交费」类词抢走。
     */
    var SCENES = [
      {
        id: 'rent', name: '租房',
        words: ['房租', '租房', '租房子', '找房', '合租', '单间', '整租', '二房东',
          '押一付', '押二付', '押三付', '押金', '中介费', '房产证', '看房', '签合同'],
        strong: ['押一付', '押二付', '押三付', '二房东', '中介费', '房产证', '看房', '签合同', '找房']
      },
      {
        id: 'medical', name: '看病买药',
        words: ['买药', '药店', '药房', '看病', '挂号', '校医院', '医院', '门诊', '感冒药',
          '退烧', '布洛芬', '消炎药', '医保', '报销', '体检', '牙科', '配眼镜'],
        strong: ['校医院', '挂号', '报销', '医保', '门诊']
      },
      {
        id: 'transport', name: '出行通勤',
        words: ['打车', '地铁', '公交', '通勤', '车费', '火车票', '高铁', '学生票',
          '滴滴', '高德', '共享单车', '油费', '停车费'],
        strong: ['通勤', '学生票', '打车费', '高铁', '火车票']
      },
      {
        id: 'telecom', name: '话费流量',
        /* 注意：「移动」既是运营商也常作动词（移动硬盘/移动电源/移动支付），
           所以不放进 strong，且在 detect 里对「移动+非通信名词」做排除。 */
        words: ['话费', '流量', '套餐', '运营商', '手机号', '月租', '保号', '副卡',
          '大流量', '电信', '移动', '联通', '校园卡', '改套餐', '降档'],
        strong: ['保号', '副卡', '改套餐', '降档', '校园卡']
      },
      {
        id: 'hairstyle', name: '理发办卡',
        words: ['理发', '剪发', '美发', 'tony', '托尼', '充值卡', '理发店', '办卡',
          '预付卡', '会员卡', '洗剪吹', '烫染'],
        strong: ['充值卡', '预付卡', '会员卡']
      },
      {
        id: 'gym', name: '健身办卡',
        words: ['健身房', '年卡', '健身卡', '私教', '游泳卡', '撸铁', '瑜伽卡',
          '健身', '办健身'],
        strong: ['年卡', '健身卡', '私教', '游泳卡']
      },
      {
        id: 'secondhand', name: '二手交易',
        words: ['闲鱼', '二手', '转转', '到手刀', '卖闲置', '闲置', '出手', '买家',
          '卖家', '面交', '退货', '砍价', '寄售'],
        strong: ['到手刀', '卖闲置']
      },
      {
        /* 买二手数码：和「卖闲置」是两件事——买的坑在版本 / 配件 / 账号。
           词只放机器名，避免「二手」把卖货句子也抢过来（detect 里按买/卖意图改判）。 */
        id: 'usedbuy', name: '二手购入',
        words: ['switch', 'ps5', 'kindle', '二手'],
        strong: ['switch', 'ps5']
      },
      {
        id: 'digital', name: '数码',
        words: ['手机', '电脑', '笔记本', '平板', '耳机', '相机', '数码', 'ipad', 'iphone',
          'macbook', '显卡', '显示器', '键盘', '鼠标', '教育优惠', '百亿补贴'],
        strong: ['教育优惠', '百亿补贴', '学生优惠']
      },
      {
        id: 'clothes', name: '衣服',
        words: ['衣服', '外套', '羽绒服', '球鞋', '鞋', '裤子', 't恤', '卫衣', '衬衫',
          '穿搭', '联名', '快时尚', '换季', '反季'],
        strong: ['联名', '反季', '快时尚', '穿搭']
      },
      {
        id: 'utility', name: '水电燃气',
        words: ['水费', '电费', '燃气费', '燃气', '物业费', '网费', '宽带', '水电',
          '商用电', '民用电', '电价', '水价'],
        strong: ['水电费', '商水商电', '民用电', '商业电', '商用电', '电价']
      },
      {
        /* 大促凑单：和「衣服 / 数码」共用一句话，但问的不是「这件值不值」，
           而是「为了省 50 多花 80 到底赚没赚」。词按「活动 / 满减动作」收，
           顺序放在买衣服之后，靠词长（双十一 3 字 > 衣服 2 字）抢过来。 */
        id: 'promo', name: '大促凑单',
        words: ['凑单', '凑满', '满减', '双十一', '双11', '618', '预售', '尾款',
          '加购', '购物车', '凑了', '硬买'],
        strong: ['凑单', '凑满', '满减', '预售', '尾款']
        /* 注意：这些词只负责「命中候选」，promo 是否成立还要过 detect 里的
           第一人称动作门禁 —— 「双十一怎么玩京东」问的是攻略，不是复盘。 */
        /* 「定金」不进词表：租房里「中介让我交定金」比大促定金常见得多，
           宁可漏掉一句「付了 50 定金」，也别把租房答成凑单。 */
      },
      {
        /* 平台攻略：用户问的是「这平台怎么玩 / 有什么套路 / 怎么买最省」，
           不是「我凑单被反薅了」。两者共用「双十一 / 满减」这类词，
           只能靠「有没有第一人称已完成动作」分开（见 detect 尾部的 promo 门禁）。
           放在 promo 之后：先让 promo 命中，再用行为门禁决定留不留下。 */
        id: 'playbook', name: '平台攻略',
        /* 只收「大促名 / 平台机制名」，不收「怎么买便宜 / 买最省」这类通用方法论词：
           那些词 5 个字，会把「买衣服怎么买便宜」从 clothes 手里抢成攻略。
           通用的「怎么玩 / 有没有套路」交给 detect 里的平台名 + 疑问语气判定。 */
        words: ['双十一', '双11', '618', '年货节', '大促',
          '领券', '价保', '优惠券', '省钱攻略', '满减券'],
        strong: ['领券', '价保', '省钱攻略']
      },
      {
        /* 订阅制：用户问的从来不是「15 块贵不贵」，而是「忘了关又扣了」。
           词收「续费 / 免密」这类机制词，避免把「会员卡」（理发店）抢过来 ——
           那边是 3 字词，长度优先，仍然归 hairstyle。 */
        id: 'subs', name: '会员订阅',
        words: ['视频会员', '自动续费', '连续包月', '连续包年', '免密支付', '自动扣款',
          '会员', '续费', '追剧', '爱奇艺', '腾讯视频', '优酷', '芒果tv',
          'b站大会员', '网易云音乐', '网盘会员'],
        strong: ['自动续费', '连续包月', '免密支付', '自动扣款']
      },
      {
        id: 'grocery', name: '买菜做饭',
        /* 只认「做饭买菜」类词：排骨/青菜/蔬菜/菜场… 不认裸「超市/生鲜/逛超市」，
           否则「在超市买两个苹果贵不贵」会被错判成买菜场景、抢走单价雷达。 */
        words: ['买菜', '菜市场', '菜场', '早市', '排骨', '青菜', '蔬菜', '买斤',
          '一斤肉', '买点菜', '做饭', '伙食', '食材'],
        strong: ['菜市场', '早市', '买菜', '菜场', '做饭']
      }
    ];

    /* 咨询意图词：出现这些才算「在问怎么办」，否则带金额就是记账 */
    var CONSULT = ['怎么', '怎样', '如何', '注意', '准备', '够不够', '够吗', '够用',
      '该不该', '要不要', '值不值', '划算', '便宜', '省钱', '避坑', '防坑', '坑',
      '贵', '多少钱', '多少', '正常吗', '合理吗', '建议', '推荐', '攻略', '指南',
      '学生', '优惠', '报销', '对比', '还是', '哪个', '能不能', '可不可以', '靠谱吗',
      '一般', '大概', '估算', '预算', '算下来', '真实', '隐藏'];

    /* 疑问标记：句子是问句但没踩中 CONSULT 词时兜底 */
    var QUESTION = /[?？]|吗|呢|么$/;

    /* ================================================================== */
    /* 三、小工具（零依赖，Node 可直接跑）                                   */
    /* ================================================================== */

    function norm(s) {
      return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
    }

    function esc(s) {
      return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
    }

    function round2(n) {
      return Math.round(n * 100) / 100;
    }

    function fmt(n) {
      var v = round2(Number(n) || 0);
      return (Math.abs(v - Math.round(v)) < 1e-9) ? String(Math.round(v)) : v.toFixed(2).replace(/0$/, '');
    }

    function toNumber(v) {
      if (v === null || v === undefined || v === '') { return null; }
      if (typeof v === 'number') { return isFinite(v) ? v : null; }
      var s = String(v).replace(/[０-９]/g, function (c) {
        return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
      }).replace(/[^\d.]/g, '');
      var n = parseFloat(s);
      return isFinite(n) ? n : null;
    }

    /** 金额：带「元/块/块钱」的数优先；没有就取「花了/一共/每月」后面那个数 */
    function parseMoney(text) {
      var t = norm(text);
      var re = /([0-9]+(?:\.[0-9]+)?)\s*(?:元|块钱|块|rmb)/g;
      var all = [];
      var m;
      while ((m = re.exec(t))) { all.push({ v: parseFloat(m[1]), i: m.index }); }
      if (all.length) {
        /* 「押一付三 2000」这类：取最后一个带钱单位的（前面的常是数量/期数） */
        return all[all.length - 1].v;
      }
      var m2 = t.match(/(?:花了|付了|交了|一共|总共|每月|月租|一个月|大概|大约)\s*([0-9]+(?:\.[0-9]+)?)/);
      if (m2) { return parseFloat(m2[1]); }
      /* 兜底：「房租2000」这种钱数紧贴场景词、不带「元/块」的说法。
         取句中最大的数（≥100），这样「押2付3」「15平」这类小数字不会被当成金额。 */
      var nums = t.match(/[0-9]+(?:\.[0-9]+)?/g);
      if (nums) {
        var best = null;
        for (var i = 0; i < nums.length; i++) {
          var v = parseFloat(nums[i]);
          if (v >= 100 && (best === null || v > best)) { best = v; }
        }
        if (best !== null) { return best; }
      }
      return null;
    }

    /** 中文数字（押一付三里的一/三） */
    var CN = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

    /** 数字 → 中文（押一付三不写「押1付3」） */
    function cnOf(n) {
      var map = { 1: '一', 2: '二', 3: '三', 4: '四', 5: '五' };
      return map[n] || String(n);
    }

    /** 押几付几：「押一付三」「押一付一」「押2付1」 */
    function parseDeposit(text) {
      var t = norm(text);
      var m = t.match(/押([一二两三四五1-5])\s*付([一二两三四五1-5])/);
      if (!m) { return null; }
      return { deposit: CN[m[1]], pay: CN[m[2]] };
    }

    function parseArea(text) {
      var t = norm(text);
      var m = t.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:平米|平方米|平方|㎡|平)/);
      if (!m) { return null; }
      var v = parseFloat(m[1]);
      return (v >= 5 && v <= 400) ? v : null;
    }

    function parseKwh(text) {
      var m = norm(text).match(/([0-9]+(?:\.[0-9]+)?)\s*(?:度|千瓦时|kwh)/);
      return m ? parseFloat(m[1]) : null;
    }

    function parseTon(text) {
      var m = norm(text).match(/([0-9]+(?:\.[0-9]+)?)\s*(?:吨|立方|m3)/);
      return m ? parseFloat(m[1]) : null;
    }

    /** 通勤天数：「每周5天」「22天」 */
    function parseDays(text) {
      var t = norm(text);
      var m = t.match(/(?:每月|一个月|月)\s*([0-9]+)\s*天/);
      if (m) { return Math.min(31, Math.max(1, parseInt(m[1], 10))); }
      var m2 = t.match(/每周\s*([0-9]+)\s*天/);
      if (m2) { return Math.min(31, Math.max(1, parseInt(m2[1], 10) * 4)); }
      var m3 = t.match(/([0-9]+)\s*天/);
      if (m3) {
        var d = parseInt(m3[1], 10);
        return (d >= 1 && d <= 31) ? d : null;
      }
      return null;
    }

    /** 人数：「4 个人」「宿舍 6 人」「两个人平摊」 */
    function parsePeople(text) {
      var t = norm(text);
      var m = t.match(/([0-9]+)\s*个人/);
      if (m) { var n = parseInt(m[1], 10); return (n >= 1 && n <= 20) ? n : null; }
      if (/两个人|两人|俩人/.test(t)) { return 2; }
      if (/三个人|三人/.test(t)) { return 3; }
      if (/四个人|四人|宿舍/.test(t)) { return 4; }
      return null;
    }

    /* ================================================================== */
    /* 四、场景识别                                                        */
    /* ================================================================== */

    /** 按 id 取场景：避免用 SCENES[i] 硬编码下标，新增/重排场景时会静默错位 */
    function sceneById(id) {
      for (var i = 0; i < SCENES.length; i++) {
        if (SCENES[i].id === id) { return SCENES[i]; }
      }
      return null;
    }

    /**
     * 判断一句话是不是「生存开销咨询」。
     * 关键门控：带金额 + 没有任何咨询口吻 → 返回 null，交回记账链路。
     * 否则「交房租 2000」会被当成咨询，「买衣服 300」会被抢走。
     *
     * @return {?{scene:string, name:string, money:?number, strong:boolean}}
     */
    function detect(text) {
      var raw = String(text == null ? '' : text);
      var t = norm(raw);
      if (!t || t.length > 140) { return null; }

      /* 单价优先，但「集体账单 / 买菜做饭」场景不让位：
         「电费 180 贵不贵」想知道一度多少钱 → 交回物价雷达（追问用量 → 续算）；
         但「宿舍电费 4 人 300 正常吗」是账单是否正常 → 归生存场景；
         「超市排骨青菜 45 块」是买菜总账 → 归买菜场景。
         判别：单价问法 + 没有「集体 / 买菜」信号时才让位；有信号就留给场景识别。
         房租例外：房租的价值恰在月开销与签约现金流，不在这条让位规则里。 */
      /* 集体账单信号：出现这些词，哪怕没问号也是「帮我看看这笔账」的咨询语境，
         不该让位给单价雷达。注意：买菜类词（超市/菜市场/买菜…）不放这里——
         它们只用于命中 grocery 场景，但「在超市买两个苹果贵不贵」是单价问法应交给雷达，
         放这里会把它错判成买菜场景。grocery 是否算咨询由下方 consult 门控单独判定。 */
      var sceneSignal = /宿舍|合租|平摊|几个人|我们|这月|账单|交了|正常吗|合理吗|偏高|刺客|背刺|被坑|超标|乱收费|正常|是不是|吓人|肉疼|心疼|生活费|月度|一个月|每月|开销|话费|流量|理发|充值卡|理发店|健身房|年卡|闲鱼|二手|到手刀|保号|副卡|预付卡|办卡/.test(t);

      var ask = looksLikePriceAsk(raw);
      if (ask && ask.parsed && ask.parsed.entry && ask.parsed.entry.id !== 'rent') {
        if (!sceneSignal) { return null; }
      }

      var hit = null;
      var hitLen = 0;
      var hitWord = '';
      for (var i = 0; i < SCENES.length; i++) {
        var sc = SCENES[i];
        for (var j = 0; j < sc.words.length; j++) {
          var w = sc.words[j];
          if (t.indexOf(w) !== -1 && w.length > hitLen) {
            hit = sc; hitLen = w.length; hitWord = w;
          }
        }
      }
      /* 只说平台名 + 「想了解 / 介绍 / 说说」：一个场景词都没命中，但意图很明确是
         攻略咨询。「不是，我要了解京东」就是这种句子 —— 前面刚被答成凑单复盘，
         用户纠正之后如果这里直接 return null，它会掉到云端裸答，上一轮的语境全丢。 */
      var platAsk = false;
      if (!hit && /京东|淘宝|天猫|拼多多|唯品会|抖音商城|抖音|苏宁|得物|1688/.test(t) &&
        /了解|介绍|说说|讲讲|想知道|科普|怎么玩|怎么用|怎么买|怎么省|有什么|有哪些|攻略|套路/.test(t)) {
        var pbOnly = sceneById('playbook');
        if (pbOnly) { hit = pbOnly; hitWord = '平台攻略'; platAsk = true; }
      }

      if (!hit) { return null; }

      /* 「移动硬盘 / 移动电源 / 移动支付」里的「移动」是动词，不是中国移动。
         命中 telecom 只是因为这个词，且句中没有真正的通信词 → 判为误命中，让位。
         这是硬约束：宁可漏判话费，也不能把「买移动硬盘」答成话费套餐。 */
      if (hit.id === 'telecom' && t.indexOf('移动') !== -1 &&
        !/话费|流量|套餐|运营商|月租|保号|副卡|校园卡|电信|联通|手机号/.test(t)) {
        return null;
      }

      /* 「合租怎么分摊水电」问的是水电，不是房租：话题里只有水电类词、没有租约类词时
         把场景改判给 utility，否则会拿一张房租对照表答非所问。 */
      var UTIL_WORDS = ['水电', '水费', '电费', '网费', '燃气', '宽带'];
      var LEASE_WORDS = ['房租', '租金', '押', '签合同', '房产证', '二房东', '中介费'];
      if (hit.id === 'rent') {
        var hasUtil = false;
        var hasLease = false;
        var u, l;
        for (u = 0; u < UTIL_WORDS.length; u++) {
          if (t.indexOf(UTIL_WORDS[u]) !== -1) { hasUtil = true; break; }
        }
        for (l = 0; l < LEASE_WORDS.length; l++) {
          if (t.indexOf(LEASE_WORDS[l]) !== -1) { hasLease = true; break; }
        }
        if (hasUtil && !hasLease) { hit = sceneById('utility') || hit; hitWord = '水电'; }
      }

      /* 「买二手 Switch」买的是机器，「闲鱼卖旧手机」才是卖闲置——两件事的坑完全不同。
         先把卖货语境排掉，剩下的「买 / 入手 / 划算」一律按「二手购入」答（版本 / 配件 / 账号）。 */
      if (hit.id === 'secondhand') {
        var selling = /卖|出手|回血|挂闲鱼|买家|卖家|到手刀|寄售/.test(t);
        var buying = /买|入手|收一个|求购|划算|值不值|值吗|想换/.test(t);
        if (buying && !selling) { hit = sceneById('usedbuy') || hit; hitWord = '二手购入'; }
      }

      /* 「为了凑单买了一件 80 的衣服」问的是凑单，不是这件衣服值不值。
         「衣服 / 数码」这类词 2 个字，和「凑单」打平时顺序会偏向商品场景，
         所以促销机制词在场就改判 —— 满减 / 预售 / 双十一 才是这句话的主语。 */
      if ((hit.id === 'clothes' || hit.id === 'digital') &&
        /凑单|凑满|满减|满\s*\d+\s*减\s*\d+|双十一|双11|618|预售|尾款/.test(t)) {
        hit = sceneById('promo') || hit; hitWord = '大促凑单';
      }

      /* ===== 平台攻略 vs 大促凑单：词袋分不清「我做了」和「我想了解」 =====
         「双十一我为了凑单硬买了 80」是复盘（promo：算净亏多少）；
         「双十一怎么玩京东 / 套路多吗 / 怎么买最省」是攻略（playbook：三层优惠怎么叠）。
         两者共用「双十一 / 满减」这类词，只能靠一件事分开：有没有第一人称已完成动作。
         这条门禁是必须的：「双十一」是 3 字词，比任何场景词都长，不加它会把
         所有关于大促的提问都吞成「你被反薅了」。 */
      var PROMO_DONE = /凑单|凑满|凑了|硬买|多买|买多了|反薅|被薅|为了凑|尾款|下了单|下单了|付了.{0,4}定金|交(了|完).{0,4}定金/;
      var PLAT_NAME = /京东|淘宝|天猫|拼多多|唯品会|抖音商城|抖音|苏宁|得物|1688|聚划算/;
      /* 方法论词：命中就是「教我怎么操作」，即便句子里有商品词也该走攻略 */
      var HOWTO = /怎么玩|怎么买|怎么省|怎么薅|买最省|攻略|玩法|套路|有什么优惠|有哪些优惠|有什么券|领券|价保/;
      /* 只有弱疑问词时，句中有明确商品才继续留给商品场景（「百亿补贴买手机靠谱吗」归数码） */
      var HOWTO_WEAK = /靠谱吗|值得吗|值不值|介绍|了解|说说/;
      var GOODS_WORD = /手机|电脑|笔记本|平板|耳机|相机|显卡|显示器|键盘|鼠标|衣服|鞋|外套|羽绒服|洗发水|纸巾|洗衣液/;

      if (hit.id === 'promo' && !PROMO_DONE.test(t)) {
        var pbA = sceneById('playbook');
        if (pbA) { hit = pbA; hitWord = '平台攻略'; }
      } else if (hit.id !== 'promo' && hit.id !== 'playbook' &&
        PLAT_NAME.test(t) && !PROMO_DONE.test(t)) {
        if (HOWTO.test(t) || (HOWTO_WEAK.test(t) && !GOODS_WORD.test(t))) {
          var pbB = sceneById('playbook');
          if (pbB) { hit = pbB; hitWord = '平台攻略'; }
        }
      }

      var strong = false;
      for (var k = 0; k < hit.strong.length; k++) {
        if (t.indexOf(hit.strong[k]) !== -1) { strong = true; break; }
      }

      var consult = strong;
      if (!consult) {
        for (var q = 0; q < CONSULT.length; q++) {
          if (t.indexOf(CONSULT[q]) !== -1) { consult = true; break; }
        }
      }
      if (!consult && QUESTION.test(t)) { consult = true; }
      /* 平台攻略类：句子里没有任何场景词，只有平台名 + 「想了解」，也算咨询、不入账 */
      if (platAsk) { consult = true; }
      /* playbook 天然是「问怎么操作」，不是流水：不加这条，
         「双十一怎么玩京东」这种没写问号的句子会被记账门控挡掉 */
      if (hit.id === 'playbook') { consult = true; }

      var money = parseMoney(raw);

      /* 凑单是「行为复盘」而不是流水：只要说出满减规则（满 X 减 Y）或「凑单」，
         就是在问这波赚没赚，不该被当成「买了一件 80 的衣服」直接记账。 */
      if (!consult && hit.id === 'promo' &&
        /满\s*\d+\s*减\s*\d+|凑单|凑满|硬凑/.test(t)) {
        consult = true;
      }

      /* 带总额 / 带人数的集体账单，本身就是「帮我拆这笔账」的咨询意图，
         即便没写问号也不该当记账流水：买菜带金额、水电带人数即视为咨询。 */
      if (!consult) {
        if (hit.id === 'grocery' && money !== null) {
          consult = true;
        } else if (hit.id === 'utility') {
          var _pe = parsePeople(t);
          if (_pe && _pe > 1) { consult = true; }
        }
      }

      /* 记账门控：有金额、没有咨询口吻 —— 这是流水，不是咨询 */
      if (!consult) { return null; }

      /* 水电这个场景特殊：带金额 + 带用量时交给 priceradar 判单价，别抢 */
      if (hit.id === 'utility' && money !== null &&
        (parseKwh(raw) !== null || parseTon(raw) !== null)) {
        return null;
      }

      return {
        scene: hit.id, name: hit.name, money: money,
        strong: strong, word: hitWord, text: raw
      };
    }

    /* ================================================================== */
    /* 五、各场景测算                                                      */
    /* ================================================================== */

    function row(label, value, note) {
      return { label: label, value: value, note: note || '' };
    }

    /**
     * 各场景的 A/B 连环子应答：键 = 选项原文（必须与 choices 完全一致），值 = 子应答正文。
     * 这些不是「再算一遍」，是同一台雷达的延伸科普，本地写死、随点随出，不联网、不调模型。
     */
    var FOLLOWUPS = {
      rent: {
        '帮我算算如果月薪 3000，租房 1500 还能活吗？':
          '🧮 月薪 3000 的租房生存账：\n' +
          '· 房租 1500 + 水电网物业 ≈ 1800，剩 1200 元 / 月生活费，约 40 元 / 天；\n' +
          '· 吃饭按 20 元 / 天算 ≈ 600，交通 + 话费 ≈ 200，还能留 400 机动；\n' +
          '· 结论：紧但不至于活不下去，前提是「房租 ≤ 收入 30%」这条线没破。\n' +
          '真要宽松，房租压到 1000 以内（合租 / 远一点），每月能多喘 500 口气。',
        '教我怎么辨别中介和二房东的合同陷阱':
          '🫂 三查 + 三不签：\n' +
          '1. 查证件：房东身份证姓名与房产证（红本）是否一致；二房东必须看原房东的委托转租授权，否则他跑路你钱房两空；\n' +
          '2. 查费用：中介费、押金、是否「押一付三」写进合同，口头承诺一律当没说；\n' +
          '3. 查违约：提前退租怎么扣、押金几日内退、家电坏了谁修。\n' +
          '三不签：证件对不上的不签、让你现金给「朋友代收」的不签、合同空白项的不签。'
      },
      utility: {
        '帮我在宿舍群发一条温和的省电倡议书':
          '📣 可直接复制的版本：\n' +
          '「宝子们，最近咱宿舍电费有点高～为了大家钱包，约几个小动作：空调设 26℃ + 风扇、不用的插头顺手拔、大功率电器错峰用。' +
          '月底电费平摊，省下的都是奶茶钱 🧋 爱你们～」\n' +
          '（温和的关键：说「平摊」不说「谁用的」，提省钱不说指责。）',
        '教我怎么排查耗电最大的电器':
          '🔌 排查四步：\n' +
          '1. 看电表：拉闸逐个房间试，哪个闸一拉电表转速骤降，就是它；\n' +
          '2. 揪大户：电热水器常保温、老冰箱密封条老化、空调外机脏堵，是三个常见电老虎；\n' +
          '3. 拔插头：充电器 / 排插待机也在耗电，出门拔；\n' +
          '4. 空调 26℃：每调低 1℃ 多耗 6%~10%。'
      },
      transport: {
        '教我怎么用学生票买高铁票最划算':
          '🎫 学生票攻略：\n' +
          '1. 先核验：12306 App 里做「学生资质核验」，动车二等座打 7.5 折，每学年 4 次单程（家庭—学校区间）；\n' +
          '2. 掐时点：大促 / 寒暑假前放票就抢，别等当天；\n' +
          '3. 算总账：打车去车站 40 如果高铁票没打折，这一趟就亏了——先把学生票用了再谈打车。',
        '打车怎么用特惠快车省钱':
          '🚕 打车省钱三招：\n' +
          '1. 勾特惠 / 拼车：比普通快车便宜 30%~50%，不赶时间就选它；\n' +
          '2. 拼人：校园群里找同方向的人平摊，每人十几块；\n' +
          '3. 提前 20 分钟出门：公交 / 地铁优先，能省下大半天的饭钱。'
      },
      digital: {
        '帮我在京东百亿补贴挑几款适合看网课的平板。':
          '🛒 京东 / 拼多多百亿补贴挑平板（只看「看网课」够用就行）：\n' +
          '· 苹果 iPad 数字版（10.9"）：补贴价常比教育价还低一截，屏幕 + 系统最稳；\n' +
          '· 华为 MatePad 11（骁龙 / 麒麟）：鸿蒙多屏协同好用，看课 + 记笔记顺手；\n' +
          '· 小米平板 6 / 红米平板：同价位配置最高，预算紧选它，屏幕大续航久；\n' +
          '· 联想小新 Pad：入门够用，性价比高。\n' +
          '挑选口诀：看网课只看「屏幕 + 续航 + 重量」，别为处理器和内存多花钱；' +
          '认准「百亿补贴」标 + 官方旗舰发货，别买第三方翻新。',
        '告诉我怎么完成教育优惠认证？':
          '🎓 教育优惠认证（三选一，免费）：\n' +
          '1. 苹果 / 微软官网教育商店：用学信网 / 校园邮箱认证，常年有效，返校季（7-9 月）还送耳机 / 配件；\n' +
          '2. 京东 / 天猫「校园认证」入口：认证后解锁学生价，认准带「教育」标识的店铺；\n' +
          '3. 线下去直营店：带学生证 + 身份证，店员协助认证。\n' +
          '认证不花一分钱，不认证等于白扔几百块折扣——先认证再下单。'
      },
      clothes: {
        '反季什么时候买最划算':
          '📅 反季买衣时间表：\n' +
          '· 3~4 月买羽绒服 / 厚外套，5 折起；\n' +
          '· 9~10 月买短袖 / 连衣裙，换季清仓最狠；\n' +
          '· 大促节点（618 / 双11）叠券，但别为凑单买不需要的。',
        '基本款怎么挑':
          '👕 基本款挑选：\n' +
          '· 纯色棉 T、牛仔、白衬衫不跟潮流，穿三年不违和；\n' +
          '· 看成分标第一行：棉 / 羊毛含量低于 30% 的「羊毛衫」别信；\n' +
          '· 买前先想「衣柜里能配它的三件」，配不上就别买。'
      },
      medical: {
        '帮我把这笔账单记一笔「医疗」支出。':
          '📝 记账很简单：在记账里选「医疗」分类，金额填对话里这个数（店员搭的三盒药一起记），' +
          '备注写「药店买药 / 被搭售」，方便以后复盘「冲动消费」。\n' +
          '更聪明的做法：下次小病先走校医院，几块钱拿药，不仅省，还能走医保报销（见选项 B）。',
        '告诉我怎么去校医院走医保报销？':
          '🏥 校医院医保报销：\n' +
          '1. 校内门诊报销比例通常最高，拿药几块到几十，先在校医院挂号别直接奔药店；\n' +
          '2. 留好发票与处方，报销只认这些；需要校外看再开转诊单；\n' +
          '3. 比例以本校医保办为准，入学时记得激活医保卡。\n' +
          '一句话：小病校医院，大病走转诊，发票别丢。'
      },
      telecom: {
        '告诉我怎么跟客服沟通降档保号？':
          '📞 跟客服降档话术（直接、不绕）：\n' +
          '1. 打运营商官方客服：移动 10086 / 联通 10010 / 电信 10000，转人工；\n' +
          '2. 一句话：「我要把主卡套餐改为最低保号套餐，请直接办理。」（移动 8 元、电信 5 元档）；\n' +
          '3. 被劝「不能改 / 有合约」就坚持：「没有合约，请帮我查，不行我工信部申诉」——' +
          '客服一般会松口；\n' +
          '4. 改完次月生效，流量交给副卡，主卡只保号。',
        '帮我看看怎么挑选靠谱的大流量副卡？':
          '📦 挑大流量副卡（19-29 元 / 百 G）避坑：\n' +
          '· 看清「首充优惠」：很多是首月便宜，次年恢复原价，问清长期资费；\n' +
          '· 选正规运营商卡（移动 / 联通 / 电信出品），避开「物联卡」（虚标流量、随时跑路）；\n' +
          '· 看合约期与注销门槛：能线上注销的最省心；\n' +
          '· 校园专属套餐常比公开渠道更便宜，先问学长学姐用的哪张。'
      },
      hairstyle: {
        '教我怎么优雅地拒绝 Tony 老师的推销？':
          '💇 优雅拒绝三连（不尴尬、不撕破脸）：\n' +
          '1. 先肯定：「今天剪得挺好的。」——给面子，气氛不僵；\n' +
          '2. 再婉拒：「不过我暂时不想办卡，就单次划算。」——把「不办」说成「暂时」；\n' +
          '3. 堵后路：「我帮你介绍同学来，但卡我自己用不上，谢谢哈。」\n' +
          '核心：不解释、不辩论、不承诺「下次」，微笑结束。',
        '帮我找找附近有没有平价理发店？':
          '🔎 找平价理发：\n' +
          '· 美团 / 抖音搜「学生剪发 / 洗剪吹」，连锁店常有 20 块左右的特价；\n' +
          '· 学校后门老店、社区便民理发，价格透明还不推销；\n' +
          '· 问学长学姐「常去哪家」——口碑比招牌靠谱，单次 30-50 元完全够。'
      },
      gym: {
        '帮我在闲鱼搜搜有没有这家店的二手次卡？':
          '🐟 闲鱼淘次卡：\n' +
          '1. 搜「店名 + 次卡 / 月卡 / 转让」，按信用分和交易数筛卖家；\n' +
          '2. 问清：剩多少次 / 有效期到几号 / 能不能门店直接验证（别买「已冻结」的）；\n' +
          '3. 走平台交易，先验卡再确认付款，拒绝「微信先转账」；\n' +
          '4. 十几块一次，先坚持去一个月，真的规律了再考虑长期。',
        '给我制定一个在操场免费夜跑的计划？':
          '🌙 操场夜跑计划（零成本，每周 3 次）：\n' +
          '· 热身 5 分钟（关节活动 + 慢走）→ 慢跑 3 公里（配速 6-7 分 / 公里）→ 拉伸 5 分钟；\n' +
          '· 周一 / 三 / 五固定，手机计时，每次打卡记进记账软件「运动」；\n' +
          '· 注意：饭后 1 小时再跑，穿缓冲好的鞋，女生约伴更安全。\n' +
          '坚持一个月，比 999 的年卡「回本」快多了。'
      },
      secondhand: {
        '帮我写一段话回怼这个「到手刀」买家？':
          '💬 回怼话术（平台内发，不卑不亢）：\n' +
          '「亲，发货前我已一镜到底录了开机 + 功能测试视频，机器功能正常、无暗病。\n' +
          '如您不满意，可在闲鱼申请退货退款，我会配合；但「到手刀」砍价我这边没法接受。\n' +
          '咱们按平台规则来，谢谢理解～」\n' +
          '记住：只走平台、不私加微信、不私下改价，证据都在视频里。',
        '教我怎么在闲鱼客服那里申诉举证？':
          '⚖️ 申诉举证步骤：\n' +
          '1. 在闲鱼订单里点「申请客服介入」，别点「确认收货」；\n' +
          '2. 上传证据：发货前录屏视频、封箱视频、快递员作证、与买家的聊天记录；\n' +
          '3. 强调「未确认收货、未私下交易、货物功能正常」；\n' +
          '4. 等判定：举证完整一般判卖家胜，大不了让他退货，别惯着「到手刀」。'
      },
      usedbuy: {
        '教我怎么当面验机 Switch？':
          '🎮 当面验机五步（10 分钟搞定）：\n' +
          '1. 看型号：设置 → 主机信息，确认是 OLED / 续航版 / 老款，和卖家说的一致；\n' +
          '2. 试手柄：打开摇杆测试页，画圈看有没有「漂移」，按一遍所有键；\n' +
          '3. 查屏幕：全白 / 全黑图看坏点、漏光、划痕；\n' +
          '4. 试网络与账号：连 Wi-Fi、进 eShop，确认能正常登录且原账号已退出；\n' +
          '5. 试卡带与充电：插一张卡带读不读得出，插电看充电指示灯与电量。\n' +
          '全程让卖家在旁边看着，有问题当场压价或走人。',
        '帮我列一份二手 Switch 验机清单？':
          '📋 二手 Switch 验机清单（照着打勾）：\n' +
          '· 型号 / 序列号与卖家描述一致（三码合一）；\n' +
          '· 手柄无漂移、按键手感正常、体感能用；\n' +
          '· 屏幕无坏点漏光、边框无磕碰、背板无拆修痕迹；\n' +
          '· 底座、电源、HDMI 线齐全（缺一件压 50~100）；\n' +
          '· 账号已退出、无「家长控制」锁、无未结清的数字版游戏；\n' +
          '· 能正常联网更新系统、能读卡带。\n' +
          '清单存手机里，当面一条条过，别嫌麻烦——这就是省下的钱。'
      },
      promo: {
        '凑单品到货后能单件退吗？':
          '📦 能，但要说清规则：\n' +
          '1. 时机：快递显示发货后再申请「单件退款」，此时满减已按整单生效，退款只退这一件的实付；\n' +
          '2. 额度：退的是「按比例分摊后」的钱，不是原价——凑单件常只退回十几块，别以为能白拿满减；\n' +
          '3. 频次：一年用一两次问题不大，短时间内反复操作会被风控（黑号、领券受限）；\n' +
          '4. 底线：别拿它当常规操作，退多了商家会拒收、平台会记异常。\n' +
          '更省事的做法是下单前就别凑——省得退货还要付一趟运费。',
        '怎么判断这波满减是不是真便宜？':
          '🔍 三步看穿「假优惠」：\n' +
          '1. 翻历史价：把商品加进购物车，用比价插件 / 慢慢买看近 90 天最低价，很多「满减」是把标价先抬了 20%；\n' +
          '2. 算到手价：只看「实付 ÷ 用量」，不看「原价 - 优惠」；一件 T 恤 39 和 129 减 50，到手价差得远；\n' +
          '3. 问一句：如果这件东西不打折，我还会买吗？答案是「不会」，那这波就是被券驱动的消费。\n' +
          '记住一条：券只对「本来就买」的部分有意义。'
      },
      playbook: {
        '京东的券到底都在哪领？':
          '🎟️ 券不在一处，分三个入口找，漏一个就少减一截：\n' +
          '1. 首页「领券」入口：最上面那排图标里，进去是一片券墙，按品类筛，先把能领的无门槛券全点了（领了不用不花钱）；\n' +
          '2. 商品详情页的「优惠」折叠区：点开能看到这件商品能用的店铺券、品类券，很多人只看到「已减 X 元」就不往下翻了；\n' +
          '3. 购物车结算页：跨店满减在这里才显示「还差多少」，同时会把可叠的券列出来，勾上再付。\n' +
          '顺序上先领店铺券 / 品类券，再让跨店满减生效，最后用平台红包——反过来会少减。\n' +
          '一个提醒：券有门槛和有效期，为了用一张「满 200 减 20」去凑 180 的东西，是拿真钱换假省。',
        '价保怎么申请、能退多少？':
          '💰 价保退的是「你实付 - 现在的到手价」的差额，不是标价的差：\n' +
          '1. 入口：京东 App → 我的 → 客户服务 → 价格保护，选订单点「申请价保」，系统自动比价；\n' +
          '2. 时限：签收后 7 天内（部分品类 PLUS 会员可到 30 天），过了就申请不了；\n' +
          '3. 能退多少：按同一商品、同一规格的当前到手价算，用券后的差价也算在内；\n' +
          '4. 不给退的情况：秒杀 / 限时抢购 / 赠品变化 / 不同店铺的同款，通常不在价保范围。\n' +
          '最省事的做法：下单后把商品留在清单里，第 3 天和第 6 天各点一次价保，三分钟的事，常常能退回几十块。'
      },
      subs: {
        '怎么把自动续费彻底关掉？':
          '🔕 两条路，关的是「授权」不是「会员」：\n' +
          '· 支付宝：我的 → 设置 → 支付设置 → 免密支付 / 自动扣款 → 找到那个 App → 关闭；\n' +
          '· 微信：我 → 服务 → 钱包 → 支付设置 → 自动续费 → 找到它 → 关闭；\n' +
          '· 苹果用户多一步：设置 → Apple ID → 订阅 → 选中 → 取消订阅（App 内关不掉，必须在这里关）；\n' +
          '· 安卓应用商店 / 华为钱包等渠道开通的，要回对应渠道关。\n' +
          '关完当月照常用到到期日，不会立刻失效——「取消即失效」是吓唬人的。',
        '视频会员怎么拼家庭组？':
          '👨‍👩‍👧 拼车四件事：\n' +
          '1. 先看规则：多数平台家庭组要求「同一设备生态 / 常用地」，成员上限 3~5 人，跨省登录容易被踢；\n' +
          '2. 找熟人：宿舍、同班、老乡群拼，别跟陌生人拼——主号一旦被封退款很麻烦；\n' +
          '3. 分清主号：由一个人开家庭组并统一续费，其他人按月转账，别让每个人各开一个连续包月；\n' +
          '4. 学生认证优先：能认证就用学生价（常见半价），比拼车更省事，还不受成员限制。\n' +
          '一句话：拼车省的是「同一份内容多设备分摊」，不是白拿。'
      }
    };

    /**
     * 租房：真实月开销 + 签约当天现金流。
     * 没说的量按典型值估，并全部记进 assumed —— 不许把估算当事实。
     */
    function rentPlan(opts) {
      var o = opts || {};
      var rent = toNumber(o.rent);
      var area = toNumber(o.area);
      var kwh = toNumber(o.kwh);
      var ton = toNumber(o.ton);
      var comm = !!o.commercial;
      var assumed = [];

      /* 只问「押一付三压力大怎么办」、没说房租：直接对比两种付法的现金流。
         按 1500 元房租举例，并写明这是举例，不是他的数。 */
      if (o.focusDeposit) {
        var ex = 1500;
        var depRows = [
          row('押一付一', '签约 ' + fmt(round2(ex * 2)) + ' 元', '押 1 个月 + 付 1 个月'),
          row('押一付三', '签约 ' + fmt(round2(ex * 4)) + ' 元', '押 1 个月 + 付 3 个月'),
          row('押一付三 + 中介', '签约 ' + fmt(round2(ex * 4 + ex * RATES.agencyMonths)) + ' 元',
            '再加半个月租金中介费')
        ];
        return {
          ok: true, scene: 'rent', name: '租房', needRent: true, focus: 'deposit',
          title: '押一付三到底压多少钱',
          rows: depRows,
          total: {
            label: '押一付三比押一付一多压',
            value: fmt(round2(ex * 2)) + ' 元',
            note: '按房租 1500 举例；房租越高，多压的越多'
          },
          sub: {
            label: '这笔钱的真实成本',
            value: '≈ 3~4 个月的生活费',
            note: '押金退租才还，中间不能动'
          },
          facts: [
            '押金是「押着」不是「花掉」：退租时按合同返还，但它在你手上不能动',
            '学生 / 应届常见做法：押一付一、半年付、年付，付得越多房东越愿意降价',
            '中介费常见为半个月到一个月租金，直租（房东直签）可以省掉这笔'
          ],
          tips: [
            '先算清这笔现金：签约当天要掏的钱 = 月租 × (押 + 付) + 中介费，凑不出就别签',
            '谈押一付一的筹码是「长租」：说愿意签一年、按月准时转账，很多房东接受',
            '押金退还写进合同：退租后几日内退、扣钱要有凭据（拍照留存入住时的房况）',
            '不要为了凑押金去借消费贷：押金本来就要还你，借钱付押金等于白付利息'
          ],
          assumed: ['房租 1500 元为例', '中介费半个月'],
          choices: ['房租 1500 押一付三', '押金不退怎么办', '中介费能砍吗']
        };
      }

      /* 没说房租：不猜他的数，给三档对照表说明「房租只是标价」这件事，
         再请他把实际数字说出来。固定开销部分按典型值算。 */
      if (rent === null || rent <= 0) {
        var fixed = round2(RATES.waterUse * RATES.water +
          RATES.powerUse * RATES.powerCivil + RATES.net + 30);
        var samples = [1000, 1500, 2000];
        var srows = [];
        for (var si = 0; si < samples.length; si++) {
          var sr = samples[si];
          srows.push(row('房租 ' + fmt(sr), '真实 ≈ ' + fmt(round2(sr + fixed)) + ' 元/月',
            '固定开销 ' + fmt(fixed) + ' 元，占房租 ' +
            fmt(round2(fixed / sr * 100)) + '%'));
        }
        return {
          ok: true, scene: 'rent', name: '租房', needRent: true,
          title: '房租之外还要掏多少',
          rows: srows,
          total: {
            label: '除房租外的固定开销',
            value: '≈ ' + fmt(fixed) + ' 元/月',
            note: '水 ' + fmt(round2(RATES.waterUse * RATES.water)) + ' + 电 ' +
              fmt(round2(RATES.powerUse * RATES.powerCivil)) + ' + 网 ' + RATES.net + ' + 物业 30'
          },
          sub: {
            label: '押一付三签约当天',
            value: '房租 × 4',
            note: '1000 → 4000，1500 → 6000，2000 → 8000（不含中介费）'
          },
          facts: [
            '民用电约 ' + fmt(RATES.powerCivil) + ' 元/度，商用电常见 ' + fmt(RATES.powerComm) +
              ' 元/度；同样用 180 度，差价 ' +
              fmt(round2(RATES.powerUseAC * (RATES.powerComm - RATES.powerCivil))) + ' 元/月',
            '水费约 ' + fmt(RATES.water) + ' 元/吨，一个人一个月 3~5 吨',
            '单间租金 ' + fmt(RENT_BAND.low) + '~' + fmt(RENT_BAND.high) +
              ' 元/月是二三线城市 / 校园周边的常见区间，一线城市通常 1.5~3 倍'
          ],
          tips: [
            '房租从来不是月开销：加上水电、网费、物业，实际支出比标价高 8%~20%',
            '押一付三 = 签约当天掏 4 个月房租，先确认现金流再谈定房；能谈押一付一就谈',
            '核实房东身份证姓名与房产证是否一致；二房东必须看原房东合同 + 转租授权',
            '合同写清三件事：水电是民用价还是商业价、物业费谁付、家电坏了谁修'
          ],
          assumed: ['水 4 吨/月', '电 100 度/月', '宽带 60 元/月', '物业 30 元/月'],
          choices: ['房租 1000 的真实开销', '房租 1500 的真实开销', '押一付三怎么谈']
        };
      }

      /* 水：有吨数就用吨数，没有按单人 4 吨 */
      var waterQty = ton !== null && ton > 0 ? ton : RATES.waterUse;
      if (ton === null) { assumed.push('水 ' + RATES.waterUse + ' 吨/月'); }
      var waterFee = round2(waterQty * RATES.water);

      /* 电：有度数就用度数，没有按 100 度（开空调 180） */
      var powerQty = kwh !== null && kwh > 0 ? kwh : (o.summer ? RATES.powerUseAC : RATES.powerUse);
      if (kwh === null) {
        assumed.push('电 ' + powerQty + ' 度/月' + (o.summer ? '（开空调）' : ''));
      }
      var price = comm ? RATES.powerComm : RATES.powerCivil;
      var powerFee = round2(powerQty * price);

      var netFee = o.includeNet === false ? 0 : RATES.net;
      if (o.includeNet === false) { /* 含网费就不加 */ }
      else if (netFee) { assumed.push('宽带 ' + RATES.net + ' 元/月'); }

      var propFee = (o.includeProperty === false) ? 0
        : (area !== null ? round2(area * RATES.property) : 30);
      if (o.includeProperty !== false) {
        assumed.push(area !== null
          ? '物业 ' + fmt(area) + '㎡ × ' + RATES.property + ' 元/㎡'
          : '物业 30 元/月');
      }

      var total = round2(rent + waterFee + powerFee + netFee + propFee);
      var extra = round2(total - rent);
      var ratio = rent ? round2(extra / rent * 100) : 0;

      /* 签约当天：押金 + 首期租金（+ 中介费） */
      var dep = o.deposit && o.pay ? { deposit: o.deposit, pay: o.pay } : { deposit: 1, pay: 3 };
      var depositAssumed = !(o.deposit && o.pay);
      var cash = round2(rent * (dep.deposit + dep.pay));
      var agency = o.withAgency === false ? 0 : round2(rent * RATES.agencyMonths);
      var firstCash = round2(cash + agency);

      var rows = [
        row('房租', fmt(rent) + ' 元/月', '标价，不含下面这些'),
        row('水费', '≈ ' + fmt(waterFee) + ' 元',
          fmt(waterQty) + ' 吨 × ' + fmt(RATES.water) + ' 元/吨'),
        row('电费', '≈ ' + fmt(powerFee) + ' 元',
          fmt(powerQty) + ' 度 × ' + fmt(price) + ' 元/度' + (comm ? '（商用）' : '（民用）')),
        row('网费', netFee ? fmt(netFee) + ' 元' : '不单算', netFee ? '单拉，合租可分摊' : '房租已含'),
        row('物业', propFee ? '≈ ' + fmt(propFee) + ' 元' : '不单算',
          propFee ? (area !== null ? fmt(area) + '㎡ × ' + fmt(RATES.property) : '按 30 估') : '房租已含')
      ];

      var facts = [
        '民用电约 ' + fmt(RATES.powerCivil) + ' 元/度，商用电常见 ' + fmt(RATES.powerComm) +
          ' 元/度；同样用 180 度，差价 ' +
          fmt(round2(RATES.powerUseAC * (RATES.powerComm - RATES.powerCivil))) + ' 元/月',
        '水费约 ' + fmt(RATES.water) + ' 元/吨，一个人一个月 3~5 吨',
        '单间租金 ' + fmt(RENT_BAND.low) + '~' + fmt(RENT_BAND.high) +
          ' 元/月是二三线城市 / 校园周边的常见区间，一线城市通常 1.5~3 倍'
      ];

      var tips = [
        '签署当天要一次掏出 ' + fmt(firstCash) + ' 元（押金' + cnOf(dep.deposit) + '个月 + 首期' +
          cnOf(dep.pay) + '个月' + (agency ? ' + 中介费 ' + fmt(agency) + ' 元' : '') +
          '）：先确认这笔钱在手上，再谈定房',
        '核实房东身份证姓名与房产证是否一致；二房东必须看原房东合同 + 转租授权，' +
          '租金打给产权人而不是「朋友代收」',
        '合同写清三件事：水电是民用价还是商业价、物业费谁付、家电坏了谁修'
      ];
      if (dep.pay >= 3) {
        tips.unshift('押一付三等于把 ' + fmt(dep.pay) + ' 个月房租一次性压在房东手上，' +
          '能谈到押一付一就谈，谈不动也要写清退租时押金几日内退');
      }

      return {
        ok: true, scene: 'rent', name: '租房',
        title: '真实月开销',
        rows: rows,
        total: {
          label: '真实月开销',
          value: '≈ ' + fmt(total) + ' 元/月',
          note: '比房租多 ' + fmt(extra) + ' 元（+' + fmt(ratio) + '%）'
        },
        sub: {
          label: '签约当天',
          value: '≈ ' + fmt(firstCash) + ' 元',
          note: '押' + cnOf(dep.deposit) + '付' + cnOf(dep.pay) +
            (agency ? ' + 中介费 ' + fmt(agency) : '')
        },
        rent: rent, waterFee: waterFee, powerFee: powerFee, netFee: netFee,
        propFee: propFee, totalValue: total,
        deposit: dep, depositAssumed: depositAssumed,
        firstCash: firstCash,
        perspective: '房租 ' + fmt(rent) + ' 只是标价：水电网物业一加，真实月开销 ≈ ' +
          fmt(total) + ' 元，折合每天一睁眼就背上约 ' + Math.round(total / 30) +
          ' 块。签约当天更要一次掏出 ' + fmt(firstCash) + ' 元（押' + cnOf(dep.deposit) +
          '付' + cnOf(dep.pay) + (agency ? ' + 中介 ' + fmt(agency) : '') +
          '），对刚实习没存款的学生是笔不小的现金流。',
        facts: facts, tips: tips, assumed: assumed,
        choices: ['帮我算算如果月薪 3000，租房 1500 还能活吗？',
          '教我怎么辨别中介和二房东的合同陷阱']
      };
    }

    /** 水电：月开销区间 + 民用/商用差；给了账单金额则反推度数，给了人数则算人均 */
    function utilityPlan(opts) {
      var o = opts || {};
      var kwh = toNumber(o.kwh);
      var ton = toNumber(o.ton);
      var cost = toNumber(o.cost);
      var people = toNumber(o.people);
      if (people !== null && (people < 1 || people > 20)) { people = null; }
      var summer = !!o.summer;
      var assumed = [];

      /* 度数优先级：给了度数直接用 → 只给账单金额就按民用价反推 → 都没给按典型值 */
      var powerQty, byCost = false;
      if (kwh !== null && kwh > 0) {
        powerQty = kwh;
      } else if (cost !== null && cost > 0) {
        powerQty = Math.max(1, Math.round(cost / RATES.powerCivil));
        byCost = true;
        assumed.push('按民用价 ' + fmt(RATES.powerCivil) + ' 反推 ≈ ' + powerQty + ' 度');
      } else {
        powerQty = summer ? RATES.powerUseAC : RATES.powerUse;
        assumed.push('电 ' + powerQty + ' 度/月' + (summer ? '（开空调）' : ''));
      }

      var civil = round2(powerQty * RATES.powerCivil);
      var comm = round2(powerQty * RATES.powerComm);
      var waterQty = ton !== null && ton > 0 ? ton : RATES.waterUse;
      if (ton === null) { assumed.push('水 ' + RATES.waterUse + ' 吨/月'); }
      var waterFee = round2(waterQty * RATES.water);
      var gas = 30;

      var rows = [];
      if (byCost) {
        rows.push(row('你这月电费', fmt(cost) + ' 元',
          '≈ ' + powerQty + ' 度（民用价 ' + fmt(RATES.powerCivil) + '）'));
        rows.push(row('若按商用价', '≈ ' + fmt(comm) + ' 元',
          '同 ' + powerQty + ' 度 × ' + fmt(RATES.powerComm) + '，比民用多 ' +
          fmt(round2(comm - cost))));
      } else {
        rows.push(row('电费（民用）', '≈ ' + fmt(civil) + ' 元',
          powerQty + ' 度 × ' + fmt(RATES.powerCivil)));
        rows.push(row('电费（商用）', '≈ ' + fmt(comm) + ' 元',
          powerQty + ' 度 × ' + fmt(RATES.powerComm) + '，多掏 ' + fmt(round2(comm - civil))));
      }
      rows.push(row('水费', '≈ ' + fmt(waterFee) + ' 元', waterQty + ' 吨 × ' + fmt(RATES.water)));
      rows.push(row('燃气', '≈ ' + fmt(gas) + ' 元', '做饭洗澡的常见用量'));
      if (people) {
        var perPerson = round2((civil + waterFee + gas) / people);
        rows.push(row(people + ' 人平摊', '≈ ' + fmt(perPerson) + ' 元/人', '民用总价 ÷ ' + people));
      }

      var civilTotal = round2(civil + waterFee + gas);
      var commTotal = round2(comm + waterFee + gas);
      var perspective = byCost
        ? ('如果学校是民用电价 ' + fmt(RATES.powerCivil) + ' 元/度，' + fmt(cost) +
          ' 元意味着这月用了约 ' + powerQty + ' 度电。' +
          (people ? (people + ' 人平摊每人约 ' + fmt(round2((cost + waterFee + gas) / people)) + ' 元（含水燃气）。') : '') +
          (summer ? '夏天 4 人开空调 24 小时大概 200~250 元，' + fmt(cost) + ' 元属于偏高。'
            : '空调温度每调低 1℃ 多耗 6%~10%。'))
        : ('水电不算清单价就等于没算：同样的 ' + powerQty + ' 度电，民用 ' + fmt(civil) +
          ' 元、商用 ' + fmt(comm) + ' 元，差一倍。' +
          (people ? (people + ' 人平摊每人约 ' + fmt(round2(civilTotal / people)) + ' 元。') : ''));

      return {
        ok: true, scene: 'utility', name: '水电燃气',
        title: '这笔水电到底正常吗',
        perspective: perspective,
        rows: rows,
        total: people
          ? { label: people + ' 人平摊月开销', value: '≈ ' + fmt(round2(civilTotal / people)) + ' 元', note: '每人（民用价）' }
          : { label: '月度合计（民用）', value: '≈ ' + fmt(civilTotal) + ' 元', note: '商用价则 ' + fmt(commTotal) + ' 元' },
        facts: [
          '民用电第一档约 ' + fmt(RATES.powerCivil) + ' 元/度，商业 / 合表常见 ' +
            fmt(RATES.powerComm) + ' 元/度，差一倍',
          '空调温度每调低 1℃，耗电量增加 6%~10%；很多宿舍是「阶梯电价」，超额度单价翻倍',
          '水费约 ' + fmt(RATES.water) + ' 元/吨（含污水处理费），一个人一个月 3~5 吨'
        ],
        tips: [
          '电费单价超过 0.8 元/度，先问是商业电价还是合表加价；被加价可要求看电表与缴费单',
          '电费突然翻倍先查大功率：电热水器常年保温、空调外机脏堵、老冰箱密封条老化',
          '空调开 26℃ 最舒适也最省电，辅以风扇；出门拔插头，充电器待机也在耗电',
          '水费翻倍先查漏水，马桶水箱最常见，一晚上能漏掉一吨'
        ],
        assumed: assumed,
        choices: ['帮我在宿舍群发一条温和的省电倡议书', '教我怎么排查耗电最大的电器']
      };
    }

    /** 交通：打车 vs 公交地铁，按月按年算差 */
    function transportPlan(opts) {
      var o = opts || {};
      var fare = toNumber(o.taxiFare);
      var days = toNumber(o.days) || RATES.workDays;
      var assumed = [];
      if (fare === null) {
        fare = RATES.taxiFare;
        assumed.push('打车 ' + RATES.taxiFare + ' 元/程（约 3 公里）');
      }
      assumed.push('每月 ' + days + ' 天来回');
      var metro = toNumber(o.metroFare) || RATES.metroFare;

      var taxiMonth = round2(fare * 2 * days);
      var metroMonth = round2(metro * 2 * days);
      var busMonth = round2(RATES.busFare * 2 * days);
      var diff = round2(taxiMonth - metroMonth);

      var rows = [
        row('打车', fmt(taxiMonth) + ' 元/月',
          fmt(fare) + ' × 2 趟 × ' + days + ' 天'),
        row('地铁', fmt(metroMonth) + ' 元/月',
          fmt(metro) + ' × 2 趟 × ' + days + ' 天'),
        row('公交', fmt(busMonth) + ' 元/月',
          fmt(RATES.busFare) + ' × 2 趟 × ' + days + ' 天')
      ];

      return {
        ok: true, scene: 'transport', name: '通勤',
        title: '打车和公交差多少',
        rows: rows,
        total: {
          label: '每月差价（打车 − 地铁）',
          value: fmt(diff) + ' 元',
          note: '一年 ' + fmt(round2(diff * 12)) + ' 元；按公交算差 ' +
            fmt(round2(taxiMonth - busMonth)) + ' 元/月'
        },
        taxiMonth: taxiMonth, metroMonth: metroMonth, diff: diff, days: days, fare: fare,
        perspective: '打车 ' + fmt(fare) + ' 元，一个人承担确实偏贵：高铁站若有地铁通常只要 ' +
          fmt(metro) + ' 元，公交约 ' + fmt(RATES.busFare) + ' 元。你多花 ' +
          fmt(round2(fare - metro)) + ' 块，大概只省 15~20 分钟。而且高铁票能办学生优惠' +
          '（二等座 7.5 折），别让「打车去车站」把这块优惠也吃了。',
        facts: [
          '通勤是少数「可以提前算死」的支出：单程差价 × 2 × 天数就是月差价',
          '高铁票有学生优惠：提前在 12306 做「学生资质核验」，动车二等座打 7.5 折（每学年 4 次单程）',
          '滴滴 / 高德都有学生认证入口，认证后打车券与折扣以 App 内为准，不是固定折扣'
        ],
        tips: [
          '月差价 ' + fmt(diff) + ' 元看着不大，一年是 ' + fmt(round2(diff * 12)) +
            ' 元 —— 够买一台入门笔记本',
          '通勤优先「固定成本」方案：地铁月卡 / 公交卡 / 共享单车月卡，比单次买票便宜',
          '打车只在三种时候划算：赶时间、带重物、多人同行分摊',
          '学生身份先去认证（滴滴 / 高德 / 12306），认证是免费的，不认证等于白扔券'
        ],
        assumed: assumed,
        choices: ['教我怎么用学生票买高铁票最划算', '打车怎么用特惠快车省钱']
      };
    }

    /** 数码：买电脑 / 平板 —— 看清「入门款 vs 中高配」，教育优惠 + 百亿补贴双走 */
    function digitalPlan(opts) {
      var o = opts || {};
      var price = toNumber(o.price);
      var assumed = [];
      var canteen = 500; /* 食堂饭钱约 500 元/月，用来换算「半年的饭钱」 */
      var rows = [];
      var perspective;

      if (price !== null && price > 0) {
        var months = Math.max(1, Math.round(price / canteen));
        var eduLo = round2(price * 0.05), eduHi = round2(price * 0.15);
        perspective = fmt(price) + ' 块买一台看网课的平板 / 电脑，如果是苹果或华为，' +
          '只能买到入门款（如 iPad 数字版或 MatePad 基础款）；如果是小米 / 联想，能买到中高配。' +
          '这笔钱相当于你约 ' + (months >= 6 ? '半年（' + months + ' 个月）' : months + ' 个月') +
          '的食堂饭钱（按 ' + canteen + ' 元/月估）。';
        rows.push(row('你报的预算', fmt(price) + ' 元', '看网课用'));
        rows.push(row('苹果 / 华为', '入门款', 'iPad 数字版 / MatePad 基础款'));
        rows.push(row('小米 / 联想', '中高配', '同价位配置更高'));
        rows.push(row('教育优惠', '省 ' + fmt(eduLo) + '~' + fmt(eduHi) + ' 元', '按 5%~15% 估'));
        assumed.push('食堂 ' + canteen + ' 元/月，折扣 5%~15%');
      } else {
        perspective = '数码产品先想清楚「买来干嘛」：看网课、写文档根本用不到顶级处理器和内存，' +
          '入门款 + 教育优惠足够，把省下的钱留着吃饭更香。';
        assumed.push('没说预算，只给策略');
      }

      return {
        ok: true, scene: 'digital', name: '数码',
        title: '这台设备到底值不值',
        perspective: perspective,
        rows: rows,
        total: price !== null && price > 0 ? {
          label: '教育优惠 + 大促叠满',
          value: '约 ' + fmt(round2(price * 0.85)) + ' 元起',
          note: '按低 15% 估，能叠加更省'
        } : null,
        price: price,
        facts: [
          '电子产品更新极快，「买新不买旧，买基础款不买顶配」——看网课用不到顶级处理器和内存',
          '每年 7-9 月是苹果返校季，买 iPad 送耳机，教育优惠能省几百块',
          '百亿补贴是平台补贴，同款不同店差价能到几百；首发 1-2 个月几乎不降价'
        ],
        tips: [
          '去官网查教育优惠：凭学信网认证，苹果、微软、华为都有专属学生价',
          '百亿补贴比价：去拼多多 / 京东百亿补贴看同款，有时比官网便宜 300-500',
          '警惕「套餐刺客」：线下店常推销「平板 + 保护壳 + 贴膜 + 碎屏险」套餐，直接买裸机最划算',
          '下单前搜「型号 + 翻车 / 屏幕 / 续航」，看真实问题再决定，跳过发布会参数'
        ],
        assumed: assumed,
        choices: ['帮我在京东百亿补贴挑几款适合看网课的平板。', '告诉我怎么完成教育优惠认证？']
      };
    }

    /** 服装：单次穿着成本这把尺子 */
    function clothesPlan(opts) {
      var o = opts || {};
      var price = toNumber(o.price);
      var wears = toNumber(o.wears) || RATES.wears;
      var rows = [];
      var assumed = [];

      if (price !== null && price > 0) {
        var per = round2(price / wears);
        rows.push(row('这件', fmt(price) + ' 元', ''));
        rows.push(row('预计穿', fmt(wears) + ' 次', '一个季节大约这个数'));
        rows.push(row('单次成本', fmt(per) + ' 元/次', fmt(price) + ' ÷ ' + fmt(wears)));
        /* 对照组：同价位的联名 / 快时尚通常穿得少 */
        var perLow = round2(price / 3);
        rows.push(row('只穿 3 次的联名款', fmt(perLow) + ' 元/次',
          '同样的钱，穿得越少越贵'));
        assumed.push('穿着 ' + fmt(wears) + ' 次/季');
      } else {
        assumed.push('没说价格，只给挑法');
      }

      return {
        ok: true, scene: 'clothes', name: '衣服',
        title: '这件衣服值不值',
        rows: rows,
        total: null,
        price: price, wears: wears,
        facts: [
          '衡量衣服贵不贵，看的不是标价而是「单次穿着成本 = 价格 ÷ 穿几次」',
          '反季买是最稳的折扣：3~4 月买羽绒、9~10 月买短袖，常见 5 折起',
          '基本款（纯色棉 T、牛仔、白衬衫）不跟潮流，穿三年不违和'
        ],
        tips: [
          '联名款 / 快时尚的溢价在「话题」不在「布料」，同款面料去搜基础款，价差常有 2~3 倍',
          '买之前先想「衣柜里有没有能配它的三件」，配不上就别买',
          '看清成分标：棉 / 羊毛含量写在标签第一行，含量低于 30% 的「羊毛衫」别信',
          '季末清仓 + 反季买，比任何优惠券都实在'
        ],
        assumed: assumed,
        choices: ['反季什么时候买最划算', '基本款怎么挑']
      };
    }

    /** 买药：店员主推 = 提成最高，校医院 + 点名买药才是正解 */
    function medicalPlan(opts) {
      var o = opts || {};
      var cost = toNumber(o.cost);
      var rows = [];
      var assumed = ['报销比例以本校医保办为准'];
      var normal = 18; /* 普通感冒灵约 15-20 元/盒 */

      var perspective;
      if (cost !== null && cost > 0) {
        var boxes = Math.max(1, Math.round(cost / normal));
        perspective = '普通的感冒灵颗粒，常规价格在 15-20 元一盒。' + fmt(cost) +
          ' 块说明店员给你搭了消炎药、维生素，甚至是昂贵的「中成药」。其实普通感冒是自限性疾病，' +
          '多喝水、多休息，吃普通的感冒药缓解症状就足够了——这一单大概多花了 ' +
          fmt(round2(cost - normal)) + ' 块。';
        rows.push(row('普通感冒灵', '15-20 元/盒', '经典老药，足够'));
        rows.push(row('你这单', fmt(cost) + ' 元', '搭了 ' + boxes + ' 盒左右'));
        rows.push(row('多花的', '≈ ' + fmt(round2(cost - normal)) + ' 元', '消炎药 / 维 C / 中成药'));
      } else {
        perspective = '进药店别描述症状等店员推荐——推荐位通常是提成最高的那款。' +
          '普通小病，点名买经典老药，够用还便宜。';
      }
      rows.push(row('校医院', '几块到几十', '校内报销比例最高'));
      rows.push(row('通用名 vs 商品名', '差 2~5 倍', '同成分不同包装'));

      return {
        ok: true, scene: 'medical', name: '看病买药',
        title: '这盒药到底贵在哪',
        perspective: perspective,
        rows: rows,
        total: cost !== null && cost > 0 ? {
          label: '这一单多花', value: '≈ ' + fmt(round2(cost - normal)) + ' 元',
          note: '换成校医院可能只要几块'
        } : null,
        cost: cost,
        facts: [
          '药店店员的主推商品，通常是利润最高、提成最高的保健品或杂牌药',
          '真正便宜好用的经典老药（如维 C 银翘片、布洛芬），往往被放在货架最底层',
          '普通感冒是自限性疾病，多喝水多休息，吃普通感冒药缓解症状即可'
        ],
        tips: [
          '首选校医院：有校园医保，几块钱就能拿药，医生也不会乱推销',
          '点名买药：进店直接说「我要一盒 XX 牌感冒灵，别的不要」',
          '学会看成分：感冒药不要混吃（很多含对乙酰氨基酚，吃多伤肝）',
          '拒绝「套餐」：保健品不是药，说「不需要」就行'
        ],
        assumed: assumed,
        choices: ['帮我把这笔账单记一笔「医疗」支出。', '告诉我怎么去校医院走医保报销？']
      };
    }

    /* ================================================================== */
    /* 六、统一入口                                                        */
    /* ================================================================== */

    /** 买菜做饭：把一笔「超市/菜场开销」拆回具体菜价，对照食堂，给挑菜避坑 */
    function groceryPlan(opts) {
      var o = opts || {};
      var t = String(o.text || '');
      var money = toNumber(o.money);
      var assumed = [];
      var meatPrice = 25, vegPrice = 5; /* 经验：排骨约 25 元/斤，青菜约 5 元/斤 */

      /* 用户若点名了分量就按他给的算，否则按「排骨/青菜等重」估算（45 块 ≈ 各 1.5 斤） */
      var mm = norm(t).match(/排骨[^0-9]{0,6}([0-9]+(?:\.[0-9]+)?)\s*斤/);
      var vm = norm(t).match(/青菜[^0-9]{0,6}([0-9]+(?:\.[0-9]+)?)\s*斤/);
      var meatJin = mm ? parseFloat(mm[1]) : null;
      var vegJin = vm ? parseFloat(vm[1]) : null;

      var meatCost, vegCost, total, rows = [];
      if (money !== null && money > 0) {
        if (meatJin && vegJin) {
          meatCost = round2(meatJin * meatPrice);
          vegCost = round2(vegJin * vegPrice);
          total = round2(meatCost + vegCost);
        } else {
          meatCost = round2(money * 0.8333);
          vegCost = round2(money - meatCost);
          total = money;
          assumed.push('排骨约 25 元/斤、青菜约 5 元/斤，按等重估分量');
        }
        rows.push(row('排骨', '≈ ' + fmt(meatCost) + ' 元', meatJin ? (fmt(meatJin) + ' 斤 × ' + meatPrice) : '约 ' + fmt(round2(meatCost / meatPrice)) + ' 斤 × ' + meatPrice));
        rows.push(row('青菜', '≈ ' + fmt(vegCost) + ' 元', vegJin ? (fmt(vegJin) + ' 斤 × ' + vegPrice) : '约 ' + fmt(round2(vegCost / vegPrice)) + ' 斤 × ' + vegPrice));
        rows.push(row('合计', fmt(total) + ' 元', '你报的数'));
      }

      var canteen = 10; /* 学校食堂一荤一素常见价 */
      var ratio = money ? round2(money / canteen) : 0;
      var perspective = money
        ? '排骨按 ' + meatPrice + ' 元/斤、青菜按 ' + vegPrice + ' 元/斤估：这一顿 ≈ ' +
          fmt(total) + ' 元。学校食堂一荤一素只要 ' + canteen + ' 块，' + fmt(total) +
          ' 块够吃 ' + fmt(ratio) + ' 顿食堂饭；如果一个人吃，确实有点超标了。'
        : '先说个数（比如「排骨青菜花了 45 块」），我按菜价帮你拆回排骨和青菜各花多少、够吃几顿食堂。';

      var choices = [
        '帮我规划一份 20 元搞定一荤一素的菜谱',
        '教我怎么在超市挑打折菜'
      ];
      var followups = {};
      followups[choices[0]] =
        '🍳 20 元一荤一素这样配（单人一顿）：\n' +
        '· 蛋白质选便宜的：2 个鸡蛋（约 2 元）或一块鸡胸（约 6 元），别碰排骨/牛排；\n' +
        '· 蔬菜选应季大路货：白菜 / 豆芽 / 萝卜（2~3 元一大把），比精包装沙拉便宜一半；\n' +
        '· 主食家里有就别买：米饭馒头自带，省下 3~4 元；\n' +
        '· 合计约 10~15 元，留 5 元机动。\n' +
        '关键：肉换成蛋/鸡胸，蔬菜买散装应季，20 元绰绰有余，45 元的「超标感」主要来自排骨和精包装。';
      followups[choices[1]] =
        '🛒 超市挑打折菜三招：\n' +
        '1. 看标价单位：很多超市写「250g」标价，看着便宜，换算成斤直接翻倍，认准「元/斤」再比；\n' +
        '2. 晚 8 点后逛生鲜区：黄标打折的菜和肉，第二天吃完全来得及，能省 3~5 成；\n' +
        '3. 认临期不认品牌：快到期的酸奶 / 熟食打折最狠，真空包装的菜比「精品盒装」便宜一大截。\n' +
        '想更省，学校周边的菜市场 / 早市散装菜，比超市再便宜 20%~30%，还能挑。';

      return {
        ok: true, scene: 'grocery', name: '买菜做饭', launch: LAUNCH.grocery,
        title: '这笔菜钱到底贵在哪',
        perspective: perspective,
        rows: rows,
        total: money ? { label: '这顿菜钱', value: fmt(total) + ' 元', note: '≈ ' + fmt(ratio) + ' 顿食堂饭' } : null,
        facts: [
          '学校食堂一荤一素普遍 10 块左右，超市精包装菜和冷柜肉包含了包装费 + 电费，比菜市场贵 20%~30%',
          '排骨 / 牛排这类「硬菜」是菜价刺客主力，一顿 45 块里它占八成',
          '一个人正常一顿饭 15~20 元足够，超过 30 元基本是「买了不该买的」'
        ],
        tips: [
          '去菜市场 / 早市买散装菜，比超市便宜还能挑，买肉可以只买 10 块钱的',
          '看标价单位：超市爱用「250g」标价，换算成斤往往翻倍',
          '晚 8 点后逛超市：生鲜区黄标打折，第二天的菜最划算'
        ],
        assumed: assumed,
        choices: choices,
        followups: followups
      };
    }

    /** 话费流量：降档保号 + 大流量副卡，别为用不完的套餐买单 */
    function telecomPlan(opts) {
      var o = opts || {};
      var monthly = toNumber(o.monthly);
      var rows = [];
      var assumed = [];
      var annual = monthly !== null && monthly > 0 ? Math.round(monthly * 12) : null;

      var perspective;
      if (monthly !== null && monthly > 0) {
        perspective = fmt(monthly) + ' 块/月的套餐，一年就是 ' + fmt(annual) +
          ' 块！够你买一张回家的全价高铁票了。很多大学生的套餐是当年入学时办的「大流量套餐」，' +
          '但实际上你平时都连校园 Wi-Fi，根本用不完。';
        rows.push(row('当前月租', fmt(monthly) + ' 元/月', '你报的数'));
        rows.push(row('一年合计', fmt(annual) + ' 元', '≈ 一张回家高铁票'));
        rows.push(row('保号套餐', '5-8 元/月', '移动 8 元 / 电信 5 元档'));
        rows.push(row('大流量副卡', '19-29 元/月', '百 G 流量'));
      } else {
        perspective = '先看账单：你每月话费多少？很多人稀里糊涂交着入学时办的「大流量套餐」，' +
          '其实平时都连校园 Wi-Fi，根本用不完——钱花在了对你没用的流量上。';
        assumed.push('没说月租，只给策略');
      }

      return {
        ok: true, scene: 'telecom', name: '话费流量',
        title: '这套餐到底亏多少',
        perspective: perspective,
        rows: rows,
        total: annual !== null ? {
          label: '一年话费', value: fmt(annual) + ' 元',
          note: '降到保号 + 副卡 ≈ 30 元/月，一年省 ' + fmt(round2(annual - 30 * 12)) + ' 元'
        } : null,
        monthly: monthly,
        facts: [
          '三大运营商都有「保号套餐」（移动 8 元、电信 5 元），只保留基础通话和短信',
          '流量完全可以靠几十块的大流量副卡或校园专属套餐替代',
          '很多校园套餐月租高但流量用不完，是「入学即办」的历史遗留'
        ],
        tips: [
          '降档保号：直接打客服电话，要求将主卡改为最低保号套餐',
          '办大流量卡：在网上办一张 19-29 元的百 G 流量卡（看清首充优惠、次年是否恢复原价）',
          '防偷跑：在手机设置里限制后台 App 使用数据网络，避免流量偷偷跑光'
        ],
        assumed: assumed,
        choices: ['告诉我怎么跟客服沟通降档保号？', '帮我看看怎么挑选靠谱的大流量副卡？']
      };
    }

    /** 理发预付卡：算清「回本次数」，本质是商家的无息贷款 */
    function hairPlan(opts) {
      var o = opts || {};
      var card = toNumber(o.card);
      var per = toNumber(o.perVisit);
      var assumed = [];
      if (per === null || per <= 0) { per = 30; assumed.push('单次按 30 元估（店员常报 15-50）'); }
      var visits = card !== null && card > 0 ? Math.max(1, Math.round(card / per)) : null;
      var years = visits !== null ? round2(visits / 12) : null;
      var yearsR = years !== null ? Math.max(1, Math.round(years)) : null;
      var yearsTxt = years !== null ? (years >= 1 ? '将近 ' + yearsR + ' 年' : '1 年不到') : '2-3 年';
      var yearsNote = years !== null ? yearsR + ' 年' : '2-3 年';

      var perspective;
      if (card !== null && card > 0) {
        perspective = '办 ' + fmt(card) + ' 块的卡，按每次 ' + fmt(per) + ' 元算，' +
          '你需要去 ' + visits + ' 次才能把本金用完。大学生一般一个月剪 1 次头发，' +
          '这意味着你要在这家店绑死' + yearsTxt + '。' +
          '万一老板跑路，或者剪得不好看，这 ' + fmt(card) + ' 块就打水漂了。';
      } else {
        perspective = '理发店充值卡，本质是「商家的无息贷款」——你先掏钱，慢慢消费，' +
          '但他们随时可能换招牌。单次 30-50 元完全能接受，不办卡反而更自由。';
        assumed.push('没说卡额，只给策略');
      }

      var rows = [];
      if (card !== null && card > 0) {
        rows.push(row('充值卡', fmt(card) + ' 元', '一次性掏出'));
        rows.push(row('单次', fmt(per) + ' 元', '店员报的价'));
        rows.push(row('回本需去', visits + ' 次', '≈ ' + yearsNote + '（每月 1 次）'));
      }

      return {
        ok: true, scene: 'hairstyle', name: '理发办卡',
        title: '这张卡到底绑你多久',
        perspective: perspective,
        rows: rows,
        total: card !== null && card > 0 ? {
          label: '回本需去', value: visits + ' 次',
          note: '≈ ' + yearsNote + '（每月 1 次）'
        } : null,
        card: card, perVisit: per,
        facts: [
          '美发行业的预付卡本质是「商家的无息贷款」。Tony 老师推销得越猛，说明店里越缺现金流',
          '很多大学城周边的理发店，一到毕业季或年底就容易换招牌',
          '单次 30-50 元是合理区间，办卡省的那点钱，远抵不过「被绑死 + 跑路风险」'
        ],
        tips: [
          '坚决不办卡：单次 30-50 元完全可以接受，就当花钱买自由',
          '用团购券：去美团 / 抖音搜「学生剪发」，很多连锁店有 20 块左右的洗剪吹特价',
          '拒绝中途加项：如果他说「你的发质需要做个软化 / 护理」，直接说「今天赶时间，只剪」'
        ],
        assumed: assumed,
        choices: ['教我怎么优雅地拒绝 Tony 老师的推销？', '帮我找找附近有没有平价理发店？']
      };
    }

    /** 健身年卡：用「现实单次成本」戳破「马上涨价」逼单 */
    function gymPlan(opts) {
      var o = opts || {};
      var card = toNumber(o.card);
      var assumed = [];
      var visits = 15; /* 行业统计：70% 办卡用户一年去 ≤15 次 */
      if (card === null || card <= 0) { assumed.push('按一年去 15 次估现实成本'); }

      var dailyCost = card !== null && card > 0 ? round2(card / 365) : null;
      var realPer = card !== null && card > 0 ? round2(card / visits) : null;
      var idealPer = card !== null && card > 0 ? round2(card / 156) : null; /* 每周 3 次 ≈ 156 次/年 */

      var perspective;
      if (card !== null && card > 0) {
        perspective = fmt(card) + ' 块一年，折合每天不到 ' + fmt(dailyCost) +
          ' 块钱。听起来像白给对不对？但请回忆一下，你上个月去操场跑步的次数有超过 5 次吗？' +
          '据行业统计，超过 70% 的办卡用户，一年去健身房的次数不超过 ' + visits + ' 次。' +
          '算下来，你去一次的成本是 ' + fmt(realPer) + ' 元。';
      } else {
        perspective = '「马上涨价」「最后一天」是健身房最经典的逼单话术（利用你的损失厌恶心理）。' +
          '先问自己：上个月运动了几次？别为「想象中的自己」买单。';
        assumed.push('没说卡价，只给策略');
      }

      var rows = [];
      if (card !== null && card > 0) {
        rows.push(row('年卡', fmt(card) + ' 元', '一次性掏出'));
        rows.push(row('日均', fmt(dailyCost) + ' 元', '按 365 天摊'));
        rows.push(row('理想（每周 3 次）', fmt(idealPer) + ' 元/次', '≈ 156 次/年'));
        rows.push(row('现实（一年 15 次）', fmt(realPer) + ' 元/次', '70% 人的真实情况'));
      }

      return {
        ok: true, scene: 'gym', name: '健身办卡',
        title: '这张年卡你真用得回本吗',
        perspective: perspective,
        rows: rows,
        total: card !== null && card > 0 ? {
          label: '现实单次成本', value: fmt(realPer) + ' 元/次',
          note: '按一年只去 ' + visits + ' 次估'
        } : null,
        card: card, visits: visits,
        facts: [
          '「马上涨价」「最后一天」是健身房最经典的逼单话术（利用你的损失厌恶心理）',
          '很多健身房甚至在收完一波年卡费后直接关门跑路',
          '行业统计：超过 70% 的办卡用户，一年去健身房不超过 15 次'
        ],
        tips: [
          '办次卡 / 月卡：闲鱼上有很多转让的次卡，十几块钱一次，先坚持去一个月再谈年卡',
          '利用免费资源：别忘了 39 栋负一层和操场看台下的免费健身房，一分钱不花也能练！',
          '按次记账：如果真的办了卡，每次去健身都在记账软件里打个卡，心理上会更「回本」'
        ],
        assumed: assumed,
        choices: ['帮我在闲鱼搜搜有没有这家店的二手次卡？', '给我制定一个在操场免费夜跑的计划？']
      };
    }

    /** 二手交易：专治「到手刀」，发货前录视频是铁证 */
    function secondPlan(opts) {
      var o = opts || {};
      var price = toNumber(o.price);
      var offered = toNumber(o.offered);
      var assumed = [];
      var cut = (price !== null && offered !== null) ? Math.round(price - offered) : null;

      var perspective;
      if (cut !== null && cut > 0) {
        perspective = '被砍掉 ' + fmt(cut) + ' 块，相当于你亏了十几顿外卖。' +
          '这叫作闲鱼经典的「到手刀」套路：买家仗着东西在你手里，以各种微小瑕疵威胁退货，逼迫你降价。';
      } else if (price !== null && price > 0) {
        perspective = '标价 ' + fmt(price) + ' 块，记住一句话：没点「确认收货」前，钱都在平台保管，' +
          '谁也拿不走。所有协商在平台内谈，别加微信私聊。';
      } else {
        perspective = '闲鱼卖闲置，「到手刀」是头号坑：买家收到货后以瑕疵威胁降价。' +
          '发货前录视频、走平台沟通，是防坑的两道铁证。';
        assumed.push('没说价格，只给策略');
      }

      var rows = [];
      if (price !== null && price > 0) {
        rows.push(row('你的标价', fmt(price) + ' 元', '挂出去的价'));
        if (offered !== null && offered > 0) {
          rows.push(row('买家只肯', fmt(offered) + ' 元', '到手刀'));
          rows.push(row('被砍', fmt(cut) + ' 元', '≈ 十几顿外卖'));
        }
      }

      return {
        ok: true, scene: 'secondhand', name: '二手交易',
        title: '这把「到手刀」怎么破',
        perspective: perspective,
        rows: rows,
        total: cut !== null && cut > 0 ? {
          label: '被砍掉', value: fmt(cut) + ' 元',
          note: '≈ 十几顿外卖'
        } : null,
        price: price, offered: offered,
        facts: [
          '闲鱼不是法外之地。一旦点了「确认收货」，钱就打给对方了，很难追回',
          '所有协商必须在闲鱼平台内进行，千万别加微信私聊',
          '「到手刀」的软肋是「没确认收货」——你握着主动权，别被吓住'
        ],
        tips: [
          '发货前录视频：打包、开机、测试功能必须一镜到底录下来',
          '在顺丰驿站发货：当着快递员的面拍封箱视频，快递员可以作证',
          '拒绝无理砍价：买家无理取闹，直接在闲鱼申请客服介入，上传发货视频证据。大不了让他退货，别惯着「到手刀」'
        ],
        assumed: assumed,
        choices: ['帮我写一段话回怼这个「到手刀」买家？', '教我怎么在闲鱼客服那里申诉举证？']
      };
    }

    /** 二手购入：买机器只看三坑——版本 / 配件 / 账号；价格反而排最后 */
    function usedBuyPlan(opts) {
      var o = opts || {};
      var price = toNumber(o.price);
      var assumed = [];

      var perspective;
      if (price !== null && price > 0) {
        perspective = fmt(price) + ' 的二手掌机 / 数码价格还算合理，但买二手水很深，' +
          '咱们拆开算算：版本、配件、账号，三样问清楚再掏钱，价格反而排最后。';
      } else {
        perspective = '二手数码别只盯价格，先问三件事：版本对不对、配件齐不齐、账号干不干净。' +
          '这三样没搞清，便宜 200 也可能是坑。';
        assumed.push('没说价格，只给验机策略');
      }

      var rows = [];
      if (price !== null && price > 0) {
        rows.push(row('你看到的价', fmt(price) + ' 元', '二手挂价'));
        rows.push(row('版本差价', 'OLED / 续航 / 老款 差 300+', '先确认型号再谈钱'));
        rows.push(row('配齐配件', '底座 + 手柄 + 电源 +200 左右', '缺配件要往下压价'));
        rows.push(row('验机面交', '0 元，多花 1 小时', '最值的保险'));
      }

      return {
        ok: true, scene: 'usedbuy', name: '二手购入',
        title: '这价钱到底值不值',
        perspective: perspective,
        rows: rows,
        total: price !== null && price > 0 ? {
          label: '合理区间看两件事',
          value: '版本 + 成色', note: '同价不同版本，体验差一档'
        } : null,
        price: price,
        facts: [
          '版本坑：Switch 分 OLED / 续航版 / 老款，老款这个价就偏贵；先确认型号再谈钱',
          '配件坑：原装底座、手柄、电源配齐又要多花两百，缺配件就得往下压价',
          '账号坑：带数字版游戏的机器别买，账号容易被原主找回，游戏说没就没'
        ],
        tips: [
          '先查成交均价：闲鱼搜同型号，看近 7 天「已成交」而不是挂单价',
          '同城面交优先：当面开机、试手柄漂移、看屏幕坏点、连 Wi-Fi 试账号能否退出',
          '走验机宝 / 平台担保：能验机就别私下转账，出问题有平台兜底',
          '到手先别点确认收货：留 1~2 天做完整测试，有问题立刻申请售后'
        ],
        assumed: assumed,
        choices: ['教我怎么当面验机 Switch？', '帮我列一份二手 Switch 验机清单？']
      };
    }

    /**
     * 大促凑单（情景三）：为省 50 硬买 80。
     * 只算「凑单那件东西」这一笔，不评价整体该不该买 —— 该不该买是用户自己的事。
     */
    function promoPlan(opts) {
      var o = opts || {};
      var price = toNumber(o.price);
      var off = toNumber(o.off);
      var need = toNumber(o.threshold);
      var assumed = [];
      var rows = [];
      var perspective;
      var total = null;

      if (price !== null && price > 0 && off !== null && off > 0) {
        var net = round2(price - off);
        rows.push(row('凑单品', fmt(price) + ' 元', '本来没打算买'));
        rows.push(row('满减减掉', '-' + fmt(off) + ' 元', '整单满 ' +
          (need !== null ? fmt(need) : '门槛') + ' 才生效'));
        rows.push(row('净多花', (net > 0 ? '+' : '') + fmt(net) + ' 元',
          net > 0 ? '省 ' + fmt(off) + ' 花 ' + fmt(price) : '凑的是刚需才算赚'));
        rows.push(row('用不上的部分', fmt(price) + ' 元', '闲置一件 = 全亏'));
        if (net > 0) {
          perspective = '你以为省了 ' + fmt(off) + ' 块，其实多花了 ' + fmt(net) +
            ' 块：为了减 ' + fmt(off) + '，你硬买了 ' + fmt(price) + ' 块不需要的东西。' +
            '这不叫薅羊毛，叫被反薅。';
        } else {
          perspective = fmt(off) + ' 的满减，你只搭了 ' + fmt(price) +
            ' 的凑单品，账面是赚的 —— 前提是那件东西你会用完。用不上，等于白送 ' +
            fmt(price) + ' 块。';
        }
        total = {
          label: net > 0 ? '这单净亏' : '这单净省',
          value: fmt(Math.abs(net)) + ' 元',
          note: net > 0 ? '真省钱 = 本来就要买的部分 × 折扣' : '凑的是刚需才算真省'
        };
      } else if (price !== null && price > 0) {
        rows.push(row('凑单品', fmt(price) + ' 元', '本来没打算买'));
        rows.push(row('满减额度', '没说', '省多少要跟门槛一起看'));
        rows.push(row('闲置风险', fmt(price) + ' 元', '用不上就是全亏'));
        perspective = '凑单的钱要按「会不会用完」算，不是按「省了多少」算。' +
          fmt(price) + ' 块的凑单品摊到日常用量上，只要闲置，就是白送商家 ' + fmt(price) + ' 块。';
        assumed.push('没说满减额度，按「凑单品全价计入成本」算');
      } else {
        perspective = '满减的门槛是商家算好的：只差十来块，凑刚需还行；差七八十还硬凑，' +
          '省下的券钱一定小于多买的东西。先看差额，再看凑什么。';
        assumed.push('没说金额，只给判断方法');
      }

      return {
        ok: true, scene: 'promo', name: '大促凑单',
        title: '这波满减到底赚没赚',
        perspective: perspective,
        rows: rows,
        total: total,
        price: price,
        facts: [
          '门槛是反推出来的：满 300 通常对应你购物车平时 250 左右的水平，就等那件「刚好差一点」',
          '满减只在「本来就买」的那部分生效；凑单那件一分不省，还多付了它的全价',
          '定金膨胀、前 N 件半价、跨店满减是同一套：先把预算锚高，再还你一点折扣感'
        ],
        tips: [
          '只凑刚需：纸巾、洗衣液、话费充值、洗衣凝珠 —— 反正会用完，才叫提前囤',
          '差额超过 30 元就别凑：直接只买需要的那件，很多时候不用券反而更便宜',
          '已经下单了：发货后申请「单件退款」，满减按整单保留（一年别用超过一两次，会被风控）',
          '下单前把购物车放 24 小时：第二天还想要再买，八成会自己划掉一半'
        ],
        assumed: assumed,
        choices: ['凑单品到货后能单件退吗？', '怎么判断这波满减是不是真便宜？']
      };
    }

    /**
     * 会员订阅（情景六）：15 块/月本身不贵，贵在「自动」。
     * 算的是一年成本与「没看的那几个月」，不是单价。
     */
    function subsPlan(opts) {
      var o = opts || {};
      var fee = toNumber(o.fee);
      var assumed = [];
      var rows = [];
      var perspective;
      var total = null;

      if (fee !== null && fee > 0) {
        var year = round2(fee * 12);
        var meals = Math.round(year / 12);
        rows.push(row('每月扣费', fmt(fee) + ' 元', '连续包月 / 到期自动续'));
        rows.push(row('一年合计', fmt(year) + ' 元', fmt(fee) + ' × 12'));
        rows.push(row('折成饭钱', meals + ' 顿食堂', '按 12 元/顿'));
        rows.push(row('没看的月份', '全额亏损', '会员按时间收费，不看也照扣'));
        perspective = fmt(fee) + ' 块一个月听着不贵，可它是「自动的」：一年 ' + fmt(year) +
          ' 块，够吃 ' + meals + ' 顿食堂。真正贵的地方不是你开了会员，是你忘了关。';
        total = {
          label: '一年不知不觉扣掉',
          value: fmt(year) + ' 元',
          note: '没看的月份 = 纯亏损的沉默成本'
        };
      } else {
        rows.push(row('常见月费', '15~25 元', '首月 9.9 是引流价'));
        rows.push(row('一年合计', '180~300 元', '按月 × 12'));
        rows.push(row('没看的月份', '全额亏损', '不看也照扣'));
        perspective = '会员费最坑的地方不是单价，是「自动」：一次授权，之后每个月都在扣，' +
          '而你只在第一周看过。先把它算成一年，再决定要不要留。';
        assumed.push('没说金额，按常见档 15~25 元/月算');
      }

      return {
        ok: true, scene: 'subs', name: '会员订阅',
        title: '这笔订阅该不该留',
        perspective: perspective,
        rows: rows,
        total: total,
        facts: [
          '「首月 9.9」的连续包月从第二个月起恢复原价 15~25 元，且默认一直扣到你自己去关',
          '自动续费的技术前提是「免密支付 / 自动扣款」授权：关掉授权等于断根，会员照样用到到期',
          '同一部剧，家庭组 / 联合会员 / 学生认证能把实际单价压到原价的三分之一左右'
        ],
        tips: [
          '开完立刻关：支付宝 → 我的 → 设置 → 支付设置 → 免密支付 / 自动扣款 → 找到它 → 关闭；' +
            '微信 → 我 → 服务 → 钱包 → 支付设置 → 自动续费',
          '关掉不影响本月会员：你取消的是「下次扣款」，不是「这次服务」，别被「取消即失效」吓住',
          '追剧就买 1 个月，追完就退订；年卡只有在全年都在看时才划算',
          '和室友拼家庭组：一份钱 3~4 个人用，人均一年十几块'
        ],
        assumed: assumed,
        choices: ['怎么把自动续费彻底关掉？', '视频会员怎么拼家庭组？']
      };
    }

    /**
     * 平台大促攻略（playbook）：「双十一怎么玩京东」问的是方法论，
     * 不是「我被凑单反薅了」。所以这张卡不评判某笔已花的钱，
     * 只拆「优惠的三层结构」和「补差到下一档到底划不划算」。
     * 平台规则年年改，卡里只给结构与临界点，具体额度以当年活动页为准。
     */
    function playbookPlan(opts) {
      var o = opts || {};
      var budget = toNumber(o.budget);
      var plat = String(o.platform || '').trim();
      var where = plat || '大促';
      var assumed = [];
      var rows = [];
      var perspective;
      var total = null;
      /* 常见门槛：跨店每满 300 减 50。年年会变，所以只在算例里用，且标注「按常见力度」 */
      var TIER = 300, CUT = 50;

      if (budget !== null && budget > 0) {
        var times = Math.floor(budget / TIER);
        var got = times * CUT;
        var rest = budget - times * TIER;
        var gap = TIER - rest;
        var worth = gap < CUT;
        rows.push(row('你的预算', fmt(budget) + ' 元', '本来就要花的钱'));
        rows.push(row('满减吃到', (got > 0 ? '-' + fmt(got) : '0') + ' 元',
          '每满 ' + TIER + ' 减 ' + CUT + '，吃到 ' + times + ' 档'));
        rows.push(row('补到下一档', '差 ' + fmt(gap) + ' 元',
          '多花 ' + fmt(gap) + '，只多减 ' + CUT));
        rows.push(row('这笔补差', worth ? '划算' : '不划算',
          worth ? '补的钱少于减的钱' : '补 ' + fmt(gap) + ' 只减 ' + fmt(CUT) + '，多花的比省下的多'));
        perspective = '按 ' + fmt(budget) + ' 的预算，满减能吃到 ' + fmt(got) +
          ' 块。真正决定你这单赚不赚的，不是这 ' + fmt(got) +
          ' 块，而是你会不会为了下一档再补 ' + fmt(gap) + ' 块：' +
          (worth ? '补 ' + fmt(gap) + ' 换 ' + fmt(CUT) + '，账面上是赚的，前提是补的东西你真用得上。'
            : '补 ' + fmt(gap) + ' 只换 ' + fmt(CUT) + '，账面上就已经亏了，更别说那件东西你可能根本不需要。');
        /* 「亏 X 元」会被读成「这单已经亏了」，但用户其实还没下单：
           真正要表达的是「补这 100 只减 50」，所以直接写多花与只减。 */
        total = worth
          ? { label: '这档可以补', value: '补 ' + fmt(gap) + '，减 ' + fmt(CUT),
            note: '补的钱少于减的钱，前提是补的东西你真用得上' }
          : { label: '这档别补', value: '多花 ' + fmt(gap) + '，只减 ' + fmt(CUT),
            note: '补差 ≥ 减免，等于拿真钱换假省' };
        assumed.push('满减按「每满 ' + TIER + ' 减 ' + CUT + '」的常见力度算，实际以当年活动页为准');
      } else {
        rows.push(row('第一层', '跨店满减', '门槛固定，减得最多'));
        rows.push(row('第二层', '品类券 / 补贴', '藏在领券页，多数人直接漏掉'));
        rows.push(row('第三层', '价保', '签收后降价能退差，白捡的'));
        rows.push(row('最该先做', '领券 + 设价保', '两件事不花钱，只花三分钟'));
        perspective = where + '的优惠是三层叠的：满减、品类券、价保。多数人只盯着第一层，' +
          '而后两层才是白捡的——领券不用多花一分钱，价保是降价后把差价要回来。' +
          '真正要防的不是「没抢到券」，是「为了用券多买了不需要的东西」。';
        assumed.push('没说预算，只给结构与顺序');
      }

      return {
        ok: true, scene: 'playbook', name: '平台攻略',
        title: (plat || '大促') + '这三层优惠怎么吃满',
        platform: plat || '',
        perspective: perspective,
        rows: rows,
        total: total,
        facts: [
          '满减门槛是反推出来的：' + TIER + ' 这个数通常对应大多数人购物车 250 左右，「就差一点」是设计出来的，不是巧合',
          '优惠有叠加顺序：先店铺券 / 品类券，再跨店满减，最后平台红包；顺序错了会少减一截',
          '价保有时限：京东签收后 7 天内（部分品类 PLUS 可到 30 天）降价可申请退差，过期不补',
          '定金通常不退：预售付了定金又不买，定金没了——只在「确定要买」时付'
        ],
        tips: [
          '先领券再逛：京东首页上方有「领券」入口，很多人直接搜商品下单，等于白送第二层',
          '百亿补贴认「自营」标：第三方店铺的补贴价，常是先抬价再补，到手未必便宜',
          '下单后立刻记一笔价保：把商品留在清单里，7 天内降价就申请退差，这是最容易被忘的白捡钱',
          '只买清单里的东西：逛之前先写下要买的，逛的时候只按清单搜，别点推荐位'
        ],
        assumed: assumed,
        choices: ['京东的券到底都在哪领？', '价保怎么申请、能退多少？']
      };
    }

    var BUILDERS = {
      rent: rentPlan, utility: utilityPlan, transport: transportPlan,
      digital: digitalPlan, clothes: clothesPlan, medical: medicalPlan,
      grocery: groceryPlan, telecom: telecomPlan, hairstyle: hairPlan,
      gym: gymPlan, secondhand: secondPlan, usedbuy: usedBuyPlan,
      promo: promoPlan, subs: subsPlan, playbook: playbookPlan
    };

    /**
     * 由一句话直接出结果。
     * @param {{scene:string, text?:string, money?:number, ...}} input
     */
    function build(scene, opts) {
      var fn = BUILDERS[scene];
      if (!fn) {
        return { ok: false, scene: scene, code: 'NO_SCENE', message: '不认识的场景' };
      }
      var r = fn(opts || {});
      /* 发射头与 A/B 子应答默认从集中表取，各 plan 也可自己覆盖 */
      if (r && r.ok) {
        if (!r.launch) { r.launch = LAUNCH[scene] || '生存物价雷达启动！'; }
        if (!r.followups && FOLLOWUPS[scene]) { r.followups = FOLLOWUPS[scene]; }
      }
      return r;
    }

    /**
     * 一句话 → 测算（解析 + 计算一步到位）。
     * @return {?Object} 不是生存咨询则为 null
     */
    function fromText(text) {
      var d = detect(text);
      if (!d) { return null; }
      var t = String(text == null ? '' : text);
      var o = { text: t };
      var money = d.money;

      if (d.scene === 'rent') {
        o.rent = money;
        var dp = parseDeposit(t);
        if (dp) { o.deposit = dp.deposit; o.pay = dp.pay; }
        /* 没说房租、只问押付压力：走现金流专项，而不是拿三档房价表答非所问 */
        if (money === null && /押|付三|付一|现金流|首付/.test(t)) { o.focusDeposit = true; }
        o.area = parseArea(t);
        o.kwh = parseKwh(t);
        o.ton = parseTon(t);
        o.commercial = /商(用|水商电)|商业电|商电/.test(norm(t));
        o.summer = /空调|夏天|夏季/.test(t);
        if (/不含|另算|自己交/.test(t)) { o.includeNet = false; }
      } else if (d.scene === 'utility') {
        o.kwh = parseKwh(t);
        o.ton = parseTon(t);
        o.cost = money;
        o.people = parsePeople(t);
        o.commercial = /商(用|业)/.test(norm(t));
        o.summer = /空调|夏天|夏季/.test(t);
      } else if (d.scene === 'transport') {
        /* 「打车25块，坐地铁4块」：一句里两个价，取打车那个，不是最后一个 */
        var tm = norm(t).match(/(?:打车|滴滴|出租|网约车)[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)/);
        o.taxiFare = tm ? parseFloat(tm[1]) : money;
        o.days = parseDays(t);
        var mf = norm(t).match(/地铁[^0-9]{0,6}([0-9]+(?:\.[0-9]+)?)/);
        if (mf) { o.metroFare = parseFloat(mf[1]); }
      } else if (d.scene === 'digital') {
        o.price = money;
      } else if (d.scene === 'clothes') {
        o.price = money;
        var wm = norm(t).match(/穿\s*([0-9]+)\s*次/);
        if (wm) { o.wears = parseInt(wm[1], 10); }
      } else if (d.scene === 'medical') {
        o.cost = money;
      } else if (d.scene === 'grocery') {
        o.money = money;
      } else if (d.scene === 'telecom') {
        o.monthly = money;
      } else if (d.scene === 'hairstyle') {
        /* 「办500的充值卡，单次剪只要15块」：卡额与单次价必须分别取，不能靠 parseMoney 的
           「最后一个带单位的数」（那会取到 15，把卡额算成 15 元、回本次数算成 1）。
           卡额规则：金额后紧跟 卡/充值 → 或 办/充值/充 + 金额。 */
        var hc = norm(t);
        var hm = hc.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:块|元)?\s*的?\s*(?:充值卡|会员卡|卡)/) ||
          hc.match(/(?:充值|办|充)\s*(?:了)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:块|元)/);
        o.card = hm ? parseFloat(hm[1]) : money;
        var pm = hc.match(/(?:单次|每次|剪|剪发)[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)\s*(?:块|元)?/);
        if (pm) {
          var pv = parseFloat(pm[1]);
          /* 单次价必须明显小于卡额，否则是解析串了，交给默认估值 */
          if (!(o.card !== null && o.card > 0) || pv < o.card) { o.perVisit = pv; }
        }
      } else if (d.scene === 'gym') {
        o.card = money;
      } else if (d.scene === 'secondhand') {
        var pr = norm(t).match(/标价\s*([0-9]+(?:\.[0-9]+)?)/);
        o.price = pr ? parseFloat(pr[1]) : money;
        var of = norm(t).match(/(?:只肯给|肯给|只给|给|出)\s*([0-9]+(?:\.[0-9]+)?)\s*(?:块|元)?/);
        if (of) { o.offered = parseFloat(of[1]); }
      } else if (d.scene === 'usedbuy') {
        o.price = money;
      } else if (d.scene === 'promo') {
        /* 「满300减50」是规则、「硬买了80的衣服」是代价：两个数必须分开取，
           否则把 50 当成凑单品价，会算成「省 50 花 50 = 刚好不亏」，结论直接反。 */
        var pc = norm(t);
        var mm = pc.match(/满\s*([0-9]+(?:\.[0-9]+)?)\s*减\s*([0-9]+(?:\.[0-9]+)?)/);
        if (mm) { o.threshold = parseFloat(mm[1]); o.off = parseFloat(mm[2]); }
        var pm = pc.match(/(?:凑|加购|硬买|买了|买个|多买)[^0-9]{0,6}([0-9]+(?:\.[0-9]+)?)\s*(?:块|元|的)?/);
        o.price = pm ? parseFloat(pm[1]) : money;
      } else if (d.scene === 'subs') {
        o.fee = money;
      } else if (d.scene === 'playbook') {
        /* 预算只认「预算 / 打算花 / 准备花」后面那个数：
           「满 300 减 50」里的数字是门槛，不是他手里有多少钱。 */
        var bm = norm(t).match(/(?:预算|打算花|准备花|手里有|就)\s*([0-9]+(?:\.[0-9]+)?)/);
        o.budget = bm ? parseFloat(bm[1]) : null;
        var pf = norm(t).match(/京东|淘宝|天猫|拼多多|唯品会|抖音商城|抖音|苏宁易购|苏宁|得物|1688/);
        if (pf) { o.platform = pf[0].indexOf('抖音') === 0 ? '抖音商城' : pf[0]; }
      }

      var r = build(d.scene, o);
      if (r && r.ok) {
        r.detected = { scene: d.scene, name: d.name, money: money, word: d.word };
        r.text = t;
      }
      return r;
    }

    /* ================================================================== */
    /* 七、卡片与正文                                                      */
    /* ================================================================== */

    /**
     * 卡片：三段 tab —— 🧮 账单透视 / 💡 生存常识 / 🫂 避坑指南。
     * 三段各说各的：透视只放数字与算式，常识只放基准线，避坑只放动作；
     * 默认停在「账单透视」，点 tab 切换（委托在 app.js 的聊天区点击里），
     * 不产生新消息，也不把同一件事说两遍。
     */
    function cardHtml(r) {
      if (!r || !r.ok) { return ''; }
      var h = ['<div class="pr-card sr-card sr-' + esc(r.scene) + '">'];
      h.push('<div class="sr-head"><span class="sr-title">' +
        esc(r.name) + ' · ' + esc(r.title) + '</span></div>');
      h.push('<div class="sr-tabs" role="tablist">');
      h.push('<button type="button" class="sr-tab on" data-srtab="0" aria-selected="true">🧮 账单透视</button>');
      h.push('<button type="button" class="sr-tab" data-srtab="1" aria-selected="false">💡 常识</button>');
      h.push('<button type="button" class="sr-tab" data-srtab="2" aria-selected="false">🫂 避坑</button>');
      h.push('</div>');

      /* pane 0 · 账单透视：只有数字与算式 */
      h.push('<div class="sr-pane" data-pane="0">');
      h.push('<div class="sr-rows">');
      var i;
      for (i = 0; i < r.rows.length; i++) {
        var w = r.rows[i];
        h.push('<div class="sr-row"><span class="sr-l">' + esc(w.label) + '</span>' +
          '<span class="sr-v">' + esc(w.value) + '</span>' +
          (w.note ? '<span class="sr-n">' + esc(w.note) + '</span>' : '') + '</div>');
      }
      h.push('</div>');
      if (r.total) {
        h.push('<div class="sr-sum"><span>' + esc(r.total.label) + '</span>' +
          '<b>' + esc(r.total.value) + '</b></div>');
        if (r.total.note) { h.push('<div class="sr-sub">' + esc(r.total.note) + '</div>'); }
      }
      if (r.sub) {
        h.push('<div class="sr-sum sr-sum2"><span>' + esc(r.sub.label) + '</span>' +
          '<b>' + esc(r.sub.value) + '</b></div>');
        if (r.sub.note) { h.push('<div class="sr-sub">' + esc(r.sub.note) + '</div>'); }
      }
      if (r.assumed && r.assumed.length) {
        h.push('<div class="sr-note">口径：' + esc(r.assumed.join('、')) +
          (r.scene === 'playbook'
            ? ' · 活动规则年年会变，以当年活动页为准'
            : ' · 经验费率，不是当地实时账单') + '</div>');
      }
      h.push('</div>');

      /* pane 1 · 生存常识：基准线 */
      h.push('<div class="sr-pane" data-pane="1" hidden>');
      for (i = 0; i < r.facts.length; i++) {
        h.push('<div class="sr-li">· ' + esc(r.facts[i]) + '</div>');
      }
      h.push('</div>');

      /* pane 2 · 避坑指南：具体动作 */
      h.push('<div class="sr-pane" data-pane="2" hidden>');
      for (i = 0; i < r.tips.length; i++) {
        h.push('<div class="sr-li">' + (i + 1) + '. ' + esc(r.tips[i]) + '</div>');
      }
      h.push('</div>');

      h.push('</div>');
      return h.join('');
    }

    /** 正文：只给结论与下一步；常识 / 避坑的清单在卡片 tab 里，不重复 */
    function say(r) {
      if (!r || !r.ok) {
        return '这个我没法算：' + ((r && r.message) || '信息不够') + '。';
      }
      var h = [];
      if (r.total) {
        h.push(r.total.label + ' **' + r.total.value + '**' +
          (r.total.note ? '（' + r.total.note + '）' : '') + '。');
      }
      if (r.sub) {
        h.push(r.sub.label + ' **' + r.sub.value + '**' +
          (r.sub.note ? '（' + r.sub.note + '）' : '') + '。');
      }
      h.push('基准线和避坑动作在卡片右上角切换查看。');
      if (r.needRent) {
        h.push('说个你实际的房租（比如「房租 1800」），我按你的数重算一遍。');
      }
      return h.join('\n');
    }

    /**
     * 聊天里的单条富叙事：发射头 → 透视 → 常识 → 避坑 → 👉 A/B 连环。
     * 与面板的「三段 tab」是两套渲染：聊天要一条气泡看完，面板要可翻面。
     *
     * opts.headers 可覆盖三段表头（由 app.js 的 voice.js 按场景轮换，避免每条回复长一个样）；
     * 段与段之间插 .vo-sep（视觉上是一条 `---`），不改任何数据与按钮行为。
     * 不传 opts 时与旧版逐字一致 —— 面板 / 旧调用方零影响。
     */
    function chatHtml(r, opts) {
      if (!r || !r.ok) { return ''; }
      var o = opts || {};
      var H = o.headers || {};
      var hPersp = H.persp || '🧮 真实账单透视';
      var hFacts = H.facts || '💡 生存常识';
      var hTips = H.tips || '🫂 避坑指南';
      var ico = ICON[r.scene] || '🧭';
      var launch = r.launch || (ico + ' 生存物价雷达启动！');
      var h = [];
      var i;
      h.push('<div class="sv-chat sv-' + esc(r.scene) + '">');
      h.push('<div class="sv-launch">' + esc(launch) + '</div>');

      /* 账单透视 */
      h.push('<div class="sv-sec"><div class="sv-sec-h">' + esc(hPersp) + '</div>');
      if (r.perspective) { h.push('<div class="sv-persp">' + esc(r.perspective) + '</div>'); }
      if (r.rows && r.rows.length) {
        h.push('<div class="sv-rows">');
        for (i = 0; i < r.rows.length; i++) {
          var w = r.rows[i];
          h.push('<div class="sv-row"><span class="sv-l">' + esc(w.label) + '</span>' +
            '<span class="sv-v">' + esc(w.value) + '</span>' +
            (w.note ? '<span class="sv-n">' + esc(w.note) + '</span>' : '') + '</div>');
        }
        h.push('</div>');
      }
      if (r.total) {
        h.push('<div class="sv-sum"><span>' + esc(r.total.label) + '</span><b>' + esc(r.total.value) + '</b></div>');
        if (r.total.note) { h.push('<div class="sv-sub">' + esc(r.total.note) + '</div>'); }
      }
      if (r.sub) {
        h.push('<div class="sv-sum sv-sum2"><span>' + esc(r.sub.label) + '</span><b>' + esc(r.sub.value) + '</b></div>');
        if (r.sub.note) { h.push('<div class="sv-sub">' + esc(r.sub.note) + '</div>'); }
      }
      if (r.assumed && r.assumed.length) {
        /* 平台攻略里没有「费率」这回事：说「经验费率」会让用户以为券有固定折扣率。
           那里该说的是「规则会变，以活动页为准」。 */
        h.push('<div class="sv-note">口径：' + esc(r.assumed.join('、')) +
          (r.scene === 'playbook'
            ? ' · 活动规则年年会变，以当年活动页为准'
            : ' · 经验费率，非实时账单') + '</div>');
      }
      /* 地域尺子（region.js 生成的一句话）：本部只报基准地，换城市把「原值 → 折算值」写出来 */
      if (o.regionLine) {
        h.push('<div class="sv-region">' + esc(o.regionLine) + '</div>');
      }
      h.push('</div>');

      /* 生存常识 */
      if (r.facts && r.facts.length) {
        h.push('<div class="vo-sep" aria-hidden="true"></div>');
        h.push('<div class="sv-sec"><div class="sv-sec-h">' + esc(hFacts) + '</div>');
        for (i = 0; i < r.facts.length; i++) {
          h.push('<div class="sv-li">· ' + esc(r.facts[i]) + '</div>');
        }
        h.push('</div>');
      }

      /* 避坑指南 */
      if (r.tips && r.tips.length) {
        h.push('<div class="vo-sep" aria-hidden="true"></div>');
        h.push('<div class="sv-sec"><div class="sv-sec-h">' + esc(hTips) + '</div>');
        for (i = 0; i < r.tips.length; i++) {
          h.push('<div class="sv-li">' + (i + 1) + '. ' + esc(r.tips[i]) + '</div>');
        }
        h.push('</div>');
      }

      /* 👉 A/B 连环 */
      var ch = r.choices || [];
      if (ch.length) {
        h.push('<div class="vo-sep" aria-hidden="true"></div>');
        h.push('<div class="sv-next">👉 接下来你想怎么做？</div>');
        h.push('<div class="sv-choices">');
        for (i = 0; i < ch.length; i++) {
          h.push('<button type="button" class="choice-btn" data-cmd="' + esc(ch[i]) + '">' +
            String.fromCharCode(65 + i) + '. ' + esc(ch[i]) + '</button>');
        }
        h.push('</div>');
      }
      h.push('</div>');
      return h.join('');
    }

    /** 子应答正文：本地写死的科普，转义 + 换行转 <br>，不掺用户输入 */
    function followupHtml(s) {
      if (!s) { return ''; }
      var html = String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/\n/g, '<br>');
      return '<div class="sv-follow">' + html + '</div>';
    }

    /**
     * 缺件时的追问：只问缺的那一个数，不一次问三件事。
     */
    function askFor(r) {
      if (r && r.code === 'NO_RENT') {
        return {
          text: '房租多少？说个月租我就能算出真实开销 —— 房租只是标价，' +
            '水电 + 网费 + 物业才是你每个月真掏的钱。',
          choices: ['房租 1000', '房租 1500', '房租 2000']
        };
      }
      return { text: '再说具体点：多少钱、多少量？', choices: [] };
    }

    var API = {
      VERSION: '1.0.0',
      RATES: RATES,
      RENT_BAND: RENT_BAND,
      SCENES: SCENES,
      detect: detect,
      rentPlan: rentPlan,
      utilityPlan: utilityPlan,
      transportPlan: transportPlan,
      digitalPlan: digitalPlan,
      clothesPlan: clothesPlan,
      medicalPlan: medicalPlan,
      telecomPlan: telecomPlan,
      hairPlan: hairPlan,
      gymPlan: gymPlan,
      secondPlan: secondPlan,
      usedBuyPlan: usedBuyPlan,
      promoPlan: promoPlan,
      subsPlan: subsPlan,
      playbookPlan: playbookPlan,
      build: build,
      fromText: fromText,
      cardHtml: cardHtml,
      chatHtml: chatHtml,
      followupHtml: followupHtml,
      say: say,
      askFor: askFor,
      parseMoney: parseMoney,
      parseDeposit: parseDeposit,
      parseArea: parseArea,
      parseKwh: parseKwh,
      parseTon: parseTon,
      parseDays: parseDays,
      fmt: fmt,
      esc: esc
    };
    return API;
  })();

  var API = {
    VERSION: '1.1.0',
    BASELINES: BASELINES,
    UNITS: UNITS,
    LEVELS: LEVELS,
    findItem: findItem,
    parse: parse,
    parseQty: parseQty,
    parseTotal: parseTotal,
    analyze: analyze,
    verdictOf: verdictOf,
    looksLikePriceAsk: looksLikePriceAsk,
    cardHtml: cardHtml,
    say: say,
    bandSay: bandSay,
    askChoices: askChoices,
    fmt: fmt,
    toNumber: toNumber,
    /* 补充场景（租房/水电/通勤/数码/衣服/买药）的对外入口 */
    survival: SVX
  };

  if (isNode) {
    module.exports = API;
  } else {
    global.AJ = global.AJ || {};
    global.AJ.priceradar = API;
  }
})(typeof window !== 'undefined' ? window : this);
