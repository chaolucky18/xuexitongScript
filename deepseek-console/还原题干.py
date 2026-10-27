"""还原学习通「font-cxsecret」字体混淆 —— 纯解码模块，不联网、不需要 Cookie。

数据从哪来
    浏览器里本来就已经渲染出正确的字了，缺的只是「码位 → 真字」的映射。
    所以由页面脚本（xuexitong-console.js）就地取出：
        ① <style> 里内联 @font-face 的 base64 字体
        ② 题干和选项的文字（此时还是乱码）
    一起 POST 给本机服务；本机服务调用本模块做字形比对，把真字回填。

原理
    学习通把「真实汉字的字形轮廓」挂到了「乱码字符的码位」上：
    码位不可信、glyph 名不可信（已改成槽位码位），只有字形轮廓可信。
    于是问题从「找映射表」变成「图像检索」：
        槽位字形渲染成位图 → 与 GB2312 一级字（3755 个）的渲染结果算余弦相似度
        → 每套字库各自取 argmax → 按权重投票（Noto Sans SC 与目标同源，记 2 票）。

对外接口
    decode_texts(texts, font_bytes) -> {'texts', 'uncertain', 'codes'}
    build_families / build_mapping / decode_text 仍单独暴露，方便调参与自测。

不依赖 requests、不依赖 5.py、不访问任何学习通接口。
"""
import json
import os
import tempfile
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageFont

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EXTRA_FONT_DIR = os.path.join(BASE_DIR, 'fonts', 'noto-sans-sc')   # 随包提供

IMAGE_SIZE = 64          # 匹配用的位图边长
RENDER_SIZE = 96         # 渲染字号，够大才能保住笔画细节
TOP_K = 3                # 每个槽位保留的候选数
GRID = 8                 # 网格密度特征的分辨率
GRID_WEIGHT = 0.6        # 网格特征权重：看字的整体结构
PIXEL_WEIGHT = 0.4       # 像素特征权重：看笔画细节

# 系统字库只留准确率最高的两套：等线 78/96、宋体 74/96 太拖后腿，已去掉
FONT_CANDIDATES = [
    ('C:/Windows/Fonts/msyh.ttc', 0),    # 微软雅黑
    ('C:/Windows/Fonts/simhei.ttf', 0),  # 黑体
]

# 形近字兜底：{识别结果: 正确字符}，遇到怎么调都认错的字再往这里加
MANUAL_FIXES = {}


def render_features(font, ch):
    """把一个字符渲染成两种互补特征。

    - grid：8x8 网格内的笔画密度，抗干扰、能反映字的整体结构；
    - pixel：64x64 灰度像素，用来区分结构相同但笔画不同的字。

    两张图都不裁剪 bbox，直接按字形面框缩放，这样字形在字面框里的
    位置也参与比对，对「说/锐」这类只有偏旁不同的字很关键。
    """
    mask = font.getmask(ch)
    img = Image.frombytes('L', mask.size, bytes(mask))
    if not img.getbbox():
        return None
    img = img.resize((IMAGE_SIZE, IMAGE_SIZE), Image.LANCZOS)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    cell = IMAGE_SIZE // GRID
    grid = arr.reshape(GRID, cell, GRID, cell).mean(axis=(1, 3)).ravel()
    pixel = arr.ravel()
    grid_norm = np.linalg.norm(grid)
    pixel_norm = np.linalg.norm(pixel)
    if not grid_norm or not pixel_norm:
        return None
    return grid / grid_norm, pixel / pixel_norm


def gb2312_chars():
    """GB2312 一级常用字（3755 个），题干基本不会超出这个范围。"""
    chars = []
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                chars.append(bytes([hi, lo]).decode('gb2312'))
            except UnicodeDecodeError:
                continue
    return chars


