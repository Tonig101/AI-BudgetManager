#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""_qa_onboard.py — 新手引导真机回归（无头 Chrome，双端两套 UI）。

跑什么：
  desktop  1280x900 → 完整版：欢迎页 → 记账（真打字发送）→ 预算 → 流水/账单分析 →
           心愿单 → 省钱 → 搭子 → 理财专家 → 目标 → 设置 → 全功能地图 → 结束页，
           再到设置里「重新查看」与 Esc 退出。
  mobile   390x844  → 简洁版：同样 9 个页面 + 地图，锚点与文案全换成简洁版元素。

用法：
  python _qa_onboard.py              # 双端都跑
  python _qa_onboard.py --desktop    # 只跑完整版
  python _qa_onboard.py --mobile     # 只跑简洁版
  python _qa_onboard.py --keep       # 保留临时文件，便于看 dump

注意（踩过的坑）：
  1. 必须带 --no-proxy-server：本机 HTTP_PROXY 会劫持 127.0.0.1 让页面假死。
  2. 断言高亮框位置要读 **内联样式**，不能用 getBoundingClientRect：
     --virtual-time-budget 下 Chrome 不推进 CSS 过渡，rect 会一直读到过渡前的值，
     看起来像「高亮框没跟过去」，其实是量具的问题。
  3. 每次跑都用干净的 user-data-dir，否则 localStorage 里已有引导存档，
     首启分支根本不会进。
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__))
MASTER = os.path.join(ROOT, 'AI\u8bb0\u8d26.html')
CHROME_CANDIDATES = [
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
    r'/usr/bin/google-chrome',
    r'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]

CASES = [
    {'name': 'desktop', 'probe': '_ob_probe_desktop.js', 'size': '1280,900'},
    {'name': 'mobile', 'probe': '_ob_probe_mobile.js', 'size': '390,844'},
]


def find_chrome():
    for p in CHROME_CANDIDATES:
        if os.path.exists(p):
            return p
    return None


def file_url(path):
    import urllib.parse
    return 'file:///' + urllib.parse.quote(path.replace('\\', '/'))


def run_case(chrome, case, keep):
    probe_path = os.path.join(ROOT, case['probe'])
    if not os.path.exists(probe_path):
        print('  [%s] 缺少探针 %s' % (case['name'], case['probe']))
        return 1
    master = io.open(MASTER, encoding='utf-8').read()
    probe = io.open(probe_path, encoding='utf-8').read()
    # 临时副本与浏览器配置一律放系统临时目录：项目里只留探针源文件，
    # 否则每次跑都会在仓库里堆几千个 Chrome profile 文件。
    tmp = tempfile.mkdtemp(prefix='qa_onboard_')
    page = os.path.join(tmp, 'page_%s.html' % case['name'])
    io.open(page, 'w', encoding='utf-8', newline='').write(
        master.replace('</body>', '<script>\n' + probe + '\n</script>\n</body>'))

    profile = os.path.join(tmp, 'profile')
    if os.path.isdir(profile):
        shutil.rmtree(profile, ignore_errors=True)
    os.makedirs(profile)

    cmd = [chrome, '--headless=new', '--disable-gpu', '--no-first-run', '--no-proxy-server',
           '--window-size=' + case['size'], '--user-data-dir=' + profile,
           '--virtual-time-budget=35000', '--dump-dom', file_url(page)]
    try:
        out = subprocess.run(cmd, capture_output=True, timeout=180).stdout.decode('utf-8', 'replace')
    except subprocess.TimeoutExpired:
        print('  [%s] Chrome 超时' % case['name'])
        return 1

    m = re.search(r'<pre id="OBRESULT">(.*?)</pre>', out, re.S)
    ok_all = True
    if not m:
        print('  [%s] 没拿到结果（页面可能在初始化阶段就报错）' % case['name'])
        ok_all = False
    else:
        data = json.loads(m.group(1))
        for d in data:
            if not d['ok']:
                ok_all = False
                print('  FAIL  %-24s %s' % (d['n'], d['x']))
        p = sum(1 for d in data if d['ok'])
        print('  [%s] PASS %d / %d' % (case['name'], p, len(data)))

    if not keep:
        shutil.rmtree(tmp, ignore_errors=True)
    else:
        print('  [%s] 临时目录保留：%s' % (case['name'], tmp))
    return 0 if ok_all else 1


def run_unit():
    """onboard.js 的纯逻辑单测（坏存档 / 存储被禁 / 续逛 / 版本升级）"""
    js = r'''
function fresh(){ delete require.cache[require.resolve('./onboard.js')]; return require('./onboard.js'); }
var a=0,f=0; function ok(c,m){ c?a++:(f++,console.log('  FAIL  '+m)); }
global.localStorage = { getItem: function(){ return '{bad json'; }, setItem: function(){} };
var OB = fresh();
if (OB.load().full.status!=='idle') { f++; console.log('  FAIL  坏存档应归一为 idle'); } else { a++; }
global.localStorage = { getItem: function(){ throw new Error('denied'); }, setItem: function(){ throw new Error('denied'); } };
OB = fresh();
try { OB.start('full'); OB.next('full'); } catch(e){ f++; console.log('  FAIL  存储被禁时抛异常'); }
if (OB.isActive('full') && OB.current('full').id==='bill') { a++; } else { f++; console.log('  FAIL  内存兜底失效'); }
var s={}; global.localStorage = { getItem:function(k){return s[k]===undefined?null:s[k];}, setItem:function(k,v){s[k]=v;} };
OB = fresh();
OB.start('full'); OB.next('full'); OB.next('full'); OB.start('full');
if (OB.stepIndex('full')===2) { a++; } else { f++; console.log('  FAIL  续逛被重置'); }
OB.finish('full'); var d1=OB.load().full.doneAt; OB.replay('full');
if (OB.load().full.doneAt===d1 && d1>0) { a++; } else { f++; console.log('  FAIL  replay 清了 doneAt'); }
/* v3：12 屏（欢迎 + 9 个页面步 + 全功能地图 + 结束）+ 版本号 3 */
if (OB.count()===12) { a++; } else { f++; console.log('  FAIL  步骤数应为 12，实际 '+OB.count()); }
if (OB.GUIDE_VERSION===3) { a++; } else { f++; console.log('  FAIL  GUIDE_VERSION 应为 3'); }
/* 每个页面步：两套 UI 都有锚点、都有 3 条以上入口清单（不然就是「没覆盖全功能」） */
var miss=0, thin=0;
for (var i=1;i<OB.count()-1;i++){
  var st=OB.get(i);
  if (st.kind==='map') { continue; }
  if (!OB.anchorOf(st,'full') || !OB.anchorOf(st,'simple')) { miss++; console.log('  FAIL  '+st.id+' 缺锚点'); }
  if (!st.points || st.points.length<3) { thin++; console.log('  FAIL  '+st.id+' 入口清单不足 3 条'); }
}
if (miss===0) { a++; } else { f++; }
if (thin===0) { a++; } else { f++; }
/* 全功能地图：5 个分组、21 个入口、每条要么能跳转要么写清在哪 */
var mp=null;
for (var j=0;j<OB.count();j++){ if (OB.get(j).kind==='map') { mp=OB.get(j); } }
if (mp) { a++; } else { f++; console.log('  FAIL  缺少全功能地图'); }
if (mp && mp.groups.length===5) { a++; } else { f++; console.log('  FAIL  地图分组应为 5'); }
var items=0, bad=0;
if (mp) {
  for (var g=0;g<mp.groups.length;g++){
    for (var k=0;k<mp.groups[g].items.length;k++){
      var it=mp.groups[g].items[k]; items++;
      if (!it.s && !it.n) { bad++; }
      if (it.s) {
        var found=false;
        for (var m=0;m<OB.count();m++){ if (OB.get(m).id===it.s) { found=true; } }
        if (!found) { bad++; console.log('  FAIL  地图跳到不存在的步骤 '+it.s); }
      }
    }
  }
}
if (items===21) { a++; } else { f++; console.log('  FAIL  地图入口应为 21，实际 '+items); }
if (bad===0) { a++; } else { f++; }
console.log('  [logic] PASS '+a+' / '+(a+f));
process.exit(f===0?0:1);
'''
    r = subprocess.run(['node', '-e', js], cwd=ROOT)
    return r.returncode


def main():
    only = None
    if '--desktop' in sys.argv:
        only = 'desktop'
    if '--mobile' in sys.argv:
        only = 'mobile'
    keep = '--keep' in sys.argv

    chrome = find_chrome()
    if not chrome:
        print('找不到 Chrome，跳过真机回归')
        return 1

    print('== 新手引导回归 ==')
    fail = 0
    if '--logic' in sys.argv or only is None:
        fail |= run_unit()
    for case in CASES:
        if only and case['name'] != only:
            continue
        fail |= run_case(chrome, case, keep)
    print('== %s ==' % ('全部通过' if fail == 0 else '有失败项'))
    return 0 if fail == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
