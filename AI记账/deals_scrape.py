#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
deals_scrape.py — 真实抓取当当网搜索结果，产出比价数据集。

只做三件事：
  1) 真请求 search.dangdang.com（关键词必须 GBK 编码，UA 伪装 PC 浏览器）
  2) 翻页 1..N 页，逐条解析 标题 / 价格 / 店铺 / 评价数 / 链接 / 图片
  3) 落盘 JSON，带 source / keyword / url / scraped_at 元信息，供前端比价面板直接吃

不生成任何模拟数据：抓不到就返回空，并在 meta 里记录失败原因。
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta

UA = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                   "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"),
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Referer": "https://www.dangdang.com/",
}

CN_TZ = timezone(timedelta(hours=8))

YX_UA = {
    "User-Agent": UA["User-Agent"],
    "Accept": "application/json,text/plain,*/*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Referer": "https://you.163.com/search?keyword=x",
    "X-Requested-With": "XMLHttpRequest",
}

# 常见保温杯品牌词表，用于从标题里识别品牌（识别不到记空，不猜）
BRANDS = ["膳魔师", "THERMOS", "象印", "ZOJIRUSHI", "虎牌", "TIGER", "富光", "哈尔斯",
          "希诺", "希乐", "苏泊尔", "乐扣乐扣", "LOCK&LOCK", "九阳", "物生物", "杯具熊",
          "bablov", "BABLOV", "星巴克", "STANLEY", "斯坦利", "泰福高", "虎象", "欧橡",
          "金灶", "特百惠", "Tupperware", "小米", "米家", "格亚", "格非尔", "恩尔美"]


