# ERA 12 星海通关演出样片

这是一份独立预览，尚未接入游戏通关流程。

## 交付内容

- `era12-cosmic-finale.webm`：1920×1080，900 帧，15 秒，60 fps。
- `era12-cosmic-finale-en.webm`：英文版，字幕为 “YOU DID IT!”。
- `ending-contact-sheet.png`：60 张全分辨率关键帧的总览。
- `ending-contact-sheet-en.png`：英文版的 60 张关键帧总览。
- `keyframes/`：每隔 0.25 秒采样的 60 张 PNG。
- `keyframes-en/`：英文版每隔 0.25 秒采样的 60 张 PNG。
- `ending_animation.html`：Canvas 演出源。
- 英文预览：打开 `ending_animation.html?lang=en`。
- `ending-background.png`：宇宙背景图。
- `ending-copy.json`、`ending-copy-en.json`：从文本表 `ui.finale.cosmic_congratulations` 生成的简体中文与英文标题。

## 演出节奏

片头先压暗星海，星点在全画面随机位置以不规则小批次跳亮，间隔逐渐缩短。随后环境星光渐暗；“恭喜通关”的星点也按随机次序散布在字形各处、逐批显现，不按空间区域成块点亮。完整字样停留后淡去，最后只留下远处的一点光。
