// 生成扩展图标：深蓝圆角方块 + 白色对勾。零依赖，只用 Node 内置 zlib。
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buffer) {
    let crc = -1;
    for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, crc]);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const wx = px - ax;
    const wy = py - ay;
    const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)));
    return Math.hypot(wx - t * vx, wy - t * vy);
}

function insideRoundedRect(x, y, radius) {
    const cx = Math.min(Math.max(x, radius), 1 - radius);
    const cy = Math.min(Math.max(y, radius), 1 - radius);
    return Math.hypot(x - cx, y - cy) <= radius + 1e-9;
}

function sample(x, y) {
    const bg = insideRoundedRect(x, y, 0.22);
    if (!bg) return [0, 0, 0, 0];
    const stroke = 0.085;
    const tick = Math.min(
        distanceToSegment(x, y, 0.27, 0.53, 0.43, 0.69),
        distanceToSegment(x, y, 0.43, 0.69, 0.74, 0.33),
    );
    if (tick <= stroke) {
        const shade = 1 - Math.pow(tick / stroke, 3) * 0.18;
        return [Math.round(255 * shade), Math.round(255 * shade), Math.round(255 * shade), 255];
    }
    const gradient = 0.5 + 0.5 * (1 - y);
    return [
        Math.round(12 + 10 * gradient),
        Math.round(44 + 26 * gradient),
        Math.round(82 + 34 * gradient),
        255,
    ];
}

function renderPixel(x, y, size) {
    const samples = 4;
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
            const px = (x + (sx + 0.5) / samples) / size;
            const py = (y + (sy + 0.5) / samples) / size;
            const [pr, pg, pb, pa] = sample(px, py);
            const alpha = pa / 255;
            r += pr * alpha;
            g += pg * alpha;
            b += pb * alpha;
            a += alpha;
        }
    }
    const count = samples * samples;
    if (a === 0) return [0, 0, 0, 0];
    return [Math.round(r / a), Math.round(g / a), Math.round(b / a), Math.round((a / count) * 255)];
}

function makePng(size) {
    const stride = size * 4 + 1;
    const raw = Buffer.alloc(stride * size);
    for (let y = 0; y < size; y++) {
        raw[y * stride] = 0;
        for (let x = 0; x < size; x++) {
            const [r, g, b, a] = renderPixel(x, y, size);
            const offset = y * stride + 1 + x * 4;
            raw[offset] = r;
            raw[offset + 1] = g;
            raw[offset + 2] = b;
            raw[offset + 3] = a;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) {
    const file = join(outDir, `icon${size}.png`);
    const png = makePng(size);
    writeFileSync(file, png);
    console.log(`${file}  ${png.length} bytes`);
}