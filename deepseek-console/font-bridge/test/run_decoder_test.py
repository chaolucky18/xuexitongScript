"""用 fixture.json 跑一次 CLI，逐字对比还原结果。

用文件而不是管道传递参数：Windows 控制台代码页是 936，管道里的中文会乱；
而且某些沙箱禁止创建匿名管道。
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
CLI = os.path.join(os.path.dirname(HERE), 'font_decode_cli.py')
DECODER = os.path.join(os.path.dirname(os.path.dirname(HERE)), '还原题干.py')


def main():
    with open(os.path.join(HERE, 'fixture.json'), encoding='utf-8') as f:
        fixture = json.load(f)

    work = tempfile.mkdtemp(prefix='fonttest-')
    in_path = os.path.join(work, 'in.json')
    out_path = os.path.join(work, 'out.json')
    with open(in_path, 'w', encoding='utf-8') as f:
        json.dump({'font_b64': fixture['font_b64'], 'texts': fixture['texts']}, f, ensure_ascii=False)

    proc = subprocess.run(
        [sys.executable, CLI, '--module', DECODER, '--input', in_path, '--output', out_path],
        capture_output=True,
    )
    if not os.path.exists(out_path):
        print('CLI 没有产出结果文件，退出码', proc.returncode)
        print(proc.stderr.decode('utf-8', 'replace')[-3000:])
        return 1
    with open(out_path, encoding='utf-8') as f:
        result = json.load(f)

    if not result.get('ok'):
        print('解码失败：', result.get('error'))
        print(result.get('traceback', ''))
        return 1

    expected = fixture['expected']
    got = result['texts']
    bad = 0
    for want, have in zip(expected, got):
        mark = 'OK ' if want == have else 'DIFF'
        if want != have:
            bad += 1
            print(f'[{mark}] 期望 {want!r}')
            print(f'       实际 {have!r}')
        else:
            print(f'[{mark}] {have}')
    print(f"\n耗时 {result.get('seconds')}s，槽位 {result.get('codes')} 个，"
          f"字库 {', '.join(result.get('families', []))}")
    if result.get('uncertain'):
        print(f"存疑 {len(result['uncertain'])} 个：")
        for ch, candidates in list(result['uncertain'].items())[:8]:
            print(f"  {ch} -> {' / '.join(candidates)}")
    print('结论：', 'PASS' if bad == 0 else f'FAIL（{bad} 段不一致）')
    return 0 if bad == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