def fetch_yx(keyword, page=1, timeout=20):
    """请求网易严选搜索 JSON 接口（you.163.com，综合电商，搜手机返回真手机）。

    返回 (请求url, 商品list原始dict)。接口免登录、UTF-8、直接吐 JSON。
    """
    q = urllib.parse.quote(keyword)
    url = ("https://you.163.com/xhr/search/search.json?keyword=%s&page=%d&style=json"
           % (q, page))
    req = urllib.request.Request(url, headers=YX_UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = json.loads(r.read().decode("utf-8", "ignore"))
    if not isinstance(data, dict) or data.get("code") != "200":
        raise RuntimeError("严选接口返回异常: %s" % str(data)[:120])
    direct = (data.get("data") or {}).get("directly") or {}
    res = (direct.get("searcherResult") or {}).get("result") or []
    return url, res


def parse_yx(raw_items):
    """把严选 JSON 商品行折算成统一字段（与当当解析同一形状）。"""
    out = []
    for it in raw_items:
        name = (it.get("name") or "").strip()
        price = it.get("retailPrice")
        try:
            price = round(float(price), 2)
        except (TypeError, ValueError):
            continue
        if not name or price <= 0 or it.get("soldOut") or it.get("underShelf"):
            continue
        sku = str(it.get("primarySkuId") or it.get("id") or "")
        counter = it.get("counterPrice")
        try:
            counter = round(float(counter), 2) if counter else None
        except (TypeError, ValueError):
            counter = None
        sv = it.get("sellVolume")
        try:
            sv = int(sv) if sv is not None and str(sv) != "" else None
        except (TypeError, ValueError):
            sv = None
        out.append({
            "sku": sku,
            "title": name,
            "price": price,
            "original": counter,  # 划线原价（严选特有，当当没有就置 None）
            "shop": "网易严选",
            "brand": "",
            "reviews": sv,
            "reviews_label": "销量",  # 前端显示"N 销量"而不是"N 条评价"
            "url": ("https://you.163.com/item/detail?itemId=" + sku) if sku else "",
            "image": "",
            "page": None,
        })
    return out


def fetch(keyword, page=1, timeout=25):
    """请求当当搜索页；关键词按 GBK 编码（当当搜索接口是 GBK）。"""
    q = urllib.parse.quote(keyword.encode("gbk"))
    # 当当翻页参数是 page_index（第 2 页起带 page_index=2），不是 page
    url = ("https://search.dangdang.com/?key=%s&act=input&page_index=%d" % (q, page))
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read()
    # 当当返回 GB2312/GBK
    return url, raw.decode("gbk", "ignore")


def _txt(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def parse_items(html):
    """按 <p class="price"> 切块 —— 每个商品自带一块，避免相邻商品串数据。"""
    chunks = re.split(r'<p class="price"', html)[1:]
    out = []
    for c in chunks:
        m_title = re.search(r'<p class="name" name="title" ><a title="([^"]*)"', c)
        if not m_title:
            continue
        m_price = re.search(r'<span class="price_n">\s*(?:&yen;|¥)?\s*([\d.]+)\s*</span>', c)
        if not m_price:
            continue
        m_href = re.search(r'name="title" ><a title="[^"]*" href="([^"]*)"', c)
        m_rev = re.search(r'>\s*(\d+)\s*条评论', c)
        m_shop = re.search(r'name="itemlist-shop-name"[^>]*title="([^"]*)"', c)
        m_img = re.search(r'<img[^>]*data-original="([^"]*)"', c)
        title = _txt(m_title.group(1))
        href = (m_href.group(1) if m_href else "").strip()
        if href.startswith("//"):
            href = "https:" + href
        m_sku = re.search(r'/product\.dangdang\.com/(\d+)\.html', href)
        brand = ""
        for b in BRANDS:
            if b.lower() in title.lower():
                brand = b.upper() if b.isascii() else b
                break
        out.append({
            "sku": m_sku.group(1) if m_sku else "",
            "title": title,
            "price": float(m_price.group(1)),
            "shop": _txt(m_shop.group(1)) if m_shop else "",
            "brand": brand,
            "reviews": int(m_rev.group(1)) if m_rev else None,
            "url": href,
            "image": ("https:" + m_img.group(1)) if m_img and m_img.group(1).startswith("//") else (m_img.group(1) if m_img else ""),
            "page": None,
        })
    return out


def capacity_ml(title):
    """从标题抠容量，用于单价折算（每 100ml 多少钱）。抠不到返回 0。"""
    m = re.search(r'(\d{3,4})\s*(?:ml|ML|毫升)', title)
    if m:
        return int(m.group(1))
    m = re.search(r'(\d(?:\.\d)?)\s*(?:L|l|升)(?![a-zA-Z])', title)
    if m:
        return int(float(m.group(1)) * 1000)
    return 0


def facets(title):
    """从标题里抽可比对规格：材质 / 人群 / 主功能。抽不到就标「未知」，绝不瞎猜。"""
    if "316" in title:
        material = "316不锈钢"
    elif "304" in title:
        material = "304不锈钢"
    else:
        material = "材质未标注"
    if re.search(r'儿童|宝宝|婴儿|幼儿园|学生|女童|男童|小孩', title):
        target = "儿童"
    elif re.search(r'男士|女士|商务|办公|车载|成人', title):
        target = "成人"
    else:
        target = "通用"
    feats = []
    for kw, name in (("显温", "智能显温"), ("茶水分离", "茶水分离"), ("吸管", "吸管杯"),
                     ("弹跳", "弹跳盖"), ("大肚", "大肚杯"), ("泡茶", "泡茶杯"),
                     ("直饮", "直饮"), ("大容量", "大容量")):
        if kw in title:
            feats.append(name)
    return {"material": material, "target": target, "feature": feats[:2]}


def _finish(meta, items, want=8):
    """去重 + 过滤 + 排序 + 统计，两个源共用。"""
    seen, uniq = set(), []
    for it in items:
        key = it["sku"] or it["title"]
        if key in seen:
            continue
        seen.add(key)
        it["capacity_ml"] = capacity_ml(it["title"])
        it.update(facets(it["title"]))
        it.pop("image", None)  # 不存外链图片，页面内零外链
        if it["capacity_ml"]:
            it["unit_price_per_100ml"] = round(it["price"] / it["capacity_ml"] * 100, 2)
        uniq.append(it)
    meta["total_parsed"] = len(uniq)
    # 相关性：严选的结果是平台搜索直接给的，保留原顺序即相关；当当要按标题过滤蹭词结果
    if meta["source"] == "当当网":
        kw_core = keyword = meta["keyword"].strip()
        rel = [i for i in uniq
               if kw_core in i["title"] and "杂志" not in i["title"] and "期刊" not in i["title"]
               and i["price"] > 0 and i["reviews"] is not None and i["shop"]]
    else:
        rel = [i for i in uniq if i["price"] > 0 and i["shop"]]
    meta["relevant"] = len(rel)
    # 销量/评价多的更可信，同分按价格升序
    rel.sort(key=lambda x: (-(x["reviews"] or 0), x["price"]))
    picked = rel[:want]
    prices = [i["price"] for i in picked]
    if prices:
        meta["price_range"] = [min(prices), max(prices)]
        meta["price_median"] = round(sorted(prices)[len(prices) // 2], 2)
    shops = {}
    for i in picked:
        shops[i["shop"]] = shops.get(i["shop"], 0) + 1
    meta["picked"] = len(picked)
    meta["shop_count"] = len(shops)
    return {"meta": meta, "items": picked}


def _new_meta(keyword):
    return {
        "source": "",
        "source_host": "",
        "keyword": keyword,
        "scraped_at": datetime.now(CN_TZ).strftime("%Y-%m-%d %H:%M:%S"),
        "scraped_at_iso": datetime.now(CN_TZ).isoformat(timespec="seconds"),
        "pages_scraped": [],
        "page_urls": [],
        "errors": [],
    }


def _scrape_yx(keyword, pages=(1, 2), want=8):
    """网易严选（you.163.com）：综合电商 JSON 接口，免登录，搜手机返回真手机。"""
    meta = _new_meta(keyword)
    meta["source"] = "网易严选"
    meta["source_host"] = "you.163.com"
    items = []
    for p in pages:
        try:
            url, raw = fetch_yx(keyword, p)
        except Exception as e:  # 网络/接口失败要如实记录，不编数据
            meta["errors"].append({"page": p, "error": "%s: %s" % (type(e).__name__, e)})
            continue
        got = parse_yx(raw)
        meta["pages_scraped"].append({"page": p, "parsed": len(got)})
        meta["page_urls"].append(url)
        for it in got:
            it["page"] = p
            items.append(it)
        time.sleep(1.0)  # 对站点友好，别打满
    return _finish(meta, items, want)


def _scrape_dangdang(keyword, pages=(1, 2), want=8):
    """当当网（search.dangdang.com）：备源，书店属性强，搜数码可能全是书。"""
    meta = _new_meta(keyword)
    meta["source"] = "当当网"
    meta["source_host"] = "search.dangdang.com"
    items = []
    for p in pages:
        try:
            url, html = fetch(keyword, p)
        except Exception as e:
            meta["errors"].append({"page": p, "error": "%s: %s" % (type(e).__name__, e)})
            continue
        got = parse_items(html)
        meta["pages_scraped"].append({"page": p, "parsed": len(got)})
        meta["page_urls"].append(url)
        for it in got:
            it["page"] = p
            items.append(it)
        time.sleep(1.2)
    return _finish(meta, items, want)


def scrape(keyword, pages=(1, 2), want=8):
    """主源网易严选（综合电商），抓不到相关商品再降级当当搜索页。"""
    data = _scrape_yx(keyword, pages, want)
    if data["items"]:
        return data
    fb = _scrape_dangdang(keyword, pages, want)
    if fb is not None:
        reason = "; ".join(str(e.get("error", "")) for e in data["meta"]["errors"]) or "严选没返回相关商品"
        fb["meta"]["errors"].append({"page": "fallback", "error": "网易严选没抓到（%s），已降级用当当" % reason[:120]})
        fb["meta"]["fallback"] = True
    return fb


if __name__ == "__main__":
    kw = sys.argv[1] if len(sys.argv) > 1 else "保温杯"
    out = sys.argv[2] if len(sys.argv) > 2 else "deals_real.json"
    data = scrape(kw)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    m = data["meta"]
    print("[meta]", m["source"], m["keyword"], m["scraped_at"], "pages:", m["pages_scraped"], "errors:", m["errors"])
    print("[picked]", len(data["items"]))
    for i in data["items"]:
        print("  ¥%-8s %-38s %-14s %s条" % (i["price"], i["title"][:36], i["shop"][:12], i["reviews"]))
