/**
 * voice.js — 说话模式路由器（聊天式 / 硬核拆解 / 情绪树洞），UMD
 *
 * 定位：只做「这句话该用哪种口吻、这段文案长什么样」，**不碰 DOM、不碰存储、不触网**。
 * 三种模式对应三种真实入口，避免「每条回复都套 计算→常识→避坑」的死板模板：
 *   ① chat      聊天式互动 —— 日常小额记账，像发微信，短句 + 情绪词，不说教；
 *   ② breakdown 硬核拆解   —— 大额 / 租房 / 数码 / 水电话费异常，分层 + `---` 分隔，
 *                              表头按场景轮换，不再每次都「账单透视；
 *   ③ comfort   情绪树洞   —— 超支崩溃 / 冲动消费 / 深夜 emo，先接情绪，
 *                              少字数、不算账、不说教。
 *
 * 对外 API（window.AJ.voice）：
 *   MODE            {CHAT, BREAKDOWN, COMFORT}
 *   MODES           四种档位元信息（auto + 三模式），设置页 / 聊天区的「模式键」用它渲染
 *   classify(raw, ctx, forced) → {mode, confidence, signals, forced}
 *   isComfort(raw, ctx, forced) → boolean
 *   normForced(v)   → 'chat' | 'breakdown' | 'comfort' | ''（auto / 未知值都归一为空）
 *   normTone(v)     → 'gentle' | 'strict' | 'rational'（custom / 未知值回落 gentle）
 *   isWish(raw)     → 愿望句（想去 / 想买）为 true；带「后悔」的不算
 *   chatBill(ctx, tone)  → 日常记账的一句口语化确认（短句、带预算提醒）
 *   comfort(ctx)    → 情绪树洞文案（极短、温柔；危机词走兜底），ctx 可带 tone
 *   headerSet(seed, forced, tone) → {persp, facts, tips} 表头（按 seed 确定性轮换）
 *   HEADER_SETS     四套温柔学姐表头常量
 *   sep()           → `---` 分隔符的 HTML 片段
 *
 * 【说话方式 × 语言风格 是两层，正交叠加】
 *   方式（本文件的 chat / breakdown / comfort）= 说多少、要不要算账；
 *   风格（tone.js 的 gentle / strict / rational）= 用什么口气。
 *   两层都只改「怎么说」，不改「说什么」：金额、结论、该拦的照拦。
 */
