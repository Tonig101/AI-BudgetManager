/**
 * savings_data.js — 省钱图谱 · 数据层（143 条 / 10 分类，其中 5 类已扩展）
 *
 * 数据来源：《大学生全网省钱与防割韭菜图谱（100 条）》用户提供版
 * 处理原则（对应《省钱功能开发规格.md》§10）：
 *   ① 原文给「周几 / 每月几号 / 几点后」→ 转成 trigger，由日期算法算真实命中，不靠记忆；
 *   ② 原文给「省 X 元 / 打几折 / 买一送一」→ 转成 save，能算就算，算不了给区间；
 *   ③ 原文只讲习惯（保温杯、图书馆）→ save.type = 'none'，照样入库、照样可打卡，只是不进金额累计；
 *   ④ 依托具体校区 / 门店 → certainty = 'local'（UI 打「以你学校为准」黄标）；
 *   ⑤ 力度随档期变的（会员日 88 折、百亿补贴）→ certainty = 'varies'（UI 打「力度常变」灰标）。
 *
 * ⚠️ 红线：所有金额都是**估算区间**，不承诺最低价，不写死平台实时价。价格类条目一律 varies。
 *
 * 浏览器：<script src="savings_data.js"> → window.AJ.savingsData
 * Node  ：require('./savings_data.js') → API（便于单测）
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);

  /** 数据版本：结构变更时改这里，app.js 据此决定要不要重置打卡记录 */
  var DATA_VERSION = 3;

  /** 10 个分类（顺序即 UI tab 顺序） */
  var CATS = [
    { key: 'fastfood', name: '连锁快餐', emoji: '🍔', ico: 'cat-food' },
    { key: 'delivery', name: '简餐外卖', emoji: '🥡', ico: 'tray' },
    { key: 'canteen', name: '校园食堂', emoji: '🍚', ico: 'bowl' },
    { key: 'drinks', name: '茶饮咖啡', emoji: '☕', ico: 'cup' },
    { key: 'snacks', name: '零食夜市', emoji: '🍢', ico: 'snack' },
    { key: 'daily', name: '商超日用', emoji: '🧴', ico: 'bag' },
    { key: 'fun', name: '娱乐社交', emoji: '🎬', ico: 'cat-fun' },
    { key: 'transit', name: '交通出行', emoji: '🚌', ico: 'cat-transit' },
    { key: 'study', name: '学习考证', emoji: '📚', ico: 'cap' },
    { key: 'promo', name: '促销节点', emoji: '🗓️', ico: 'ticket' },
    { key: 'gu', name: '吃谷避坑', emoji: '🎴', ico: 'bag' }
  ];

  /** 账本合法分类（与 data.js CATEGORIES 严格一致，另允许 '跨类'） */
  var BILL_CATS = ['餐饮', '社交', '购物', '学习', '交通', '娱乐', '居住', '医疗', '其他', '跨类'];

  /**
   * 121 条条目（用户提供 100 条 + 后续新增 13 条品牌优惠 + 8 条隐形省钱法则）。字段说明见规格 §3.1。
   * trigger 支持单维度或多维度（**任一维度满足即命中**，OR 语义）：
   *   { weekday:[1..7] }            1=周一 … 7=周日
   *   { monthday:[1..28] }          每月几号（限 1-28，规避 2 月缺日）
   *   { timeRange:['HH:MM','HH:MM'] }  支持跨零点（20:00 → 02:00）
   *   { mmdd:['MM-DD'] }            固定月日（双11 / 618）
   *   { window:[{from,to}] }        区间（开学季）
   */
  var ENTRIES = [
  {
    "id": "fastfood.mcd.01",
    "cat": "fastfood",
    "title": "麦当劳周一「随心配 1+1」",
    "action": "周一点「随心配 1+1」，两件组合价 13.9 元；8/18/28 会员日顺手用积分兑免费小吃。饮料要中杯，别升大杯。",
    "who": "想吃快餐但不想破 15 元的人",
    "gate": "需周一当天；到店或小程序下单",
    "scene": "连锁快餐",
    "risk": "仅周一有效；部分门店不参加；大杯加价差 3-4 元不值",
    "trigger": {
      "weekday": [
        1
      ],
      "monthday": [
        8,
        18,
        28
      ]
    },
    "save": {
      "type": "range",
      "min": 4,
      "max": 8
    },
    "priceRef": {
      "before": 20,
      "after": 13.9
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "麦当劳",
      "随心配",
      "1+1",
      "金拱门"
    ],
    "certainty": "stable",
    "source": "麦当劳 App / 门店",
    "when": "weekday-lunch"
  },
  {
    "id": "fastfood.kfc.02",
    "cat": "fastfood",
    "title": "肯德基疯狂星期四 + 代金券",
    "action": "周四点「疯狂星期四」限定套餐；先在淘宝搜「肯德基代金券」再下单，可再叠一层。",
    "who": "周四有课路过校门口的人",
    "gate": "需周四；代金券要提前买好",
    "scene": "连锁快餐",
    "risk": "热门单品中午就卖完；代金券有使用期限，别囤；比点外卖省的是配送费，走两步更省",
    "trigger": {
      "weekday": [
        4
      ]
    },
    "save": {
      "type": "range",
      "min": 10,
      "max": 20
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "肯德基",
      "KFC",
      "疯狂星期四",
      "代金券"
    ],
    "certainty": "stable",
    "source": "肯德基 App / 门店；项目 deals.js 既有口径",
    "when": "weekday-dinner"
  },
  {
    "id": "fastfood.bk.03",
    "cat": "fastfood",
    "title": "汉堡王周三 9.9 元特价堡",
    "action": "周三直接点 9.9 元特价堡，再领「1 元小食」券；不点套餐、不加饮料。",
    "who": "只要一个堡就够吃的人",
    "gate": "需周三；部分门店限堂食",
    "scene": "连锁快餐",
    "risk": "特价堡多为单层小规格；1 元小食常限量；只买特价会被店员劝升级，扛得住就行",
    "trigger": {
      "weekday": [
        3
      ]
    },
    "save": {
      "type": "range",
      "min": 8,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "汉堡王",
      "9.9",
      "特价堡"
    ],
    "certainty": "stable",
    "source": "汉堡王 App / 门店",
    "when": "weekday-lunch"
  },
  {
    "id": "fastfood.tastien.04",
    "cat": "fastfood",
    "title": "塔斯汀周二会员日买一送一",
    "action": "周二会员日买一送一，两个人吃刚好；一个人吃就拉舍友拼，别硬吃两份。",
    "who": "有饭搭子的宿舍",
    "gate": "需周二；会员身份",
    "scene": "连锁快餐",
    "risk": "买一送一多为指定款；一个人吃两份反而多花钱；现烤要等 15 分钟",
    "trigger": {
      "weekday": [
        2
      ]
    },
    "save": {
      "type": "range",
      "min": 8,
      "max": 18
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "塔斯汀",
      "中国汉堡",
      "买一送一"
    ],
    "certainty": "stable",
    "source": "塔斯汀门店活动",
    "when": "weekday-dinner"
  },
  {
    "id": "fastfood.ph.05",
    "cat": "fastfood",
    "title": "必胜客周三「尖叫星期三」",
    "action": "周三走尖叫星期三价位；部分门店有自助沙拉吧，先吃沙拉再点主食。",
    "who": "想偶尔改善一顿的人",
    "gate": "需周三；自助沙拉吧仅部分门店",
    "scene": "连锁快餐",
    "risk": "自助沙拉吧门店越来越少，去前先打电话问；饮料最贵，自带水",
    "trigger": {
      "weekday": [
        3
      ]
    },
    "save": {
      "type": "range",
      "min": 15,
      "max": 30
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "必胜客",
      "尖叫星期三",
      "披萨"
    ],
    "certainty": "varies",
    "source": "必胜客 App / 门店",
    "when": "weekday-dinner"
  },
  {
    "id": "fastfood.saizeriya.06",
    "cat": "fastfood",
    "title": "萨莉亚：避开牛排，点意面焗饭",
    "action": "只点十几元的意面 / 焗饭 + 9 元畅饮，避开三四十元的牛排和拼盘。",
    "who": "想在商场里吃顿正经西餐又不想超 30 的人",
    "gate": "无",
    "scene": "连锁快餐",
    "risk": "牛排性价比最差；畅饮要主动点才给杯子；饭点排队久",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 25
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "萨莉亚",
      "意面",
      "焗饭"
    ],
    "certainty": "stable",
    "source": "萨莉亚菜单",
    "when": "weekend-meal"
  },
  {
    "id": "fastfood.wallace.07",
    "cat": "fastfood",
    "title": "华莱士：只买抖音/美团团购双人餐",
    "action": "在抖音或美团搜「华莱士双人餐」，20 元上下；绝不原价扫码点单。",
    "who": "两个人一起吃、对品质要求不高的人",
    "gate": "需先在团购平台下单，到店核销",
    "scene": "连锁快餐",
    "risk": "出品稳定性看门店，肠胃敏感慎选；团购券有核销时段限制",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 20
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "华莱士",
      "双人餐",
      "团购"
    ],
    "certainty": "varies",
    "source": "抖音 / 美团团购",
    "when": "weekday-dinner"
  },
  {
    "id": "fastfood.laojiaji.08",
    "cat": "fastfood",
    "title": "老乡鸡/乡村基：晚 8 点后进店",
    "action": "晚上 8 点后到店，剩下的菜常买一送一；公众号先领「半价菜券」再点。",
    "who": "晚饭吃得晚的人",
    "gate": "需 20:00 后到店；券在公众号领",
    "scene": "连锁快餐",
    "risk": "8 点后可选菜品少；买一送一多为临期菜，看新鲜度再拿",
    "trigger": {
      "timeRange": [
        "20:00",
        "21:30"
      ]
    },
    "save": {
      "type": "range",
      "min": 8,
      "max": 18
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "老乡鸡",
      "乡村基",
      "半价菜"
    ],
    "certainty": "varies",
    "source": "门店 / 公众号",
    "when": "late-dinner"
  },
  {
    "id": "fastfood.nanchengxiang.09",
    "cat": "fastfood",
    "title": "南城香：3 元自助早餐",
    "action": "早上点 3 元自助早餐（粥 / 豆浆无限续），20 元内能吃到一顿正经饭。",
    "who": "学校附近有南城香的（北京为主）",
    "gate": "需门店覆盖；早餐时段",
    "scene": "连锁快餐",
    "risk": "仅部分城市有店，别的城市不适用；高峰期座位紧张",
    "trigger": {
      "timeRange": [
        "06:30",
        "09:30"
      ]
    },
    "save": {
      "type": "range",
      "min": 5,
      "max": 12
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "南城香",
      "自助早餐",
      "3元"
    ],
    "certainty": "local",
    "source": "南城香门店（区域性）",
    "when": "morning"
  },
  {
    "id": "fastfood.micun.10",
    "cat": "fastfood",
    "title": "米村拌饭：点最便宜的石锅拌饭",
    "action": "只点最便宜的石锅拌饭，海带汤、泡菜、米饭免费无限续，续两次就吃饱。",
    "who": "饭量大、能接受重复口味的人",
    "gate": "无",
    "scene": "连锁快餐",
    "risk": "续饭续汤是店里给的，别打包带走；高峰期限续次数可能收紧",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 8,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "米村拌饭",
      "石锅拌饭",
      "免费续"
    ],
    "certainty": "stable",
    "source": "米村拌饭门店",
    "when": "weekday-lunch"
  },
  {
    "id": "fastfood.mcd.member",
    "cat": "fastfood",
    "title": "麦当劳会员日：领券再下单",
    "action": "周一 App 里领会员日券（满减 / 指定单品优惠），下单前先去「我的卡包」用掉，别原价点。",
    "who": "常点麦当劳的人",
    "gate": "需周一；需领券后下单",
    "scene": "连锁快餐",
    "risk": "券有门槛和指定品类；领了不用过期作废；和随心配比价后再用",
    "trigger": {
      "weekday": [
        1
      ]
    },
    "save": {
      "type": "range",
      "min": 3,
      "max": 10
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "麦当劳",
      "会员日",
      "领券",
      "优惠券"
    ],
    "certainty": "varies",
    "source": "麦当劳 App 会员日",
    "when": "weekday-lunch"
  },
  {
    "id": "fastfood.wallace.member",
    "cat": "fastfood",
    "title": "华莱士周五会员日买一送一",
    "action": "周五会员日指定款买一送一，拉个饭搭子一人一份最划算；一个人就别硬凑两份。",
    "who": "有饭搭子的宿舍",
    "gate": "需周五；限会员日指定款",
    "scene": "连锁快餐",
    "risk": "买一送一多为指定单品；和团购双人餐二选一别叠加；出品看门店",
    "trigger": {
      "weekday": [
        5
      ]
    },
    "save": {
      "type": "range",
      "min": 10,
      "max": 20
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "华莱士",
      "会员日",
      "买一送一"
    ],
    "certainty": "varies",
    "source": "华莱士会员日",
    "when": "weekday-dinner"
  },
  {
    "id": "fastfood.dicos.18",
    "cat": "fastfood",
    "title": "德克士每月 18 号买一送一",
    "action": "每月 18 号德克士指定款买一送一，两个人吃刚好；一个人就去拼单或只点特价。",
    "who": "想吃炸鸡又想省的人",
    "gate": "需每月 18 号；限指定款",
    "scene": "连锁快餐",
    "risk": "买一送一多为指定单品；一个人吃两份反而多花；注意核销时段",
    "trigger": {
      "monthday": [
        18
      ]
    },
    "save": {
      "type": "range",
      "min": 10,
      "max": 20
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "德克士",
      "18号",
      "买一送一"
    ],
    "certainty": "varies",
    "source": "德克士门店活动",
    "freq": "monthly"
  },
  {
    "id": "fastfood.haidilao.student",
    "cat": "fastfood",
    "title": "海底捞大学生 69 折",
    "action": "学生认证后，工作日 14:00-17:00 及 22:00 后到店享 69 折；挑人少时段，锅底小料另算。",
    "who": "已做学生认证的人",
    "gate": "需学生认证；仅工作日 14:00-17:00 与 22:00 后",
    "scene": "连锁快餐",
    "risk": "周末和饭点不打折；锅底、小料、酒水不参与；认证只认本人账号",
    "trigger": {
      "weekday": [
        1,
        2,
        3,
        4,
        5
      ]
    },
    "save": {
      "type": "ratio",
      "rate": 0.31,
      "cap": 80
    },
    "priceRef": {
      "before": 150
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "海底捞",
      "大学生",
      "69折",
      "学生认证"
    ],
    "certainty": "stable",
    "source": "海底捞大学生优惠",
    "when": "weekday-dinner"
  },
  {
    "id": "delivery.pinhaofan.11",
    "cat": "delivery",
    "title": "美团/饿了么「拼好饭」频道",
    "action": "点外卖先进「拼好饭」频道，10-15 元一顿，月底吃土救星；不赶时间就选它。",
    "who": "月底余额告急的人",
    "gate": "需在 App 内切到拼好饭频道",
    "scene": "外卖点餐",
    "risk": "可选商家少、出餐慢；配送时段集中在饭点后；口味稳定性一般",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 8,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "拼好饭",
      "外卖",
      "美团",
      "饿了么"
    ],
    "certainty": "varies",
    "source": "美团 / 饿了么 App",
    "when": "lunch"
  },
  {
    "id": "delivery.shaxian.12",
    "cat": "delivery",
    "title": "沙县/兰州拉面：只点面，不点炒菜",
    "action": "点一碗十几元的面或饭就够；炒菜和卤味是这家最贵的地方，一律不点。",
    "who": "想十几块吃饱的人",
    "gate": "无",
    "scene": "外卖点餐",
    "risk": "只吃面蛋白质不足，隔天补个蛋或豆浆；部分店堂食比外卖便宜 3-5 元",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 18
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "沙县",
      "兰州拉面",
      "拉面"
    ],
    "certainty": "stable",
    "source": "门店菜单",
    "when": "lunch"
  },
  {
    "id": "delivery.coudan.13",
    "cat": "delivery",
    "title": "满减不一个人硬凑",
    "action": "满 30 减 15 不要一个人凑到 30；找舍友拼单，或者只点到刚好达线，多一分都不加。",
    "who": "常被满减带着多买的人",
    "gate": "需有人拼单",
    "scene": "外卖点餐",
    "risk": "为凑单多买的往往是零食饮料，等于把省的钱又花出去；拼单要提前说好怎么分",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 12
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "满减",
      "凑单",
      "拼单",
      "室友",
      "舍友",
      "一起点",
      "跟风点"
    ],
    "certainty": "varies",
    "source": "平台满减规则（通用）",
    "freq": "order"
  },
  {
    "id": "delivery.redpacket.14",
    "cat": "delivery",
    "title": "隐藏红包：下单前先搜一次",
    "action": "点单前在微信搜外卖返利类小程序，领隐藏红包再回 App 下单，每次省 2-5 元。",
    "who": "每周点 3 次以上外卖的人",
    "gate": "需授权登录第三方小程序",
    "scene": "外卖点餐",
    "risk": "第三方小程序会拿你的订单信息，介意就别用；别为几块钱绑银行卡",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 2,
      "max": 5
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "红包",
      "返利",
      "优惠券"
    ],
    "certainty": "varies",
    "source": "第三方返利小程序（谨慎授权）",
    "freq": "order"
  },
  {
    "id": "delivery.packing.15",
    "cat": "delivery",
    "title": "包装费刺客：改到店自取",
    "action": "下单前看包装费那一栏；能走过去就选「到店自取」，配送费 + 包装费一起省。",
    "who": "店离宿舍 10 分钟内的人",
    "gate": "需能到店",
    "scene": "外卖点餐",
    "risk": "自取要自己走一趟，赶时间不划算；部分店自取不给优惠",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 8
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "包装费",
      "配送费",
      "自取"
    ],
    "certainty": "stable",
    "source": "平台费用结构（通用）",
    "freq": "order"
  },
  {
    "id": "delivery.member.16",
    "cat": "delivery",
    "title": "外卖会员：用完立刻关自动续费",
    "action": "开会员只开一个月，用完马上去关自动续费；取消页面常弹半价挽留券，先领再走。",
    "who": "一个月点十次以上外卖的人",
    "gate": "需开通过会员",
    "scene": "外卖点餐",
    "risk": "忘了取消就月月扣；挽留券有门槛，别为了用券多点单",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "外卖会员",
      "自动续费",
      "会员"
    ],
    "certainty": "varies",
    "source": "美团 / 饿了么 会员规则",
    "freq": "monthly"
  },
  {
    "id": "delivery.student.17",
    "cat": "delivery",
    "title": "学生认证：常驻专属满减",
    "action": "在 App 里做学生认证，认证后点奶茶快餐优先用学生专属红包。",
    "who": "在校生（人人可用）",
    "gate": "需学信网 / 校园卡认证",
    "scene": "外卖点餐",
    "risk": "认证要填学校信息；专属红包有时不如拼好饭便宜，下单前比一下",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 10
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "学生认证",
      "学生优惠",
      "满减"
    ],
    "certainty": "varies",
    "source": "平台学生认证页"
  },
  {
    "id": "delivery.officearea.18",
    "cat": "delivery",
    "title": "写字楼/医院周边更便宜",
    "action": "同一家连锁，优先选开在写字楼、医院旁边的门店，走量价通常比商业街低两成。",
    "who": "学校在商圈边上的人",
    "gate": "需能配送或走到",
    "scene": "外卖点餐",
    "risk": "便宜的多是走量款，品质一致但出餐快、口味标准化；别为了便宜跑太远",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 8
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "写字楼",
      "医院",
      "外卖"
    ],
    "certainty": "varies",
    "source": "商圈观察经验",
    "freq": "order"
  },
  {
    "id": "delivery.laojiaji.19",
    "cat": "delivery",
    "title": "晚上八点后到店买一送一",
    "action": "20:00 后去老乡鸡 / 大米先生门店，剩下的菜品经常买一送一。",
    "who": "晚饭吃得晚、不挑菜的人",
    "gate": "需 20:00 后到店",
    "scene": "外卖点餐",
    "risk": "可选菜品少；临期菜要看新鲜度；门店执行力度不一",
    "trigger": {
      "timeRange": [
        "20:00",
        "21:30"
      ]
    },
    "save": {
      "type": "range",
      "min": 8,
      "max": 18
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "老乡鸡",
      "大米先生",
      "买一送一"
    ],
    "certainty": "varies",
    "source": "门店",
    "when": "late-dinner"
  },
  {
    "id": "delivery.budgeteat.20",
    "cat": "delivery",
    "title": "只点一个最便宜的堡",
    "action": "实在没预算就点一个最便宜的汉堡，配店里的免费番茄酱和免费水，别点套餐。",
    "who": "当天只剩 10 块钱的人",
    "gate": "无",
    "scene": "外卖点餐",
    "risk": "长期这么吃营养不够，只当应急；别拿一堆免费纸巾和酱当习惯",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 8,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "汉堡",
      "穷鬼",
      "套餐"
    ],
    "certainty": "stable",
    "source": "门店通用做法",
    "freq": "emergency"
  },
  {
    "id": "delivery.dominos.21",
    "cat": "delivery",
    "title": "达美乐周一外卖 8 折",
    "action": "周一在达美乐小程序 / 外卖平台点单走 8 折，两个人拼一单把配送费摊薄。",
    "who": "想吃披萨的人",
    "gate": "需周一；以外卖价为准",
    "scene": "外卖点餐",
    "risk": "8 折仅限外卖、不含堂食；特价套餐可能不参与；满减与折扣二选一",
    "trigger": {
      "weekday": [
        1
      ]
    },
    "save": {
      "type": "ratio",
      "rate": 0.2,
      "cap": 30
    },
    "priceRef": {
      "before": 60
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "达美乐",
      "Domino",
      "外卖",
      "8折"
    ],
    "certainty": "varies",
    "source": "达美乐小程序",
    "when": "weekday-dinner"
  },
  {
    "id": "delivery.dominos.22",
    "cat": "delivery",
    "title": "达美乐周三外卖 7 折",
    "action": "周三达美乐外卖 7 折，比周一更狠；凑够起送再下单，别为凑单点多。",
    "who": "周三想吃披萨的人",
    "gate": "需周三；以外卖价为准",
    "scene": "外卖点餐",
    "risk": "7 折限外卖渠道；部分单品不参与；注意起送门槛",
    "trigger": {
      "weekday": [
        3
      ]
    },
    "save": {
      "type": "ratio",
      "rate": 0.3,
      "cap": 40
    },
    "priceRef": {
      "before": 60
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "达美乐",
      "Domino",
      "外卖",
      "7折"
    ],
    "certainty": "varies",
    "source": "达美乐小程序",
    "when": "weekday-dinner"
  },
  {
    "id": "canteen.clearance.21",
    "cat": "canteen",
    "title": "18:30 后食堂半价清仓",
    "action": "18:30 以后去食堂，面食、炒菜、卤味进入半价清仓，价格常是原价一半。",
    "who": "晚饭时间偏晚的人",
    "gate": "需 18:30 后；清仓量有限",
    "scene": "校园食堂",
    "risk": "去晚了就只剩几样；清仓菜可能是当日最后一批，看颜色再拿",
    "trigger": {
      "timeRange": [
        "18:30",
        "20:30"
      ]
    },
    "save": {
      "type": "range",
      "min": 5,
      "max": 10
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "食堂",
      "清仓",
      "半价"
    ],
    "certainty": "local",
    "source": "校内食堂惯例（以你学校为准）",
    "when": "dinner"
  },
  {
    "id": "canteen.corner.22",
    "cat": "canteen",
    "title": "挑角落/楼梯口的档口",
    "action": "同样一份菜，角落和楼梯口的档口通常比正对大门那几家便宜 2-3 元。",
    "who": "不介意多走二十步的人",
    "gate": "无",
    "scene": "校园食堂",
    "risk": "位置偏的档口菜品更新慢；人多的时候排队方向不直观",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 2,
      "max": 3
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "食堂",
      "档口",
      "便宜"
    ],
    "certainty": "local",
    "source": "校内观察（以你学校为准）",
    "when": "meal"
  },
  {
    "id": "canteen.freebuff.23",
    "cat": "canteen",
    "title": "免费米饭+例汤+咸菜吃饱",
    "action": "只点一份最便宜的素菜，靠食堂免费的米饭、例汤、咸菜吃饱。",
    "who": "当天预算极紧的人",
    "gate": "食堂提供免费加饭 / 例汤",
    "scene": "校园食堂",
    "risk": "长期缺蛋白质，隔两天要吃蛋和豆制品；免费加饭按学校规矩来，别反复要",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 9
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "食堂",
      "免费",
      "加饭",
      "例汤"
    ],
    "certainty": "local",
    "source": "校内食堂（以你学校为准）",
    "freq": "emergency"
  },
  {
    "id": "canteen.logistics.24",
    "cat": "canteen",
    "title": "盯后勤公众号薅餐券",
    "action": "关注学校后勤 / 饮食服务中心公众号，节日免费餐券、新菜品鉴券经常在那发。",
    "who": "愿意花两分钟点关注的人",
    "gate": "需关注本校后勤号",
    "scene": "校园食堂",
    "risk": "券有使用时段和份数限制，抢不到很正常；别在非官方号填个人信息",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 30
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "后勤",
      "公众号",
      "餐券"
    ],
    "certainty": "local",
    "source": "学校后勤公众号（以你学校为准）"
  },
  {
    "id": "canteen.teacher.25",
    "cat": "canteen",
    "title": "教师食堂共用时去蹭",
    "action": "部分学校教师食堂与学生食堂共用，菜品更好、价格更低，饭点错开 10 分钟去。",
    "who": "学校确实开放教师食堂的学生",
    "gate": "需学校允许学生就餐",
    "scene": "校园食堂",
    "risk": "不少学校严禁学生进入，先问清楚再进；被拦下别硬闯，尴尬的是自己",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 8
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "教师食堂",
      "食堂"
    ],
    "certainty": "local",
    "source": "校内（各校政策不同，务必先确认）",
    "when": "meal"
  },
  {
    "id": "canteen.share.26",
    "cat": "canteen",
    "title": "两人一份大份炒菜+两碗饭",
    "action": "和舍友点一份大份炒菜 + 两碗米饭，人均 6-8 元，比各点各的省一半。",
    "who": "有固定饭搭子的人",
    "gate": "需两人以上",
    "scene": "校园食堂",
    "risk": "口味要能凑到一块；AA 记得当场转，别拖成糊涂账",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 6,
      "max": 10
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "拼菜",
      "AA",
      "食堂"
    ],
    "certainty": "stable",
    "source": "食堂通用做法",
    "when": "dinner"
  },
  {
    "id": "canteen.halfportion.27",
    "cat": "canteen",
    "title": "问一句「能打半份吗」",
    "action": "很多窗口可以单点半份菜，同样的钱能吃到两倍种类，先问再点。",
    "who": "想多吃几种菜的人",
    "gate": "看窗口是否支持",
    "scene": "校园食堂",
    "risk": "不是每个窗口都愿意打半份；高峰期阿姨可能直接拒绝",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 6
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "半份",
      "食堂",
      "窗口"
    ],
    "certainty": "local",
    "source": "校内食堂（以你学校为准）",
    "when": "meal"
  },
  {
    "id": "canteen.offpeak.28",
    "cat": "canteen",
    "title": "错峰就餐，闲时给得多",
    "action": "避开 12:00 和 18:00 高峰，11:30 或 12:40 去，部分档口闲时会多给一勺。",
    "who": "课表允许错峰的人",
    "gate": "无",
    "scene": "校园食堂",
    "risk": "太晚去菜品少；错峰省的是「量」，不是标价，别指望打折",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 2,
      "max": 5
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "错峰",
      "食堂",
      "高峰"
    ],
    "certainty": "local",
    "source": "校内观察",
    "when": "meal"
  },
  {
    "id": "canteen.breakfast.29",
    "cat": "canteen",
    "title": "早餐在食堂解决",
    "action": "早饭吃食堂的包子 + 鸡蛋 + 豆浆，是最便宜的碳水和蛋白质组合。",
    "who": "能早起 10 分钟的人",
    "gate": "早餐时段供应",
    "scene": "校园食堂",
    "risk": "起晚了就没了；包子别只吃一个，上午会饿",
    "trigger": {
      "timeRange": [
        "06:30",
        "09:00"
      ]
    },
    "save": {
      "type": "range",
      "min": 3,
      "max": 6
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "早餐",
      "包子",
      "豆浆",
      "食堂"
    ],
    "certainty": "stable",
    "source": "食堂通用",
    "when": "morning"
  },
  {
    "id": "canteen.card.30",
    "cat": "canteen",
    "title": "用校园卡付，别扫码",
    "action": "很多学校用校园卡结算比微信 / 支付宝便宜 10%，付款前先看有没有这个差。",
    "who": "学校有校园卡补贴的人",
    "gate": "需校园卡余额",
    "scene": "校园食堂",
    "risk": "不是所有学校都有这个差；校园卡丢了要先挂失，别嫌麻烦",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 1,
      "max": 3
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "校园卡",
      "饭卡",
      "支付"
    ],
    "certainty": "local",
    "source": "校内结算规则（以你学校为准）",
    "when": "meal"
  },
  {
    "id": "drinks.luckin.31",
    "cat": "drinks",
    "title": "瑞幸周二 / 周四 9.9",
    "action": "周二、周四下单 9.9 元；淘宝先买礼品卡代下单，还能再省 2-3 元。",
    "who": "每周喝 2 杯以上的人",
    "gate": "需周二 / 周四；礼品卡需提前买",
    "scene": "茶饮咖啡",
    "risk": "9.9 多为指定款；礼品卡有有效期；门店高峰排队久",
    "trigger": {
      "weekday": [
        2,
        4
      ]
    },
    "save": {
      "type": "range",
      "min": 6,
      "max": 10
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "瑞幸",
      "9.9",
      "咖啡",
      "礼品卡"
    ],
    "certainty": "stable",
    "source": "瑞幸 App / 淘宝礼品卡",
    "when": "weekday"
  },
  {
    "id": "drinks.cotti.32",
    "cat": "drinks",
    "title": "库迪常驻 8.8 / 9.9 券",
    "action": "库迪常年有 8.8 / 9.9 券，门店在阳光广场，走过去比点外卖省配送费。",
    "who": "离得近、天天要一杯的人",
    "gate": "需到店或自提",
    "scene": "茶饮咖啡",
    "risk": "券每天限量；门店出品不稳定时换一家",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 6,
      "max": 10
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "库迪",
      "8.8",
      "咖啡"
    ],
    "certainty": "varies",
    "source": "库迪 App / 小程序",
    "when": "weekday"
  },
  {
    "id": "drinks.mixue.33",
    "cat": "drinks",
    "title": "蜜雪：4 元柠檬水",
    "action": "想喝东西就去蜜雪，4 元柠檬水、2 元冰淇淋，是抗通胀的底线价。",
    "who": "只要解渴不要仪式感的人",
    "gate": "需有门店",
    "scene": "茶饮咖啡",
    "risk": "甜度默认偏高，点少糖；排队时间长",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 6,
      "max": 12
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "蜜雪",
      "柠檬水",
      "冰淇淋",
      "奶茶"
    ],
    "certainty": "stable",
    "source": "蜜雪冰城门店"
  },
  {
    "id": "drinks.heytea.34",
    "cat": "drinks",
    "title": "喜茶/奈雪：先买代下单券",
    "action": "真喝就先去闲鱼买代下单券或生日免单券，再点单，单价能降五到十元。",
    "who": "偶尔想喝一杯的人",
    "gate": "需闲鱼交易；部分需他人账号下单",
    "scene": "茶饮咖啡",
    "risk": "代下单有跑单、账号风控风险；生日券需借用他人身份，别常用",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 12
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "喜茶",
      "奈雪",
      "代下单",
      "闲鱼",
      "奶茶"
    ],
    "certainty": "varies",
    "source": "闲鱼二手券（有交易风险，自行判断）",
    "when": "weekend"
  },
  {
    "id": "drinks.starbucks.35",
    "cat": "drinks",
    "title": "星巴克平替：挂耳 / 冻干",
    "action": "办公室或宿舍喝挂耳、冻干粉，一杯成本不到 3 元，比 30 多元一杯省一个量级。",
    "who": "天天要喝咖啡的人",
    "gate": "需烧水 / 有杯子",
    "scene": "茶饮咖啡",
    "risk": "口感不如现磨；冻干别买大桶装，开封后风味掉得快",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 20,
      "max": 29
    },
    "priceRef": {
      "before": 32,
      "after": 3
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "星巴克",
      "挂耳",
      "冻干",
      "咖啡"
    ],
    "certainty": "stable",
    "source": "自制成本对比"
  },
  {
    "id": "drinks.chagee.36",
    "cat": "drinks",
    "title": "霸王茶姬买一送一拼单",
    "action": "小程序常发买一送一 / 第二杯半价，找个人拼，一人一杯就把单价打下来。",
    "who": "有同事或舍友一起喝的人",
    "gate": "需两人成单",
    "scene": "茶饮咖啡",
    "risk": "券有指定款和时段；一个人喝两杯等于没省",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 8,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "霸王茶姬",
      "买一送一",
      "拼单",
      "奶茶"
    ],
    "certainty": "varies",
    "source": "霸王茶姬小程序",
    "when": "weekend"
  },
  {
    "id": "drinks.freetopping.37",
    "cat": "drinks",
    "title": "点纯茶 + 免费小料",
    "action": "一点點、CoCo 这类店加珍珠、椰果是免费的：点最便宜的纯茶，把免费小料加满。",
    "who": "想要「有料」的口感又不想多花钱的人",
    "gate": "看门店是否免费加料",
    "scene": "茶饮咖啡",
    "risk": "不是所有店都免费，先问；料加太多会盖掉茶味",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 6
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "小料",
      "珍珠",
      "一点點",
      "CoCo",
      "奶茶"
    ],
    "certainty": "varies",
    "source": "门店加料规则"
  },
  {
    "id": "drinks.convenience.38",
    "cat": "drinks",
    "title": "便利店咖啡 + 自带杯",
    "action": "全家 / 7-11 现磨咖啡买月卡或自带杯，单价 5 元上下。",
    "who": "早上赶课顺路买的人",
    "gate": "需有便利店；自带杯部分门店才减",
    "scene": "茶饮咖啡",
    "risk": "月卡用不完就亏；自带杯减免门店执行不一",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 20
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "便利店",
      "全家",
      "7-11",
      "咖啡"
    ],
    "certainty": "varies",
    "source": "便利店咖啡月卡",
    "when": "morning"
  },
  {
    "id": "drinks.cup.39",
    "cat": "drinks",
    "title": "永远点中杯",
    "action": "中杯和大杯差好几块，量只多一点，点单时直接说中杯。",
    "who": "所有人",
    "gate": "无",
    "scene": "茶饮咖啡",
    "risk": "爱喝大杯的别硬改，喝完不够会再买一杯，反而更贵",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 6
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "中杯",
      "大杯",
      "奶茶"
    ],
    "certainty": "stable",
    "source": "茶饮定价结构（通用）"
  },
  {
    "id": "drinks.thermos.40",
    "cat": "drinks",
    "title": "保温杯自泡",
    "action": "买个保温杯，自己泡茶包或冲速溶，一年能省出一部手机的钱。",
    "who": "每天至少一杯外带饮品的人",
    "gate": "需愿意洗杯子",
    "scene": "茶饮咖啡",
    "risk": "省的是长期账，前两周最难坚持；茶包别买太便宜的，喝着难受就坚持不下去",
    "trigger": null,
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "保温杯",
      "茶包",
      "自制",
      "奶茶"
    ],
    "certainty": "stable",
    "source": "长期习惯账（无单次金额）"
  },
  {
    "id": "drinks.heytea.topping",
    "cat": "drinks",
    "title": "喜茶 / CoCo：免费加小料",
    "action": "周二喜茶、CoCo 常推免费加小料活动：点纯茶或最便宜的饮品，把免费小料加满，口感立刻升级。",
    "who": "想加料又不想加钱的人",
    "gate": "需周二；看门店活动",
    "scene": "茶饮咖啡",
    "risk": "不是所有门店 / 所有饮品都参与；活动款常指定；加太多盖住茶味",
    "trigger": {
      "weekday": [
        2
      ]
    },
    "save": {
      "type": "range",
      "min": 2,
      "max": 5
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "喜茶",
      "CoCo",
      "免费",
      "小料",
      "加料"
    ],
    "certainty": "varies",
    "source": "喜茶 / CoCo 周活动",
    "when": "weekday"
  },
  {
    "id": "drinks.mixue.12off",
    "cat": "drinks",
    "title": "蜜雪冰城满 12 减 2",
    "action": "周三蜜雪常做「满 12 减 2」，三五个人拼单最容易凑到；一个人就加个最便宜的小食凑门槛。",
    "who": "常喝蜜雪的人",
    "gate": "需周三；满 12 元才减",
    "scene": "茶饮咖啡",
    "risk": "门槛要凑够 12 元；单点一杯多半不够，别硬凑一堆喝不下",
    "trigger": {
      "weekday": [
        3
      ]
    },
    "save": {
      "type": "range",
      "min": 2,
      "max": 2
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "蜜雪",
      "满12减2",
      "柠檬水"
    ],
    "certainty": "stable",
    "source": "蜜雪冰城门店活动",
    "when": "weekday"
  },
  {
    "id": "drinks.chabaidao.upsize",
    "cat": "drinks",
    "title": "茶百道周三会员升杯",
    "action": "周三茶百道会员日常做「免费升杯 / 加料」，会员下单时勾上升杯，一杯变两杯的量。",
    "who": "茶百道会员",
    "gate": "需周三；需会员身份",
    "scene": "茶饮咖啡",
    "risk": "升杯限指定款；非会员先领会员再下单；活动随时变",
    "trigger": {
      "weekday": [
        3
      ]
    },
    "save": {
      "type": "range",
      "min": 3,
      "max": 6
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "茶百道",
      "升杯",
      "会员日"
    ],
    "certainty": "varies",
    "source": "茶百道小程序",
    "when": "weekday"
  },
  {
    "id": "drinks.chabaidao.88",
    "cat": "drinks",
    "title": "茶百道周四 88 折",
    "action": "周四茶百道会员日 88 折，一杯省两三块；顺手把想喝的囤成券，别为折扣硬喝两杯。",
    "who": "茶百道常客",
    "gate": "需周四；部分需会员",
    "scene": "茶饮咖啡",
    "risk": "88 折常限指定款；和升杯活动不同天，别搞混",
    "trigger": {
      "weekday": [
        4
      ]
    },
    "save": {
      "type": "ratio",
      "rate": 0.12,
      "cap": 10
    },
    "priceRef": {
      "before": 18
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "茶百道",
      "88折",
      "会员日"
    ],
    "certainty": "varies",
    "source": "茶百道小程序",
    "when": "weekday"
  },
  {
    "id": "drinks.guming.20",
    "cat": "drinks",
    "title": "古茗每月 20 号会员日",
    "action": "每月 20 号古茗会员日，常发买一送一 / 第二杯半价，找人拼一杯就把单价打下来。",
    "who": "古茗常客",
    "gate": "需每月 20 号；部分需会员",
    "scene": "茶饮咖啡",
    "risk": "券有指定款和时段；一个人喝两杯等于没省；先领券再点",
    "trigger": {
      "monthday": [
        20
      ]
    },
    "save": {
      "type": "range",
      "min": 5,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "古茗",
      "会员日",
      "20号"
    ],
    "certainty": "varies",
    "source": "古茗小程序",
    "freq": "monthly"
  },
  {
    "id": "drinks.yihetang.18",
    "cat": "drinks",
    "title": "益禾堂每月 18 号半价 / 买一送一",
    "action": "每月 18 号益禾堂常做半价或买一送一，两人拼单最香；一个人就只点参与款，别硬凑。",
    "who": "益禾堂常客",
    "gate": "需每月 18 号；部分需会员",
    "scene": "茶饮咖啡",
    "risk": "活动款常指定；和德克士 18 号同一天，可顺路一起薅",
    "trigger": {
      "monthday": [
        18
      ]
    },
    "save": {
      "type": "range",
      "min": 5,
      "max": 18
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "益禾堂",
      "18号",
      "半价",
      "买一送一"
    ],
    "certainty": "varies",
    "source": "益禾堂小程序",
    "freq": "monthly"
  },
  {
    "id": "snacks.zhaoyiming.41",
    "cat": "snacks",
    "title": "赵一鸣逢 8 号 88 折",
    "action": "每月 8 / 18 / 28 号会员日 88 折，散称零食平时就比超市便宜三成，凑到会员日再买。",
    "who": "常买散称零食的人",
    "gate": "需会员日；部分门店需会员身份",
    "scene": "零食夜宵",
    "risk": "88 折常有金额门槛；散称容易买多，先列清单",
    "trigger": {
      "monthday": [
        8,
        18,
        28
      ]
    },
    "save": {
      "type": "ratio",
      "rate": 0.12,
      "cap": 20
    },
    "priceRef": {
      "before": 50
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "赵一鸣",
      "零食",
      "88折",
      "会员日"
    ],
    "certainty": "varies",
    "source": "赵一鸣门店会员日（按 50 元客单估算）",
    "freq": "monthly"
  },
  {
    "id": "snacks.hotmax.42",
    "cat": "snacks",
    "title": "好特卖买临期大牌",
    "action": "去好特卖买临期大牌饮料和进口薯片，价格常是正价的三到五折。",
    "who": "不介意临期的人",
    "gate": "需有门店",
    "scene": "零食夜宵",
    "risk": "看清剩余保质期；临期食品别囤，吃不完就是浪费",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "好特卖",
      "临期",
      "零食"
    ],
    "certainty": "varies",
    "source": "好特卖门店"
  },
  {
    "id": "snacks.nightmarket.43",
    "cat": "snacks",
    "title": "夜市 9 点后收摊前买",
    "action": "晚上 9 点后去大学城夜市，烤冷面、炸串收摊前会打折或多给量。",
    "who": "晚上还醒着的人",
    "gate": "需 21:00 后",
    "scene": "零食夜宵",
    "risk": "剩的品类少；收摊前的东西可能放久了，看油温和新鲜度",
    "trigger": {
      "timeRange": [
        "21:00",
        "23:00"
      ]
    },
    "save": {
      "type": "range",
      "min": 3,
      "max": 8
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "夜市",
      "烤冷面",
      "炸串"
    ],
    "certainty": "varies",
    "source": "夜市摊主惯例",
    "when": "night"
  },
  {
    "id": "snacks.zhengxin.44",
    "cat": "snacks",
    "title": "正新鸡排只买团购券",
    "action": "抖音或美团搜团购券再核销，绝不原价扫码；一张券通常省 5 元以上。",
    "who": "路过想吃一块的人",
    "gate": "需提前买券",
    "scene": "零食夜宵",
    "risk": "券有核销时段；部分门店不参加",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 10
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "正新鸡排",
      "鸡排",
      "团购"
    ],
    "certainty": "varies",
    "source": "抖音 / 美团团购"
  },
  {
    "id": "snacks.juewei.45",
    "cat": "snacks",
    "title": "绝味：凑满减或买素菜拼盘",
    "action": "外卖平台满减时凑单买，平时就点素菜拼盘解馋，鸭脖按根数着买。",
    "who": "爱吃卤味的人",
    "gate": "需满减档期",
    "scene": "零食夜宵",
    "risk": "卤味单价高，很容易一顿吃掉 30+；为凑满减多买等于没省",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 12
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "绝味",
      "鸭脖",
      "卤味"
    ],
    "certainty": "varies",
    "source": "外卖平台满减",
    "when": "night"
  },
  {
    "id": "snacks.markdown.46",
    "cat": "snacks",
    "title": "超市晚上 8 点黄标",
    "action": "20:00 后去大润发 / 沃尔玛，熟食区贴黄标半价，当晚饭直接省一半。",
    "who": "晚饭没着落的人",
    "gate": "需 20:00 后；黄标货有限",
    "scene": "零食夜宵",
    "risk": "熟食当天做的，务必看清时间；夏天别买放太久的凉菜",
    "trigger": {
      "timeRange": [
        "20:00",
        "22:00"
      ]
    },
    "save": {
      "type": "range",
      "min": 5,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "超市",
      "黄标",
      "熟食",
      "大润发",
      "沃尔玛"
    ],
    "certainty": "varies",
    "source": "商超晚市折扣惯例",
    "when": "night"
  },
  {
    "id": "snacks.bulk.47",
    "cat": "snacks",
    "title": "散装看清 250g 还是 500g",
    "action": "买散称零食先看标价单位，很多店按 250g 标价，看着便宜其实贵一倍。",
    "who": "常买散称的人",
    "gate": "无",
    "scene": "零食夜宵",
    "risk": "标价单位常写在小字里；结账前自己算一遍每 500g 多少钱",
    "trigger": null,
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "散装",
      "250g",
      "零食"
    ],
    "certainty": "stable",
    "source": "零售标价惯例"
  },
  {
    "id": "snacks.milk.48",
    "cat": "snacks",
    "title": "买临期 1-2 个月的纯牛奶",
    "action": "挑离保质期还有 1-2 个月的纯牛奶，价格常是原价一半，一周内喝得完就买。",
    "who": "每天喝奶、喝得快的人",
    "gate": "需能短期喝完",
    "scene": "零食夜宵",
    "risk": "喝不完就浪费；临期奶要冷链，夏天别囤",
    "trigger": null,
    "save": {
      "type": "ratio",
      "rate": 0.5,
      "cap": 30
    },
    "priceRef": {
      "before": 60
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "临期",
      "牛奶",
      "纯牛奶"
    ],
    "certainty": "varies",
    "source": "商超临期折扣（按 60 元/箱估算）"
  },
  {
    "id": "snacks.wholesale.49",
    "cat": "snacks",
    "title": "批发市场成箱买泡面火腿肠",
    "action": "去当地副食品批发市场，成箱买泡面、火腿肠，比超市便宜三成以上。",
    "who": "宿舍能囤货的人",
    "gate": "需有批发市场；一次买量",
    "scene": "零食夜宵",
    "risk": "一次压几百块现金；泡面别囤太多，吃腻了更浪费",
    "trigger": null,
    "save": {
      "type": "ratio",
      "rate": 0.3,
      "cap": 80
    },
    "priceRef": {
      "before": 200
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "批发",
      "泡面",
      "囤货"
    ],
    "certainty": "varies",
    "source": "副食品批发市场（按 200 元/次估算）",
    "freq": "monthly"
  },
  {
    "id": "snacks.luckinsnack.50",
    "cat": "snacks",
    "title": "瑞幸小食去闲鱼买券",
    "action": "配咖啡的烘焙小食不要在店里买，闲鱼搜券通常 3-5 元。",
    "who": "买咖啡时顺手加小食的人",
    "gate": "需闲鱼交易",
    "scene": "零食夜宵",
    "risk": "券有使用门店限制；为用券专门跑一趟不值",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 4,
      "max": 8
    },
    "priceRef": {},
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "瑞幸",
      "小食",
      "闲鱼",
      "券"
    ],
    "certainty": "varies",
    "source": "闲鱼二手券"
  },
  {
    "id": "snacks.haoxianglai.8",
    "cat": "snacks",
    "title": "好想来每月 8 号 88 折",
    "action": "每月 8 号好想来会员日全场 88 折，散称零食平时就比超市便宜，凑到 8 号再补货。",
    "who": "常买散称零食的人",
    "gate": "需每月 8 号；需会员",
    "scene": "零食夜宵",
    "risk": "88 折有金额门槛；散称容易买多，先列清单再进店",
    "trigger": {
      "monthday": [
        8
      ]
    },
    "save": {
      "type": "ratio",
      "rate": 0.12,
      "cap": 30
    },
    "priceRef": {
      "before": 50
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "好想来",
      "8号",
      "88折",
      "零食"
    ],
    "certainty": "varies",
    "source": "好想来会员日",
    "freq": "monthly"
  },
  {
    "id": "daily.runtai.51",
    "cat": "daily",
    "title": "校外润泰超市买洗护和纸巾",
    "action": "洗发水、纸巾这类重货去校外润泰买，比校内便宜，走一趟当散步。",
    "who": "一次买够两周用量的人",
    "gate": "需走得出校门",
    "scene": "日用商超",
    "risk": "搬回来累；重货别一次买太多，宿舍放不下",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 8,
      "max": 25
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "润泰",
      "超市",
      "洗发水",
      "纸巾"
    ],
    "certainty": "local",
    "source": "校外超市（以你学校周边为准）",
    "freq": "weekly"
  },
  {
    "id": "daily.zunte.52",
    "cat": "daily",
    "title": "校内尊特优选只买急用的",
    "action": "校内便利店只买今晚就要用的，不急的一律等拼多多百亿补贴。",
    "who": "所有住校生",
    "gate": "无",
    "scene": "日用商超",
    "risk": "校内溢价高，随手买容易多花；但半夜急用也只能认",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 10
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "尊特",
      "便利店",
      "校内"
    ],
    "certainty": "local",
    "source": "校内便利店",
    "freq": "emergency"
  },
  {
    "id": "daily.pdd.53",
    "cat": "daily",
    "title": "拼多多百亿补贴整箱买",
    "action": "整箱买水、纸巾、洗衣液，寄到菜鸟驿站，比超市便宜一半。",
    "who": "宿舍有地方堆的人",
    "gate": "需自提；有起送量",
    "scene": "日用商超",
    "risk": "整箱占地方；临期日化要看清生产日期；驿站超时会退回",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 40
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "拼多多",
      "百亿补贴",
      "整箱",
      "纸巾"
    ],
    "certainty": "varies",
    "source": "拼多多百亿补贴",
    "freq": "monthly"
  },
  {
    "id": "daily.1688.54",
    "cat": "daily",
    "title": "1688 宿舍拼单批发",
    "action": "垃圾袋、抽纸、文具去 1688 拼单，一间宿舍凑够起订量，单价能压到零售一半。",
    "who": "整间宿舍一起买的人",
    "gate": "需凑起订量；需一人统一下单",
    "scene": "日用商超",
    "risk": "1688 售后比零售麻烦；凑单要先收钱，不然容易扯皮",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 50
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "1688",
      "批发",
      "拼单",
      "宿舍"
    ],
    "certainty": "varies",
    "source": "1688 批发平台",
    "freq": "monthly"
  },
  {
    "id": "daily.xianyu.55",
    "cat": "daily",
    "title": "闲鱼搜「毕业出」收二手",
    "action": "毕业季在闲鱼搜「大学生毕业」，台灯、收纳盒、小家电基本白菜价。",
    "who": "不介意二手的住校生",
    "gate": "需面交或走平台担保",
    "scene": "日用商超",
    "risk": "电器要看通电演示；别先付定金；面交选人多的地方",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 20,
      "max": 80
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "闲鱼",
      "二手",
      "毕业",
      "台灯"
    ],
    "certainty": "varies",
    "source": "闲鱼二手（面交验货）",
    "freq": "seasonal"
  },
  {
    "id": "daily.print.56",
    "cat": "daily",
    "title": "宿舍楼下打印店 0.1 元/面",
    "action": "打印走宿舍楼下（17A / E2 / E3）的店，黑白 0.1 元/面还定时配送，绝不去校外。",
    "who": "要打课件和资料的人",
    "gate": "需在配送时间前下单",
    "scene": "日用商超",
    "risk": "高峰期排队；急件还是自己跑一趟更快",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 20
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "打印",
      "复印",
      "0.1"
    ],
    "certainty": "local",
    "source": "校内打印店（以你学校为准）"
  },
  {
    "id": "daily.miniso.57",
    "cat": "daily",
    "title": "名创优品只买 10 元小物",
    "action": "只买 10 元档的小物件，零食和饮料在这家溢价极高，一律不买。",
    "who": "爱逛但预算有限的人",
    "gate": "无",
    "scene": "日用商超",
    "risk": "逛店容易顺手多买；10 元区之外的东西性价比一般",
    "trigger": null,
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "名创优品",
      "10元",
      "小物"
    ],
    "certainty": "stable",
    "source": "零售定价观察"
  },
  {
    "id": "daily.walmart.58",
    "cat": "daily",
    "title": "沃尔玛大包装当几天口粮",
    "action": "买大包装烤鸡、麻薯这类，一次解决两三天饭，折算下来比外卖便宜很多。",
    "who": "宿舍有冰箱或能当天吃完的人",
    "gate": "需有沃尔玛",
    "scene": "日用商超",
    "risk": "没冰箱别买多，坏了更亏；烤鸡当顿吃可以，别连吃三天",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 30
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "沃尔玛",
      "烤鸡",
      "大包装"
    ],
    "certainty": "varies",
    "source": "沃尔玛门店",
    "freq": "weekly"
  },
  {
    "id": "daily.cosmetic.59",
    "cat": "daily",
    "title": "先试用，再去百补或免税买",
    "action": "在得物或丝芙兰试用确认色号，再去拼多多百亿补贴或免税渠道下单。",
    "who": "买护肤品化妆品的人",
    "gate": "需先线下试用",
    "scene": "日用商超",
    "risk": "百补也有假货投诉，认准官方旗舰；免税要出行记录",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 30,
      "max": 100
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "护肤",
      "化妆品",
      "得物",
      "免税"
    ],
    "certainty": "varies",
    "source": "线下试用 + 正规渠道比价"
  },
  {
    "id": "daily.clothes.60",
    "cat": "daily",
    "title": "衣服反季买 / 只逛红标区",
    "action": "不买当季新款：反季买，或只逛优衣库贴红标的打折区，也可以闲鱼收二手。",
    "who": "对款式不追新的人",
    "gate": "需能等一个季度",
    "scene": "日用商超",
    "risk": "反季买容易买错尺码，退换麻烦；红标款断码严重",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 50,
      "max": 200
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "衣服",
      "优衣库",
      "反季",
      "打折"
    ],
    "certainty": "varies",
    "source": "零售折扣季",
    "freq": "seasonal"
  },
  {
    "id": "daily.cosmetic.nearexp.102",
    "cat": "daily",
    "title": "临期大牌护肤品打 3 折",
    "action": "去好特卖找临期美妆，或淘宝搜「临期美妆」：没开封、没过期，效果一样，剩余半年足够用完一瓶。原价几百的大牌几十块拿下。",
    "who": "用大牌护肤品但预算有限的人",
    "gate": "需看清剩余保质期与批号",
    "scene": "日用商超",
    "risk": "临期不是过期，但要算好「剩余效期 ≥ 自己的使用周期」；膏体变色变味直接放弃；认准好特卖这类连锁临期店，杂店警惕假货",
    "trigger": null,
    "save": {
      "type": "ratio",
      "rate": 0.7,
      "cap": 150
    },
    "priceRef": {
      "before": 200
    },
    "billCats": [
      "购物"
    ],
    "keywords": [
      "临期",
      "美妆",
      "护肤品",
      "好特卖",
      "三折"
    ],
    "certainty": "varies",
    "source": "临期连锁店 / 电商临期专场（按 200 元正价估算）"
  },
  {
    "id": "daily.xianyu.proxy.105",
    "cat": "daily",
    "title": "闲鱼搜「代下单」再付钱",
    "action": "星巴克、瑞幸、肯德基、寄快递，别急着原价下单：先在闲鱼搜「瑞幸代下单」「快递代发」，卖家有内部渠道或大客户折扣，原价 30 的咖啡约 15 元。电影票代买详见娱乐类。",
    "who": "常买品牌连锁的人",
    "gate": "需闲鱼担保交易；需提供订单信息",
    "scene": "日用商超",
    "risk": "代下单要给卖家手机号或账号，有隐私风险；出单出错难售后；拒绝「先付全款再私下返差价」的骗局，只走平台担保",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "餐饮",
      "购物"
    ],
    "keywords": [
      "闲鱼",
      "代下单",
      "代买",
      "瑞幸",
      "星巴克",
      "肯德基"
    ],
    "certainty": "varies",
    "source": "闲鱼代下单服务"
  },
  {
    "id": "daily.express.code.107",
    "cat": "daily",
    "title": "寄快递找内部寄件码，别原价寄",
    "action": "寄快递别在公众号原价下单：去菜鸟驿站 / 校内代收点问「学生寄件群」或「内部寄件码」，省外件官方 12 元、内部码 6-8 元就能寄。",
    "who": "要寄行李、退换货的人",
    "gate": "需驿站提供内部码；需自送到驿站",
    "scene": "日用商超",
    "risk": "内部码包裹理赔仍走原平台，贵重物品别图便宜；寒暑假行李高峰提前几天寄；驿站说没有就没有，别硬求",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 4,
      "max": 8
    },
    "priceRef": {
      "before": 12
    },
    "billCats": [
      "购物",
      "其他"
    ],
    "keywords": [
      "快递",
      "寄件",
      "菜鸟驿站",
      "内部码",
      "学生寄件"
    ],
    "certainty": "local",
    "source": "菜鸟驿站 / 校内代收点（以你学校周边为准）",
    "freq": "seasonal"
  },
  {
    "id": "fun.video.61",
    "cat": "fun",
    "title": "视频会员买联合会员 / 拼家庭组",
    "action": "淘宝、拼多多搜「联合会员」，或和舍友拼家庭组，人均每月只要几块。",
    "who": "追剧的人",
    "gate": "需有人拼；需接受账号共享",
    "scene": "娱乐休闲",
    "risk": "共享账号有被踢下线风险；联合会员要看清是哪家",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 8,
      "max": 20
    },
    "priceRef": {},
    "billCats": [
      "娱乐"
    ],
    "keywords": [
      "视频会员",
      "爱奇艺",
      "腾讯视频",
      "联合会员"
    ],
    "certainty": "varies",
    "source": "电商联合会员 / 家庭组",
    "freq": "monthly"
  },
  {
    "id": "fun.music.62",
    "cat": "fun",
    "title": "音乐会员走学生认证",
    "action": "学生认证后会员半价，坚决不买原价黑胶 VIP。",
    "who": "在校生",
    "gate": "需学生认证",
    "scene": "娱乐休闲",
    "risk": "认证每年要复核；自动续费记得关",
    "trigger": null,
    "save": {
      "type": "ratio",
      "rate": 0.5,
      "cap": 10
    },
    "priceRef": {
      "before": 15
    },
    "billCats": [
      "娱乐"
    ],
    "keywords": [
      "音乐会员",
      "网易云",
      "黑胶",
      "学生认证"
    ],
    "certainty": "stable",
    "source": "平台学生优惠",
    "freq": "monthly"
  },
  {
    "id": "fun.cloud.63",
    "cat": "fun",
    "title": "网盘会员按天租下载卡",
    "action": "考研党不要包年，去闲鱼租按天或按月的下载卡，用完就退。",
    "who": "集中下载资料的人",
    "gate": "需闲鱼交易",
    "scene": "娱乐休闲",
    "risk": "租号有隐私与封号风险，别登自己的主账号；重要资料本地备份",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "娱乐"
    ],
    "keywords": [
      "网盘",
      "会员",
      "下载卡",
      "闲鱼"
    ],
    "certainty": "varies",
    "source": "闲鱼租号（有风险，自行判断）"
  },
  {
    "id": "fun.game.64",
    "cat": "fun",
    "title": "游戏只买夏促冬促",
    "action": "Steam 等平台只在大促买游戏，绝不原价买皮肤和点券。",
    "who": "打游戏的人",
    "gate": "需等大促",
    "scene": "娱乐休闲",
    "risk": "打折买的游戏大概率不玩，先看自己有没有时间；别被「史低」两字带走",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 20,
      "max": 100
    },
    "priceRef": {},
    "billCats": [
      "娱乐"
    ],
    "keywords": [
      "游戏",
      "Steam",
      "皮肤",
      "充值"
    ],
    "certainty": "varies",
    "source": "平台促销日历",
    "freq": "seasonal"
  },
  {
    "id": "fun.escape.65",
    "cat": "fun",
    "title": "剧本杀/KTV 只买团购套餐",
    "action": "只用美团或抖音团购，包间费和强制酒水一律拒绝。",
    "who": "周末聚会的人",
    "gate": "需提前团购",
    "scene": "娱乐休闲",
    "risk": "到店加价、强制最低消费常见，进门前问清；团购要看清使用时段",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 20,
      "max": 60
    },
    "priceRef": {},
    "billCats": [
      "社交"
    ],
    "keywords": [
      "剧本杀",
      "KTV",
      "团购"
    ],
    "certainty": "varies",
    "source": "美团 / 抖音团购",
    "when": "weekend"
  },
  {
    "id": "fun.gymfree.66",
    "cat": "fun",
    "title": "学校免费健身房",
    "action": "39 栋负一层 2 号、田径场看台下 3 号健身房全免费，先把自己的场地用起来。",
    "who": "住校生",
    "gate": "需学生身份；有开放时段",
    "scene": "娱乐休闲",
    "risk": "器械少、高峰要排队；开放时间以学校公告为准",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 200,
      "max": 600,
      "once": true,
      "onceLabel": "全年可省"
    },
    "priceRef": {},
    "billCats": [
      "娱乐"
    ],
    "keywords": [
      "健身房",
      "免费",
      "田径场"
    ],
    "certainty": "local",
    "source": "校内设施（以你学校为准）"
  },
  {
    "id": "fun.campus.67",
    "cat": "fun",
    "title": "校园讲座与周末电影",
    "action": "学校大礼堂周末有电影放映，社团活动也基本免费，先看校内再看校外。",
    "who": "想出去玩又不想花钱的人",
    "gate": "需关注校内通知",
    "scene": "娱乐休闲",
    "risk": "场次和片单看学校安排；热门场次要去早",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 15,
      "max": 45
    },
    "priceRef": {},
    "billCats": [
      "娱乐"
    ],
    "keywords": [
      "校园",
      "讲座",
      "电影",
      "社团"
    ],
    "certainty": "local",
    "source": "校内活动（以你学校为准）",
    "when": "weekend"
  },
  {
    "id": "fun.gymcard.68",
    "cat": "fun",
    "title": "健身卡不办年卡",
    "action": "坚决不办年卡，去闲鱼买别人转让的次卡，用几次买几次。",
    "who": "一年去不到 30 次的人",
    "gate": "需闲鱼交易",
    "scene": "娱乐休闲",
    "risk": "转让卡可能有实名限制；健身房跑路时次卡也会作废",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 200,
      "max": 600,
      "once": true,
      "onceLabel": "全年可省"
    },
    "priceRef": {},
    "billCats": [
      "娱乐"
    ],
    "keywords": [
      "健身卡",
      "年卡",
      "次卡",
      "闲鱼"
    ],
    "certainty": "varies",
    "source": "闲鱼转让（注意实名与跑路风险）"
  },
  {
    "id": "fun.movie.69",
    "cat": "fun",
    "title": "电影票先搜代买",
    "action": "买票前在淘宝搜「电影票代买」，每张通常便宜 5-10 元。",
    "who": "每月看一两场的人",
    "gate": "需提前一天买",
    "scene": "娱乐休闲",
    "risk": "代买要提供手机号，注意隐私；热门场次好座位被锁",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 10
    },
    "priceRef": {},
    "billCats": [
      "娱乐"
    ],
    "keywords": [
      "电影票",
      "代买",
      "淘宝"
    ],
    "certainty": "varies",
    "source": "淘宝代买（注意隐私）",
    "when": "weekend"
  },
  {
    "id": "fun.concert.70",
    "cat": "fun",
    "title": "抢不到原价票就不去",
    "action": "演唱会只买原价票，抢不到就不去，坚决不碰高溢价黄牛。",
    "who": "追星的人",
    "gate": "无",
    "scene": "娱乐休闲",
    "risk": "黄牛票有假票和无法实名入场的风险，损失往往上千",
    "trigger": null,
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "娱乐"
    ],
    "keywords": [
      "演唱会",
      "黄牛",
      "门票"
    ],
    "certainty": "stable",
    "source": "票务实名规则"
  },
  {
    "id": "fun.groupbuy.103",
    "cat": "fun",
    "title": "吃喝玩乐先搜团购券，再防缩水套餐",
    "action": "吃饭、游乐场、密室、KTV 这类消费，下单前先去美团 / 抖音搜一遍团购券——餐饮娱乐是团购补贴最狠的领域。买券前对着正价菜单看清套餐内容和份量，防「缩水版套餐」。",
    "who": "周末聚餐和出去玩的人",
    "gate": "需提前买券，到店核销",
    "scene": "娱乐休闲",
    "risk": "很多商家在团购平台挂「缩水版套餐」：肉变少、菜变差，折扣是虚的——逐项对比再买；核销时段与节假日加价规则看清；为用券点多买等于没省",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 40
    },
    "priceRef": {},
    "billCats": [
      "餐饮",
      "娱乐",
      "社交"
    ],
    "keywords": [
      "团购",
      "美团",
      "抖音",
      "套餐",
      "缩水套餐",
      "游乐场"
    ],
    "certainty": "varies",
    "source": "美团 / 抖音团购",
    "when": "weekend"
  },
  {
    "id": "fun.apphide.104",
    "cat": "fun",
    "title": "卸载 / 藏起购物 App，给冲动消费加门槛",
    "action": "卸载最常冲动打开的 1-2 个购物 App，剩下的收进手机最后一屏的文件夹里——想买必须「专门去找」。没有随手逛的入口，冲动当场少一大半；真需要的东西，专门打开买完就退。",
    "who": "睡前刷购物软件停不下来的人",
    "gate": "需忍住 3 天别重装",
    "scene": "娱乐休闲",
    "risk": "前 3 天手痒最难受，可以留一个下单入口应急；别为了「防自己」把所有支付方式都注销，影响正常生活",
    "trigger": null,
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物",
      "娱乐"
    ],
    "keywords": [
      "卸载",
      "购物App",
      "冲动消费",
      "决策疲劳"
    ],
    "certainty": "stable",
    "source": "长期习惯账（无单次金额）"
  },
  {
    "id": "fun.cartcool.105",
    "cat": "fun",
    "title": "想买的先放购物车晾 24 小时",
    "action": "想买的东西一律先加购物车、不结算，第二天再回来看：大部分东西过一夜就「没那么想要了」。还想要的再下单——这时它至少通过了「今天依然需要」这一关。大额（超 50 元）直接升级成 48 小时法则。",
    "who": "经常下完单就后悔的人",
    "gate": "需忍住不当场结算",
    "scene": "娱乐休闲",
    "risk": "别用「收藏夹」代替购物车——收藏没有结算动作，仪式感弱，拦不住手；倒计时商品别被「错过」带节奏，真优惠通常第二天还在",
    "trigger": null,
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物",
      "娱乐",
      "社交"
    ],
    "keywords": [
      "购物车",
      "冷静期",
      "24小时",
      "冲动消费"
    ],
    "certainty": "stable",
    "source": "长期习惯账（无单次金额）"
  },
  {
    "id": "transit.rail.71",
    "cat": "transit",
    "title": "学生票每年 4 次，先在 12306 核验",
    "action": "先在 12306 完成学生资质核验，寒暑假往返用学生票，每年 4 次。",
    "who": "异地读书的人",
    "gate": "需学生证 + 优惠区间核验",
    "scene": "出行交通",
    "risk": "次数用完就没有；区间填错会被拦；每年要重新核验一次",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 20,
      "max": 100
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "高铁",
      "火车",
      "学生票",
      "12306"
    ],
    "certainty": "stable",
    "source": "铁路 12306 学生票规则",
    "freq": "holiday"
  },
  {
    "id": "transit.taxi.72",
    "cat": "transit",
    "title": "打车用聚合平台 + 先领券",
    "action": "用高德聚合打车比单一平台便宜，下单前先领 5 折券，多平台比一次价。",
    "who": "偶尔打车的人",
    "gate": "需装聚合平台 App",
    "scene": "出行交通",
    "risk": "聚合平台售后要走原平台，扯皮麻烦；高峰期券不可用",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 10
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "打车",
      "高德",
      "滴滴",
      "优惠券"
    ],
    "certainty": "varies",
    "source": "高德聚合打车"
  },
  {
    "id": "transit.bike.73",
    "cat": "transit",
    "title": "共享单车买月卡",
    "action": "共享单车买月卡，10 元/月，比单次扫码省 80%。",
    "who": "每天骑车 2 次以上的人",
    "gate": "需月卡；限单车品牌",
    "scene": "出行交通",
    "risk": "只覆盖一个品牌，混着骑就不划算；月卡记得关自动续费",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 8,
      "max": 20
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "共享单车",
      "月卡",
      "单车"
    ],
    "certainty": "stable",
    "source": "共享单车月卡定价",
    "freq": "monthly"
  },
  {
    "id": "transit.shuttle.74",
    "cat": "transit",
    "title": "节假日辅助公交 5 元",
    "action": "节假日去地铁南海大学城站坐辅助公交，5 元/人，比打车省一大截。",
    "who": "节假日进城的人",
    "gate": "需节假日班次",
    "scene": "出行交通",
    "risk": "班次少、要等；末班车时间要提前看",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 8
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "公交",
      "地铁",
      "大学城"
    ],
    "certainty": "local",
    "source": "本地公交（以你所在城市为准）",
    "freq": "holiday"
  },
  {
    "id": "transit.flight.75",
    "cat": "transit",
    "title": "机票提前 1-2 个月盯",
    "action": "提前 1-2 个月关注学生机票，春秋、九元这类廉航常常更便宜。",
    "who": "寒暑假回家 / 出行的人",
    "gate": "需提前规划；廉航行李另收费",
    "scene": "出行交通",
    "risk": "廉航行李费可能抵消差价，算总价再买；退改签限制多",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 100,
      "max": 300
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "机票",
      "飞机",
      "廉航",
      "春秋"
    ],
    "certainty": "varies",
    "source": "航司学生票 / 廉航",
    "freq": "holiday"
  },
  {
    "id": "transit.metro.76",
    "cat": "transit",
    "title": "地铁用官方 App 或云闪付",
    "action": "用当地地铁 App 或云闪付乘车，常有「1 分钱乘地铁」「满 2 减 1」活动。",
    "who": "每周进城的人",
    "gate": "需开通对应支付方式",
    "scene": "出行交通",
    "risk": "活动有名额限制，抢不到按原价；别为几毛钱绑一堆支付",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 1,
      "max": 3
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "地铁",
      "云闪付",
      "乘车码"
    ],
    "certainty": "varies",
    "source": "地铁 App / 云闪付活动"
  },
  {
    "id": "transit.carpool.77",
    "cat": "transit",
    "title": "跨城走顺风车",
    "action": "跨城出行用哈啰或嘀嗒顺风车，不赶时间时常常比高铁还便宜。",
    "who": "不赶时间、行李不多的人",
    "gate": "需提前发布行程",
    "scene": "出行交通",
    "risk": "等匹配、可能绕路；夜间长途要注意安全，优先实名认证司机",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 20,
      "max": 80
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "顺风车",
      "哈啰",
      "嘀嗒"
    ],
    "certainty": "varies",
    "source": "顺风车平台",
    "freq": "holiday"
  },
  {
    "id": "transit.airport.78",
    "cat": "transit",
    "title": "去机场火车站拼车",
    "action": "在学校群里找人拼滴滴去机场或火车站，三四个人平摊，比一个人打车省一半以上。",
    "who": "寒暑假同行的同学",
    "gate": "需找同行人",
    "scene": "出行交通",
    "risk": "行李多会加价；出发时间要留足余量，别为了拼车误点",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 40
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "拼车",
      "机场",
      "火车站",
      "滴滴"
    ],
    "certainty": "varies",
    "source": "校内拼车群",
    "freq": "holiday"
  },
  {
    "id": "transit.hostel.79",
    "cat": "transit",
    "title": "穷游住青旅或洗浴中心",
    "action": "穷游首选青年旅舍，实在不行洗浴中心过夜，一晚上几十块。",
    "who": "背包出行的人",
    "gate": "需接受公共空间",
    "scene": "出行交通",
    "risk": "青旅要保管好贵重物品；洗浴中心过夜人多且杂，女生优先选正规青旅",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 50,
      "max": 150
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "青旅",
      "住宿",
      "酒店",
      "穷游"
    ],
    "certainty": "varies",
    "source": "青旅 / 洗浴中心定价",
    "freq": "holiday"
  },
  {
    "id": "transit.rentcar.80",
    "cat": "transit",
    "title": "假期租车几个人平摊",
    "action": "假期周边游用神州 / 一嗨的学生特惠，几个人平摊，比全程打车便宜。",
    "who": "有驾照、三四个人同行的人",
    "gate": "需驾照；需押金或信用免押",
    "scene": "出行交通",
    "risk": "剐蹭和油费要提前说清怎么分；新手别跑山路夜路",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 50,
      "max": 150
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "租车",
      "神州",
      "一嗨",
      "自驾"
    ],
    "certainty": "varies",
    "source": "租车平台学生特惠",
    "freq": "holiday"
  },
  {
    "id": "transit.pinche.104",
    "cat": "transit",
    "title": "市内打车选拼车 / 特惠快车",
    "action": "市内打车别直接叫普通快车：滴滴 / 高德先勾「拼车」或「特惠快车」，比普通快车便宜三到五成；同路同学在校园群顺路拼，摊下来更便宜。",
    "who": "不赶时间、偶尔打车的人",
    "gate": "需接受拼车可能绕路等人",
    "scene": "出行交通",
    "risk": "拼车绕路接人耗时，赶时间别拼；拼车失败会恢复原价，下单前看清计价；夜间与陌生人拼车注意安全",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 15
    },
    "priceRef": {},
    "billCats": [
      "交通"
    ],
    "keywords": [
      "拼车",
      "特惠快车",
      "滴滴",
      "高德",
      "打车"
    ],
    "certainty": "varies",
    "source": "滴滴 / 高德拼车产品"
  },
  {
    "id": "transit.nogrouptour.108",
    "cat": "transit",
    "title": "别跟低价购物团，特种兵穷游自己走",
    "action": "「XX 元 3 日游」的低价团靠带购物回血，大学生别跟：行程被购物点占满还没自由，没驾照也开不了房车。平替是学生票火车 / 高铁 + 青旅 + 自带干粮的特种兵式自由行，路线自己排。",
    "who": "假期想出去玩的人",
    "gate": "需提前做行程攻略",
    "scene": "出行交通",
    "risk": "低价团合同里藏购物店和自费项目，签约前逐条看；特种兵行程别排太满，夜间别赶路，安全第一",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 100,
      "max": 400,
      "once": true,
      "onceLabel": "单次出行可省"
    },
    "priceRef": {},
    "billCats": [
      "交通",
      "娱乐"
    ],
    "keywords": [
      "低价团",
      "购物团",
      "跟团游",
      "特种兵",
      "穷游"
    ],
    "certainty": "stable",
    "source": "旅游防坑常识 + 学生出行组合",
    "freq": "holiday"
  },
  {
    "id": "study.usedbook.81",
    "cat": "study",
    "title": "教材去闲鱼买学长的",
    "action": "考研、四六级教材在闲鱼买上一届的，通常还带笔记，价格三折起。",
    "who": "准备考试的人",
    "gate": "需闲鱼交易",
    "scene": "学习文具",
    "risk": "版本要对得上（改版年份不同内容不一样）；笔记太密反而影响自己看",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 20,
      "max": 60
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "教材",
      "二手",
      "考研",
      "四六级"
    ],
    "certainty": "varies",
    "source": "闲鱼二手书",
    "freq": "seasonal"
  },
  {
    "id": "study.print.82",
    "cat": "study",
    "title": "打印在校内 0.1 元/面",
    "action": "资料统一攒够一次打，校内黑白 0.1 元/面，量大还能配送。",
    "who": "经常打资料的人",
    "gate": "需攒量",
    "scene": "学习文具",
    "risk": "攒太多一次打容易出错，先打样张；彩色页单独算",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 20
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "打印",
      "资料",
      "0.1"
    ],
    "certainty": "local",
    "source": "校内打印店（以你学校为准）"
  },
  {
    "id": "study.driving.83",
    "cat": "study",
    "title": "驾校多对比 + 团报",
    "action": "对比学校周边三家驾校，找熟人团报；「低价包过」的一律不签。",
    "who": "准备考驾照的人",
    "gate": "需实地看场地",
    "scene": "学习文具",
    "risk": "低价班后期加收模拟费、补考费；合同要看退费条款",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 200,
      "max": 800,
      "once": true,
      "onceLabel": "一次性省"
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "驾校",
      "考驾照",
      "团报"
    ],
    "certainty": "varies",
    "source": "本地驾校（务必实地核实）",
    "freq": "seasonal"
  },
  {
    "id": "study.course.84",
    "cat": "study",
    "title": "不报高价线下课",
    "action": "B 站、慕课上找同方向的免费名师课，先学两周再决定要不要花钱。",
    "who": "想补课的人",
    "gate": "需自制力",
    "scene": "学习文具",
    "risk": "免费课没人为你答疑，卡住容易放弃；别囤课，学完一门再开下一门",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 200,
      "max": 2000,
      "once": true,
      "onceLabel": "一次性省"
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "网课",
      "培训",
      "B站",
      "慕课"
    ],
    "certainty": "varies",
    "source": "公开免费课程平台"
  },
  {
    "id": "study.stationery.85",
    "cat": "study",
    "title": "文具拼多多批发",
    "action": "笔芯、笔记本在拼多多按盒买，一学期能省几十块。",
    "who": "笔记多的人",
    "gate": "需按盒买",
    "scene": "学习文具",
    "risk": "便宜笔芯漏墨，先买一小盒试；别囤到毕业都用不完",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 30
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "文具",
      "笔芯",
      "笔记本"
    ],
    "certainty": "stable",
    "source": "拼多多批发",
    "freq": "seasonal"
  },
  {
    "id": "study.software.86",
    "cat": "study",
    "title": "正版软件先查教育优惠",
    "action": "微软、苹果等大厂有教育优惠甚至免费，买之前先去官网教育商店查一遍；Adobe、Matlab、Office 这类还可以去学校信息中心问免费激活码。",
    "who": "要买正版软件的学生",
    "gate": "需学籍 / 教育邮箱认证",
    "scene": "学习文具",
    "risk": "教育版有时不能商用；淘宝「教育邮箱」属于违规，别买",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 100,
      "max": 500
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "正版软件",
      "教育优惠",
      "微软",
      "苹果"
    ],
    "certainty": "stable",
    "source": "厂商教育商店"
  },
  {
    "id": "study.cnki.87",
    "cat": "study",
    "title": "知网用校园网下",
    "action": "校内用校园网或图书馆入口免费下载；离校后用学校 VPN 回校园网。",
    "who": "写论文的人",
    "gate": "需校园网 / VPN",
    "scene": "学习文具",
    "risk": "淘宝买知网账号有封号与法律风险，不建议；校外访问要先配好 VPN",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 30
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "知网",
      "文献",
      "论文",
      "校园网"
    ],
    "certainty": "stable",
    "source": "学校图书馆资源"
  },
  {
    "id": "study.signup.88",
    "cat": "study",
    "title": "考证报名别错过交费",
    "action": "把报名和交费日期写进日历，设两个提醒；错过一次就要等半年。",
    "who": "准备考证的人",
    "gate": "无",
    "scene": "学习文具",
    "risk": "报名成功不等于交费成功，一定看缴费状态；别拖到最后一天，系统会崩",
    "trigger": null,
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "考证",
      "报名",
      "交费"
    ],
    "certainty": "stable",
    "source": "考试院通知"
  },
  {
    "id": "study.checkdup.89",
    "cat": "study",
    "title": "查重先用学校免费次数",
    "action": "认准学校提供的免费查重次数，或淘宝大平台；不知名高价查重站一律不用。",
    "who": "写毕业论文的人",
    "gate": "需知道学校给的次数",
    "scene": "学习文具",
    "risk": "小平台会留档论文，有泄露风险；免费次数用完再考虑付费",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 50,
      "max": 200
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "查重",
      "论文",
      "降重"
    ],
    "certainty": "varies",
    "source": "学校图书馆 / 正规查重平台"
  },
  {
    "id": "study.ebook.90",
    "cat": "study",
    "title": "电子书先找免费源",
    "action": "先在鸠摩搜书这类免费站点找 PDF，找不到再考虑买。",
    "who": "看课外书和专业书的人",
    "gate": "需自己判断版权",
    "scene": "学习文具",
    "risk": "部分资源有版权风险，正规教材还是买；下载站广告多，注意别点错",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 20,
      "max": 60
    },
    "priceRef": {},
    "billCats": [
      "学习"
    ],
    "keywords": [
      "电子书",
      "PDF",
      "鸠摩搜书"
    ],
    "certainty": "varies",
    "source": "公开电子书站点（注意版权）"
  },
  {
    "id": "study.studentauth.101",
    "cat": "study",
    "title": "学生认证总法则：结账前先看能不能认证",
    "action": "支付宝 / 微信搜「学生认证」，把能认证的平台都认证一遍：视频 / 音乐 App 会员基本半价，滴滴、高德、同程旅行常送 5 折券甚至免单券，Apple 有教育优惠；海底捞 69 折详见快餐类。结账前先问一句：这个平台能学生认证吗？",
    "who": "所有在校生",
    "gate": "需学籍信息；部分平台每年复核",
    "scene": "学习文具",
    "risk": "认证走官方入口，别把学生证照片发给「代认证」商家；学生价限本人使用，别出借账号；认证后记得关自动续费",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 5,
      "max": 30
    },
    "priceRef": {},
    "billCats": [
      "购物",
      "娱乐",
      "交通",
      "学习"
    ],
    "keywords": [
      "学生认证",
      "学生优惠",
      "半价",
      "教育优惠",
      "5折券"
    ],
    "certainty": "varies",
    "source": "各平台学生认证入口（力度以平台为准）"
  },
  {
    "id": "promo.618.91",
    "cat": "promo",
    "title": "618：囤日用品",
    "action": "6 月中下旬是全年低价之一，把洗发水、纸巾、洗衣液一次囤够半年。",
    "who": "有储物空间的人",
    "gate": "需提前加购；需蹲预售",
    "scene": "网购电商",
    "risk": "为凑满减多买是常态；囤太多用不完等于涨价",
    "trigger": {
      "window": [
        {
          "from": "06-01",
          "to": "06-20"
        }
      ]
    },
    "save": {
      "type": "range",
      "min": 20,
      "max": 80,
      "once": true,
      "onceLabel": "大促可省"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "618",
      "囤货",
      "日用品"
    ],
    "certainty": "varies",
    "source": "电商大促日历",
    "freq": "seasonal"
  },
  {
    "id": "promo.1111.92",
    "cat": "promo",
    "title": "双 11：大件数码",
    "action": "全年最大促销，买手机、耳机这类大件等到 11 月 11 日，提前 20 天加购比价。",
    "who": "要换数码的人",
    "gate": "需提前加购；需看历史价",
    "scene": "网购电商",
    "risk": "先涨后降常见，用慢慢买查历史价；预售定金不退",
    "trigger": {
      "window": [
        {
          "from": "10-20",
          "to": "11-11"
        }
      ]
    },
    "save": {
      "type": "range",
      "min": 100,
      "max": 500,
      "once": true,
      "onceLabel": "大促可省"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "双11",
      "数码",
      "手机",
      "耳机"
    ],
    "certainty": "varies",
    "source": "电商大促日历",
    "freq": "seasonal"
  },
  {
    "id": "promo.1212.93",
    "cat": "promo",
    "title": "双 12：补充采购",
    "action": "12 月 12 日做补充采购和清仓捡漏，双 11 漏买的这时候补。",
    "who": "双 11 没买齐的人",
    "gate": "无",
    "scene": "网购电商",
    "risk": "力度普遍小于双 11；清仓款断码严重",
    "trigger": {
      "mmdd": [
        "12-12"
      ]
    },
    "save": {
      "type": "range",
      "min": 10,
      "max": 50,
      "once": true,
      "onceLabel": "大促可省"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "双12",
      "清仓",
      "补货"
    ],
    "certainty": "varies",
    "source": "电商大促日历",
    "freq": "seasonal"
  },
  {
    "id": "promo.school.94",
    "cat": "promo",
    "title": "开学季：文具床品电子配件",
    "action": "8 月底和 2 月底开学季，文具、床品、电子配件有专门折扣，别在开学第一周买。",
    "who": "新生和换季要添东西的人",
    "gate": "需在开学前后 2 周内",
    "scene": "网购电商",
    "risk": "开学第一周最贵，越晚越便宜；床品尺寸要先量宿舍床",
    "trigger": {
      "window": [
        {
          "from": "08-20",
          "to": "09-10"
        },
        {
          "from": "02-15",
          "to": "03-05"
        }
      ]
    },
    "save": {
      "type": "range",
      "min": 30,
      "max": 100,
      "once": true,
      "onceLabel": "大促可省"
    },
    "priceRef": {},
    "billCats": [
      "购物",
      "学习"
    ],
    "keywords": [
      "开学季",
      "文具",
      "床品"
    ],
    "certainty": "varies",
    "source": "电商开学季活动",
    "freq": "seasonal"
  },
  {
    "id": "promo.jd.95",
    "cat": "promo",
    "title": "京东百亿补贴买数码",
    "action": "手机、耳机这类数码去京东百亿补贴，正品且便宜，售后走官方。",
    "who": "买数码的人",
    "gate": "需认准「百亿补贴」标",
    "scene": "网购电商",
    "risk": "补贴款常是特定配置；第三方店铺要看清是否自营",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 50,
      "max": 300
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "京东",
      "百亿补贴",
      "数码"
    ],
    "certainty": "varies",
    "source": "京东百亿补贴"
  },
  {
    "id": "promo.taobao.96",
    "cat": "promo",
    "title": "淘宝百亿补贴买零食日用",
    "action": "零食、日用品走淘宝百亿补贴，单件包邮门槛低，适合零散买。",
    "who": "零散买小件的人",
    "gate": "需认准补贴入口",
    "scene": "网购电商",
    "risk": "补贴价经常变，下单前再看一眼；凑单别硬凑",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 40
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "淘宝",
      "百亿补贴",
      "零食"
    ],
    "certainty": "varies",
    "source": "淘宝百亿补贴"
  },
  {
    "id": "promo.pdd.97",
    "cat": "promo",
    "title": "拼多多百亿补贴买生鲜整箱水",
    "action": "生鲜、整箱水走拼多多百亿补贴，寄到驿站自提，比超市便宜一半。",
    "who": "囤水和水果的人",
    "gate": "需自提",
    "scene": "网购电商",
    "risk": "生鲜售后看运气，坏果要及时拍照；重货自提要带小车",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 50
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "拼多多",
      "百亿补贴",
      "生鲜",
      "整箱"
    ],
    "certainty": "varies",
    "source": "拼多多百亿补贴"
  },
  {
    "id": "promo.vip.98",
    "cat": "promo",
    "title": "唯品会大牌日买衣服鞋",
    "action": "衣服鞋子等唯品会大牌日，折扣力度比平时大，先看历史价再买。",
    "who": "要买牌子衣服的人",
    "gate": "需等大牌日",
    "scene": "网购电商",
    "risk": "断码严重，热门尺码先没；退换要自己出运费",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 50,
      "max": 200
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "唯品会",
      "大牌日",
      "衣服",
      "鞋"
    ],
    "certainty": "varies",
    "source": "唯品会活动",
    "freq": "seasonal"
  },
  {
    "id": "promo.eight.99",
    "cat": "promo",
    "title": "逢 8 会员日",
    "action": "每月 8 / 18 / 28 号，大润发、赵一鸣这类超市和零食店都有专属折扣，攒到这天买。",
    "who": "月度集中采购的人",
    "gate": "需会员日；部分需会员身份",
    "scene": "网购电商",
    "risk": "折扣多有金额门槛；别为了 88 折买一堆用不上的",
    "trigger": {
      "monthday": [
        8,
        18,
        28
      ]
    },
    "save": {
      "type": "ratio",
      "rate": 0.12,
      "cap": 30
    },
    "priceRef": {
      "before": 150
    },
    "billCats": [
      "购物"
    ],
    "keywords": [
      "会员日",
      "88折",
      "逢8"
    ],
    "certainty": "varies",
    "source": "商超会员日（按 150 元客单估算）",
    "freq": "monthly"
  },
  {
    "id": "promo.unionpay.100",
    "cat": "promo",
    "title": "云闪付校企活动满 10 减 5",
    "action": "学校推广的信用卡绑定云闪付，常有「满 10 减 5」，吃饭充值前先看一眼。",
    "who": "愿意办一张卡的人",
    "gate": "需绑卡；有名额限制",
    "scene": "网购电商",
    "risk": "办信用卡要看清年费和征信影响，别为几块钱的活动办一堆卡",
    "trigger": null,
    "save": {
      "type": "fixed",
      "amount": 5
    },
    "priceRef": {},
    "billCats": [
      "餐饮",
      "购物"
    ],
    "keywords": [
      "云闪付",
      "满10减5",
      "信用卡"
    ],
    "certainty": "varies",
    "source": "云闪付校企活动"
  },
  {
    "id": "promo.manjian.106",
    "cat": "promo",
    "title": "满减凑单反套路：刚需凑，凑完退",
    "action": "满 300 减 50 是让你多花钱的陷阱：差一点凑单就买纸巾、洗衣液等刚需必需品，坚决不买「可能有用」的垃圾；凑单件不想留就等发货后再退——发货后退只退凑单件，满减依然生效（外卖满减凑单详见简餐外卖类）。",
    "who": "大促忍不住凑单的人",
    "gate": "需平台支持发货后退货",
    "scene": "网购电商",
    "risk": "发货前退货会整单退、满减作废，务必等发货后再退；频繁退货可能被平台限权；凑单件选 7 天无理由可退的，生鲜定制类别凑",
    "trigger": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 50
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "满减",
      "凑单",
      "反凑单",
      "退货",
      "套路"
    ],
    "certainty": "varies",
    "source": "电商满减与退货规则",
    "freq": "seasonal"
  },
  {
    "id": "gu.glossary.101",
    "cat": "gu",
    "title": "谷圈黑话速查（看不懂交易帖先查这个）",
    "action": "在「省钱图谱 → 吃谷避坑」里点开黑话速查，搜关键词就能看解释 + 避坑。先记高频词：吧唧=徽章、立牌=站立角色牌、流麻=流沙麻将、海景谷=稀有限定、捆=冷门谷绑热门一起卖、肾=付钱、跑单=付了钱团长消失。",
    "who": "刚入坑看不懂交易帖的人",
    "gate": "无门槛，随时查",
    "scene": "通用",
    "risk": "别凭感觉拍板；被「捆」的冷门谷很可能砸手里卖不掉，能单买别被捆。",
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "谷圈黑话",
      "吧唧",
      "立牌",
      "流麻",
      "海景谷",
      "捆",
      "肾",
      "跑单",
      "黑话速查"
    ],
    "certainty": "stable",
    "source": "谷圈通用黑话"
  },
  {
    "id": "gu.channel.102",
    "cat": "gu",
    "title": "买谷渠道分级：闭眼入 / 谨慎 / 别碰",
    "action": "🟢闭眼入：官方旗舰店、授权线下谷店、漫展官方摊位（有授权方/厂商/中文标识，可要求看授权书）。🟡谨慎：闲鱼只走平台担保、老牌代购店、有实绩拼团（查评价、要实物图+对光视频、团长≥3次成功开团）。🔴别碰：微信/QQ私转、无监管拼团小程序、评论区留联系方式的代购（90%诈骗；低于市价30%的海景谷必假）。标「祖国版/工作室出品/尾单/散货」一律按盗版。",
    "who": "准备买谷的人",
    "gate": "下单前先对一遍渠道等级",
    "scene": "通用",
    "risk": "任何「未成年不能闲鱼所以私转」的团长直接拉黑；盗版不只质量差，还可能侵权且无售后。",
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "正版",
      "盗版",
      "祖国版",
      "官方旗舰店",
      "闲鱼担保",
      "代购",
      "渠道分级"
    ],
    "certainty": "stable",
    "source": "消协/监管口径 + 平台规则"
  },
  {
    "id": "gu.group.103",
    "cat": "gu",
    "title": "跟团前必查 5 项（拼团防跑路清单）",
    "action": "跟团前逐项打勾：①团长有≥3次成功开团记录（超话/小红书可查）②支持平台担保交易（闲鱼链接），不接受微信/支付宝私转 ③公开购买凭证、物流、费用明细 ④提前说明发货时间、捆物规则、退款政策 ⑤团规模≤50人、预售期≤6个月。五项全过再跟。",
    "who": "想跟团拼谷的人",
    "gate": "跟团前过一遍",
    "scene": "通用",
    "risk": "任何说「未成年不能用闲鱼所以私转」的团长直接拉黑——这是跑路高发话术。",
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "拼团",
      "跟团",
      "团长",
      "跑路",
      "平台担保",
      "预售"
    ],
    "certainty": "stable",
    "source": "谷圈拼团防坑共识"
  },
  {
    "id": "gu.gacha.104",
    "cat": "gu",
    "title": "盲盒/抽赏前先过 3 问（冲动消费重灾区）",
    "action": "抽前自检：①这个角色的热/温/冷你查了吗（热谷加价、冷谷减价，盲抽前先看闲鱼均价）②隐藏款概率你看到了吗？商家没公示概率就直接关掉（消协规定盲盒概率必须公示，8岁以下禁售，8-18岁需监护人同意）③抽到不想要的款，你愿意花多少精力出二手？三问有两问答不上→先别抽，去闲鱼直接收确认款。",
    "who": "想抽盲盒/抽赏的人",
    "gate": "手痒想抽前",
    "scene": "通用",
    "risk": "盲抽的「可能抽到稀有」是多巴胺陷阱，算下来往往比直接收确认款贵。",
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "盲盒",
      "抽赏",
      "抽盒",
      "隐藏款",
      "概率公示",
      "盲抽"
    ],
    "certainty": "stable",
    "source": "消协盲盒指引 + 闲鱼比价"
  },
  {
    "id": "gu.budget.105",
    "cat": "gu",
    "title": "吃谷别「吃土也要买」：设专项额度隔离",
    "action": "每月从生活费划固定额（如50元）进「吃谷罐」，买谷只从罐里出，花完就停；想买但超预算的先丢心愿单晾48小时；月末没花完的吃谷钱可转回主预算或继续存。物理隔离额度是防超支最稳的办法（广州市消协也建议先确认是否在零花钱预算内）。",
    "who": "容易为谷超支的人",
    "gate": "月初设一次",
    "scene": "通用",
    "risk": "谷圈最容易出现「这个月吃土也要买」，先把额度锁死再谈喜欢。",
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "吃谷预算",
      "吃谷罐",
      "专项额度",
      "吃土",
      "隔离额度"
    ],
    "certainty": "stable",
    "source": "广州市消协零花钱预算建议"
  },
  {
    "id": "gu.qa.auth.106",
    "cat": "gu",
    "title": "【问答】怎么判断正版谷子？",
    "action": "一句话：有授权方/厂商/中文标识、能出示授权书的才放心；标「祖国版/工作室出品/尾单/散货」一律按盗版。细节：官方旗舰店与授权谷店最稳，闲鱼收二手也要让卖家发实物图+对光视频看印刷与镭射。",
    "who": "怕买到盗版的人",
    "gate": "下单前",
    "scene": "通用",
    "risk": "低价「海景谷」90%是假，别贪。",
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "正版",
      "盗版",
      "祖国版",
      "怎么判断正版"
    ],
    "certainty": "stable",
    "source": "消协/监管口径"
  },
  {
    "id": "gu.qa.used.107",
    "cat": "gu",
    "title": "【问答】闲鱼收二手谷子注意什么？",
    "action": "一句话：只走平台担保、要实物图+对光视频、看卖家评价。细节：对比近期成交均价防虚高；确认无拆封痕迹/无氧化；「全新未拆」溢价高，能接受拆封更划算；先验货再确认收货。",
    "who": "想收二手谷的人",
    "gate": "拍下前",
    "scene": "通用",
    "risk": "脱离平台私转=送钱，任何理由都不行。",
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "闲鱼",
      "二手",
      "收谷",
      "闲置",
      "验货"
    ],
    "certainty": "stable",
    "source": "闲鱼交易规则 + 谷圈经验"
  },
  {
    "id": "gu.qa.hotcold.108",
    "cat": "gu",
    "title": "【问答】热谷冷谷怎么查？",
    "action": "一句话：盲抽/高价前先去闲鱼搜「角色名+谷」看近期成交均价。细节：热谷（烫门）普遍加价，冷谷（温/冷）常低于发行价；「海景谷」稀有限定价格虚高且假货多；先看均价再决定抽还是收，别凭情绪出手。",
    "who": "分不清热冷谷的人",
    "gate": "买前",
    "scene": "通用",
    "risk": "热谷溢价很多是泡沫，冷谷也可能突然翻红，别 all in。",
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "热谷",
      "冷谷",
      "海景谷",
      "烫门",
      "均价",
      "怎么查"
    ],
    "certainty": "stable",
    "source": "闲鱼比价 + 谷圈行情"
  },
  {
    "id": "gu.resale.109",
    "cat": "gu",
    "title": "卖了谷子=闲置回血，记得记收入",
    "action": "把不想要的谷卖掉叫「出谷/回血」，是正向现金流，别当丢脸。卖出后在记账里选「收入→其他/闲置回血」，金额填实际到手；回血的钱建议进吃谷罐或存钱罐，形成「买谷-回血」闭环。",
    "who": "有闲置谷想出手的人",
    "gate": "卖出后",
    "scene": "通用",
    "risk": "出谷也走平台担保，别私转；定价参考闲鱼近期成交。",
    "save": {
      "type": "none"
    },
    "priceRef": {},
    "billCats": [
      "购物"
    ],
    "keywords": [
      "出谷",
      "回血",
      "闲置",
      "卖谷",
      "记收入"
    ],
    "certainty": "stable",
    "source": "谷圈交易习惯"
  },
  {
    "id": "gu.phone.150",
    "cat": "gu",
    "scene": "通讯缴费",
    "title": "话费：签到积分兑 + 保号套餐",
    "action": "运营商 App 每天签到攒积分，月底兑话费券；长期保号用 8 元保号套餐，别给闲置副卡交月租。",
    "who": "每月自充话费的人",
    "gate": "需运营商 App 账号",
    "risk": "积分有过期时限，清零不补；保号套餐不含流量，别当主卡用",
    "trigger": null,
    "freq": "monthly",
    "save": {
      "type": "range",
      "min": 5,
      "max": 20
    },
    "priceRef": {},
    "billCats": [
      "其他"
    ],
    "keywords": [
      "话费",
      "充值",
      "运营商",
      "移动",
      "联通",
      "电信",
      "保号套餐"
    ],
    "certainty": "stable",
    "source": "运营商 App"
  },
  {
    "id": "gu.broadband.151",
    "cat": "gu",
    "scene": "宽带网络",
    "title": "宽带：融合套餐 + 老用户续约谈价",
    "action": "宽带绑手机号办融合套餐比单办便宜；到期别自动续，打电话说“要转网”往往给折扣或赠礼。",
    "who": "在家 / 租房用宽带的人",
    "gate": "需手机号在网",
    "risk": "合约期内提前解约要赔违约金；“免费提速”可能只是试用期",
    "trigger": null,
    "freq": "always",
    "save": {
      "type": "range",
      "min": 10,
      "max": 30
    },
    "priceRef": {},
    "billCats": [
      "其他"
    ],
    "keywords": [
      "宽带",
      "融合套餐",
      "续约",
      "运营商",
      "转网"
    ],
    "certainty": "varies",
    "source": "运营商客服"
  },
  {
    "id": "gu.health.152",
    "cat": "gu",
    "scene": "健康体检",
    "title": "体检：入学 / 入职套餐 + 团购",
    "action": "学校或单位年度体检别错过；自费选公立医院团购或美年 / 瑞慈套餐，比门诊单项加起来便宜。",
    "who": "要自费体检的人",
    "gate": "需提前预约",
    "risk": "加项推销未必必要；看清套餐含不含关键项（肝功 / 甲状腺）",
    "trigger": null,
    "freq": "always",
    "save": {
      "type": "range",
      "min": 50,
      "max": 200
    },
    "priceRef": {},
    "billCats": [
      "医疗"
    ],
    "keywords": [
      "体检",
      "入职体检",
      "团购",
      "美年",
      "瑞慈",
      "公立医院"
    ],
    "certainty": "stable",
    "source": "公立医院 / 美团"
  },
  {
    "id": "gu.rent.153",
    "cat": "gu",
    "scene": "租房生活",
    "title": "租房：年付谈折扣 + 避开中介费",
    "action": "年付通常比月付省 1-2 个月租金；直租（小区群 / 闲鱼）避开中介费；签约前查水电燃气是否民用价。",
    "who": "在外租房的学生 / 打工人",
    "gate": "需签合同",
    "risk": "押一付三资金占用大；二房东跑路风险，务必核验房产证",
    "trigger": null,
    "freq": "always",
    "save": {
      "type": "range",
      "min": 500,
      "max": 2000
    },
    "priceRef": {},
    "billCats": [
      "居住"
    ],
    "keywords": [
      "租房",
      "年付",
      "中介费",
      "直租",
      "押一付三",
      "二手房东"
    ],
    "certainty": "local",
    "source": "租房平台 / 闲鱼"
  },
  {
    "id": "gu.pet.154",
    "cat": "gu",
    "scene": "养宠",
    "title": "养宠：驱虫疫苗团购 + 刚需囤货",
    "action": "驱虫药、猫砂在电商大促囤货；疫苗问清是否含在套餐里；别冲动买智能设备，先算真实使用率。",
    "who": "养猫狗的人",
    "gate": "需养宠物",
    "risk": "宠物医院项目溢价高，先问价；冻干 / 零食非必需，按需买",
    "trigger": null,
    "freq": "always",
    "save": {
      "type": "range",
      "min": 30,
      "max": 150
    },
    "priceRef": {},
    "billCats": [
      "其他"
    ],
    "keywords": [
      "宠物",
      "猫砂",
      "驱虫",
      "疫苗",
      "养猫",
      "养狗"
    ],
    "certainty": "stable",
    "source": "电商 / 宠物医院"
  },
  {
    "id": "fun.game.155",
    "cat": "fun",
    "scene": "游戏娱乐",
    "title": "游戏充值：首充 + 官方渠道",
    "action": "首充双倍只做一次；充值走官方 / 应用宝，别信低价代充（封号风险）；月卡比直充划算。",
    "who": "常充游戏的人",
    "gate": "需游戏账号",
    "risk": "代充可能是黑卡，封号不退款；限定礼包大多是沉没成本",
    "trigger": null,
    "freq": "always",
    "save": {
      "type": "range",
      "min": 10,
      "max": 60
    },
    "priceRef": {},
    "billCats": [
      "娱乐"
    ],
    "keywords": [
      "游戏",
      "充值",
      "首充",
      "月卡",
      "代充",
      "皮肤"
    ],
    "certainty": "stable",
    "source": "游戏官方"
  },
  {
    "id": "daily.haircut.157",
    "cat": "daily",
    "scene": "个人护理",
    "title": "理发：剪发次卡 + 避开推销",
    "action": "社区理发店办次卡比单次便宜；连锁用团购剪发券；烫染前问清总价，别被中途加项。",
    "who": "定期理发的人",
    "gate": "需到店",
    "risk": "办卡后门店跑路；“总监”加价多为话术",
    "trigger": null,
    "freq": "monthly",
    "save": {
      "type": "range",
      "min": 10,
      "max": 40
    },
    "priceRef": {},
    "billCats": [
      "其他"
    ],
    "keywords": [
      "理发",
      "剪发",
      "团购",
      "办卡",
      "烫染",
      "社区理发"
    ],
    "certainty": "local",
    "source": "美团 / 门店"
  },
  {
    "id": "gu.insurance.158",
    "cat": "gu",
    "scene": "通用",
    "title": "学生医保别漏缴，意外险几十块一年",
    "action": "学校统一组织的城乡居民医保一年一缴，按学校通知时间在班级渠道缴费，漏缴后看病全额自费；手机摔碎、运动扭伤这类意外，可再配一份学生意外险（几十元/年），投保前看清免赔额和报销比例。",
    "who": "所有在校学生（医保）/ 经常运动或手滑的人（意外险）",
    "gate": "按学校统一通知时间缴费",
    "risk": "医保生效有等待期，漏缴后补缴不能立即报销；意外险只保意外不保生病，两者不能互相替代",
    "trigger": null,
    "freq": "seasonal",
    "save": {
      "type": "range",
      "min": 200,
      "max": 1000
    },
    "priceRef": {
      "text": "城乡居民医保学生档各地约 200-400 元/年，学生意外险约 50-100 元/年"
    },
    "billCats": [
      "医疗"
    ],
    "keywords": [
      "医保",
      "保险",
      "意外险",
      "看病",
      "报销",
      "生病",
      "缴费",
      "入学"
    ],
    "certainty": "stable",
    "source": "城乡居民基本医疗保险政策（通用）"
  },
  {
    "id": "gu.sidejob.159",
    "cat": "gu",
    "scene": "通用",
    "title": "兼职搞钱走正规渠道，押金会费都是坑",
    "action": "优先校内勤工俭学岗（图书馆/行政助理，按学校公示时薪）、正规家教平台或熟人介绍；任何先交押金、会费、培训费才给活的兼职直接拉黑；刷单兼职 100% 是骗局。",
    "who": "想开源的在校学生",
    "gate": "不影响学业，每周建议 ≤10 小时",
    "risk": "刷单被骗的案例最多；校外中介押金基本要不回；兼职收入超过起征点要交税，别信「帮走账」",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 300,
      "max": 1500
    },
    "priceRef": {
      "text": "校内勤工俭学各地时薪约 12-20 元，家教约 50-150 元/小时"
    },
    "billCats": [
      "其他"
    ],
    "keywords": [
      "兼职",
      "搞钱",
      "赚钱",
      "副业",
      "家教",
      "勤工俭学",
      "缺钱",
      "开源",
      "刷单"
    ],
    "certainty": "stable",
    "source": "教育部勤工俭学管理办法（通用）"
  },
  {
    "id": "gu.broke.160",
    "cat": "gu",
    "scene": "通用",
    "title": "月底没钱救急三步：翻闲置 → 找活 → 绝不碰贷",
    "action": "第一步翻闲置回血：闲鱼挂掉吃灰的教材、小家电、衣服；第二步找校内勤工俭学或周末家教补窟窿；第三步记账砍掉下周非必要开销。任何情况下都不碰分期、白条、校园贷——利息滚起来远超窟窿本身。",
    "who": "月底吃土 / 花超了的人",
    "gate": "窟窿在几百元量级；更大的缺口先找家里或辅导员，别自己扛",
    "risk": "分期和无息宣传的小额贷普遍有隐藏服务费；以贷养贷只会越滚越大，还可能影响征信",
    "trigger": null,
    "freq": "monthly",
    "save": {
      "type": "range",
      "min": 100,
      "max": 800
    },
    "priceRef": {},
    "billCats": [
      "其他"
    ],
    "keywords": [
      "没钱",
      "缺钱",
      "月底",
      "吃土",
      "救急",
      "分期",
      "校园贷",
      "白条",
      "撑到"
    ],
    "certainty": "stable",
    "source": "通用理财常识 + 校园贷风险提示"
  },
  {
    "id": "gu.data.161",
    "cat": "gu",
    "scene": "通讯缴费",
    "title": "流量不够用：先查校园卡套餐，再比流量卡",
    "action": "先查自己校园卡套餐里藏的校园区域流量（很多学校有校内基站定向流量，白白浪费）；不够再比运营商的长期流量卡（19-29 元/百 G 档），办卡认准可查证的一级代理商和「长期套餐」字样，警惕「9 元百 G」宣传价。",
    "who": "流量月月超的人",
    "gate": "已有主卡能收验证码；不轻易注销老号（绑了太多东西）",
    "risk": "「9 元百 G」多为首充优惠价，次月恢复原价；物联卡无客服、跑路率高；合约期内注销有违约金",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 40
    },
    "priceRef": {
      "text": "长期流量卡主流 19-29 元/月（约 80-155G）；校园卡套餐含校内定向流量"
    },
    "billCats": [
      "其他"
    ],
    "keywords": [
      "流量",
      "流量卡",
      "校园卡",
      "电话卡",
      "套餐",
      "物联卡",
      "超流量"
    ],
    "certainty": "varies",
    "source": "运营商套餐页 + 工信部办卡提示"
  },
  {
    "id": "fun.aa.162",
    "cat": "fun",
    "scene": "同学聚餐",
    "title": "聚餐先定人均上限，点单按「人数 - 1」道菜",
    "action": "出发前在群里定人均上限（学生局 40-60 元常见），点单时菜数按人数减一，先点主食和两个硬菜，不够再加；饮料用店里的免费茶水，别默认点瓶装饮料。",
    "who": "一周被约两次饭、每次都超预算的人",
    "gate": "先在群里提人均，多数人其实也想省钱；有人坚持点贵的，单独加菜各付",
    "risk": "包间常有最低消费或服务费，订位前先问；最后一个人点单最容易点多",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 15,
      "max": 40
    },
    "priceRef": {
      "text": "学生聚餐人均常见 40-80 元，控制点单结构通常能压到 30-50 元"
    },
    "billCats": [
      "社交"
    ],
    "keywords": [
      "聚餐",
      "AA",
      "同学聚会",
      "请客",
      "包间",
      "最低消费",
      "下馆子"
    ],
    "certainty": "varies",
    "source": "餐饮点单惯例 + 学生聚餐经验"
  },
  {
    "id": "fun.gift.163",
    "cat": "fun",
    "scene": "生日礼物",
    "title": "生日礼物：宿舍统一价位 + 一起买一份",
    "action": "同宿舍或同班约定统一价位（如每人 30-50 元），合买一份实用大件（电煮锅、护手霜套装、好一点的耳机）比各送一份小礼物更划算也更体面；提前一个月在群里收钱。",
    "who": "一个月赶上三四场生日的人",
    "gate": "先问寿星缺什么，别买重复的；合买要有人统一收钱记账",
    "risk": "统一价位别定太高，会被当成攀比；收钱的人要留转账记录",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 20,
      "max": 80
    },
    "priceRef": {
      "text": "单份礼物常见 50-150 元，合买人均 30-50 元"
    },
    "billCats": [
      "社交"
    ],
    "keywords": [
      "生日",
      "礼物",
      "送礼",
      "宿舍",
      "合买",
      "同学过生日"
    ],
    "certainty": "varies",
    "source": "学生送礼惯例"
  },
  {
    "id": "fun.dorm.164",
    "cat": "fun",
    "scene": "宿舍公摊",
    "title": "宿舍公摊用共享账本记，别靠口头",
    "action": "水电、纸巾、洗衣液这类公摊，固定一个人先垫并在共享账本（或群公告）逐笔记，每月底统一结算一次；大额采购先在群里说一声再买。",
    "who": "总被室友忘记还钱的人",
    "gate": "第一次就立规矩最容易通过；小额也别嫌麻烦，攒到月底一起算",
    "risk": "口头 AA 最容易漏账和翻旧账；记账的人别自己垫太多，容易变相垫资",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 10,
      "max": 50
    },
    "priceRef": {
      "text": "宿舍公摊每月常见 50-150 元/人，漏账往往占一成以上"
    },
    "billCats": [
      "居住",
      "社交"
    ],
    "keywords": [
      "宿舍",
      "公摊",
      "水电费",
      "室友",
      "AA",
      "平摊",
      "记账"
    ],
    "certainty": "stable",
    "source": "合租/宿舍公摊通行做法"
  },
  {
    "id": "fun.club.165",
    "cat": "fun",
    "scene": "社团费用",
    "title": "社团会费先问清用途，别一次交整年",
    "action": "入社前问清会费覆盖什么（场地、器材、活动物料），能否按学期交；只参加一两次活动的社团，先不交整年会费，等确认要长期参加再交。",
    "who": "开学被拉进好几个社团的人",
    "gate": "会费应有明确用途说明；不肯说明的社团直接不交",
    "risk": "部分社团收完会费就没活动；「保证金」「服装费」另收的要问是否可退",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 30,
      "max": 200
    },
    "priceRef": {
      "text": "社团会费常见 20-100 元/年，运动类含服装器材可能 200 元以上"
    },
    "billCats": [
      "社交",
      "娱乐"
    ],
    "keywords": [
      "社团",
      "会费",
      "学生会",
      "入社",
      "保证金",
      "社团活动"
    ],
    "certainty": "varies",
    "source": "高校社团收费惯例"
  },
  {
    "id": "fun.treat.166",
    "cat": "fun",
    "scene": "请客",
    "title": "请客选食堂小炒或奶茶，别默认下馆子",
    "action": "要表达心意时，请一顿食堂小炒、一份奶茶或一顿夜宵，成本只有餐厅的三分之一；真要下馆子就选人均固定的套餐店，避免点菜超支。",
    "who": "要还人情、又不想吃土的人",
    "gate": "先看对方在意的是「一起吃饭」还是「吃什么」，多数人在意前者",
    "risk": "人均不透明的店容易超预算；请客前最好先定好预算上限",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 50,
      "max": 150
    },
    "priceRef": {
      "text": "餐厅请客人均 80-150 元，食堂小炒/奶茶人均 15-30 元"
    },
    "billCats": [
      "社交",
      "餐饮"
    ],
    "keywords": [
      "请客",
      "还人情",
      "做东",
      "请吃饭",
      "请人吃饭",
      "请客吃饭",
      "奶茶",
      "小炒"
    ],
    "certainty": "varies",
    "source": "校园餐饮价格区间"
  },
  {
    "id": "fun.wedding.167",
    "cat": "fun",
    "scene": "随礼",
    "title": "随礼按关系定档，别跟同辈比数字",
    "action": "先定自己的三档标准（普通同学 / 好朋友 / 亲戚），按档给，不因为群里别人给得多就加码；学生身份可以直接说明「还在读书」，多数人不会介意。",
    "who": "第一次收到同学婚礼请帖的人",
    "gate": "先问同去的人大概给多少，取中间档；关系一般的可以不参加只发祝福",
    "risk": "随礼是单向支出，别为此借钱或动用生活费；各地风俗差异大，别照搬网上标准",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 100,
      "max": 500
    },
    "priceRef": {
      "text": "学生随礼常见 200-600 元，按关系分档可减少攀比型支出"
    },
    "billCats": [
      "社交"
    ],
    "keywords": [
      "随礼",
      "份子钱",
      "婚礼",
      "红包",
      "结婚",
      "人情"
    ],
    "certainty": "varies",
    "source": "各地风俗差异大，仅作分档思路"
  },
  {
    "id": "fun.love.168",
    "cat": "fun",
    "scene": "恋爱开销",
    "title": "恋爱设「约会预算」，别每顿都你请",
    "action": "每月给约会单列一个额度（如 200-300 元），超了就改成散步、做饭、看免费展；约会开销轮流付或 AA，比一方长期全付更可持续。",
    "who": "谈恋爱后生活费总不够的人",
    "gate": "额度要提前和对方说清楚，别默默扛到自己吃土",
    "risk": "长期单方承担容易积累情绪；节日礼物别叠加大额支出，和约会预算合并计算",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 100,
      "max": 400
    },
    "priceRef": {
      "text": "学生约会单次常见 80-200 元，按月定额度更可控"
    },
    "billCats": [
      "社交",
      "娱乐"
    ],
    "keywords": [
      "恋爱",
      "约会",
      "情侣",
      "对象",
      "礼物",
      "看电影"
    ],
    "certainty": "varies",
    "source": "学生消费结构经验"
  },
  {
    "id": "fun.drink.169",
    "cat": "fun",
    "scene": "聚会饮品",
    "title": "聚会先问能否自带，注意开瓶费",
    "action": "订位时问一句「能否自带饮料、有没有开瓶费/服务费」；能自带就在超市买整箱，不能自带就点大瓶分享装，别一人一瓶。",
    "who": "每次聚会饮料钱占一半的人",
    "gate": "先问清规则再带，别到了被收开瓶费",
    "risk": "部分餐厅禁止自带且收服务费，反而更贵；KTV 的酒水溢价最高，尽量选含酒水套餐",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 20,
      "max": 80
    },
    "priceRef": {
      "text": "店内瓶装饮料常为超市价 2-3 倍"
    },
    "billCats": [
      "社交",
      "娱乐"
    ],
    "keywords": [
      "聚会",
      "饮料",
      "开瓶费",
      "KTV",
      "酒水",
      "自带"
    ],
    "certainty": "varies",
    "source": "餐饮/KTV 通行收费规则"
  },
  {
    "id": "fun.photo.170",
    "cat": "fun",
    "scene": "毕业照写真",
    "title": "毕业照拼单找校内摄影，别买影楼套餐",
    "action": "毕业照、证件照先找校内摄影社团或学长接单（按小时或按人头计价），几个人拼一场分摊；影楼套餐里的相册、放大照多数不会再看。",
    "who": "毕业季要拍照的人",
    "gate": "先看对方作品集，确认交付张数和精修数量",
    "risk": "影楼套餐常有二次消费（加片、加册）；低价引流套餐的精修张数往往很少",
    "trigger": {
      "window": [
        {
          "from": "05-01",
          "to": "07-15"
        }
      ]
    },
    "freq": null,
    "save": {
      "type": "range",
      "min": 200,
      "max": 800
    },
    "priceRef": {
      "text": "影楼毕业写真常见 800-3000 元，拼单/校内摄影常见 200-600 元"
    },
    "billCats": [
      "社交",
      "娱乐"
    ],
    "keywords": [
      "毕业照",
      "写真",
      "证件照",
      "拍照",
      "影楼",
      "毕业季"
    ],
    "certainty": "varies",
    "source": "摄影服务常见报价区间"
  },
  {
    "id": "fun.trip.171",
    "cat": "fun",
    "scene": "集体出游",
    "title": "集体出游用分摊工具，交通住宿提前订",
    "action": "出发前用分摊小程序建一个账本，谁付谁记；交通和住宿至少提前两周订（学生票/青旅/民宿多人间），门票先查学生票和免费开放日。",
    "who": "班级/社团组织出游的人",
    "gate": "先收一笔公共基金（人均 100-200 元）由一人管，结束多退少补",
    "risk": "临行前订票价格翻倍；管事的人垫资过多容易起纠纷",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 100,
      "max": 500
    },
    "priceRef": {
      "text": "提前订票通常比临期低 20%-40%，学生票另省门票 50%"
    },
    "billCats": [
      "社交",
      "交通",
      "娱乐"
    ],
    "keywords": [
      "出游",
      "旅游",
      "班级活动",
      "分摊",
      "学生票",
      "青旅"
    ],
    "certainty": "varies",
    "source": "交通住宿定价规律 + 景区学生票政策"
  },
  {
    "id": "fun.deliver.172",
    "cat": "fun",
    "scene": "拼单配送",
    "title": "室友拼单摊配送费，凑到起送价就停",
    "action": "同一时段点外卖的室友一起下单，配送费和满减门槛一起摊；凑单只加真正会吃的东西（加一份主食、一瓶水），不为凑满减买不需要的。",
    "who": "一个人点外卖总觉得配送费贵的人",
    "gate": "同一家店、同一时段才拼得起来；先问室友要不要，别默认帮人点",
    "risk": "为凑满减多买的部分往往比省下的配送费更贵；拼单要留好各自金额",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 3,
      "max": 15
    },
    "priceRef": {
      "text": "配送费常见 3-6 元/单，拼单后可分摊"
    },
    "billCats": [
      "餐饮"
    ],
    "keywords": [
      "拼单",
      "配送费",
      "起送价",
      "外卖",
      "室友",
      "满减"
    ],
    "certainty": "stable",
    "source": "外卖平台计费规则"
  },
  {
    "id": "fun.recycle.173",
    "cat": "fun",
    "scene": "人情往来替代",
    "title": "送礼前先翻自己的闲置，二手转赠也体面",
    "action": "送书、送小电器、送没拆封的护肤小样前，先看自己有没有重复的闲置；确实要买就选对方明确需要的东西，别买「看起来很贵但用不上」的礼盒。",
    "who": "送礼预算紧、又不想失礼的人",
    "gate": "二手转赠只送未拆封或成色极好的，且要说明来源",
    "risk": "送闲置要挑对象，关系不够近容易误会；礼盒类溢价高、实用度低",
    "trigger": null,
    "freq": null,
    "save": {
      "type": "range",
      "min": 50,
      "max": 200
    },
    "priceRef": {
      "text": "礼盒类常见 100-300 元，实用单品常见 30-80 元"
    },
    "billCats": [
      "社交"
    ],
    "keywords": [
      "送礼",
      "闲置",
      "二手",
      "礼盒",
      "人情",
      "转赠"
    ],
    "certainty": "varies",
    "source": "闲置流通与礼品定价经验"
  }
];

  /* ================================================================== */
  /* 校验                                                                */
  /* ================================================================== */

  var CERTAINTY = ['stable', 'varies', 'local'];
  var SAVE_TYPES = ['fixed', 'ratio', 'range', 'none'];
  var CAT_KEYS = CATS.map(function (c) { return c.key; });

  function isStr(v) { return typeof v === 'string' && v.trim() !== ''; }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /**
   * 数据自检。返回 {ok, errors:[{id, field, msg}], count}
   * 任何一条不合规都会被列出来——渲染层据此跳过该条，绝不渲染半截卡片。
   */
  function validate(list) {
    var arr = Array.isArray(list) ? list : ENTRIES;
    var errors = [];
    var seen = {};

    function err(id, field, msg) { errors.push({ id: id || '(no id)', field: field, msg: msg }); }

    for (var i = 0; i < arr.length; i++) {
      var e = arr[i] || {};
      var id = e.id;

      if (!isStr(id)) { err(id, 'id', '缺少 id'); }
      else if (seen[id]) { err(id, 'id', 'id 重复'); }
      else { seen[id] = true; }

      if (CAT_KEYS.indexOf(e.cat) === -1) { err(id, 'cat', '分类不在 10 类之内：' + e.cat); }

      ['title', 'action', 'who', 'gate', 'scene', 'risk', 'source'].forEach(function (f) {
        if (!isStr(e[f])) { err(id, f, '必填字段为空'); }
      });

      if (CERTAINTY.indexOf(e.certainty) === -1) { err(id, 'certainty', '取值非法：' + e.certainty); }

      /* billCats */
      if (!Array.isArray(e.billCats) || e.billCats.length === 0) {
        err(id, 'billCats', '至少关联一个账本分类');
      } else {
        e.billCats.forEach(function (c) {
          if (BILL_CATS.indexOf(c) === -1) { err(id, 'billCats', '未知账本分类：' + c); }
        });
      }

      /* keywords */
      if (!Array.isArray(e.keywords) || e.keywords.length === 0) {
        err(id, 'keywords', '至少一个关键词');
      } else {
        e.keywords.forEach(function (k) {
          if (!isStr(k)) { err(id, 'keywords', '关键词必须是非空字符串'); }
        });
      }

      /* save */
      var s = e.save || {};
      if (s.once !== undefined && typeof s.once !== 'boolean') {
        err(id, 'save.once', 'once 必须是布尔值');
      }
      if (s.onceLabel !== undefined && !isStr(s.onceLabel)) {
        err(id, 'save.onceLabel', 'onceLabel 必须是非空字符串');
      }
      if (SAVE_TYPES.indexOf(s.type) === -1) {
        err(id, 'save', '未知 save.type：' + s.type);
      } else if (s.type === 'fixed') {
        if (!isNum(s.amount) || s.amount < 0) { err(id, 'save.amount', 'fixed 需要非负数字'); }
      } else if (s.type === 'ratio') {
        if (!isNum(s.rate) || s.rate <= 0 || s.rate >= 1) { err(id, 'save.rate', 'rate 必须在 (0,1) 之间'); }
        if (s.cap !== undefined && (!isNum(s.cap) || s.cap <= 0)) { err(id, 'save.cap', 'cap 必须为正数'); }
        if (e.priceRef && isNum(e.priceRef.before) && e.priceRef.before <= 0) {
          err(id, 'priceRef.before', '原价必须为正数');
        }
      } else if (s.type === 'range') {
        if (!isNum(s.min) || !isNum(s.max)) { err(id, 'save', 'range 需要 min / max 数字'); }
        else if (s.max < s.min) { err(id, 'save', 'max 不能小于 min'); }
      }

      /* trigger */
      var t = e.trigger;
      if (t !== null && t !== undefined) {
        if (typeof t !== 'object') { err(id, 'trigger', 'trigger 必须是对象或 null'); }
        else {
          if (t.weekday !== undefined) {
            if (!Array.isArray(t.weekday) || !t.weekday.length) { err(id, 'trigger.weekday', '必须是非空数组'); }
            else { t.weekday.forEach(function (w) { if (!(w >= 1 && w <= 7)) { err(id, 'trigger.weekday', '取值须 1-7：' + w); } }); }
          }
          if (t.monthday !== undefined) {
            if (!Array.isArray(t.monthday) || !t.monthday.length) { err(id, 'trigger.monthday', '必须是非空数组'); }
            else { t.monthday.forEach(function (d) { if (!(d >= 1 && d <= 28)) { err(id, 'trigger.monthday', '取值须 1-28（规避 2 月缺日）：' + d); } }); }
          }
          if (t.timeRange !== undefined) {
            var tr = t.timeRange;
            if (!Array.isArray(tr) || tr.length !== 2 || !/^\d{2}:\d{2}$/.test(tr[0]) || !/^\d{2}:\d{2}$/.test(tr[1])) {
              err(id, 'trigger.timeRange', '必须是 ["HH:MM","HH:MM"]');
            }
          }
          if (t.mmdd !== undefined) {
            if (!Array.isArray(t.mmdd) || !t.mmdd.length) { err(id, 'trigger.mmdd', '必须是非空数组'); }
            else { t.mmdd.forEach(function (m) { if (!/^\d{2}-\d{2}$/.test(m)) { err(id, 'trigger.mmdd', '格式须 MM-DD：' + m); } }); }
          }
          if (t.window !== undefined) {
            if (!Array.isArray(t.window) || !t.window.length) { err(id, 'trigger.window', '必须是非空数组'); }
            else {
              t.window.forEach(function (w) {
                if (!w || !/^\d{2}-\d{2}$/.test(w.from) || !/^\d{2}-\d{2}$/.test(w.to)) {
                  err(id, 'trigger.window', '区间必须是 {from:"MM-DD", to:"MM-DD"}');
                }
              });
            }
          }
        }
      }
    }

    return { ok: errors.length === 0, errors: errors, count: arr.length };
  }

  /* ================================================================== */
  /* 导出                                                                */
  /* ================================================================== */

  var API = {
    VERSION: '1.0.0',
    DATA_VERSION: DATA_VERSION,
    CATS: CATS,
    CAT_KEYS: CAT_KEYS,
    BILL_CATS: BILL_CATS,
    CERTAINTY: CERTAINTY,
    SAVE_TYPES: SAVE_TYPES,
    ENTRIES: ENTRIES,
    validate: validate,
    catByKey: function (key) {
      for (var i = 0; i < CATS.length; i++) { if (CATS[i].key === key) { return CATS[i]; } }
      return null;
    },
    byId: function (id) {
      for (var i = 0; i < ENTRIES.length; i++) { if (ENTRIES[i].id === id) { return ENTRIES[i]; } }
      return null;
    },
    byCat: function (cat) {
      return ENTRIES.filter(function (e) { return e.cat === cat; });
    }
  };

  if (isNode) {
    module.exports = API;
  } else {
    global.AJ = global.AJ || {};
    global.AJ.savingsData = API;
  }
})(typeof window !== 'undefined' ? window : this);
