# Contributing

[English README](README.md) · [中文说明](README.zh-CN.md)

Use Node.js 22+ and install dependencies with `npm ci`. Prepare models using `npm run models`, then build with `npm run build`. Load `dist` as an unpacked Chrome extension and refresh existing YouTube tabs after rebuilding or reloading the extension.

Run `npm run typecheck` and `npm test` before submitting a pull request. Changes to OCR inference or viewing state should also be checked in a real browser. Clearly distinguish synthetic fixtures from real YouTube playback when reporting results.

Please keep changes focused, update both README languages for user-facing changes, and preserve conservative defaults: uncertain detections keep soft captions enabled, manual user actions take priority, and frame/text processing stays local.

Do not commit model binaries, browser profiles, generated bundles, diagnostic logs or secrets. Models are downloaded from upstream during local setup. See [SECURITY.md](SECURITY.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
