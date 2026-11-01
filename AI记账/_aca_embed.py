# -*- coding: utf-8 -*-
"""_aca_embed.py — 把「理财学院/理财学院.html」同步进两份单文件产物的 acaDoc 内嵌副本。

为什么必须有这个脚本：index.html / AI记账.html 里各有一份
`<script type="text/plain" id="acaDoc">` 包着的学院页全文（应用内「理财学院」
直接读它渲染，不开新页）。学院页源文件改了之后若不同步，应用里看到的还是旧学院。

用法：
    python _aca_embed.py          # 同步（幂等，重复跑结果一致）
    python _aca_embed.py --check  # 只检查是否一致，不一致则 exit 1（发布前例检用）

块格式（与现存块一致，勿改）：
    <script type="text/plain" id="acaDoc">
    {学院页全文，唯一转义：</script> → <\\/script>}
    </script>
"""
import io
import sys

SRC = "理财学院/理财学院.html"
TARGETS = ["index.html", "AI记账.html"]
OPEN = '<script type="text/plain" id="acaDoc">'
CLOSE = "</script>"
ESC_FROM = "</script>"
ESC_TO = "<\\/script>"


def read(p):
    return io.open(p, encoding="utf-8").read()


def write(p, s):
    io.open(p, "w", encoding="utf-8", newline="").write(s)


def embed(tpl):
    """学院页全文 → acaDoc 内容（唯一允许的转义）"""
    return tpl.replace(ESC_FROM, ESC_TO)


def block_for(tpl):
    return OPEN + "\n" + embed(tpl) + "\n" + CLOSE


def locate(s, path):
    """返回 (块起点, 块终点)；找不到或结构异常都报错，绝不静默跳过"""
    i = s.find(OPEN)
    if i < 0:
        raise SystemExit("ERROR: %s 里找不到 acaDoc 块" % path)
    j = s.find(CLOSE, i + len(OPEN))
    if j < 0:
        raise SystemExit("ERROR: %s 的 acaDoc 块没有闭合" % path)
    return i, j + len(CLOSE)


def main():
    check = "--check" in sys.argv
    tpl = read(SRC)
    if ESC_FROM in tpl.replace(ESC_TO, ESC_FROM) and ESC_TO not in tpl:
        # 模板本身含 </script>（正常，学院页也是 HTML），统一转义
        pass
    blk = block_for(tpl)
    dirty = 0
    for t in TARGETS:
        s = read(t)
        i, j = locate(s, t)
        cur = s[i:j]
        # 取出 <script …> 与 </script> 之间的内容，去转义后与模板比对
        inner = cur[len(OPEN):]
        if inner.startswith("\n"):
            inner = inner[1:]
        if inner.endswith("\n" + CLOSE):
            inner = inner[: -(len(CLOSE) + 1)]
        same = inner.replace(ESC_TO, ESC_FROM) == tpl
        if same:
            print("OK   %s（acaDoc 与学院页一致）" % t)
            continue
        if check:
            print("DIFF %s（acaDoc 落后于学院页，需跑 python _aca_embed.py）" % t)
            dirty += 1
        else:
            s = s[:i] + blk + s[j:]
            write(t, s)
            print("SYNC %s（acaDoc %d → %d 字符）" % (t, len(cur), len(blk)))
    if dirty:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
