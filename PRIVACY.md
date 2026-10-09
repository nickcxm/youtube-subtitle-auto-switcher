# Privacy / 隐私说明

Updated / 更新：2026-10-09

Local Captions has no login, payment service, analytics or telemetry.

Video frames and caption text are read temporarily on your device to identify duplicate subtitles. They are not uploaded to a project server or model provider. Recognition results are held briefly in local memory for delivery to the requesting document and are discarded or expired. Frames are not persisted.

Preferences, channel/video rules, confirmed closure records and up to 200 operational diagnostic events are stored in Chrome extension-local storage. Logs do not contain frames, recognized text or credentials. Export occurs only when you explicitly choose it; the exported file remains yours to manage.

Optional language models are downloaded from the official PaddleOCR model host and cached locally. The model host receives ordinary download-request information, including your IP address. It does not receive video frames, caption text or your stored rules.

You can clear model downloads, confirmed records and logs in the settings. Removing the extension removes its extension-local data according to browser behavior. No project-managed account database exists.

For privacy questions, use the repository's support channels without posting sensitive information: https://github.com/nickcxm/youtube-subtitle-auto-switcher/issues

本扩展无登录、支付、统计或遥测。画面和字幕文字仅在本机暂时处理，不上传；偏好、规则、确认结果和有限运行日志保存在本地。按需下载模型时，官方模型服务器会收到 IP 等普通下载请求信息，但不会收到视频画面、字幕或规则。你可以在设置中清除下载模型、确认记录和日志。
