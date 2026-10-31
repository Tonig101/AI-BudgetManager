#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""萌宠文案据实更新（2026-10-31）：选宠弹窗顶部 + 三卡小字 + 设置页两行小字。
事实依据：petpro.js / pet.js / mascot.js 模块头注释（功能清单）。
弹窗字符串在 app.js(源) 与 AI记账.html(成品) 各一份；设置页静态行仅在 AI记账.html。
"""
import io

def apply(path, pairs):
    with io.open(path, "r", encoding="utf-8") as f:
        s = f.read()
    ok = True
    for old, new, tag in pairs:
        n = s.count(old)
        if n != 1:
            print("  [WARN %s] %s 命中 %d 次（期望1）" % (path, tag, n)); ok = False
        s = s.replace(old, new)
    with io.open(path, "w", encoding="utf-8") as f:
        f.write(s)
    return ok

TOP_OLD = (
    "      '  <p class=\"pet-pick-sub\">小伙伴住在右下角，记账、存钱、超支时都会回应你。先挑一只，' +\n"
    "      '之后随时能在「设置 · 宠物形象」里更换。</p>' +"
)
TOP_NEW = (
    "      '  <p class=\"pet-pick-sub\">三只小伙伴都住在右下角，记账、存钱时都会动起来回应你，戳戳它还有彩蛋。' +\n"
    "      '先挑一只，之后随时能在「设置 · 宠物形象」里更换。</p>' +"
)

C1_OLD = "      '      <b>阿账</b><small>9 种心情<br>顶部播报预算</small>' +"
C1_NEW = "      '      <b>阿账</b><small>9 态情绪<br>顶部播报预算</small>' +"

C2_OLD = "      '      <b>存钱罐精灵</b><small>6 种表情<br>随手就能拖</small>' +"
C2_NEW = "      '      <b>存钱罐精灵</b><small>6 态表情 · 可拖拽<br>存钱分档动画</small>' +"

C3_OLD = "      '      <b>记账小管家</b><small>自定义形象<br>小猪绕身</small>' +"
C3_NEW = "      '      <b>记账小管家</b><small>自定义形象工坊<br>绕行小猪 · 成就</small>' +"

MODAL_PAIRS = [
    (TOP_OLD, TOP_NEW, "top"),
    (C1_OLD, C1_NEW, "card-azhang"),
    (C2_OLD, C2_NEW, "card-sprite"),
    (C3_OLD, C3_NEW, "card-pro"),
]

S1_OLD = "<small>右下角常驻可拖动的小家伙，记账 / 超支自动变脸</small>"
S1_NEW = "<small>右下角常驻的小伙伴，记账 / 存钱 / 超支都会变脸回应，还能戳一戳</small>"
S2_OLD = "<small>阿账播报预算心情，存钱罐精灵更活泼，记账小管家能自定义形象</small>"
S2_NEW = "<small>阿账播报预算心情；精灵存钱动画分四档；小管家可自定义形象、养小猪拿成就</small>"
SET_PAIRS = [(S1_OLD, S1_NEW, "set-pet-switch"), (S2_OLD, S2_NEW, "set-skin")]

a1 = apply("app.js", MODAL_PAIRS)
a2 = apply("AI记账.html", MODAL_PAIRS + SET_PAIRS)
print("RESULT:", "ALL_OK" if (a1 and a2) else "HAS_WARN")