class FontFamily:
    """一套逻辑字体。

    既可以是单个 .ttf/.ttc，也可以像 Google Fonts 那样被拆成按 unicode-range
    切片的几十个 woff2：按字符路由到包含它的那个分片。
    weight 是它的投票权重：与目标字体同源的思源/Noto 权重更高。
    """

    def __init__(self, name, files, weight=1):
        self.name = name
        self.files = files              # [(path, face_index, ranges | None)]
        self.weight = weight
        self._fonts = {}

    def font_for(self, ch):
        code = ord(ch)
        for path, index, ranges in self.files:
            if ranges is not None and not any(lo <= code <= hi for lo, hi in ranges):
                continue
            font = self._fonts.get(path)
            if font is None:
                font = ImageFont.truetype(path, RENDER_SIZE, index=index)
                self._fonts[path] = font
            return font
        return None


def load_sliced_family(directory):
    """读字体目录里的 index.json，组装成一个分片字体族（没有就返回 None）。"""
    index_path = os.path.join(directory, 'index.json')
    if not os.path.exists(index_path):
        return None
    with open(index_path, encoding='utf-8') as f:
        data = json.load(f)
    files = [(os.path.join(directory, face['file']), 0, face['ranges'])
             for face in data['faces']]
    # 目标字体本身就是思源黑体，Noto Sans SC 是它的 Google 发行版，所以给 2 票
    return FontFamily(data.get('family') or 'sliced', files, weight=2)


def build_families():
    """参与投票的全部字库：系统字体 + 随包的 Noto Sans SC。"""
    families = []
    for path, index in FONT_CANDIDATES:
        if os.path.exists(path):
            families.append(FontFamily(os.path.basename(path), [(path, index, None)]))
        else:
            print(f'  跳过不存在的字库: {path}')
    extra = load_sliced_family(EXTRA_FONT_DIR)
    if extra is not None:
        families.append(extra)
    else:
        print(f'  没找到 {EXTRA_FONT_DIR}/index.json，本次只用系统字库')
    return families


_TARGET_GRID = None
_TARGET_PIXEL = None


def worker_count():
    """并行进程数：直接开满逻辑核心。"""
    return os.cpu_count() or 1


def _init_worker(target_grid, target_pixel):
    """每个子进程只收一次目标字形特征，后面靠全局变量用。"""
    global _TARGET_GRID, _TARGET_PIXEL
    _TARGET_GRID = target_grid
    _TARGET_PIXEL = target_pixel


def _score_chunk(job):
    """子进程任务：渲染一小批候选字，直接返回它们与目标字形的相似度。

    只回传 (块内候选数 × 槽位数) 的分数矩阵，不回传 61 MB 的特征矩阵，
    否则进程间传输开销会把并行省下的时间吃回去。
    """
    files, chars = job
    family = FontFamily('chunk', files)
    grids, pixels, valid = [], [], []
    for ch in chars:
        font = family.font_for(ch)
        feats = render_features(font, ch) if font is not None else None
        valid.append(feats is not None)
        if feats is None:
            grids.append(np.zeros(GRID * GRID, np.float32))
            pixels.append(np.zeros(IMAGE_SIZE ** 2, np.float32))
        else:
            grids.append(feats[0])
            pixels.append(feats[1])
    score = (GRID_WEIGHT * (np.stack(grids) @ _TARGET_GRID.T)
             + PIXEL_WEIGHT * (np.stack(pixels) @ _TARGET_PIXEL.T))
    return score, np.array(valid, dtype=bool)


def score_family(family, chars, chunk_size, pool):
    """一套字库的候选字分块渲染，返回 (槽位×候选 分数, 候选是否有效)。"""
    jobs = [(family.files, chars[i:i + chunk_size])
            for i in range(0, len(chars), chunk_size)]
    results = list(pool.map(_score_chunk, jobs)) if pool else [_score_chunk(job) for job in jobs]
    score = np.concatenate([r[0] for r in results], axis=0).T
    valid = np.concatenate([r[1] for r in results])
    return score, valid


