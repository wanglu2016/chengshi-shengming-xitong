# tools

这个项目没有构建步骤，`index.html` 直接引用 `assets/` 下的文件。这里只有一个辅助脚本。

## build-fonts.py

把 Noto Sans SC / Noto Serif SC 按页面实际用到的字裁剪成 woff2，输出到 `assets/fonts/`。

- 输入：Noto CJK 的 OTC 字体。Debian / Ubuntu 上安装 `fonts-noto-cjk` 和 `fonts-noto-cjk-extra` 即可，
  也可以从 <https://github.com/notofonts/noto-cjk> 下载后把目录作为参数传入。
- 依赖：`pip install fonttools brotli`
- 运行（在仓库根目录）：

```bash
python3 tools/build-fonts.py            # 默认读 /usr/share/fonts/opentype/noto/
python3 tools/build-fonts.py 字体目录    # 或者指定目录
```

什么时候要重新运行：改了 `index.html` 或 `assets/js/*.js` 里的中文文字之后。
不重新运行也不会出错，只是新出现的字会回退到系统字体，看起来和其他字不一样。

改完之后记得重新打离线包：

```bash
rm -f download/chengshi-shengming-xitong-site.zip
zip -r download/chengshi-shengming-xitong-site.zip index.html assets README.md 使用说明.txt
```