(function (global) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);

  var MODE = { CHAT: 'chat', BREAKDOWN: 'breakdown', COMFORT: 'comfort' };

  /**
   * 四种档位：第一档「自动」是默认，其余是用户手动锁死。
   *
   * 为什么留「自动」而不是只给三个键：多数时候用户并不想管这件事，
   * 但一旦他想管（「我现在就想听人安慰」「别给我算账」），
   * 判定对不对就不该由算法决定了 —— 这是「可调」的全部意义。
   */
  var MODES = [
    { key: 'auto', name: '自动', icon: '🎚️', hint: '看情绪和金额自己选' },
    { key: 'chat', name: '聊天', icon: '💬', hint: '一句话，像发微信' },
    { key: 'breakdown', name: '拆解', icon: '🔍', hint: '分层算清楚' },
    { key: 'comfort', name: '树洞', icon: '🫂', hint: '先接情绪，不算账' }
  ];

  /** 把外部传入的档位归一：只有三个真模式算「强制」，其余（auto / 空 / 拼错）都当自动 */
  function normForced(v) {
    var k = String(v == null ? '' : v);
    if (k === MODE.CHAT || k === MODE.BREAKDOWN || k === MODE.COMFORT) { return k; }
    return '';
  }

  /** 档位显示名（聊天区那颗键、Toast、提示词都用这一份） */
  function modeName(key) {
    var k = String(key == null ? '' : key);
    for (var i = 0; i < MODES.length; i++) {
      if (MODES[i].key === k) { return MODES[i].name; }
    }
    return MODES[0].name;
  }

  /* ---------------------------------------------------------------- */
  /* 一·五、语言风格（tone）：只决定「口气」，不决定「方式」             */
  /* ---------------------------------------------------------------- */

  var TONES = ['gentle', 'strict', 'rational'];

  /**
   * 语气归一。三种之外一律当温柔学姐。
   *
   * 为什么 custom（用户自己写的人设）也回落 gentle：
   * 本文件的句子是本地写死的，用户那 120 个字只有云端模型读得到。
   * 本地硬编一个「自定义腔」既猜不准，又容易把用户设定里的自称写错。
   * 所以本地文案退到最中性的骨架，云端再把【说话风格·自定义】叠上去 ——
   * 用户看到的效果仍然是他的设定，只是本地兜底那半句不抢戏。
   */
  function normTone(v) {
    var k = String(v == null ? '' : v);
    return TONES.indexOf(k) >= 0 ? k : 'gentle';
  }

  /* ---------------------------------------------------------------- */
  /* 一、信号词                                                        */
  /* ---------------------------------------------------------------- */

  /** 强情绪信号：出现即偏「树洞」，而不是「算账」。
   *  注意：「冲动 / 忍不住」不在这里 —— 它们只是行为，必须配「后悔 / 没用」才算情绪
   *  （否则「冲动买了个包 300」会被当成倾诉，而不是一笔该记的账）。 */
  var EMOTE = /焦虑|崩溃|难受|emo|烦死|好烦|烦躁|压力|自责|好废|废了|后悔|哭了|想哭|失眠|深夜|破防|内耗|委屈|心累|麻木|摆烂|难过|胸闷|喘不过气|撑不住|不想活|没意思|好丧|丧到|自卑|讨厌自己/;

  /** 冲动消费 + 后悔 的组合（单独「冲动」不够，必须配「后悔/没用/浪费」） */
  var IMPULSE = /冲动|忍不住|剁手|没忍住|又买/;
  var REGRET = /后悔|没用|浪费|好废|心疼|自责|白买/;

  /** 危机信号：先接人，再谈钱（不做任何算账） */
  var CRISIS = /撑不住|不想活|没意思|活着没|麻木|崩溃|讨厌自己|自卑|想去死|活不下去/;

  /**
   * 愿望 / 想去哪儿：不是情绪，也不是后悔。
   *
   * 为什么必须单独拎出来：树洞那三条文案的前提是「你刚花了钱、你在自责」，
   * 套到「我真的很想去北京旅游」上就变成「别骂自己啦，钱已经花了」——
   * 用户根本没花钱，也没骂自己。这不是答偏，是把人惹毛的那种答偏。
   * 愿望句该接的是「想去就去，先把这趟的钱摸清」，而不是安慰。
   */
  var WISH_GO = /想去|打算去|计划去|想旅游|想出去玩|攒钱去|什么时候能去/;

  /** 想买型愿望：和「想去」拆的东西不一样（本体 / 配件 / 维修），文案不能共用 */
  var WISH_BUY = /想买|想换|想入手|想添置|打算买/;

  /** 分析诉求：只要用户在明确「要算/要选」，就不落树洞，交给拆解 */
  var ANALYTIC = /算|多少|贵不贵|贵吗|划算|值不值|值吗|怎么省|预算|还够|够不够|对比|哪个|怎么选|怎么买|怎么谈/;

  /** 结构型 / 大额信号：偏「硬核拆解」 */
  var STRUCT = /租房|房租|押一付|押金|中介|签合同|平板|电脑|笔记本|手机|相机|switch|ps5|显卡|主机|年卡|充值卡|预付卡|办卡|套餐|话费|水电|电费|水费|二手|闲鱼|首付|分期|贷款|学费|换新|配置|医保|报销/;

  /** 大额阈值（元）：到这个量级就不是「吃喝玩乐」了，值得拆开讲 */
  var AMOUNT_BIG = 300;

  /* ---------------------------------------------------------------- */
  /* 二、分类                                                          */
  /* ---------------------------------------------------------------- */

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  /**
   * 判断这句话该用哪种模式。
   * 优先级：情绪树洞 > 硬核拆解 > 聊天式。
   * 关键取舍：情绪再强，只要用户明确说「算/贵不贵/划算吗」，也算拆解——
   *   他要的是答案，不是安慰；树洞只接「纯情绪 / 纯后悔」。
   *
   * @param {string} raw 用户原话
   * @param {Object} [ctx] {scene, amount}
   * @param {string} [forced] 用户手动锁死的档位（chat / breakdown / comfort）；auto 传空
   * @return {{mode:string, confidence:number, signals:Object, forced:boolean}}
   */
  function classify(raw, ctx, forced) {
    var t = String(raw == null ? '' : raw);
    var c = ctx || {};
    var f = normForced(forced);

    /* ⓪ 手动档位优先于一切信号：用户既然亲手按了「树洞」，
       就不该因为句子里有个「算」字又被拽回去算账 —— 那等于键是坏的。 */
    if (f) {
      return {
        mode: f,
        confidence: 1,
        forced: true,
        signals: { forced: f, emote: EMOTE.test(t), analytic: ANALYTIC.test(t) }
      };
    }

    var emo = EMOTE.test(t);
    var impulse = IMPULSE.test(t) && REGRET.test(t);
    var analytic = ANALYTIC.test(t);
    var scene = c.scene || '';
    var amount = num(c.amount);

    /* ① 情绪树洞：强情绪 / 冲动+后悔；且没有明确「算一笔」的诉求 */
    if ((emo || impulse) && !analytic) {
      return {
        mode: MODE.COMFORT,
        confidence: emo ? 0.9 : 0.8,
        signals: { emote: emo, impulse: impulse, crisis: CRISIS.test(t) }
      };
    }

    /* ② 硬核拆解：结构型场景 / 大额 / 结构词 */
    var structuralScene = /^(rent|digital|utility|telecom|hairstyle|gym|secondhand|usedbuy)$/.test(scene);
    var big = amount >= AMOUNT_BIG;
    if (structuralScene || big || STRUCT.test(t)) {
      return {
        mode: MODE.BREAKDOWN,
        confidence: structuralScene ? 0.9 : 0.75,
        signals: { scene: scene, amount: amount, big: big }
      };
    }

    /* ③ 默认聊天式 */
    return { mode: MODE.CHAT, confidence: 0.6, signals: { amount: amount } };
  }

  function isComfort(raw, ctx, forced) {
    return classify(raw, ctx, forced).mode === MODE.COMFORT;
  }

  /* ---------------------------------------------------------------- */
  /* 三、模式一：聊天式记账确认                                         */
  /* ---------------------------------------------------------------- */

  function fmtNum(n) {
    var v = Math.round(num(n) * 100) / 100;
    if (Math.abs(v - Math.round(v)) < 1e-9) { return String(Math.round(v)); }
    return v.toFixed(1).replace(/\.0$/, '');
  }

  /**
   * 日常小额记账的口语化确认。
   * 不做表格、不堆卡片，先接住「记好了」，再顺手提一句预算。
   *
   * 三种语言风格只换「怎么开口」，不换「说什么」：
   *   gentle  ——「✅ 记好啦！…很标准嘛」，带语气词与表情；
   *   strict  ——「记上了，18 块黄焖鸡。剩 300 撑 8 天，一天 37，稳住。」短句、命令；
   *   rational——「已入账：黄焖鸡 18 元。本周期剩余 300 元（8 天），日均 37.5 元。」
   * 四种预算状态 × 三种风格都要说同一件事（花了多少 / 还剩多少 / 接下来怎么办），
   * 所以先算数、再选腔调 —— 不能因为换了语气就把数字说漏。
   *
   * @param {Object} ctx {amount, note, category, remaining, daysLeft, over}
   * @param {string} [tone] gentle / strict / rational（缺省 = gentle）
   * @return {string}
   */
  function chatBill(ctx, tone) {
    var c = ctx || {};
    var t = normTone(tone);
    var amt = fmtNum(c.amount);
    var note = String(c.note || c.category || '这笔').trim();
    var left = num(c.remaining);
    var days = num(c.daysLeft);
    var over = num(c.over);
    var perDay = days > 0 ? left / days : left;
    /* 教练档用「一天 37 块」的口语；数据档要「日均 37.5 元」，单位不能混，所以分开拼 */
    var dayLine = days > 0 ? ('，一天 ' + fmtNum(perDay) + ' 块') : '';

    /* 超支 / 余额见底：三种风格都「先坦诚，再给一个小动作，不指责」。
       教练档砍掉安慰但不砍动作，数据档只留事实 —— 都不许说「你管不住手」。 */
    if (over > 0) {
      if (t === 'strict') {
        return '记上了，' + amt + ' 块的' + note + '。这月超 ' + fmtNum(over) +
          '，接下来食堂，一荤一素，别点外卖。';
      }
      if (t === 'rational') {
        return '已入账：' + note + ' ' + amt + ' 元。本周期累计超支 ' + fmtNum(over) +
          ' 元，剩余额度为负，需在下周期回补。';
      }
      return '✅ 记好啦！' + amt + ' 块的' + note + '。哎，这月已经超了 ' +
        fmtNum(over) + ' 啦，接下来咱先勒一勒，食堂走起，好吗？';
    }
    if (left <= 0) {
      if (t === 'strict') {
        return '记上了，' + amt + ' 块的' + note + '。预算见底，这几天只花饭钱。';
      }
      if (t === 'rational') {
        return '已入账：' + note + ' ' + amt + ' 元。本周期预算余额 ' + fmtNum(left) + ' 元' +
          (days > 0 ? '，剩余 ' + days + ' 天' : '') + '，后续支出需另行安排。';
      }
      return '✅ 记好啦！' + amt + ' 块的' + note + '。这月预算见底了，接下来几天咱先省着点，行吗？';
    }

    /* 剩余额度撑不到月底：给「去食堂」的具体动作，不空喊省钱 */
    if (days > 0 && perDay < 30) {
      if (t === 'strict') {
        return '记上了，' + amt + ' 块的' + note + '。剩 ' + fmtNum(left) + ' 撑 ' +
          days + ' 天' + dayLine + '，食堂够，别点外卖。';
      }
      if (t === 'rational') {
        return '已入账：' + note + ' ' + amt + ' 元。剩余 ' + fmtNum(left) + ' 元 / ' +
          days + ' 天，日均 ' + fmtNum(perDay) + ' 元，食堂一荤一素可覆盖。';
      }
      return '✅ 记好啦！' + amt + ' 块的' + note + '很标准嘛。不过剩下的 ' +
        fmtNum(left) + ' 要撑 ' + days + ' 天，接下来几天咱们多去食堂吃吃一荤一素，' +
        '把预算留给周末的火锅怎么样？🍲';
    }

    /* 正常：轻松收尾（教练档也别夸成「真棒」，给个可执行的节奏就够） */
    if (t === 'strict') {
      return '记上了，' + amt + ' 块的' + note + '。剩 ' + fmtNum(left) +
        (days > 0 ? '，还有 ' + days + ' 天' : '') + dayLine + '，稳住。';
    }
    if (t === 'rational') {
      return '已入账：' + note + ' ' + amt + ' 元。本周期剩余 ' + fmtNum(left) + ' 元' +
        (days > 0 ? '（' + days + ' 天，日均 ' + fmtNum(perDay) + ' 元）' : '') + '，节奏正常。';
    }
    return '✅ 记好啦！' + amt + ' 块的' + note + '很标准嘛。这月生活费还剩 ' +
      fmtNum(left) + (days > 0 ? '（还有 ' + days + ' 天）' : '') +
      '，节奏不错，继续保持～';
  }

  /* ---------------------------------------------------------------- */
  /* 四、模式三：情绪树洞                                              */
  /* ---------------------------------------------------------------- */

  /**
   * 三套树洞文案，按语言风格分。
   *
   * 共同底线：都不算账、不指责人格、不追问金额。
   * 区别只在「接情绪的方式」：
   *   gentle  —— 先抱一下，允许关心；
   *   strict  —— 接一句就收住，立刻给一个硬动作（去睡 / 明天看账），不哄；
   *   rational—— 承认事实，把情绪和账分开，不煽情、不给空头安慰。
   */
  var COMFORT = {
    gentle: [
      '摸摸头，别自责啦。谁都有压力大、控制不住手的时候。既然已经买了，咱们就开开心心地享受它。' +
        '实在焦虑的话，明天我陪你一起把账理一理，看看能不能从别的地方省一点补回来，好不好？🫂',
      '先抱一下。人累的时候就是容易乱花钱，这不代表你「废」。等这阵情绪过去，咱们再慢慢看账，不急。🫂',
      '别骂自己啦。钱已经花了，自责也换不回来。今晚先好好睡一觉，明天咱们一起想办法补上，好吗？🫂'
    ],
    strict: [
      '哭完了就去睡，钱回不来。明天把这笔账翻出来，看下个月从哪儿扣回来。',
      '情绪归情绪，事归事。这笔已经花了，现在能做的是别再花第二笔。',
      '别骂自己，骂完账还是那个账。今晚到这儿，明天把预算重排一遍。'
    ],
    rational: [
      '这笔支出已发生，无法回滚。情绪与账目分开看：先承认事实，再定下个月的额度。',
      '沉没成本不影响后续决策，能调的只有剩余额度。今晚不必再看账，明天用五分钟重排预算。',
      '非必需支出上升时，情绪波动是常见诱因。先把这笔归到「想要」，再决定要不要给它设上限。'
    ]
  };

  /** 危机兜底：先确认「我在」，再轻轻建议找人说，绝不算账。
   *  **这一句不随语言风格变化** —— 用户选了「铁面教练」也不该在危机句上变冷。
   *  风格是排版语气，不是把人推开的理由；真要压缩，只能压缩前半句，不能删「找人聊聊」。 */
  var CRISIS_LINE = '我在的，先别一个人扛，深呼吸一下。要是这种撑不住的感觉已经很久了，' +
    '找个信得过的人聊聊，或者去学校心理中心坐坐，真的不丢人。钱的事，咱们以后再说。🫂';

  /**
   * 愿望型文案：接住「想去」，然后立刻给一条能往下走的路。
   *
   * 三条都必须含「拆成三笔 / 算总数」这类动作 —— 用户的原话是
   * 「这说完也要分析呀」：只安慰等于没说。但也只给方向、不报数：
   * 北京往返多少、住几晚，本地没有实时票价，编一个数字比不给更坏。
   * 真要报数，交给云端 / 攒钱目标面板去查。
   */
  var WISH_LINES = {
    gentle: [
      '想去就去，值得。先别急着否定自己 —— 把这趟的硬成本摸出来：来回车票、住几晚、门票，' +
        '三笔一加就知道要攒多久。',
      '这愿望挺好的。先给它一个数字：车票 + 住宿 + 门票，估出来心里才有底，' +
        '也才知道是攒两个月还是半年。',
      '想去的地方，值得认真算一次。把它拆成三笔（交通 / 住宿 / 门票），算清总数再定时间，比干想着强。'
    ],
    strict: [
      '想去就查价：车票、住宿、门票，三笔加总。数出来再谈走不走。',
      '愿望留着，成本先摆出来：车票、住宿、门票。估不出总数，就别先订票。',
      '别光想。车票、住宿、门票先算清，再定时间。'
    ],
    rational: [
      '出行成本 = 往返交通 + 住宿 × 晚数 + 门票餐饮。先估总数，再对照本周期可支配结余。',
      '建议先做预算再决策：交通、住宿、门票约占四三三，按目的地取价后与结余比对。',
      '这类属可选消费，先算出交通、住宿、门票的总额，再单列「旅行」额度按月存。'
    ]
  };

  /**
   * 想买型愿望：拆的是「本体 / 配件 / 维修」，还要问一句「现役那台还能撑多久」。
   * 每种风格只给两条 —— 买这件事本来就该短，说多了像在劝退。
   */
  var WISH_BUY_LINES = {
    gentle: [
      '想买就先别急着下单。把这笔拆开看：本体多少、配件多少、坏了修一次多少 —— ' +
        '三笔清楚，才分得清是「想要」还是「真需要」。',
      '这个念头先留着。看一眼手上那台还能用多久，再算总价：能用就先别换，真卡了再换也不迟。'
    ],
    strict: [
      '想买就先写三条：本体价、配件价、修一次的价。写不出来，说明还没想清楚。',
      '先看手上那台还能不能撑。撑得住就别换。'
    ],
    rational: [
      '先算总拥有成本：本体 + 配件 + 保修维修。再对照日均使用频次，低于每天一次就该重新评估。',
      '建议按「现役设备剩余寿命」判断：还能用多久，决定这次是升级还是重复消费。'
    ]
  };

  /**
   * 语气判定：愿望句要不要用愿望文案。
   * 带「后悔 / 没用」的不算 —— 「想去旅游但钱花光了，好后悔」主体仍是后悔，先安慰。
   */
  function isWish(raw) {
    var t = String(raw == null ? '' : raw);
    return (WISH_GO.test(t) || WISH_BUY.test(t)) && !REGRET.test(t);
  }

  /**
   * 情绪树洞文案：极短、先接情绪。
   * 命中选择靠 raw 的哈希，同一句话稳定、不同话有变化（不随机、可测）；
   * 三种风格用同一个下标 —— 换风格只换口吻，不会「同一句话换个语气就换了个意思」。
   *
   * 分型：危机 → 兜底；想去 / 想买 → 接住 + 给方向；其余 → 安慰。
   *
   * @param {Object} [ctx] {raw, tone}
   * @return {string}
   */
  function comfort(ctx) {
    var c = ctx || {};
    var raw = String(c.raw || '');
    if (CRISIS.test(raw)) { return CRISIS_LINE; }
    var t = normTone(c.tone);
    var pool;
    if (isWish(raw)) {
      pool = WISH_BUY.test(raw) ? WISH_BUY_LINES[t] : WISH_LINES[t];
    } else {
      pool = COMFORT[t];
    }
    pool = pool || COMFORT.gentle;
    return pool[hash(raw || 'x') % pool.length];
  }

  /* ---------------------------------------------------------------- */
  /* 五、模式二：表头轮换 + 分隔符                                      */
  /* ---------------------------------------------------------------- */

  /**
   * 四套表头：同一件事换不同说法，避免每条回复都长一个样。
   * 每套都保留「透视 / 常识 / 避坑」的语义，只换措辞与 emoji。
   */
  var HEADER_SETS = [
    { persp: '🧮 账单透视', facts: '💡 生存常识', tips: '🫂 避坑指南' },
    { persp: '🔍 拆解一下', facts: '📌 先记住这几条', tips: '⚠️ 别踩这几个坑' },
    { persp: '🧾 算一笔账', facts: '📖 底层逻辑', tips: '🛡️ 怎么防' },
    { persp: '🔎 掰开揉碎', facts: '🎯 关键常识', tips: '🚧 避雷清单' }
  ];

  /**
   * 教练档 / 数据档的表头：同一张卡换一层皮，内容一个字不动。
   *
   * 每种只给两套（温柔学姐给四套）—— 用户既然指定了风格，
   * 「稳定像那个人」比「每条都换个说法」更重要；两套刚好够避免完全复读。
   */
  var TONE_HEADERS = {
    strict: [
      { persp: '📉 账在这儿', facts: '📏 卡住这几条', tips: '🚫 别踩' },
      { persp: '🔢 直接算', facts: '⚠️ 前提', tips: '🛑 坑在这儿' }
    ],
    rational: [
      { persp: '📊 数据口径', facts: '📐 参考区间', tips: '📌 风险提示' },
      { persp: '🧾 明细核算', facts: '📎 依据', tips: '🔺 偏差项' }
    ]
  };

  function hash(s) {
    var str = String(s == null ? '' : s);
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
  }

  /**
   * 按 seed 选一套表头（确定性：同一个场景永远同一套，跨场景各不相同），
   * 再按语言风格换一层皮。
   *
   * 手动锁「拆解」时固定用一套（已挑好的那套），不再轮换：
   * 轮换的前提是「我替你挑」，用户自己挑了还要轮换，反而像没听指令。
   * 三种风格固定的是各自的「第一套」——温柔学姐沿用原来的「🔍 拆解一下」。
   *
   * @param {string} seed 一般传 scene 或 scene+'|'+raw
   * @param {string} [forced] 手动档位
   * @param {string} [tone] gentle / strict / rational（缺省 = gentle）
   * @return {{persp:string, facts:string, tips:string}}
   */
  function headerSet(seed, forced, tone) {
    var t = normTone(tone);
    var pool = (t === 'gentle') ? HEADER_SETS : TONE_HEADERS[t];
    if (normForced(forced) === MODE.BREAKDOWN) {
      return (t === 'gentle') ? HEADER_SETS[1] : pool[0];
    }
    return pool[hash(seed) % pool.length];
  }

  /** `---` 分隔符（用 div 而不是 <hr>，避免被全局 hr 样式影响；读屏忽略） */
  function sep() {
    return '<div class="vo-sep" aria-hidden="true"></div>';
  }

  var API = {
    MODE: MODE,
    MODES: MODES,
    AMOUNT_BIG: AMOUNT_BIG,
    classify: classify,
    isComfort: isComfort,
    normForced: normForced,
    normTone: normTone,
    isWish: isWish,
    modeName: modeName,
    chatBill: chatBill,
    comfort: comfort,
    headerSet: headerSet,
    HEADER_SETS: HEADER_SETS,
    TONE_HEADERS: TONE_HEADERS,
    WISH_LINES: WISH_LINES,
    WISH_BUY_LINES: WISH_BUY_LINES,
    sep: sep,
    hash: hash
  };

  if (isNode) {
    module.exports = API;
  } else {
    global.AJ = global.AJ || {};
    global.AJ.voice = API;
  }
})(typeof window !== 'undefined' ? window : this);