def build_tables(families, chars, target_grid, target_pixel):
    """并行渲染所有字库的候选字特征。多进程不可用时自动回退单进程。"""
    workers = worker_count()
    # 每个进程分到约 2 块：块太小调度开销大，块太大负载不均
    chunk_size = max(64, -(-len(chars) // (workers * 2)))
    try:
        with ProcessPoolExecutor(max_workers=workers, initializer=_init_worker,
                                 initargs=(target_grid, target_pixel)) as pool:
            return [score_family(family, chars, chunk_size, pool) for family in families]
    except Exception as exc:  # noqa: BLE001
        print(f'  多进程渲染失败（{exc}），回退单进程')
        _init_worker(target_grid, target_pixel)
        return [score_family(family, chars, chunk_size, None) for family in families]


def build_mapping(font_path, codes, families):
    """乱码码位 -> 真实字符。返回 (mapping, uncertain)。"""
    tt = TTFont(font_path)
    available = {code for code in tt.getBestCmap() if code > 0x3000}
    tt.close()
    codes = sorted(code for code in codes if code in available)

    target_font = ImageFont.truetype(font_path, RENDER_SIZE)
    targets = {code: render_features(target_font, chr(code)) for code in codes}
    codes = [code for code in codes if targets[code] is not None]
    if not codes:
        return {}, {}
    target_grid = np.stack([targets[code][0] for code in codes])
    target_pixel = np.stack([targets[code][1] for code in codes])

    chars = gb2312_chars()
    tables = []
    valid_rows = []
    for score, valid in build_tables(families, chars, target_grid, target_pixel):
        tables.append(score)
        valid_rows.append(valid)

    stacked = np.stack(tables)          # (字库数, 槽位数, 候选数)
    has_char = np.stack(valid_rows)[:, None, :]   # 该字库里有没有这个候选字
    # 字库里没有的字不参与比较（否则零向量会拉到 0 分、干扰排序）
    scores = np.where(has_char, stacked, -1.0)
    total = np.where(has_char, stacked, 0.0).sum(axis=0)
    count = has_char.sum(axis=0)
    mean_score = np.divide(total, count, out=np.zeros_like(total), where=count > 0)
    votes = scores.argmax(axis=2)       # 每套字库各自认的字

    mapping, uncertain = {}, {}
    weights = np.array([family.weight for family in families], dtype=np.float32)
    total_weight = float(weights.sum())
    for row, code in enumerate(codes):
        counts = np.bincount(votes[:, row], weights=weights, minlength=len(chars))
        # 主键票数、次键平均分：少数服从多数，分不出就比像不像
        order = np.lexsort((-mean_score[row], -counts))[:TOP_K]
        candidates = [chars[j] for j in order]
        mapping[code] = candidates[0]
        # 只要有字库唱反调，就把候选列出来给人核对
        if counts[order[0]] < total_weight:
            uncertain[code] = candidates
    return mapping, uncertain


def decode_text(text, mapping):
    return ''.join(MANUAL_FIXES.get(mapping[ord(ch)], mapping[ord(ch)])
                   if ord(ch) in mapping else ch
                   for ch in text)


def decode_texts(texts, font_bytes, families=None):
    """把一批乱码文本还原成真字。

    texts      : 页面读出来的文字（题干、选项……），字符串列表
    font_bytes : 页面内联 @font-face 的字体字节
    返回       : {'texts': [...], 'uncertain': {字符: [候选...]}, 'codes': int}
    """
    if not isinstance(texts, list) or not texts:
        raise ValueError('texts 必须是非空字符串数组')
    families = families if families is not None else build_families()
    if not families:
        raise RuntimeError('没有可用的对比字库')

    codes = {ord(ch) for text in texts for ch in text}
    fd, font_path = tempfile.mkstemp(suffix='.ttf')
    os.close(fd)
    with open(font_path, 'wb') as f:
        f.write(font_bytes)
    try:
        mapping, uncertain = build_mapping(font_path, codes, families)
    finally:
        try:
            os.unlink(font_path)
        except OSError:
            pass

    return {
        'texts': [decode_text(text, mapping) for text in texts],
        'uncertain': {chr(code): candidates for code, candidates in uncertain.items()},
        'codes': len(mapping),
    }
