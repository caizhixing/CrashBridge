# CrashBridge

**Turn multiple Crashlytics issues into one reviewable, locally-stored report.** A Chrome / Edge Manifest V3 extension built with native ESM and zero third-party dependencies. It never uploads data, creates Harness sessions, or modifies Firebase issue state.

[中文说明](#中文说明) · [Español](#español) · [Français](#français) · [Português](#português)

> **Real Firebase console compatibility is verified end-to-end** against a live project (list selection, issue-ID resolution, full-stack capture, metadata extraction). Layouts that cannot be recognised fail explicitly — the extension never exports an empty "success".

## What it does

1. **Batch-select** Crashlytics issues with independent checkboxes (Firebase's native selection is untouched).
2. **Resolve real Issue IDs** through extension-owned temporary tabs — never guessed from titles or row positions.
3. **Capture the full raw thread dump** via the page's own "Copy stack trace" control (100 KB+, all threads, `at`-prefixed frames) — not the collapsed DOM view.
4. **Deduplicate** by Project + App + Issue ID.
5. **Export** filtered JSON / Markdown with a live preview — stack trace, app version, version code, OS, device model, event time, crash and user counts.
6. **Work in five languages**: English, 中文, Français, Español, Português.
7. **Drag** the floating toolbar anywhere; the position persists.

## Install (from source)

Requires Node ≥ 24 and a current Chrome / Edge. No `npm install` needed — everything uses Node built-ins and runs offline:

```powershell
npm run check
npm run build
```

1. Open `chrome://extensions` (or `edge://extensions`).
2. Enable Developer mode → **Load unpacked** → select the **dist** directory.
3. The extension requests only `storage`, `alarms`, `downloads` and access to `https://console.firebase.google.com/*`.
4. After rebuilding, click **Reload** on the extension card and refresh the Firebase page.

## Daily workflow

1. Sign in to Firebase and open an **Android Crashlytics issue list**. Login and proxy are handled by the browser; the extension never reads cookies.
2. Tick the **CrashBridge checkboxes** (independent from Firebase's). The fixed toolbar shows the selection count. Clicking **Add selected** resolves real issue IDs through serially-opened temporary list tabs; the original list never navigates. Snapshots must match exactly; ambiguous rows fail rather than guessing IDs. Up to 100 issues, deduplicated by **project + app + issue ID**.
3. Click **Start capture**: the extension serially opens temporary detail tabs (one at a time), intercepts the page's own "Copy stack trace" control, and captures the complete raw thread dump. The original user tab is never navigated or closed.
4. Failed items can be retried individually; a 60-second deadline applies per item. Storage or resource failures stop the batch safely with visible reasons.
5. Review warnings and the preview, pick fields (stack and version on by default; device and statistics off), then download JSON and Markdown separately. Filenames are `yyyyMMdd_HHmmss_<issueId|Nissues>.<ext>`.

## Data & privacy

- All data stays on the machine. Nothing is uploaded, ever.
- The extension does not read cookies, call private Firebase APIs, access Angular internals, or modify issue state.
- Queue and captures live in `chrome.storage.local` (4 MiB UTF-8 cap). Resolution sessions live in `storage.session` and clear with the browser.
- Only the currently displayed representative event is captured per issue; completeness is never claimed.
- Hidden / collapsed DOM is excluded from the visible-text extraction; the full dump comes exclusively from the page's own copy control.
- Clearing local data deletes the queue and captures; downloaded files remain (delete them yourself).

## Languages

Switch in the manager page header (🌐 selector). Applies to the manager page and the floating toolbar. Language preference persists.

## Development

```powershell
npm run check           # syntax + manifest/module/HTML reference validation
npm run build           # assemble dist/ (18+ files)
npm test                # Node built-in test runner
npm run test:coverage   # per-file coverage gates
```

142 tests, zero third-party dependencies, zero network installs. Coverage gates: domain modules 100 % lines, capture queue and resolver 100 % lines. DOM / manager / Chrome glue is n/a for coverage but covered by real behaviour tests.

Verified end-to-end in a real browser: list selection → ID resolution → full-stack capture (104 KB / 1206 frames / all threads) → metadata extraction → dual-format export → dedupe on re-add.

---

# 中文说明

**把多个 Crashlytics 问题整理成一份可检查的本地日志。** Chrome / Edge Manifest V3 扩展，原生 ESM，零第三方依赖；不会自动上传数据、创建 Harness 会话或关闭 Firebase 问题。

真实 Firebase 控制台兼容性已在真实项目中端到端验证（列表选择、Issue ID 解析、完整堆栈采集、元数据提取）。无法识别的布局会明确失败——绝不导出空的“成功”。

## 功能

1. **批量勾选** Crashlytics 问题（独立复选框，不影响 Firebase 原生选择）。
2. 通过扩展自有临时标签页**解析真实 Issue ID**——绝不按标题或行位置猜。
3. 通过页面自带的"Copy stack trace"控件**捕获完整原始堆栈**（100 KB+，全部线程，`at` 前缀帧）——而非折叠后的 DOM 视图。
4. 按**项目 + App + Issue ID** 去重。
5. **导出** JSON / Markdown，带实时预览——堆栈、应用版本、versionCode、系统、设备型号、事件时间、崩溃与用户数。
6. **五种语言**：中文、English、Français、Español、Português。
7. 悬浮工具栏**可拖动**，位置记忆。

## 安装

需要 Node ≥ 24。离线构建：

```powershell
npm run check
npm run build
```

`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选 **dist** 目录。

## 数据与隐私

- 所有数据只在本机。从不上传。
- 不读取 Cookie、不调用 Firebase 私有接口、不访问 Angular 内部状态、不修改 Issue 状态。
- 默认不导出设备 / 统计字段（可手动开启）；“清空本地数据”删除队列与捕获内容。
- 每问题采集当前展示的一个代表事件；不宣称最新或完整。
