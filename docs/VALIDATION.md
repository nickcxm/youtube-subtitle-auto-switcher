# Validation record / 验证记录

Date / 日期：2026-10-09

This record distinguishes algorithm checks, browser fixture verification and actual YouTube playback. It is not an accuracy benchmark across arbitrary videos.

## Completed / 已完成

- TypeScript type checking and extension bundling completed.
- Twelve reusable checks passed: normalization, OCR-error tolerance, short-text rejection, distinct-caption evidence, duplicate recognition, low-confidence rejection, watermark rejection, cross-script evidence, rule precedence, model selection, OpenCV CSP transformation and manifest permissions.
- The unpacked Manifest V3 extension loaded in an isolated Chrome for Testing 147 profile.
- Local OCR recognized `Welcome to our astronomy channel` using both WebGPU and WASM.
- An original synthetic canvas-video fixture supplied changing burned-in text and a separate HTML soft-caption overlay. The actual content script captured video frames and closed CC after two different matching caption texts.
- Restore reopened CC, switched the current viewing to manual control and removed the confirmed-closure record.
- Channel-hide and video-show rules were applied through the actual player menu; video-show took precedence. A trusted CC click entered manual control. Test rules were then removed.
- A fixture without burned-in subtitles kept CC enabled after exhausting the configured four-sample budget.
- The Korean model downloaded from the official model host and appeared as cached in model management. Korean recognition itself was not tested.
- A real YouTube watch page, **Big Buck Bunny 60fps 4K — Official Blender Foundation Short Film** (`aqz-KE-bpKQ`), played successfully. The extension mounted in the real player; a decoded 854-pixel-wide frame could be drawn to Canvas and encoded without a security exception. This verifies real-player mounting and frame access, not duplicate-caption accuracy on a real subtitled video.

## Remaining user verification / 待实际使用验证

- Real videos with simultaneous burned-in and switchable captions, especially timing offsets and decorative fonts.
- Other language-model inference and mixed-language videos.
- Advertisements, rapid navigation, language changes and long viewing sessions on YouTube's live UI.
- Different machines, Chrome versions and graphics drivers.

Additional functional testing was stopped at the user's request. The final build includes the documented compatibility defaults, bounded local-runtime timeout and distribution notices; no further browser test campaign was run after that request.

## Documentation images / 文档图片

- `settings.png`: the actual extension settings page.
- `player-demo.png`: actual extension controls running on the original synthetic video fixture; clearly labeled as a demonstration.
- `banner.svg`, `flow-en.svg`, `flow-zh.svg`: original vector artwork created for this project.

No browser profiles, exported operational logs or test-video frames are committed. Temporary browser automation files are kept outside tracked source and are removed after the work is complete.
