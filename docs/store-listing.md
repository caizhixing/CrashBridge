# Chrome Web Store 提审材料

## 基本信息

| 项 | 值 |
|---|---|
| 名称 | CrashBridge · Crashlytics Exporter |
| 简短描述（≤132字符） | Batch-export Firebase Crashlytics issues with full stack traces, device info and metadata to JSON/Markdown. 100% local, 5 languages, zero tracking. |
| 类别 | Developer Tools |
| 语言 | English（主）+ 中文、Français、Español、Português |

## 详细描述

```
CrashBridge turns hours of copy-pasting crash reports into one click.

BATCH SELECT
Tick independent checkboxes next to Crashlytics issues on the Firebase console list. The extension resolves real Issue IDs through its own temporary tabs — never guessed from titles or row positions.

FULL STACK TRACES
The extension uses the page's own "Copy stack trace" control to capture the complete raw thread dump — every thread, every frame, exactly as Firebase renders it. Not the collapsed view you see on screen.

RICH METADATA
App version, version code, OS version, device model, event timestamp, crash count and affected user count are extracted automatically.

DEDUPLICATED QUEUE
Issues are tracked by Project + App + Issue ID. Selecting the same issue twice is a no-op. Up to 100 issues per batch.

FIELD-CONTROLLED EXPORT
Choose exactly what to include: stack trace, app version, device/OS, statistics. Live preview shows the exact bytes you'll download. JSON and Markdown formats, timestamped filenames.

FIVE LANGUAGES
English, 中文, Français, Español, Português — switchable from the manager page.

DRAGGABLE TOOLBAR
The floating selection toolbar on the Firebase page can be dragged anywhere. Position is remembered.

PRIVACY FIRST
• All data stays on your machine — nothing is uploaded, ever
• No cookies, no private APIs, no Angular internals, no Firebase issue state modification
• Only requests access to console.firebase.google.com
• Clear local data removes everything; downloaded files are yours

ZERO DEPENDENCIES
Built entirely with native browser APIs. No third-party libraries, no tracking, no analytics.

PERMISSIONS EXPLAINED
• storage — local queue and captured data (4 MiB cap)
• alarms — capture timeout management (60 seconds per issue)
• downloads — saving your exported JSON/Markdown files
• console.firebase.google.com — reading the Crashlytics page you already have open
```

## 权限说明（审核表单）

| 权限 | 理由 |
|---|---|
| `storage` | Stores the issue queue and captured stack traces locally. Uses `storage.local` (persistent, 4 MiB cap) and `storage.session` (temporary resolution state). No data leaves the machine. |
| `alarms` | Each capture has a 60-second deadline enforced by a browser alarm; this survives service-worker suspension in Manifest V3. |
| `downloads` | The user explicitly clicks "Download JSON" or "Download Markdown"; the extension saves the filtered export to the user's chosen location via `chrome.downloads`. |
| `https://console.firebase.google.com/*` (host) | The extension's content script runs on the Firebase Crashlytics console to: (1) inject selection checkboxes, (2) read the currently displayed stack trace and metadata from the DOM, (3) intercept the page's own "Copy stack trace" button to obtain the full thread dump. No other origins are accessed. |

## 单一用途说明（审核表单）

> CrashBridge is a developer tool that batch-exports Firebase Crashlytics crash reports (full stack traces, device info, metadata) from the Firebase console to local JSON/Markdown files for use with AI coding assistants or issue trackers.

## 隐私政策要点（如有要求）

- 不收集、不存储、不传输任何用户数据到远程服务器
- 崩溃数据仅存储在浏览器本地 `chrome.storage.local`
- 不读取 Cookie、浏览历史或任何非 Firebase 页面内容
- 用户可通过管理页"清空本地数据"删除所有暂存内容

## 商店素材

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `artifacts/icons/icon-128.png` | 128×128 | 商店图标 |
| `artifacts/icons/icon-256.png` | 256×256 | 高清图标（备用） |
| `artifacts/screenshots/*.png` | 1280×800 | 商店截图（1-5张） |

## 截图建议

1. **列表选择** — Firebase Crashlytics 页面 + CrashBridge 工具栏 + 勾选框
2. **管理页概览** — 队列列表 + 采集状态 + 统计卡片
3. **导出预览** — 字段选择 + JSON/Markdown 预览 + 下载按钮
4. **多语言** — 切换到 English 后的管理页
5. **完整堆栈** — 导出的 Markdown 内容（脱敏后）
