# Chrome Web Store Listing — 本地字幕管家 · Local Captions

Last Updated: 2026-10-09. Draft only; not submitted or published. This document records listing and permission changes, not a readiness certification.

## Store Listing

Extension Name: 本地字幕管家 · Local Captions

Short Description: 自动开启 YouTube 可用字幕，发现画面内重复字幕后按偏好关闭软字幕。支持恢复、频道和视频规则，无需账号。

Detailed Description:

本地字幕管家帮助你管理 YouTube 的字幕开关。观看有可用字幕的视频时自动开启字幕；画面已经包含相同字幕时，经过多次确认后关闭重复的一层。

你可以随时恢复软字幕，为频道或单个视频保存规则。手动操作字幕按钮后，本次观看由你控制。不同语言的字幕默认同时保留，也可选择提示或在证据充分时关闭。

安装后刷新 YouTube 视频页面，点击播放器中的 LC 查看状态、重新检测、恢复字幕或设置规则。

视频画面和字幕文字在本机处理，不上传服务器。无需注册、订阅或使用次数额度。

支持与反馈：https://github.com/nickcxm/youtube-subtitle-auto-switcher/issues

Category: Productivity
Single Purpose: Manage existing YouTube captions according to local subtitle evidence and user preferences.
Primary Language: Simplified Chinese

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|---|---|---|---|
| Icon | 128×128 PNG | Ready | public/icons/128.png |
| Store screenshot | 1280×800 or 640×400 | Needs capture before submission | Not yet created |
| README settings screenshot | 520 px wide | Refresh for 0.2.0 contrast changes before store use | docs/images/settings.png |
| README player demonstration | Synthetic fixture | Labeled demonstration; not a store-ready screenshot | docs/images/player-demo.png |
| README artwork | SVG | Original documentation art | docs/images/banner.svg, flow-en.svg, flow-zh.svg |

## Permissions Justification

| Permission | Purpose |
|---|---|
| storage | Save user caption preferences, channel/video rules, confirmed results and bounded local diagnostics. |
| offscreen | Run local caption recognition without opening a visible processing tab. |
| activeTab | Access the tab context after the user invokes the toolbar action; no access to unrelated browsing history is needed. |
| alarms | Release idle local recognition resources. The alarm is scheduled only when needed and does not collect or transmit data. |
| https://www.youtube.com/* | Read the playing video and visible captions and manage the player's caption button. |
| https://paddle-model-ecology.bj.bcebos.com/* | Download additional recognition models from the official source when needed. No video images or subtitle texts are sent to this host. |

## Privacy & Data Use

Website content (video frames and caption text) is processed locally and temporarily for recognition. User preferences, selected video/channel IDs, confirmed closures and operational log events are stored locally. No personally identifying information, login credentials, payment data, health data, communications or location data is requested.

No telemetry or project-server uploads are used. Model downloads disclose normal network request information, such as IP address, to the model host. Local logs are exported only at the user's request.

- Data is not sold.
- Data is not used for unrelated purposes.
- Data is not used for creditworthiness or lending decisions.

## Privacy Policy

Draft policy: https://github.com/nickcxm/youtube-subtitle-auto-switcher/blob/main/PRIVACY.md
Verify that the policy URL is publicly reachable and accepted by the dashboard before submission.

## Distribution

Store visibility and regions: not configured; decide before submission.
Repository: https://github.com/nickcxm/youtube-subtitle-auto-switcher

## Developer Info

Publisher name: confirm store account details before submission.
Contact email: not supplied; must be filled by the publisher before submission.
Support URL: https://github.com/nickcxm/youtube-subtitle-auto-switcher/issues
Homepage: https://github.com/nickcxm/youtube-subtitle-auto-switcher

## Version History

| Version | Date | Changes | Status |
|---|---|---|---|
| 0.2.0 | 2026-10-09 | Task isolation, source-tab settings, event-driven recognition, idle resource release, smaller runtime and accessibility improvements. | Draft |
| 0.1.0 | 2026-10-09 | Initial local subtitle management extension. | Draft |

## Review Notes

No store review or rejection has occurred. Before submission, capture compliant screenshots, complete publisher/contact information, verify privacy disclosures and conduct browser compatibility verification. Screenshots currently document 0.1.0; 0.2.0 interactive regression verification is pending.
