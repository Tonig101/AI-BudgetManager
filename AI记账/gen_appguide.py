#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen_appguide.py — 从 理财学院/理财学院.html 抽取 App 教学数据，生成 appguide.js。

为什么要有这个脚本：
  51 条 App 实操要点原本只写死在学院页面里，AI 检索不到（问「淘宝怎么领小样」
  「闲鱼怎么捡漏」只能瞎答）。学院页面是这些内容的唯一真相来源，所以这里做
  **纯文本切片**把它搬成一个模块给 app.js 用，而不是另抄一份——手抄必然漂移。

切片策略（不解析 JS，避免引号/转义踩坑）：
  SAVE_CATS  : 'var SAVE_CATS=[' -> 下一个 '\n];'
  SAVE_APPS  : 'var SAVE_APPS=[' -> 'var SAVE_FAV_KEY='
  SAVE_VIDS  : 'var SAVE_VIDS=[' -> 'var VID_META='

用法:
  python gen_appguide.py           # 生成/更新 appguide.js
  python gen_appguide.py --check   # 只读核验：appguide.js 与学院页面是否一致
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, '理财学院', '理财学院.html')
OUT = os.path.join(ROOT, 'appguide.js')

HEADER = '''/**
 * appguide.js — App 教学指南数据（理财学院「App 教学」Tab 的 17 类 App / 51 条要点）
 *
 * 这些要点原本只活在学院页面里：AI 检索不到，「淘宝怎么领小样」「闲鱼怎么捡漏」
 * 「会员怎么拼最便宜」这类问题只能靠模型瞎猜。本模块把它们搬进 AJ.appguide，
 * 由 app.js 的 AGENT_KB 建成知识卡（type:'guide'），答完还能一键跳到学院对应 App。
 *
 * 【勿手改】内容唯一真相来源是 理财学院/理财学院.html 的 SAVE_CATS / SAVE_APPS / SAVE_VIDS。
 * 改完学院页面后跑 `python gen_appguide.py` 重新生成本文件；
 * `python gen_appguide.py --check` 可核验两者是否已经漂移。
 */
'''


def read_src():
    with io.open(SRC, encoding='utf-8') as f:
        return f.read().replace('\r\n', '\n')


def slice_block(doc, start_pat, end_pat, name):
    """从 start_pat 起切到 end_pat 之前，返回形如 'var X=[...];' 的完整语句。"""
    i = doc.find(start_pat)
    if i < 0:
        raise SystemExit('未找到 %s 的起点：%s' % (name, start_pat))
    j = doc.find(end_pat, i)
    if j < 0:
        raise SystemExit('未找到 %s 的终点：%s' % (name, end_pat))
    seg = doc[i:j]
    # 去掉终点前残留的空行/缩进，保留到最后一个分号
    seg = seg.rstrip()
    if not seg.endswith(';'):
        seg += ';'
    return seg


def build():
    doc = read_src()
    cats = slice_block(doc, 'var SAVE_CATS=[', 'var SAVE_LOGOS=', 'SAVE_CATS')
    apps = slice_block(doc, 'var SAVE_APPS=[', 'var SAVE_FAV_KEY=', 'SAVE_APPS')
    vids = slice_block(doc, 'var SAVE_VIDS=[', 'var VID_META=', 'SAVE_VIDS')
    # 视频块结尾是 '];' 后面紧跟 VID_META，slice 已含 '];'
    parts = [
        HEADER,
        '(function (global) {\n',
        "  'use strict';\n\n",
        '  /* ---- 以下三段由 gen_appguide.py 从学院页面切片，勿手改 ---- */\n',
        cats, '\n\n',
        apps, '\n\n',
        vids, '\n\n',
        '''  /* 统计：卡片与提示词里的数字都从这里取，避免写死 17 / 51 之后忘记同步 */
  var TIP_N = 0, APP_N = SAVE_APPS.length, i;
  for (i = 0; i < SAVE_APPS.length; i++) {
    TIP_N += (SAVE_APPS[i].tips && SAVE_APPS[i].tips.length) || 0;
  }
  var CAT_NAME = {};
  for (i = 0; i < SAVE_CATS.length; i++) { CAT_NAME[SAVE_CATS[i].key] = SAVE_CATS[i].name; }

  var API = {
    CATS: SAVE_CATS, APPS: SAVE_APPS, VIDS: SAVE_VIDS,
    CAT_NAME: CAT_NAME, APP_N: APP_N, TIP_N: TIP_N
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = API;
  } else {
    global.AJ = global.AJ || {};
    global.AJ.appguide = API;
  }
})(typeof window !== 'undefined' ? window : this);
''',
    ]
    return ''.join(parts)


def main():
    check = '--check' in sys.argv
    want = build()
    cur = ''
    if os.path.exists(OUT):
        with io.open(OUT, encoding='utf-8') as f:
            cur = f.read().replace('\r\n', '\n')
    # 统计条数做核验提示（要点只数 SAVE_APPS 段，别把视频入口算进来）
    n_app = len(re.findall(r"\{id:'[a-z_0-9]+',name:", want))
    apps_seg = want[want.find('var SAVE_APPS=['):want.find('var SAVE_VIDS=[')]
    n_tip = len(re.findall(r"\{t:'", apps_seg))
    if check:
        same = cur.strip() == want.strip()
        print('appguide.js：%d 类 App / %d 条要点，与学院页面%s' %
              (n_app, n_tip, '一致' if same else '已漂移（请跑 python gen_appguide.py）'))
        sys.exit(0 if same else 1)
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(want)
    print('GEN appguide.js：%d 类 App / %d 条要点（%d 字符）' % (n_app, n_tip, len(want)))


if __name__ == '__main__':
    main()
