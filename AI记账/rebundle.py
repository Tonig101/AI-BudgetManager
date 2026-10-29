# -*- coding: utf-8 -*-
"""
rebundle.py — 把根目录的外部 JS 模块和 styles.css 重新内联进打包单文件「AI记账.html」。

背景：官方 bundle_once.py 依赖已丢失的 AI记账.src.html 模板，无法运行；
本脚本直接以现有打包产物为基底，按固定块序替换各 <script> 内联块，
并把「最长的那个 <style> 块」替换为 styles.css 的最新内容。

块 0 是「防闪主题」内联小脚本，永远原样保留；块 16 是 cloud-config.js
（由云服务生成的公开配置文件，同样从磁盘读取覆盖）。

用法：
  python rebundle.py            重新打包（会写盘，并备份上一版）
  python rebundle.py --check    只读核验：比对产物与源文件是否一致，不写盘

⚠️ 注意：样式曾经漏打包过一次（脚本只回填了 <script>），
   导致改了 styles.css 但页面没变化。所以这里必须两块都管。
"""
import io
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PACKED = os.path.join(HERE, 'AI记账.html')
BACKUP = os.path.join(HERE, 'AI记账.html.bak-rebundle')
STYLE_SRC = os.path.join(HERE, 'styles.css')

# 静态托管的默认文档是 index.html（访问 / 时取它）。线上曾因此长期返回 10-23 的旧骨架页，
# 所以每次打包都把产物同步一份到 index.html，保证分享链接根路径就是最新版。
INDEX = os.path.join(HERE, 'index.html')

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
STYLE_PATTERN = re.compile(r'(<style\b[^>]*>)(.*?)(</style>)', re.S)


def main():
    check_only = '--check' in sys.argv

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

    # ---- 样式块：取内容最长的那块当主样式（其余两个是防闪/局部小样式，不动）----
    style_changed = False
    css = ''
    if os.path.exists(STYLE_SRC):
        with io.open(STYLE_SRC, encoding='utf-8') as f:
            css = f.read()
        spans = list(STYLE_PATTERN.finditer(new_html))
        if spans:
            target = max(spans, key=lambda m: len(m.group(2)))
            if css.rstrip() != target.group(2).rstrip():
                style_changed = True
                new_html = (new_html[:target.start()] + target.group(1) + css +
                            target.group(3) + new_html[target.end():])
            print('主样式块: 第 %d 块, 产物 %d 字节 / styles.css %d 字节'
                  % (spans.index(target), len(target.group(2)), len(css)))
    else:
        print('警告：找不到 styles.css，样式块原样保留')

    total = len(updated) + (1 if style_changed else 0)

    if check_only:
        print('只读核验：%s（%d 字节）' % (os.path.basename(PACKED), os.path.getsize(PACKED)))
        index_stale = (not os.path.exists(INDEX)) or \
                      (os.path.getsize(INDEX) != os.path.getsize(PACKED))
        if index_stale:
            print('CHECK FAIL —— 入口副本 index.html 与产物不一致（静态托管的 / 会返回旧版）')
        if total or index_stale:
            if total:
                print('CHECK FAIL —— 产物落后于源文件：%s%s'
                      % (', '.join(updated) if updated else '(js 无差异)',
                         ' · styles.css' if style_changed else ''))
            sys.exit(2)
        print('CHECK PASS %d 块（<script> %d + <style> 1）—— 与磁盘源文件一致'
              % (len(LOCAL_JS) + 2, len(LOCAL_JS) + 1))
        return

    shutil.copyfile(PACKED, BACKUP)
    with io.open(PACKED, 'w', encoding='utf-8', newline='') as f:
        f.write(new_html)

    shutil.copyfile(PACKED, INDEX)   # 静态托管默认文档同步（保证 / 就是最新版）

    size_kb = os.path.getsize(PACKED) / 1024.0
    print('内联块：<script> %d 个（含 1 个防闪内联脚本）/ <style> 1 个' % (len(LOCAL_JS) + 1))
    print('本次更新: %d 块 -> %s'
          % (total, ', '.join(updated + (['styles.css'] if style_changed else [])) or '(无)'))
    print('备份: %s' % os.path.basename(BACKUP))
    print('文件大小: %.2f KB' % size_kb)


if __name__ == '__main__':
    main()
