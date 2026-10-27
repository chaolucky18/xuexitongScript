"""字形反混淆的批处理入口：把「页面给的字体 + 乱码文本」变成真字。

调用方式（由 Node 侧 font-bridge.mjs 驱动，不手工使用）：

    python font_decode_cli.py --module <还原题干.py 路径> --input in.json --output out.json

输入 in.json：
    {"font_b64": "<font-cxsecret 的 base64>", "texts": ["乱码题干", "..."]}

输出 out.json：
    {"ok": true, "texts": ["还原后文本", "..."], "uncertain": {"搕": ["表", "麦", "衰"]},
     "codes": 12, "families": ["msyh.ttc", "simhei.ttf", "Noto Sans SC"], "seconds": 5.6}
  或
    {"ok": false, "error": "...", "traceback": "..."}

数据全部来自浏览器里已经加载好的页面，不访问学习通接口、不需要 Cookie。

为什么用文件而不是 stdin/stdout：
    1. Windows 控制台默认代码页是 936，管道里传中文容易变乱码；
    2. 某些沙箱/父进程不允许创建匿名管道，spawn 的 stdio: 'pipe' 会直接 EPERM。
    文件中转两边都用 UTF-8，且不依赖管道。

依赖：numpy / pillow / fontTools（随包的 .venv 里已装好）。
"""
import argparse
import base64
import json
import os
import sys
import time
import traceback

# 结果文件写不进去时（杀软/权限），把这一行打到 stdout 给父进程兜底
RESULT_MARKER = '__CXDECODE_RESULT__'


def load_decoder(module_path):
    """按文件路径导入 还原题干.py，让多进程子进程也能按模块名再导入一次。"""
    import importlib

    directory = os.path.dirname(os.path.abspath(module_path))
    if directory not in sys.path:
        sys.path.insert(0, directory)
    name = os.path.splitext(os.path.basename(module_path))[0]
    return importlib.import_module(name)


def run(payload, module_path):
    font_b64 = payload.get('font_b64') or ''
    texts = payload.get('texts') or []
    if not font_b64:
        raise ValueError('缺少 font_b64')
    if not isinstance(texts, list) or not texts:
        raise ValueError('texts 必须是非空字符串数组')
    if any(not isinstance(text, str) for text in texts):
        raise ValueError('texts 里只能有字符串')

    font_bytes = base64.b64decode(font_b64, validate=True)
    if len(font_bytes) < 100:
        raise ValueError(f'字体太小，不像真字体（{len(font_bytes)} 字节）')

    decoder = load_decoder(module_path)
    families = decoder.build_families()
    if not families:
        raise RuntimeError('没有可用的对比字库（系统字体和 fonts/noto-sans-sc 都不可用）')

    result = decoder.decode_texts(texts, font_bytes, families)
    result['families'] = [family.name for family in families]
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--module', default=os.environ.get('CXXT_DECODER', ''))
    parser.add_argument('--input', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    real_stdout = sys.stdout
    # 还原题干.py 里会 print 进度；统一赶到 stderr，别污染结果
    sys.stdout = sys.stderr
    started = time.time()
    try:
        with open(args.input, encoding='utf-8') as f:
            payload = json.load(f)
        if not args.module:
            raise ValueError('没有指定 --module（还原题干.py 的路径）')
        result = run(payload, args.module)
        result['ok'] = True
    except Exception as exc:  # noqa: BLE001
        result = {
            'ok': False,
            'error': f'{type(exc).__name__}: {exc}',
            'traceback': traceback.format_exc(limit=6),
        }
    result['seconds'] = round(time.time() - started, 2)
    payload = json.dumps(result, ensure_ascii=False)
    try:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(payload)
    except OSError as exc:
        # 杀毒软件 / 权限策略可能禁止 python 往结果文件里写；
        # stdout 是父进程开的句柄，通常不受影响，于是用带标记的一行兜底。
        print(f'写入结果文件失败：{exc}', file=sys.stderr)
        print(RESULT_MARKER + payload, file=real_stdout, flush=True)
    if not result.get('ok'):
        sys.stderr.write(result['traceback'] + '\n')
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
