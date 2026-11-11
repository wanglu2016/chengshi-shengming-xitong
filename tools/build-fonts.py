#!/usr/bin/env python3
"""按页面实际用字裁剪 Noto Sans SC / Noto Serif SC，输出到 assets/fonts/。

输入：Noto CJK 的 OTC 字体（Debian/Ubuntu 的 fonts-noto-cjk、fonts-noto-cjk-extra 包，
      或 https://github.com/notofonts/noto-cjk ）。
用法：在仓库根目录运行  python3 tools/build-fonts.py [字体目录]
依赖：pip install fonttools brotli
改过页面文字或 assets/js/data.js 之后要重新运行一次，否则新出现的字会回退到系统字体。
"""
import os, subprocess, sys

SRC = sys.argv[1] if len(sys.argv) > 1 else '/usr/share/fonts/opentype/noto/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'fonts')
PAGES = ['index.html', 'assets/js/data.js', 'assets/js/app.js', 'assets/js/sim.js', 'assets/js/world.js']

chars = set(chr(i) for i in range(0x20, 0x7f)) | set('，。、；：？！“”‘’（）《》—…·×→％℃')
for p in PAGES:
    chars |= set(open(os.path.join(ROOT, p), encoding='utf-8').read())
chars = sorted(c for c in chars if c >= ' ')
with open(os.path.join(OUT, 'chars.txt'), 'w', encoding='utf-8') as f:
    f.write(''.join(chars))

JOBS = [
    ('NotoSansCJK-Regular.ttc', 'NotoSansSC-Regular.woff2', None),
    ('NotoSansCJK-Medium.ttc', 'NotoSansSC-Medium.woff2', None),
    ('NotoSerifCJK-Bold.ttc', 'NotoSerifSC-Bold.woff2', None),
    ('NotoSerifCJK-Black.ttc', 'NotoSerifSC-Black.woff2', '城市的生命系统'),  # 只用于开场的大标题
]
for src, out, only in JOBS:
    args = ['pyftsubset', os.path.join(SRC, src), '--font-number=2',  # OTC 里第 2 号是简体中文 (SC)
            '--flavor=woff2', '--no-hinting', '--desubroutinize', '--output-file=' + os.path.join(OUT, out)]
    args.append('--text=' + only if only else '--text-file=' + os.path.join(OUT, 'chars.txt'))
    subprocess.run(args, check=True)
    print(out, os.path.getsize(os.path.join(OUT, out)), 'bytes')
print(len(chars), '个字符')
