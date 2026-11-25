# 渊海群星（Shellbreak）

玩家从木卫二冰海中的一座聚落起步，分配族民、建造设施、推进科技与市政，逐步凿穿天壳并驶向群星。

## 本地运行与构建

在项目根目录运行 `python3 -m http.server 8000`，用浏览器打开 `http://localhost:8000/`。源码入口是 `index.html`，页面按声明顺序载入 `src/` 的经典脚本。发行构建使用 `package.json` 中的依赖，首次构建先运行 `pnpm install`。

| 用途 | 命令 | 结果 |
| --- | --- | --- |
| Web | `pnpm run build:web` | `dist/web/` |
| TapTap | `python3 _repack.py` | `dist/taptap/Shellbreak-TapTap.zip` |
| Electron 桌面调试 | `pnpm start` | 使用桌面壳打开游戏 |
| Windows Steam 内容包 | `pnpm run package:steam` | `dist/steam-depot/win-unpacked/` |

## 回归与素材

`node sim/e2e.mjs` 运行全套游戏回归。`node sim/e2e.mjs --perf-only` 验证运行时性能约束，`node sim/probe_render_cost.mjs` 统计渲染调用的 JavaScript 耗时和 DOM 写入次数。浏览器的离线等待、触屏和后台测量见[性能复测记录](docs/PERF_RETEST_2026-11-24.md)。

成就与挑战列表使用 `assets/achievements/thumbs/` 与 `assets/challenges/thumbs/` 的 WebP。添加或替换图时，把原图放在对应的上级目录，在游戏的列表数据中引用同名缩略图，然后运行 `pnpm run assets:thumbs`。生成工具使用 Python 3 和 Pillow。仓库中的现有文件使用 Pillow 12.2.0、libwebp 1.6.0 编码，可在同版本环境运行 `pnpm run assets:thumbs --check` 做逐字节复核。

平台能力、发布步骤及设计资料见[项目文档](docs/README.md)。
