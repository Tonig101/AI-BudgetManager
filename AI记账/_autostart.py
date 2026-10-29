# -*- coding: utf-8 -*-
"""静默启动器 —— 由 Windows 计划任务在登录时调用。

为什么不直接跑 deals_api.py：
  · 用 python.exe 会常驻一个黑窗口，用户会关掉它
  · 用 pythonw.exe 没有控制台，但 sys.stdout/stderr 是 None，
    uvicorn 写日志时会抛异常直接退出

所以这里先把标准输出接管到 backend.log，再以 __main__ 方式运行 deals_api.py，
既不起窗口，也不会因为日志写不出去而挂掉。
"""
import os
import sys
import urllib.request
import runpy

_DIR = os.path.dirname(os.path.abspath(__file__))
_LOG = os.path.join(_DIR, 'backend.log')
_PORT = os.environ.get('DEALS_API_PORT', '8010')

# pythonw 下这两个是 None；uvicorn / logging 只要碰到 None 就会炸
try:
    _log = open(_LOG, 'a', encoding='utf-8', buffering=1)
    sys.stdout = _log
    sys.stderr = _log
except Exception:
    pass


def _already_running():
    """已经有实例在跑就别抢端口，否则 uvicorn 会 bind 失败直接退出。"""
    try:
        with urllib.request.urlopen('http://127.0.0.1:%s/api/health' % _PORT, timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def main():
    if _already_running():
        print('[autostart] 后端已在运行，跳过本次启动')
        return 0

    print('\n[autostart] %s 启动比价后端，端口 %s' % (
        __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S'), _PORT))

    target = os.path.join(_DIR, 'deals_api.py')
    os.chdir(_DIR)
    sys.argv = [target, '--port', str(_PORT)]
    runpy.run_path(target, run_name='__main__')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(1)
