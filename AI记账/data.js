/**
 * data.js — 全局配置、分类词典、平替词典、演示种子数据
 *
 * 浏览器：通过 <script src="data.js"> 加载，挂载到 window.AJ.data
 * Node  ：require('./data.js') 直接返回 DATA 对象（便于单元测试）
 */
(function (global) {
  'use strict';

  /** localStorage 统一 key */
  var STORAGE_KEY = 'ai_jizhang_v1';

  /** 数据版本号，结构变更时用于迁移 */
  var DATA_VERSION = 1;

  /**
   * 固定分类（"其他" 为兜底分类）
   * color = 品牌淡色，用于比例条 / 圆点 / 淡底（12% 透明度）
   * ink   = 同色系"深墨色"，专用于淡底小方块里的线性图标描边。
   *         实测在各自 12% 淡底上对比度 4.5:1 以上（WCAG AA），
   *         浅色分类（餐饮绿 / 交通青）用原色只有 2:1，会糊在底上看不清。
   * essential = 是否「必需消费」，只给消费诊断卡用：
   *         true  → 餐饮 / 学习 / 交通 / 居住 / 医疗（吃饭、上课、通勤、住宿、看病）
   *         false → 社交 / 购物 / 娱乐 / 其他（可压缩的「想要」）
   *         注意：这是**追加字段**，key / 顺序 / color / ink 一律不动。
   */
  var CATEGORIES = [
    /* ---- 原有 11 类（key / 顺序 / color / ink 一律不动，历史数据兼容） ---- */
    { key: '餐饮', color: '#07C160', ink: '#047A3E', essential: true },
    { key: '社交', color: '#FF8A3D', ink: '#AF5410', essential: false },
    { key: '购物', color: '#7C6CF0', ink: '#5748B8', essential: false },
    { key: '学习', color: '#3D9CFF', ink: '#1C6CBF', essential: true },
    { key: '交通', color: '#2AC6C0', ink: '#0A7570', essential: true },
    { key: '娱乐', color: '#EF5350', ink: '#C0352C', essential: false },
    { key: '居住', color: '#B0803C', ink: '#7D5722', essential: true },
    { key: '电费', color: '#DBA514', ink: '#8A6206', essential: true },
    { key: '燃气费', color: '#D64570', ink: '#8E2444', essential: true },
    { key: '医疗', color: '#E0629A', ink: '#A93765', essential: true },
    /* ---- 扩充：食品饮品（2026-10 用户要求对齐主流记账 App 的"大全集"） ---- */
    { key: '外卖', color: '#4CAF50', ink: '#2E7D32', essential: false },
    { key: '蔬菜', color: '#7CB342', ink: '#4C7A1F', essential: true },
    { key: '买菜', color: '#9CCC65', ink: '#5F8329', essential: true },
    { key: '水果', color: '#FF9800', ink: '#A65E00', essential: true },
    { key: '零食', color: '#FBC02D', ink: '#8A7400', essential: false },
    { key: '饮品', color: '#4FC3F7', ink: '#0B6E96', essential: false },
    { key: '烟酒', color: '#A0522D', ink: '#64331A', essential: false },
    /* ---- 扩充：购物 ---- */
    { key: '日用', color: '#90A4AE', ink: '#57646E', essential: true },
    { key: '服饰', color: '#AB47BC', ink: '#6E2279', essential: false },
    { key: '美容', color: '#F06292', ink: '#A82A5E', essential: false },
    { key: '数码', color: '#5C6BC0', ink: '#333E85', essential: false },
    { key: '快递', color: '#C0CA33', ink: '#757A00', essential: false },
    /* ---- 扩充：居住 ---- */
    { key: '房租', color: '#8D6E63', ink: '#574137', essential: true },
    { key: '房贷', color: '#6D4C41', ink: '#402A22', essential: true },
    { key: '水费', color: '#29B6F6', ink: '#0A6E96', essential: true },
    { key: '话费', color: '#00ACC1', ink: '#00707E', essential: true },
    { key: '物业', color: '#78909C', ink: '#47565F', essential: true },
    { key: '维修', color: '#E64A19', ink: '#96290B', essential: false },
    /* ---- 扩充：交通 ---- */
    { key: '汽车', color: '#0D47A1', ink: '#082B63', essential: true },
    { key: '摩托', color: '#455A64', ink: '#273941', essential: true },
    { key: '加油费', color: '#F57C00', ink: '#94470A', essential: true },
    /* ---- 扩充：娱乐 / 学习 ---- */
    { key: '礼物', color: '#FF80AB', ink: '#B03368', essential: false },
    { key: '旅行', color: '#00897B', ink: '#00564B', essential: false },
    { key: '电影票', color: '#D81B60', ink: '#8E0F3E', essential: false },
    { key: '游戏', color: '#7E57C2', ink: '#4A2E85', essential: false },
    { key: '追星', color: '#F48FB1', ink: '#A84B6E', essential: false },
    { key: '运动', color: '#558B2F', ink: '#33591A', essential: false },
    { key: '麻将', color: '#4DD0E1', ink: '#0E7C8A', essential: false },
    { key: '书籍', color: '#5E35B1', ink: '#361D6E', essential: true },
    /* ---- 扩充：生活 ---- */
    { key: '宠物', color: '#FF8A65', ink: '#A84A28', essential: false },
    { key: '育儿', color: '#FFB74D', ink: '#A3641B', essential: false },
    { key: '长辈', color: '#B39DDB', ink: '#6A4FA3', essential: false },
    { key: '洗衣服', color: '#80DEEA', ink: '#1A7A8A', essential: true },
    /* ---- 扩充：人情 / 资金往来（转账还款等非消费，与 BILL_EXCLUDED_CATEGORIES 对齐） ---- */
    { key: '红包', color: '#E53935', ink: '#9E1F1B', essential: false },
    { key: '礼金', color: '#F4511E', ink: '#A02F0B', essential: false },
    { key: '彩票', color: '#F9A825', ink: '#96650A', essential: false },
    { key: '捐赠', color: '#81C784', ink: '#4E8A4E', essential: false },
    { key: '转账', color: '#607D8B', ink: '#3A4C55', essential: false },
    { key: '还款', color: '#A1887F', ink: '#6B5249', essential: false },
    { key: '借出', color: '#BCAAA4', ink: '#7A655D', essential: false },
    /* ---- 兜底分类永远在最后 ---- */
    { key: '其他', color: '#9AA3AD', ink: '#5E6771', essential: false }
  ];

  /**
   * 食物组：恩格尔系数的分母口径（餐饮 + 各餐饮子类）。
   * 拆分餐饮子类后，getEngel 若只数「餐饮」桶会严重低估，必须按组求和。
   */
  var FOOD_CATEGORIES = ['餐饮', '外卖', '蔬菜', '买菜', '水果', '零食', '饮品'];

  /**
   * 分类关键词词典。
   * 打分规则见 nlp.js classify()：最长命中词长度 * 10 + 命中词个数。
   */
  var CATEGORY_KEYWORDS = {
    '餐饮': [
      '食堂', '美团', '饿了么', '黄焖鸡', '麻辣烫', '火锅', '烧烤', '米线', '拉面',
      '面条', '饭团', '便当', '泡面', '早餐', '午餐',
      '晚餐', '早饭', '午饭', '晚饭', '夜宵', '宵夜', '吃饭', '米饭', '饭', '包子', '馒头', '饺子', '馄饨',
      '粥', '饼', '汉堡', '披萨', '炸鸡', '麻辣香锅', '酸菜鱼', '螺蛳粉', '自助',
      '蛋糕', '面包', '食堂饭卡', '饭卡', '肉', '菜', '汤', '面',
      '汉堡王', '萨莉亚', '老乡鸡', '乡村基', '南城香', '米村拌饭', '沙县', '兰州拉面',
      '正新鸡排', '绝味'
    ],
    '外卖': [
      '外卖', '美团外卖', '饿了么外卖', '点外卖', '外卖费', '送餐', '跑腿费'
    ],
    '蔬菜': [
      '蔬菜', '青菜', '白菜', '菠菜', '土豆', '西红柿', '番茄', '黄瓜', '生菜', '萝卜', '青椒'
    ],
    '买菜': [
      '买菜', '菜市场', '菜场', '买菜钱', '赶集',
      '排骨', '猪肉', '牛肉', '羊肉', '鸡肉', '鸡蛋', '虾'
    ],
    '水果': [
      '水果', '苹果', '香蕉', '橙子', '橘子', '葡萄', '西瓜', '芒果', '草莓', '车厘子', '榴莲', '柚子'
    ],
    '零食': [
      '零食', '薯片', '饼干', '辣条', '糖果', '瓜子', '坚果', '巧克力', '鸭脖', '卤味', '话梅', '果冻'
    ],
    '饮品': [
      '饮品', '饮料', '奶茶', '咖啡', '星巴克', '瑞幸', '库迪', '蜜雪', '喜茶', '霸王茶姬', '奈雪',
      '茶百道', '古茗', '沪上阿姨', '可乐', '雪碧', '矿泉水', '果汁', '酸奶', '柠檬水', '汽水',
      '冰淇淋', '雪糕', '拿铁', '冰美式'
    ],
    '烟酒': [
      '烟酒', '啤酒', '白酒', '红酒', '香烟', '槟榔', '酒吧', '买烟', '买酒'
    ],
    '社交': [
      '聚餐', 'AA制', 'AA', '请客', '舍友', '室友', '同学', '朋友', '生日', '聚会', '剧本杀', 'KTV',
      '唱歌', '送礼', '社团', '联谊', '约会', '团建', '串门',
      '请吃饭', '聚会'
    ],
    '购物': [
      '淘宝', '拼多多', '京东', '水杯', '台灯', '床单', '被套',
      '超市', '商场', '首饰', '手表', '包',
      '好特卖', '沃尔玛', '大润发', '天猫', '唯品会', '得物', '1688', '闲鱼',
      '抖音', '小红书', '名创优品', '大众点评', '微软'
    ],
    '日用': [
      '日用', '日用品', '纸巾', '洗面奶', '洗发水', '沐浴露', '牙膏', '牙刷', '毛巾',
      '洗衣液', '卫生纸', '垃圾袋', '抽纸', '卷纸'
    ],
    '服饰': [
      '服饰', '衣服', '裤子', '裙子', '卫衣', '外套', '鞋', '袜子', '帽子', '衬衫', 'T恤',
      '羽绒服', '优衣库', '牛仔裤'
    ],
    '美容': [
      '美容', '化妆', '护肤', '面膜', '口红', '香水', '理发', '美发', '美甲', '发型',
      '护肤品', '化妆品'
    ],
    '数码': [
      '数码', '手机', '电脑', '耳机', '键盘', '鼠标', '充电宝', '数据线', '平板', '显示器',
      '相机', '音箱', '苹果手机', 'iPhone'
    ],
    '快递': [
      '快递', '快递费', '邮费', '寄件', '取件', '菜鸟', '驿站'
    ],
    '学习': [
      '教材', '打印', '复印', '文具', '本子', '网课', '报名', '四六级', '考研', '资料',
      '考试', '课程', '学费', '辅导', '讲座', '实验', '笔记本', '参考书', '书', '笔', '知网'
    ],
    '交通': [
      '地铁', '公交', '打车', '滴滴', '高铁', '火车', '单车', '共享单车', '充电', '车费',
      '车票', '大巴', '出租车', '网约车', '交通卡', '地铁卡',
      '高德', '12306', '哈啰', '美团单车', '青桔'
    ],
    '房租': [
      '房租', '租房', '房费', '合租', '押金'
    ],
    '房贷': [
      '房贷', '按揭', '月供'
    ],
    '水费': [
      '水费', '自来水', '水费充值'
    ],
    '话费': [
      '话费', '手机费', '电话费', '流量', '套餐', '充话费'
    ],
    '物业': [
      '物业', '物业费', '管理费'
    ],
    '维修': [
      '维修', '修理', '修车', '修补', '安装费'
    ],
    '汽车': [
      '汽车', '私家车', '保养', '年检', '洗车', '停车费', '过路费'
    ],
    '摩托': [
      '摩托', '电动车', '电瓶车', '机车'
    ],
    '加油费': [
      '加油', '油费', '汽油', '柴油', '加油站'
    ],
    '娱乐': [
      '充值', '盲盒', '会员', 'VIP', '手办',
      '桌游', '网吧', '电影', '剧本', '台球', '密室', '电竞',
      '爱奇艺', '腾讯视频', '网易云', '音乐', 'B站'
    ],
    '礼物': [
      '礼物', '礼品', '送礼', '纪念品'
    ],
    '旅行': [
      '旅行', '旅游', '机票', '酒店', '民宿', '景点', '门票', '度假'
    ],
    '电影票': [
      '电影票', '电影院', '影票', '观影', 'IMAX'
    ],
    '游戏': [
      '游戏', '皮肤', '点卡', '点券', '抽卡', 'steam', 'Steam', '游戏充值'
    ],
    '追星': [
      '追星', '周边', '应援', '专辑', '打投', '明星', '演唱会'
    ],
    '运动': [
      '运动', '健身', '健身房', '体育馆', '羽毛球', '篮球', '足球', '游泳', '瑜伽', '跑步'
    ],
    '麻将': [
      '麻将', '扑克', '棋牌', '牌局', '打牌'
    ],
    '书籍': [
      '书籍', '图书', '教辅', '小说', '漫画', '杂志', '书店', '购书', '读物'
    ],
    '宠物': [
      '宠物', '猫粮', '狗粮', '猫砂', '驱虫', '宠物医院', '宠物店'
    ],
    '育儿': [
      '育儿', '奶粉', '尿布', '亲子', '婴儿', '辅食'
    ],
    '长辈': [
      '长辈', '爸妈', '父母', '爷爷奶奶', '孝敬'
    ],
    '洗衣服': [
      '洗衣服', '洗衣', '干洗', '洗衣房', '烘干'
    ],
    '红包': [
      '红包', '发红包', '压岁钱'
    ],
    '礼金': [
      '礼金', '份子', '随礼', '人情', '份子钱'
    ],
    '彩票': [
      '彩票', '双色球', '刮刮乐', '体彩', '福彩'
    ],
    '捐赠': [
      '捐赠', '捐款', '慈善', '公益', '募捐'
    ],
    '转账': [
      '转账', '转给', '转出', '微信转账'
    ],
    '还款': [
      '还款', '花呗', '白条', '信用卡', '分期'
    ],
    '借出': [
      '借出', '借给', '借钱给'
    ],
    '居住': [
      '住宿', '水电', '网费', '空调', '宿舍', '宽带'
    ],
    '电费': [
      '电费', '交电费', '电费充值', '电费单'
    ],
    '燃气费': [
      '燃气费', '燃气', '煤气', '煤气费', '天然气', '天然气费', '交燃气'
    ],
    '医疗': [
      '医院', '挂号', '体检', '感冒', '口罩', '诊所', '看病', '退烧', '消炎', '眼药水',
      '疫苗', '药', '牙'
    ]
  };

  /** 情绪型（冲动）消费关键词 */
  var EMOTION_KEYWORDS = [
    '盲盒', '皮肤', '抽卡', '手办', '演唱会', '会员', '游戏', '夜宵', '宵夜', '奶茶',
    '咖啡', '星巴克', '打车', '限量', '联名', '冲动', '电影', 'KTV', '剧本杀', '密室',
    '网咖', '网吧', '周边', '追星', '充值', '鲜花', '口红', '冰淇淋', '雪糕'
  ];

  /** "想要"（非刚需）关键词：服装鞋包 / 数码 / 美妆 */
  var WANT_KEYWORDS = [
    '衣服', '鞋', '裤子', '裙子', '卫衣', '外套', '口红', '化妆', '护肤', '面膜',
    '耳机', '手办', '周边', '香水', '首饰', '手表', '盲盒', '皮肤', '背包', '书包',
    '双肩包', '手提包', '单肩包', '包包'
  ];

  /** 收入关键词（同时需要上下文，见 nlp.js detectIncome） */
  var INCOME_KEYWORDS = [
    '生活费', '到账', '兼职', '工资', '奖学金', '助学金', '家里打', '退款', '报销',
    '进账', '收入', '赚了', '入账'
  ];

  /** 收入分类名（与支出 9 分类并列，仅用于 type === 'income' 的账单） */
  var INCOME_CATEGORY = '收入';

  /** 收入来源枚举（录入表单 / 解析推断共用）。首项为默认选中项。 */
  var INCOME_SOURCES = [
    '生活费', '工资', '兼职', '奖学金', '助学金', '红包', '礼金', '年终奖', '奖金',
    '分红', '理财收益', '退款', '卖闲置', '借入', '其他'
  ];

  /**
   * 收入来源推断关键词。
   * nlp.js 解析「收到生活费2000」「兼职赚了300」时按此表推断 source。
   */
  var INCOME_SOURCE_KEYWORDS = [
    { source: '兼职', keywords: ['兼职', '日结', '跑腿', '家教', '实习', '勤工'] },
    { source: '工资', keywords: ['工资', '月薪', '发薪'] },
    { source: '奖学金', keywords: ['奖学金', '国奖', '励志奖'] },
    { source: '助学金', keywords: ['助学金', '补助', '补贴', '贫困生'] },
    { source: '红包', keywords: ['红包', '转账给我'] },
    { source: '礼金', keywords: ['礼金', '压岁钱', '份子'] },
    { source: '年终奖', keywords: ['年终奖', '年底奖'] },
    { source: '奖金', keywords: ['奖金', '绩效'] },
    { source: '分红', keywords: ['分红', '股息', '利息'] },
    { source: '退款', keywords: ['退款', '退回', '退货', '报销'] },
    { source: '卖闲置', keywords: ['卖闲置', '出闲置', '闲鱼', '二手卖出', '卖二手'] },
    { source: '生活费', keywords: ['生活费', '家里打', '打钱', '给我转'] },
    // 兜底：只出现「到账」时按生活费理解（放在最后，避免抢走「兼职到账」）
    { source: '生活费', keywords: ['到账'] }
  ];

  /**
   * 导入账单（支付宝 / 微信 / 银行）14 类 → 应用内分类映射。
   * 值为应用内分类名；`收入` 是特殊值（导入层会转成 type: 'income'）。
   * 未命中时由 analysis.js 回退到 nlp.classify()。
   */
  var BILL_CATEGORY_MAP = {
    '餐饮': '餐饮',
    '交通': '交通',
    '购物': '购物',
    '日用': '日用',
    '居住': '居住',
    '通讯': '话费',
    '医疗': '医疗',
    '教育': '学习',
    '娱乐': '娱乐',
    '人情往来': '社交',
    '收入': '收入',
    '其他': '其他',
    '转账': '转账',
    '还款': '还款'
  };

  /**
   * 导入时不参与消费统计的分类（给室友转账 / 还花呗不是消费）。
   * analysis.js 会把这些行标记 excluded: true，不计入支出与占比。
   */
  var BILL_EXCLUDED_CATEGORIES = ['转账', '还款', '信用还款', '信用卡还款', '转账红包', '投资理财', '借贷'];

  /** 日期词 → 相对今天的天数偏移 */
  var DATE_WORDS = [
    { word: '大前天', offset: -3 },
    { word: '前天', offset: -2 },
    { word: '昨晚', offset: -1 },
    { word: '昨早', offset: -1 },
    { word: '昨天', offset: -1 },
    { word: '今日', offset: 0 },
    { word: '今晚', offset: 0 },
    { word: '今早', offset: 0 },
    { word: '今天', offset: 0 },
    { word: '今儿', offset: 0 },
    { word: '刚才', offset: 0 }
  ];

  /** 餐段词 → 餐段名称 */
  var MEAL_WORDS = [
    { word: '早饭', meal: '早餐' },
    { word: '早餐', meal: '早餐' },
    { word: '早上', meal: '早餐' },
    { word: '早晨', meal: '早餐' },
    { word: '上午', meal: '早餐' },
    { word: '今早', meal: '早餐' },
    { word: '午饭', meal: '午餐' },
    { word: '午餐', meal: '午餐' },
    { word: '中饭', meal: '午餐' },
    { word: '中午', meal: '午餐' },
    { word: '下午', meal: '午餐' },
    { word: '晚饭', meal: '晚餐' },
    { word: '晚餐', meal: '晚餐' },
    { word: '晚上', meal: '晚餐' },
    { word: '今晚', meal: '晚餐' },
    { word: '傍晚', meal: '晚餐' },
    { word: '夜宵', meal: '夜宵' },
    { word: '宵夜', meal: '夜宵' }
  ];

  /**
   * 量词表（只用于「数字 + 量词」整体剔除，绝不单独当停用词删）。
   *
   * 为什么必须单列：这些字大量出现在名词内部 —— 盲盒 / 盒饭 / 双人餐 / 串串 /
   * 水瓶 / 只字不提。历史上它们被塞进 STOP_WORDS，buildNote 用 split/join 全串替换，
   * 于是「盲盒」洗成「盲」、「盒饭」洗成「饭」、「双人餐」洗成「人餐」、
   * 「串串」直接洗空后被兜底成「晚餐」。而「盲盒」是 COOLDOWN_KEYWORDS 的核心词，
   * 冷静期落心愿单时 draft.note 就是标题，用户会看到一条叫「盲」的心愿。
   *
   * 正确做法：只剥离「数字 + 量词」形态（3杯 / 一盒 / 2个），量词本身不进停用词表。
   */
  var QUANTIFIERS = [
    '杯', '份', '次', '张', '个', '瓶', '件', '斤', '袋', '盒',
    '碗', '串', '根', '双', '只', '顿', '支', '包', '罐', '盘', '屉'
  ];

  /**
   * 备注清洗停用词表。
   * 注意：
   *   ① 刻意不包含 "和"，避免把 "和舍友AA聚餐" 洗成 "舍友AA聚餐"；
   *   ② 刻意不包含任何量词（见 QUANTIFIERS 的注释），量词由 nlp.buildNote 用
   *      「数字 + 量词」正则成对剔除，避免啃掉 盲盒 / 盒饭 / 双人餐 这类名词。
   */
  var STOP_WORDS = [
    '大前天', '今天', '昨天', '前天', '今日', '今晚', '今早', '昨晚', '昨早', '今儿', '刚才',
    '上午', '早晨', '早上', '中午', '下午', '傍晚', '晚上', '夜宵', '宵夜',
    '一共', '总共', '合计', '大概', '大约', '左右', '差不多', '大概其',
    '花了', '花费', '付了', '付款', '支付', '买了', '买', '入了', '消费了', '消费',
    '用了', '充了', '充值', '吃', '吃了', '喝', '喝了', '给了', '交了', '到账', '入账',
    '等了', '住了', '抽了',
    '人民币', '块钱', '块', '元', '毛', '角', '钱',
    '的', '了', '我', '在', '是', '又', '还', '就', '才', '刚', '约'
  ];

  /** 段首可安全剔除的连接词（不包含 "和"） */
  var LEADING_CONNECTORS = ['还有', '然后', '另外', '加上', '以及', '顺便', '再', '并且'];

  /**
   * 校园平替词典（14 条）。
   * save = 品牌参考价 brandPrice - altPrice（统一按单价计算，不跟随整笔实付金额）
   * times = 文案里"本周少 X 次"的次数，用于计算本周可省金额（save × times），
   *         必须与 timesText 的措辞严格一致。
   */
  /**
   * 南海北区专属省钱平替库（21 条）。
   * 数据与《广轻大南海北区理财与平替指南》一致，含校内 / 周边真实点位。
   * save = 品牌参考价 brandPrice - altPrice（统一按单价计算，不跟随整笔实付金额）
   * times = 文案里"本周少 X 次"的次数，用于计算本周可省金额（save × times），
   *         必须与 timesText 的措辞严格一致。
   * tip   = 理财教练话术前半句（后面自动接"更香"），必须带校区点位或频次建议。
   */
  var ALTERNATIVES = [
    /* ---- 一、餐饮 ---- */
    {
      id: 'takeout', keywords: ['外卖', '美团', '饿了么', '轻食'],
      brand: '外卖轻食', brandPrice: 30, altName: '食堂一荤一素（南海北区饭堂）', altPrice: 11,
      unit: '顿', times: 3, timesText: '本周少点三次',
      tip: '一周少点 3 次外卖立省 50+，'
    },
    {
      id: 'kfc', keywords: ['炸鸡', '肯德基', 'kfc', 'KFC', '疯狂星期四'],
      brand: '校门口炸鸡', brandPrice: 45, altName: '周四去校门口商业街的肯德基', altPrice: 25,
      unit: '份', times: 2, timesText: '本月控制在两次',
      tip: '比点外卖便宜至少 15 元，但每月控制在 1-2 次，'
    },
    {
      id: 'mcd', keywords: ['麦当劳', '金拱门', '麦乐鸡'],
      brand: '麦当劳单点', brandPrice: 25, altName: '阳光广场麦当劳周一 13.9 元随心配', altPrice: 13.9,
      unit: '份', times: 2, timesText: '月初手头紧时去两次',
      tip: '比单点省 10 元左右，'
    },
    {
      id: 'drinkbox', keywords: ['饮料', '可乐', '矿泉水', '雪碧', '整箱'],
      brand: '校内便利店瓶装饮料', brandPrice: 5, altName: '拼多多整箱送到菜鸟驿站', altPrice: 2.5,
      unit: '瓶', times: 5, timesText: '本周少买五瓶',
      tip: '均价能省一半，'
    },

    /* ---- 二、饮品 ---- */
    {
      id: 'starbucks', keywords: ['星巴克', 'starbucks', '馥芮白'],
      brand: '星巴克', brandPrice: 32, altName: '瑞幸 / 库迪 9.9 元（阳光广场）', altPrice: 9.9,
      unit: '杯', times: 2, timesText: '每周最多两杯',
      tip: '单杯省 15-20 元，'
    },
    {
      id: 'chayi', keywords: ['喜茶', '奈雪', '霸王茶姬', '茶百道', '古茗', '沪上阿姨'],
      brand: '喜茶/奈雪', brandPrice: 22, altName: '瑞幸 / 库迪 9.9 元（每周二）', altPrice: 9.9,
      unit: '杯', times: 2, timesText: '每周最多两杯',
      tip: '每周最多 2 杯，'
    },
    {
      id: 'milktea', keywords: ['奶茶', '一点点', '益禾堂'],
      brand: '阳光广场奶茶', brandPrice: 18, altName: '食堂免费热水 / 宿舍速溶咖啡', altPrice: 2,
      unit: '杯', times: 3, timesText: '本周少喝三杯',
      tip: '这笔是纯情绪消费，'
    },
    {
      id: 'coffee', keywords: ['咖啡', '拿铁', '美式'],
      brand: '校外咖啡', brandPrice: 28, altName: '瑞幸 / 库迪 9.9 元（阳光广场）', altPrice: 9.9,
      unit: '杯', times: 2, timesText: '本周少喝两杯',
      tip: '走过去也就几分钟，'
    },

    /* ---- 三、日用品与购物 ---- */
    {
      id: 'print', keywords: ['打印', '复印', '打印店'],
      brand: '校外打印店', brandPrice: 0.5, altName: '校内宿舍打印店（17A / E2 / E3，黑白 0.1 元/面）', altPrice: 0.1,
      unit: '面', times: 10, timesText: '本周的一百页',
      tip: '校外门店贵 3-5 倍，'
    },
    {
      id: 'convenience', keywords: ['便利店', '小卖部'],
      brand: '校内便利店', brandPrice: 25, altName: '润泰超市（正门斜对面 150 米）', altPrice: 15,
      unit: '次', times: 2, timesText: '本周少逛两次',
      tip: '别在这买整箱饮料，'
    },
    {
      id: 'snack', keywords: ['零食', '薯片', '辣条'],
      brand: '校内便利店的零食', brandPrice: 25, altName: '赵一鸣（阳光广场）', altPrice: 15,
      unit: '份', times: 2, timesText: '本月控制在两次',
      tip: '只买清单上的东西，别囤太多，'
    },
    {
      id: 'miniso', keywords: ['名创优品', 'miniso', 'MINISO'],
      brand: '名创优品的小物件', brandPrice: 40, altName: '赵一鸣 / 拼多多', altPrice: 22,
      unit: '次', times: 1, timesText: '本月少逛一次',
      tip: '这里的零食比赵一鸣贵，'
    },
    {
      id: 'zunte', keywords: ['尊特', '第二饭堂三楼', '校内超市'],
      brand: '尊特优选（第二饭堂三楼）', brandPrice: 50, altName: '拼多多百亿补贴', altPrice: 30,
      unit: '单', times: 1, timesText: '不急的单子等网购',
      tip: '急用才去尊特，不急的等网购，'
    },

    /* ---- 四、健身与娱乐 ---- */
    {
      id: 'gym', keywords: ['健身房', '健身卡', '私教'],
      brand: '校外健身房', brandPrice: 199, altName: '南海北区 39 栋负一层 2 号健身房（免费）', altPrice: 0,
      unit: '月', times: 1, timesText: '每月白捡一次',
      tip: '7:00-21:30 免费开放，有氧和力量区都有，'
    },
    {
      id: 'strength', keywords: ['力量训练', '器械'],
      brand: '校外健身房的力量区', brandPrice: 199, altName: '田径场看台下 3 号健身房（免费）', altPrice: 0,
      unit: '月', times: 1, timesText: '每月白捡一次',
      tip: '专门做大力量训练，同样免费，'
    },
    {
      id: 'ktv', keywords: ['KTV', 'ktv', '剧本杀', '密室'],
      brand: '校外 KTV / 剧本杀', brandPrice: 60, altName: '操场夜跑 / 社团免费活动', altPrice: 0,
      unit: '次', times: 1, timesText: '本月少去一次',
      tip: '这笔属于娱乐-非刚需，'
    },
    {
      id: 'billiards', keywords: ['台球', '网吧', '网咖'],
      brand: '校外台球 / 网吧', brandPrice: 35, altName: '操场夜跑 / 社团活动', altPrice: 0,
      unit: '次', times: 2, timesText: '本月控制在两次',
      tip: '月底复盘会发现这是隐形黑洞，'
    },
    {
      id: 'movie', keywords: ['电影', '影院', '观影'],
      brand: '商业影院', brandPrice: 45, altName: '校园影院', altPrice: 8,
      unit: '张', times: 1, timesText: '校园影院一场',
      tip: '免费和低价资源先捞一遍，'
    },

    /* ---- 五、交通出行 ---- */
    {
      id: 'taxi', keywords: ['打车', '滴滴', '出租车', '网约车'],
      brand: '打车去市区', brandPrice: 32, altName: '公交 K5 到岭南新天地', altPrice: 5,
      unit: '趟', times: 2, timesText: '本周少打两次',
      tip: '全程约 1.5 小时但只花几块钱，'
    },
    {
      id: 'metro', keywords: ['地铁站', '广佛线', '龙溪'],
      brand: '打车到地铁站', brandPrice: 30, altName: '公交佛 275 到龙溪地铁站', altPrice: 4,
      unit: '趟', times: 2, timesText: '本周少打两次',
      tip: '约 1 小时 10 分直达广佛线，'
    },
    {
      id: 'bike', keywords: ['共享单车', '单车', '青桔', '美团单车'],
      brand: '共享单车单次扫码', brandPrice: 3, altName: '共享单车月卡（10 元/月）', altPrice: 0.5,
      unit: '次', times: 10, timesText: '本月看成十次',
      tip: '办月卡短途出行够用，'
    },
    {
      id: 'skin', keywords: ['皮肤', '抽卡', '充值', '点券', '点卡'],
      brand: '游戏充值', brandPrice: 99, altName: '等打折 / 二手账号', altPrice: 49,
      unit: '次', times: 1, timesText: '等一个折扣季',
      tip: '这笔要进冷静期，'
    },
    {
      id: 'blindbox', keywords: ['盲盒', '手办', '谷子', '潮玩'],
      brand: '盲盒', brandPrice: 59, altName: '闲鱼二手', altPrice: 20,
      unit: '个', times: 1, timesText: '二手同款',
      tip: '这笔要进冷静期，'
    },
    {
      id: 'haircut', keywords: ['理发', '剪头', 'tony', 'Tony'],
      brand: '校外理发店', brandPrice: 68, altName: '学校理发店', altPrice: 15,
      unit: '次', times: 1, timesText: '校内一次',
      tip: '校内便宜一大截，'
    }
  ];

  /** 南海北区商家词典：记账时从自然语句里提取「商家」字段（业务规则第 1 条） */
  var MERCHANTS = [
    { key: '南海北区饭堂', words: ['食堂', '饭堂', '一饭', '二饭', '三饭', '四饭'], cat: '餐饮' },
    { key: '外卖平台（美团 / 饿了么）', words: ['外卖', '美团', '饿了么'], cat: '餐饮' },
    { key: '宿舍打印店（17A / E2 / E3）', words: ['打印店', '打印', '复印'], cat: '学习' },
    { key: '肯德基（校门口商业街）', words: ['肯德基', 'kfc', 'KFC', '疯狂星期四'], cat: '餐饮' },
    { key: '麦当劳（阳光广场）', words: ['麦当劳', '金拱门', '麦乐鸡'], cat: '餐饮' },
    { key: '瑞幸 / 库迪（阳光广场）', words: ['瑞幸', '库迪', 'luckin'], cat: '餐饮' },
    { key: '赵一鸣零食（阳光广场）', words: ['赵一鸣', '零食'], cat: '餐饮' },
    { key: '尊特优选（第二饭堂三楼）', words: ['尊特', '第二饭堂'], cat: '购物' },
    { key: '校内便利店（各饭堂旁）', words: ['便利店', '小卖部'], cat: '购物' },
    { key: '润泰超市（正门斜对面）', words: ['润泰', '超市'], cat: '购物' },
    { key: '宿舍楼下小卖部', words: ['楼下小卖部', '宿管小卖部'], cat: '购物' },
    { key: '名创优品（阳光广场）', words: ['名创优品', 'miniso', 'MINISO'], cat: '购物' },
    { key: '星巴克', words: ['星巴克', 'starbucks'], cat: '餐饮' },
    { key: '喜茶', words: ['喜茶', '奈雪', '霸王茶姬', '茶百道', '古茗'], cat: '餐饮' },
    { key: '菜鸟驿站', words: ['菜鸟驿站', '拼多多', '百亿补贴'], cat: '购物' },
    { key: '京东', words: ['京东'], cat: '购物' },
    { key: '淘宝/天猫', words: ['淘宝', '天猫'], cat: '购物' },
    { key: '闲鱼二手', words: ['闲鱼', '二手'], cat: '购物' }
  ];

  /**
   * 单笔非刚需支出触发「冷静期」的关键词（业务规则：冲动消费冷静期）。
   * 只要命中其一且金额 ≥ 冷静期阈值，就必须弹出冷静期提醒。
   */
  var COOLDOWN_KEYWORDS = [
    '游戏充值', '游戏皮肤', '抽卡', '点券', '首充', '月卡礼包',
    '盲盒', '手办', '谷子', '潮玩', '扭蛋',
    '剧本杀', '密室', 'KTV', 'ktv', '台球', '网吧',
    '聚餐AA', '请客', '生日局', '社团聚会', '份子', '随礼'
  ];

  /** 宿舍电费防刺客小贴士（月结 / 分摊场景用） */
  var ELECTRICITY_TIPS = [
    '空调开 26 度，每低 1 度电费明显上涨',
    '出门前检查一下空调到底关没关',
    '月底分摊时如果自己用电最多，主动多承担一点，别因小钱闹宿舍矛盾'
  ];


  /** 分类预算默认占比（用于 budgets.csv 的"预算金额"列） */
  var CATEGORY_BUDGET_RATIO = {
    '餐饮': 0.40,
    '社交': 0.12,
    '购物': 0.15,
    '学习': 0.08,
    '交通': 0.06,
    '娱乐': 0.10,
    '居住': 0.05,
    '医疗': 0.02,
    '其他': 0.02
  };

  /** 默认预算设置 */
  var DEFAULT_BUDGET = {
    total: 2000,
    payday: 1,
    cooldownThreshold: 50
  };

  /** 预置理财目标 */
  var DEFAULT_GOALS = [
    { id: 'goal_ipad', name: 'iPad', target: 3000, saved: 800, deadline: '2026-12-31' }
  ];

  /**
   * 演示种子账单（14 笔支出）。
   * offset 表示"距今几天"，由 app.js 在首次启动时换算成真实日期。
   */
  var SEED_BILLS = [
    { offset: 0, amount: 220, category: '餐饮', note: '食堂饭卡充值', motivation: '刚需', want: false },
    { offset: 0, amount: 18, category: '餐饮', note: '黄焖鸡米饭', motivation: '刚需', want: false },
    { offset: 1, amount: 26, category: '餐饮', note: '外卖麻辣烫', motivation: '刚需', want: false },
    { offset: 2, amount: 32, category: '餐饮', note: '星巴克拿铁', motivation: '情绪', want: false },
    { offset: 2, amount: 6, category: '餐饮', note: '蜜雪冰城柠檬水', motivation: '情绪', want: false },
    { offset: 3, amount: 128, category: '餐饮', note: '周末火锅', motivation: '刚需', want: false },
    { offset: 4, amount: 68, category: '社交', note: '和舍友AA聚餐', motivation: '刚需', want: false },
    { offset: 5, amount: 100, category: '社交', note: '社团生日份子', motivation: '刚需', want: false },
    { offset: 6, amount: 100, category: '交通', note: '地铁卡充值', motivation: '刚需', want: false },
    { offset: 7, amount: 23, category: '交通', note: '打车回学校', motivation: '情绪', want: false },
    { offset: 8, amount: 36.5, category: '学习', note: '打印资料和文具', motivation: '刚需', want: false },
    { offset: 9, amount: 99, category: '娱乐', note: '游戏皮肤充值', motivation: '情绪', want: false },
    { offset: 10, amount: 259, category: '购物', note: '淘宝卫衣', motivation: '刚需', want: true },
    { offset: 11, amount: 219, category: '购物', note: '蓝牙耳机', motivation: '情绪', want: true }
  ];

  /** 演示种子收入（1 笔，生活费） */
  var SEED_INCOME = {
    offset: 11,
    amount: 2000,
    category: '收入',
    source: '生活费',
    note: '生活费到账',
    motivation: '刚需',
    want: false,
    type: 'income'
  };

  /** 根据分类名取颜色 */
  function getCategoryColor(key) {
    var i;
    for (i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].key === key) {
        return CATEGORIES[i].color;
      }
    }
    return '#9AA3AD';
  }

  /** 根据分类名取"深墨色"（淡底图标专用，保证可读） */
  function getCategoryInk(key) {
    var i;
    for (i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].key === key) {
        return CATEGORIES[i].ink;
      }
    }
    return '#5E6771';
  }

  /** 分类 key 列表 */
  var CATEGORY_KEYS = CATEGORIES.map(function (c) { return c.key; });

  /**
   * 对话气泡 / 卡片标题里的小图标。
   *
   * 为什么不用 emoji：系统 emoji 在 Windows 上是 Segoe UI Emoji，在 macOS 上是 Apple Color
   * Emoji —— 同样的「📊」在两台电脑上颜色、粗细、大小都不同，而且和项目自带的线性 svg
   * 图标（2px 描边 + currentColor）完全不是一套语言，看起来像临时凑上去的。
   *
   * @param {string} name  #i-xxx 的 symbol 名（不含 #）
   * @param {string} [cls] 追加类名，用于不同语境下的尺寸 / 颜色，例如 'bico-warn'
   * @param {?string} [label] 无障碍名；传了就有 role="img"，省略则 aria-hidden
   * @returns {string} 内联 <svg> 字符串（需调用方自行拼进 innerHTML）
   */
  function inlineIcon(name, cls, label) {
    return '<svg class="bico' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24"' +
      (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') +
      '><use href="#' + name + '"/></svg>';
  }

  var DATA = {
    STORAGE_KEY: STORAGE_KEY,
    DATA_VERSION: DATA_VERSION,
    CATEGORIES: CATEGORIES,
    CATEGORY_KEYS: CATEGORY_KEYS,
    FOOD_CATEGORIES: FOOD_CATEGORIES,
    CATEGORY_KEYWORDS: CATEGORY_KEYWORDS,
    CATEGORY_BUDGET_RATIO: CATEGORY_BUDGET_RATIO,
    EMOTION_KEYWORDS: EMOTION_KEYWORDS,
    WANT_KEYWORDS: WANT_KEYWORDS,
    INCOME_KEYWORDS: INCOME_KEYWORDS,
    INCOME_CATEGORY: INCOME_CATEGORY,
    INCOME_SOURCES: INCOME_SOURCES,
    INCOME_SOURCE_KEYWORDS: INCOME_SOURCE_KEYWORDS,
    BILL_CATEGORY_MAP: BILL_CATEGORY_MAP,
    BILL_EXCLUDED_CATEGORIES: BILL_EXCLUDED_CATEGORIES,
    DATE_WORDS: DATE_WORDS,
    MEAL_WORDS: MEAL_WORDS,
    STOP_WORDS: STOP_WORDS,
    QUANTIFIERS: QUANTIFIERS,
    LEADING_CONNECTORS: LEADING_CONNECTORS,
    ALTERNATIVES: ALTERNATIVES,
    MERCHANTS: MERCHANTS,
    COOLDOWN_KEYWORDS: COOLDOWN_KEYWORDS,
    ELECTRICITY_TIPS: ELECTRICITY_TIPS,
    DEFAULT_BUDGET: DEFAULT_BUDGET,
    DEFAULT_GOALS: DEFAULT_GOALS,
    SEED_BILLS: SEED_BILLS,
    SEED_INCOME: SEED_INCOME,
    inlineIcon: inlineIcon,
    getCategoryColor: getCategoryColor,
    getCategoryInk: getCategoryInk
  };
  if (typeof window !== 'undefined') {
    window.AJ = window.AJ || {};
    window.AJ.data = DATA;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DATA;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
