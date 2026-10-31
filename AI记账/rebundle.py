#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""rebundle.py — 把磁盘上的 JS 模块与 styles.css 同步进 AI记账.html / index.html 的内联块。

（原 rebundle.py 丢失后重建。定位策略：HTML 内联块与其磁盘源文件共享很长的
  头注释前缀（头注释基本不变、正文常改），据此把每个块唯一地指派给一个模块；
  指派不上的块（页面自举脚本等）原样保留。）

用法:
  python rebundle.py           # 同步 AI记账.html 并写出一模一样的 index.html
  python rebundle.py --check   # 只读核验：每个模块恰好匹配 1 块且内容一致
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
MODULES = [
    'analysis.js', 'app.js', 'appguide.js', 'billfilter.js', 'cloud-config.js', 'coach.js',
    'data.js', 'deals.js', 'diagnose.js', 'dazai.js', 'engine.js', 'gu.js',
    'intent.js', 'mascot.js', 'nlp.js', 'ocr.js', 'persona.js', 'pet.js',
    'petpro.js', 'piggy.js', 'savings.js', 'savings_data.js',
    'sfx.js', 'tone.js', 'wishlist.js', 'xlsx.js',
]
STYLE_FILE = 'styles.css'
HTML_FILES = ['AI\u8bb0\u8d26.html', 'index.html']  # AI记账.html, index.html
PREFIX_MIN = 40   # 前缀至少这么长才算指派成功


def norm(s):
    return s.replace('\r\n', '\n').strip()


def read(name):
    return io.open(os.path.join(ROOT, name), encoding='utf-8').read().replace('\r\n', '\n')


def prefix_len(a, b, cap=300):
    n = 0
    for x, y in zip(a[:cap], b[:cap]):
        if x != y:
            break
        n += 1
    return n


SELF_DECLARED = re.compile(r'^\s*\*\s*([A-Za-z0-9_\-]+\.js)\s*[\u2014\u00b7]', re.M)


def assign(blocks, sources):
    """解析每块自我声明的标题行「* <name>.js —/·」，映射到源文件。"""
    out = []
    for i, inner in enumerate(blocks):
        head = inner[:400]
        m_ = SELF_DECLARED.search(head)
        name = None
        if m_:
            declared = m_.group(1)
            if declared in sources:
                name = declared
        elif 'WorkBuddy 云服务公开配置' in head:
            name = 'cloud-config.js'
        elif 'AI 校园记账管家 · 全部样式' in head:
            name = 'styles.css'
        out.append((i, name, 0))
    return out


def main():
    check = '--check' in sys.argv
    master = read(HTML_FILES[0])
    sources = {m: read(m) for m in MODULES}
    sources[STYLE_FILE] = read(STYLE_FILE)

    script_blocks = re.findall(r'<script>(.*?)</script>', master, re.S)
    style_blocks = re.findall(r'<style>(.*?)</style>', master, re.S)

    asg_script = assign(script_blocks, sources)
    asg_style = assign(style_blocks, sources)

    report = {m: 'unmatched' for m in sources}
    for _, name, _p in asg_script + asg_style:
        if name:
            report[name] = 'matched'

    def repl_script(m_):
        inner = m_.group(1)
        for i, name, _p in asg_script:
            if name and inner == script_blocks[i]:
                if norm(inner) == norm(sources[name]):
                    return m_.group(0)
                if check:
                    return m_.group(0)
                return '<script>\n' + sources[name].rstrip('\n') + '\n</script>'
        return m_.group(0)

    def repl_style(m_):
        inner = m_.group(1)
        for i, name, _p in asg_style:
            if name == STYLE_FILE and inner == style_blocks[i]:
                if norm(inner) == norm(sources[name]):
                    return m_.group(0)
                if check:
                    return m_.group(0)
                return '<style>\n' + sources[name].rstrip('\n') + '\n</style>'
        return m_.group(0)

    new_html = re.sub(r'<script>(.*?)</script>', repl_script, master, flags=re.S)
    new_html = re.sub(r'<style>(.*?)</style>', repl_style, new_html, flags=re.S)

    # ---- 报告 ----
    stale, bad = [], []
    for name, st in report.items():
        if st == 'unmatched':
            bad.append(name)
    for i, name, _p in asg_script + asg_style:
        if name and norm(script_blocks[i] if i < len(script_blocks) else '') == '':
            pass
    # 逐一比对内容
    for i, name, _p in asg_script:
        if name and norm(script_blocks[i]) != norm(sources[name]):
            stale.append(name if check else name)
    for i, name, _p in asg_style:
        if name and norm(style_blocks[i]) != norm(sources[name]):
            stale.append(name)

    for name in sources:
        if report[name] == 'unmatched':
            print('  %s -> UNMATCHED' % name)
    for name in sorted(set(stale)):
        print('  %s -> %s' % (name, 'STALE' if check else 'SYNCED'))

    if bad:
        print('CHECK FAIL：以下源文件没有唯一匹配块', bad)
        sys.exit(2)

    if check:
        print('只读核验：%s（%d 字符）' % (HTML_FILES[0], len(master)))
        print('CHECK %s %d 模块 + 1 样式，漂移 %d 块'
              % ('PASS' if not stale else 'FAIL', len(sources), len(stale)))
        sys.exit(0 if not stale else 1)

    io.open(os.path.join(ROOT, HTML_FILES[0]), 'w', encoding='utf-8', newline='').write(new_html)
    io.open(os.path.join(ROOT, HTML_FILES[1]), 'w', encoding='utf-8', newline='').write(new_html)
    print('SYNC %d 块已更新，两份 HTML 已写出（%d 字符）' % (len(set(stale)), len(new_html)))


if __name__ == '__main__':
    main()
