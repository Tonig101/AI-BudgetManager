# -*- coding: utf-8 -*-
"""
rebundle.py — 把根目录的外部 JS 模块重新内联进打包单文件「AI记账.html」。

背景：官方 bundle_once.py 依赖已丢失的 AI记账.src.html 模板，无法运行；
本脚本直接以现有打包产物为基底，按固定块序替换各 <script> 内联块。
块 0 是「防闪主题」内联小脚本，永远原样保留；块 16 是 cloud-config.js
（由云服务生成的公开配置文件，同样从磁盘读取覆盖）。

用法：python rebundle.py
"""
import io
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACKED = os.path.join(HERE, 'AI记账.html')
BACKUP = os.path.join(HERE, 'AI记账.html.bak-rebundle')

# 内联块顺序（索引 0 为防闪内联脚本，不在此列表内）
LOCAL_JS = [
    'data.js',        # 1
    'nlp.js',         # 2
    'engine.js',      # 3
    'coach.js',       # 4
    'tone.js',        # 5
    'deals.js',       # 6
    'savings_data.js',# 7
    'savings.js',     # 8
    'piggy.js',       # 9
    'gu.js',          # 10
    'wishlist.js',    # 11
    'diagnose.js',    # 12
    'analysis.js',    # 13
    'ocr.js',         # 14
    'intent.js',      # 15
    'cloud-config.js',# 16
    'mascot.js',      # 17
    'sfx.js',         # 18
    'pet.js',         # 19
    'petpro.js',      # 20
    'persona.js',     # 21
    'billfilter.js',  # 22
    'xlsx.js',        # 23
    'dazai.js',       # 24
    'app.js',         # 25
]

# 匹配所有 <script ...> 块；repl() 只回填「无属性 <script>」的 JS 模块块，
# 带属性的块（如页尾理财学院嵌入层 <script type="text/plain" id="acaDoc">、
# <script data-aca-loader>）原样保留、不计数。
PATTERN = re.compile(r'(<script\b[^>]*>)(.*?)(</script>)', re.S)


def main():
    if not os.path.exists(PACKED):
        print('找不到打包文件:', PACKED)
        sys.exit(1)

    with io.open(PACKED, encoding='utf-8') as f:
        html = f.read()

    blocks = PATTERN.findall(html)
    plain = [b for b in blocks if b[0] == '<script>']
    if len(plain) != len(LOCAL_JS) + 1:
        print('普通 <script> 块数不符: 实际 %d 个, 预期 %d 个 —— 中止，请核对 LOCAL_JS 顺序'
              % (len(plain), len(LOCAL_JS) + 1))
        sys.exit(1)

    shutil.copyfile(PACKED, BACKUP)

    counter = {'i': 0}
    updated = []

    def repl(m):
        if m.group(1) != '<script>':
            return m.group(0)  # 带属性的脚本块（嵌入层模板/加载器）原样保留
        i = counter['i']
        counter['i'] += 1
        if i == 0:
            return m.group(0)  # 防闪内联脚本，原样保留
        if i > len(LOCAL_JS):
            return m.group(0)  # 超出模块表的普通内联块，原样保留
        name = LOCAL_JS[i - 1]
        path = os.path.join(HERE, name)
        if not os.path.exists(path):
            print('缺少源文件:', name, '—— 该块原样保留')
            return m.group(0)
        with io.open(path, encoding='utf-8') as f:
            src = f.read()
        if src.rstrip() != m.group(2).rstrip():
            updated.append(name)
        return m.group(1) + src + m.group(3)

    new_html = PATTERN.sub(repl, html)

    with io.open(PACKED, 'w', encoding='utf-8', newline='') as f:
        f.write(new_html)

    size_kb = os.path.getsize(PACKED) / 1024.0
    print('内联 JS 块: %d 个 (含 1 个防闪内联脚本)' % (len(LOCAL_JS) + 1))
    print('本次更新: %d 块 -> %s' % (len(updated), ', '.join(updated) if updated else '(无)'))
    print('备份: %s' % os.path.basename(BACKUP))
    print('文件大小: %.2f KB' % size_kb)


if __name__ == '__main__':
    main()
