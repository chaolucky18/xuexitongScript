"""造一份「假的学习通混淆页面」用来验证解码链路。

做法：从黑体 simhei.ttf 里只取需要的真字，然后把它们挂到随机的 CJK 槽位码位上
（这正是 font-cxsecret 的手段：码位是假的，字形是真的）。真字体是模拟的，
但解码要面对的输入结构和真实页面完全一致。

输出 fixture.json：{"font_b64": ..., "texts": [...], "expected": [...]}
"""
import base64
import json
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

SIMHEI = 'C:/Windows/Fonts/simhei.ttf'
HERE = os.path.dirname(os.path.abspath(__file__))

TEXTS = [
    'Python中表示浮点数的数据类型是',
    '下列关于列表与元组的说法错误的是',
    'int',
    'float',
    'list',
    'tuple',
]

# 从 U+6415 起挑一组 CJK 槽位，避开真字本身的码位
def pick_slots(real_chars):
    real_codes = {ord(ch) for ch in real_chars}
    slots = []
    code = 0x6415
    while len(slots) < len(real_chars):
        if code not in real_codes and 0x4E00 <= code <= 0x9FFF:
            slots.append(code)
        code += 1
    return slots


def build_font(real_chars):
    """返回 (字体字节, 真字 -> 槽位字符 的映射)。"""
    font = TTFont(SIMHEI)
    options = subset.Options()
    options.layout_features = []
    options.name_IDs = ['*']
    options.notdef_outline = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=''.join(real_chars))
    subsetter.subset(font)

    cmap = font.getBestCmap()
    slots = pick_slots(real_chars)
    new_map = {slot: cmap[ord(ch)] for slot, ch in zip(slots, real_chars)}
    table = font['cmap'].tables[0]
    table.cmap = new_map
    table.format = 4
    for other in font['cmap'].tables[1:]:
        other.cmap = dict(new_map)

    import io
    buffer = io.BytesIO()
    font.save(buffer)
    return buffer.getvalue(), {ch: chr(slot) for slot, ch in zip(slots, real_chars)}


def main():
    real_chars = ''.join(dict.fromkeys(''.join(TEXTS)))
    real_chars = ''.join(ch for ch in real_chars if ord(ch) > 0x3000)
    font_bytes, to_slot = build_font(real_chars)

    # 页面里看到的是槽位字符（乱码），浏览器靠字体把字形画对
    garbled = [''.join(to_slot.get(ch, ch) for ch in text) for text in TEXTS]

    fixture = {
        'font_b64': base64.b64encode(font_bytes).decode('ascii'),
        'texts': garbled,
        'expected': TEXTS,
        'font_size': len(font_bytes),
        'slots': len(real_chars),
    }
    path = os.path.join(HERE, 'fixture.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(fixture, f, ensure_ascii=False)
    print(f'字体 {len(font_bytes)} 字节，{len(real_chars)} 个槽位 -> {path}')
    print('乱码示例：', garbled[0])
    return 0


if __name__ == '__main__':
    sys.exit(main())
