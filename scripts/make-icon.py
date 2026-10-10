import struct, zlib, math
from pathlib import Path

SIZE = 1024

def build_png(path, size, pixel_fn):
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            row += bytes(pixel_fn(x, y, size))
        rows.append(bytes(row))
    raw = b''.join(b'\x00' + r for r in rows)

    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    blob = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    Path(path).write_bytes(blob)

def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))

def rounded_alpha(x, y, size, radius):
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    d = math.hypot(x - cx, y - cy)
    if d <= radius - 1:
        return 255
    if d >= radius:
        return 0
    return round(255 * (radius - d))

def pixel(x, y, size):
    n = size - 1
    alpha = rounded_alpha(x, y, size, size * 0.22)
    if alpha == 0:
        return (0, 0, 0, 0)
    t = (x / n + y / n) / 2
    base = mix((46, 38, 74), (18, 22, 34), t)
    dx = (x - size / 2) / (size * 0.5)
    dy = (y - size / 2) / (size * 0.5)
    star = math.sqrt(abs(dx)) + math.sqrt(abs(dy))
    if star <= 1.0:
        edge = min(1.0, (1.0 - star) * 6.0)
        core = mix((201, 188, 255), (139, 216, 208), min(1.0, max(0.0, (dx + dy) * 0.5 + 0.5)))
        glow = mix(base, core, edge)
        return (glow[0], glow[1], glow[2], alpha)
    ring = abs(star - 1.16)
    if ring < 0.035:
        glow = mix(base, (150, 138, 220), (0.035 - ring) / 0.035 * 0.55)
        return (glow[0], glow[1], glow[2], alpha)
    return (base[0], base[1], base[2], alpha)

build_png('app-icon.png', SIZE, pixel)
print('icon source written')
