#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""_aca_embed.py — 把 理财学院/理财学院.html 同步进 AI记账.html / index.html 的 acaDoc 块。

单文件架构下，学院页不是外链 iframe，而是以 `<script type="text/plain" id="acaDoc">`
的形式整页内嵌，再由启动脚本塞进 iframe 的 srcdoc。所以学院页一改，两个产物里的
acaDoc 就必须跟着重写，否则应用内看到的还是旧学院。

（本脚本原文件曾丢失，按 index.html 现存的块格式重建。）

唯一需要的转义：内嵌 HTML 里的 `</script>` 必须写成 `<\\/script>`，
否则 HTML 解析器会在那里提前结束 script 标签。

用法:
  python _aca_embed.py           # 同步两份产物
  python _aca_embed.py --check   # 只读核验，漂移时退出码 1
"""
import io
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, '理财学院', '理财学院.html')
HTML_FILES = ['AI\u8bb0\u8d26.html', 'index.html']  # AI记账.html, index.html
OPEN_TAG = '<script type="text/plain" id="acaDoc">'
CLOSE_TAG = '</script>'


def read(name):
    return io.open(name, encoding='utf-8').read().replace('\r\n', '\n')


def payload():
    """学院源文件 → 可直接放进 acaDoc 的文本（前后各留一个换行，与原格式一致）。"""
    src = read(SRC)
    if not src.endswith('\n'):
        src += '\n'
    return '\n' + src.replace('</script>', '<\\/script>') + '\n'


def locate(html):
    i = html.find(OPEN_TAG)
    if i < 0:
        return None
    start = i + len(OPEN_TAG)
    end = html.find(CLOSE_TAG, start)
    if end < 0:
        return None
    return start, end


def main():
    check = '--check' in sys.argv
    want = payload()
    bad = 0
    for name in HTML_FILES:
        path = os.path.join(ROOT, name)
        if not os.path.exists(path):
            print('[MISS] %s 不存在' % name)
            bad += 1
            continue
        html = read(path)
        pos = locate(html)
        if pos is None:
            print('[FAIL] %s 找不到 acaDoc 块' % name)
            bad += 1
            continue
        start, end = pos
        cur = html[start:end]
        if cur == want:
            print('[OK  ] %s: 已与源文件一致（%d 字符）' % (name, len(want)))
            continue
        if check:
            print('[DRIFT] %s: acaDoc 与学院源文件不一致（现 %d / 应 %d 字符）'
                  % (name, len(cur), len(want)))
            bad += 1
            continue
        io.open(path, 'w', encoding='utf-8', newline='\n').write(html[:start] + want + html[end:])
        print('[SYNC] %s: acaDoc 已更新（%d 字符）' % (name, len(want)))
    if check:
        print('CHECK %s' % ('PASS' if bad == 0 else 'FAIL（%d 处漂移）' % bad))
    else:
        print('DONE %s' % ('OK' if bad == 0 else '（%d 处失败）' % bad))
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
