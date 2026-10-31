#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""_aca_embed.py — 把 理财学院/理财学院.html 同步进 AI记账.html / index.html 的 acaDoc 内嵌块。

背景：学院整页以 <script type="text/plain" id="acaDoc"> 内嵌，主应用用
document.write 把它灌进同源 iframe。块内出现的 </script> 必须转义成 <\\/script>，
否则会提前闭合 text/plain 块；主应用加载时会把 <\\/script 还原（见 data-aca-loader）。

用法:
  python _aca_embed.py           # 同步 AI记账.html 与 index.html
  python _aca_embed.py --check   # 只读核验：两个产物是否已与源文件一致
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, '理财学院', '理财学院.html')
TARGETS = ['AI记账.html', 'index.html']

BLOCK = re.compile(
    r'(<script type="text/plain" id="acaDoc">\n)(.*?)(\n</script>)',
    re.S,
)


def read_src():
    with open(SRC, encoding='utf-8') as f:
        doc = f.read().replace('\r\n', '\n')
    return doc.rstrip('\n') + '\n'


def escaped(doc):
    return doc.replace('</script>', '<\\/script>')


def main():
    check = '--check' in sys.argv
    want = escaped(read_src())

    bad = []
    for name in TARGETS:
        path = os.path.join(ROOT, name)
        with open(path, encoding='utf-8') as f:
            html = f.read()

        m = BLOCK.search(html)
        if not m:
            print('[FAIL] %s: 未找到 acaDoc 块' % name)
            bad.append(name)
            continue

        same = (m.group(2) == want)
        if check:
            print('[%s] %s: %s' % ('OK ' if same else 'DIFF', name,
                                   '已与源文件一致' if same else '需同步（%d vs %d 字节）'
                                   % (len(m.group(2)), len(want))))
            if not same:
                bad.append(name)
        else:
            if same:
                print('[SKIP] %s: 已一致' % name)
                continue
            out = html[:m.start(2)] + want + html[m.end(2):]
            with open(path, 'w', encoding='utf-8') as f:
                f.write(out)
            print('[OK ] %s: 已同步学院内嵌块（%d 字节）' % (name, len(want)))

    if bad:
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
