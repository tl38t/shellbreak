# -*- coding: utf-8 -*-
"""ERA7 科技图标生成（9 枚 64x64 PNG，纯 stdlib，沿用 era5-steelschool 手写先例）。
深空紫底 + 星海粉/银几何徽记；输出 assets/tech-icons/era-7/。"""
import os, zlib, struct

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'tech-icons', 'era-7')
os.makedirs(OUT, exist_ok=True)

S = 64
BG = (26, 20, 64, 255)          # 深空紫
EDGE = (255, 142, 212, 255)     # 星海粉（era7 主题色）
SILVER = (214, 226, 244, 255)   # 舷窗银

def in_rounded(x, y, r=12):
    cx = min(max(x, r), S - 1 - r); cy = min(max(y, r), S - 1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r

def new_img():
    return [[BG if in_rounded(x, y) else (0, 0, 0, 0) for x in range(S)] for y in range(S)]

def fill_circle(img, cx, cy, rad, col, hollow=False, thick=3):
    for y in range(S):
        for x in range(S):
            d2 = (x - cx) ** 2 + (y - cy) ** 2
            if d2 <= rad * rad and (not hollow or d2 >= (rad - thick) ** 2):
                img[y][x] = col

def fill_rect(img, x0, y0, w, h, col):
    for y in range(max(0, y0), min(S, y0 + h)):
        for x in range(max(0, x0), min(S, x0 + w)):
            img[y][x] = col

def fill_poly(img, pts, col):
    for y in range(S):
        for x in range(S):
            inside = False
            n = len(pts)
            for i in range(n):
                x1, y1 = pts[i]; x2, y2 = pts[(i + 1) % n]
                if (y1 > y) != (y2 > y):
                    xin = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
                    if x < xin: inside = not inside
            if inside: img[y][x] = col

def save(img, name):
    raw = b''
    for y in range(S):
        raw += b'\x00' + b''.join(bytes(px) for px in img[y])
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', S, S, 8, 6, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(png)
    print('wrote', name)

def star_ring(img, cx=32, cy=32, rad=24):
    fill_circle(img, cx, cy, rad, EDGE, hollow=True, thick=2)

icons = {}

# rocket 火箭：三角箭体 + 双尾翼 + 焰
img = new_img()
fill_poly(img, [(32, 8), (40, 34), (24, 34)], SILVER)
fill_rect(img, 30, 34, 4, 10, SILVER)
fill_poly(img, [(24, 34), (18, 46), (26, 40)], EDGE)
fill_poly(img, [(40, 34), (46, 46), (38, 40)], EDGE)
fill_poly(img, [(28, 46), (36, 46), (32, 56)], EDGE)
icons['rocket'] = img

# autodrill 齿轮：外圈齿 + 中孔
img = new_img()
import math
fill_circle(img, 32, 32, 16, SILVER)
for k in range(8):
    a = k * math.pi / 4
    x = 32 + int(19 * math.cos(a)); y = 32 + int(19 * math.sin(a))
    fill_rect(img, x - 3, y - 3, 6, 6, SILVER)
fill_circle(img, 32, 32, 6, BG)
icons['autodrill'] = img

# surface 地表探测：行星 + 轨道环 + 小卫星点
img = new_img()
fill_circle(img, 32, 34, 13, SILVER)
for t in range(-26, 27):
    x = 32 + t; y = 30 + int(abs(t) * 0.28)
    if 0 <= x < S and 0 <= y < S: img[y][x] = EDGE
    y2 = 30 - int(abs(t) * 0.28)
    if 0 <= x < S and 0 <= y2 < S: img[y2][x] = EDGE
fill_circle(img, 51, 22, 3, EDGE)
icons['surface'] = img

# crewed 载人：密封舱 + 舷窗
img = new_img()
fill_poly(img, [(32, 8), (44, 40), (20, 40)], SILVER)
fill_rect(img, 20, 40, 24, 8, SILVER)
fill_circle(img, 32, 28, 6, EDGE)
fill_circle(img, 32, 28, 3, BG)
fill_poly(img, [(26, 50), (38, 50), (34, 58), (30, 58)], EDGE)
icons['crewed'] = img

# architect 大型架构：三梁桁架
img = new_img()
for i in range(4):
    fill_rect(img, 10 + i * 12, 22, 4, 28, SILVER)
fill_rect(img, 10, 22, 44, 4, EDGE)
fill_rect(img, 10, 46, 44, 4, EDGE)
for i in range(3):
    fill_poly(img, [(14 + i * 12, 26), (26 + i * 12, 26), (14 + i * 12, 46)], EDGE)
icons['architect'] = img

# ancient 超古代：同心环 + 中心点（远古遗迹观测）
img = new_img()
fill_circle(img, 32, 32, 22, EDGE, hollow=True, thick=2)
fill_circle(img, 32, 32, 14, SILVER, hollow=True, thick=2)
fill_circle(img, 32, 32, 5, EDGE)
for a in range(4):
    ang = a * math.pi / 2 + math.pi / 4
    x = 32 + int(18 * math.cos(ang)); y = 32 + int(18 * math.sin(ang))
    fill_rect(img, x - 2, y - 2, 4, 4, SILVER)
icons['ancient'] = img

# spacestation 空间站：中舱 + 双太阳板
img = new_img()
fill_rect(img, 26, 24, 12, 16, SILVER)
fill_rect(img, 28, 18, 8, 6, EDGE)
fill_rect(img, 6, 28, 16, 8, SILVER)
fill_rect(img, 42, 28, 16, 8, SILVER)
for x in range(6, 22, 4): fill_rect(img, x, 28, 1, 8, BG)
for x in range(42, 58, 4): fill_rect(img, x, 28, 1, 8, BG)
fill_rect(img, 22, 30, 4, 4, EDGE)
fill_rect(img, 38, 30, 4, 4, EDGE)
icons['spacestation'] = img

# fission 核裂变：三叶标
img = new_img()
fill_circle(img, 32, 32, 5, SILVER)
for k in range(3):
    a = -math.pi / 2 + k * 2 * math.pi / 3
    cx = 32 + 15 * math.cos(a); cy = 32 + 15 * math.sin(a)
    fill_circle(img, int(cx), int(cy), 7, EDGE)
    fill_poly(img, [(32, 32),
                    (int(32 + 22 * math.cos(a - 0.5)), int(32 + 22 * math.sin(a - 0.5))),
                    (int(32 + 22 * math.cos(a + 0.5)), int(32 + 22 * math.sin(a + 0.5)))], EDGE)
fill_circle(img, 32, 32, 9, BG)
fill_circle(img, 32, 32, 5, SILVER)
icons['fission'] = img

# complexf 复合型工厂：厂房 + 烟囱
img = new_img()
fill_rect(img, 10, 36, 40, 18, SILVER)
fill_rect(img, 14, 20, 6, 16, EDGE)
fill_rect(img, 24, 14, 6, 22, EDGE)
for i in range(3):
    fill_poly(img, [(12 + i * 12, 36), (20 + i * 12, 28), (20 + i * 12, 36)], SILVER)
for y in range(40, 54, 5):
    for x in range(14, 50, 8): fill_rect(img, x, y, 4, 2, BG)
icons['complexf'] = img

for name, img in icons.items():
    save(img, 'era7-%s.png' % name)
print('done:', len(icons), 'icons ->', OUT)
