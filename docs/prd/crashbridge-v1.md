# PRD：CrashBridge v1 — Crashlytics 批量日志导出

- **milestone**：CrashBridge v1（拟建；尚未在 GitHub 创建）
- **日期 / 对谈轮次**：2026-11-16 / 1
- **状态**：frozen（用户已确认范围、失败处理与 worktree 父目录；无脱敏真实 DOM 样本，明确真实控制台兼容性未验证）

## 1. 背景与目标

用户通过 VPS 代理访问 Firebase Crashlytics 控制台，目前手动复制堆栈给 Harness 修复。第一版提供 Chrome / Edge 通用 Manifest V3 扩展，将多个选中的 Issue 整理为本地 JSON 与 Markdown，不修改 Firebase 问题状态，不自动创建 Harness 会话，不上传数据。

以下均为待确认的第一版建议，不把历史讨论中的建议视为用户已逐项批准。

### 使用流程

1. 用户在已登录的 Firebase Crashlytics Android 问题列表浏览。
2. 扩展为能可靠识别项目、App、Issue 的列表行提供选择入口；可添加当前页已加载的问题，跨筛选与分页继续累积。
3. 扩展管理页展示本地待导出清单；按项目 + App + Issue ID 去重，可删除、清空、打开来源页。
4. 用户主动开始采集。逐项打开临时详情标签页，复用浏览器会话与代理，从已渲染 DOM 读取当前代表事件。最多一个采集标签页，不读 Cookie，不重放未公开接口，不自动点击会更改 Firebase 状态的控件。
5. 展示进度与逐项结果；取消停止调度并清理扩展创建的临时标签页；失败不丢弃清单，可重试失败项。
6. 用户预览、选择字段，再分别下载 JSON 与 Markdown。默认排除 breadcrumbs、custom keys、用户标识及整页文本；只导出允许的事件字段和堆栈。

### 数据边界

- 每 Issue 第一版只采集一个当前代表事件，不承诺一定是最新事件；仅明确可靠的事件时间/排序证据才标记“最新”。未覆盖全部事件、变体或所有线程。
- 保留实际可取得的异常因果链及堆栈；缺失堆栈视为采集失败。只有部分可见内容时明确 partial，无法验证完整性为 unknown，绝不默认 complete。
- 项目与 App 必须可靠识别后才可入队；不能仅按 Issue ID 或标题去重。URL 解析必须核实真实页面模式，不能把任意路径尾段当 Issue ID。
- 没有真实页面样本时，仅能完成合成 fixture 与解析契约验证，不宣称已兼容用户当前 Firebase 页面。页面结构不支持时显示 unsupported，而不是导出空成功。
- 默认不自动展开页面未加载线程、不下载附件、不读取本机源码、不接 BigQuery。确需扩展读取方式应先修订 PRD。

## 2. 待冻结接口与数据模型

建议零第三方运行时依赖：原生 ES modules + JSDoc 明确类型；Node 内置测试与覆盖率；本地脚本校验、组装 MV3 扩展，无联网安装。

公共模块位置建议：`src/domain`（标识/去重/数据校验/导出）；`src/adapter`（Firebase URL 与 DOM）；`src/background`（采集调度与持久化）；`src/ui`（管理页）；`src/content`（列表挂载与详情采集）。冻结后 worker 不得自行修改共享签名。

```text
IssueRef = { projectId: string, appId: string, issueId: string, url: string, title: string | null }
issueKey = JSON.stringify([projectId, appId, issueId])
EventRef = { eventId: string | null, identitySource: 'event-id' | 'unavailable' }
Capture = {
  issue: IssueRef,
  event: EventRef,
  capturedAt: ISO8601,
  eventTimestamp: string | null,
  selection: 'currently-displayed',
  source: 'rendered-dom',
  completeness: 'partial' | 'unknown',
  stacktrace: string,
  appVersion: string | null,
  versionCode: string | null,
  osVersion: string | null,
  deviceModel: string | null,
  statistics: { events: string | null, users: string | null, timeRange: string | null },
  warnings: string[]
}
QueueItem = {
  key: string,
  issue: IssueRef,
  status: 'pending' | 'collecting' | 'succeeded' | 'failed' | 'cancelled',
  capture: Capture | null,
  error: { code: ErrorCode, message: string } | null
}
ErrorCode = 'unsupported' | 'login-required' | 'timeout' | 'tab-closed'
          | 'missing-stack' | 'cancelled' | 'storage-failed' | 'download-failed'
ExportBundle = {
  schemaVersion: 1,
  exportedAt: ISO8601,
  issues: QueueItem[],
  warnings: string[]
}
```

- 第一版每 Issue 仅一个 capture，因此同一批次重复 Issue 不产生重复事件；event ID 缺失保留 null，不用堆栈 hash 冒充 Firebase ID。后续多事件版本需另行冻结事件去重规则。
- 同批次去重，不永久屏蔽历史导出。再次采集允许覆盖该 Issue 的旧采集结果，先在 UI 明示；失败不得伪装旧结果为新成功。
- URL 仅允许 Firebase 控制台 HTTPS 同源、已验证 Crashlytics 路由，去掉不必要查询参数；不能接受由页面文本指定的任意外站。
- 消息固定 `namespace: 'crashbridge'`、`version: 1`；类型为 ADD_ISSUES、GET_STATE、REMOVE_ISSUE、CLEAR_QUEUE、START_CAPTURE、CANCEL_CAPTURE、RETRY_FAILED、CAPTURE_RESULT。管理操作仅允许本扩展管理页发送；ADD_ISSUES 允许已校验的 Firebase content script；CAPTURE_RESULT 必须匹配当前调度 tab ID、Issue key 和随机 job ID。payload 经运行时校验，GET_STATE 返回快照，变更通过 storage.onChanged 订阅；响应为 `{ok:true,data}` 或 `{ok:false,error:{code,message}}`。
- 日志是数据：禁止 eval、动态脚本与 innerHTML；Markdown 使用安全长度围栏并防止标题/链接注入，JSON 不包含原始 DOM。队列最多 100 个 Issue；ID 最长 512 字符、标题最长 1000 字符；单事件堆栈最多 200000 字符，超出则标记 partial 并添加截断 warning；累计持久化 JSON 上限 4 MiB（UTF-8），写入前检查，超出报 storage-failed，不删除其他结果或误报保存成功。
- 存储 schema 与消息协议版本从 1 起；JSON 格式是对外契约。申请 storage、alarms、downloads，host_permissions/content script matches 仅 https://console.firebase.google.com/*；用 tabs 创建/关闭扩展自己的采集标签页，不申请广泛 tabs 读取权限。管理页 action 点击打开扩展自有页面。不申请 cookies、debugger、webRequest、全站或本机文件访问权限。
- 单项采集超时 60 秒，alarms 作 worker 挂起后的兜底；全局取消与重启恢复仅清理经保存 ID 和预期 URL 双重核实的采集标签页。首版不做静默自动重试。
- 导出字段选项：堆栈（默认开）、版本（默认开）、设备/系统（默认关）、聚合统计（默认关）。Issue ID/链接、错误与完整性警告始终保留。用户取消某字段应在两种格式中都排除，不仅从预览隐藏。默认关闭字段指不进入下载，不意味着未存储；管理页明确说明本地捕获暂存与清空方式。

## 3. 任务拆分预案与合并顺序

| 序号 | 主题 | 范围 | 依赖 / 冲突 |
|---|---|---|---|
| 1 | 工程基线与纯域逻辑 | 校验、去重、导出、schema、构建脚本、域测试 | 先冻结公共接口；不改其他任务目录 |
| 2 | Firebase 页面适配 | URL 解析、DOM 提取、列表选择、合成 fixtures | 依赖 1 接口；真实 DOM 样本影响支持声明 |
| 3 | 本地队列与采集调度 | service worker、storage、单标签页采集、取消/失败重试 | 依赖 1/2 接口；覆盖 MV3 重启与异步竞态 |
| 4 | 管理页与集成 | 清单、进度、字段预览、下载、安装文档 | 依赖前三项；集成静态检查与全量测试 |

建议 worktree 父目录 `E:\work\CrashBridge-wt`，使用 `wt-issue-N` 与 `wt-review-P`；待确认后创建。并发不超过 4。

## 4. 逐任务行为清单

### 任务 1：域逻辑

- 相同项目/App/Issue 重复添加只出现一次；不同 App 或项目的相同 Issue ID 保留。
- 空 ID、伪造 URL、超大字段与无效消息被拒绝，错误可见，不静默裁剪标识。
- JSON 与 Markdown 均携带 schema、来源、采集时间、缺失字段、完整性说明和失败条目；缺失字段用 null/未取得，不编造值。
- 堆栈中含围栏、HTML 或伪指令时只作为文本输出，不形成可执行 UI。
- 本次去重不影响下次主动重新采集；事件缺 ID 不捏造。

### 任务 2：适配

- 已支持的合成列表/详情 DOM 能提取准确身份与堆栈；缺失/歧义身份拒绝入队。
- SPA 路由/列表刷新不产生重复勾选控件；卸载清理监听，不改变 Firebase 原生操作。
- 详情中的实际 event ID 缺失为 null，时间/统计范围缺失明确标记。
- 登录页、未支持布局、空堆栈分别报错；不能将页面无关文本当堆栈。
- 缺少真实布局样本时，测试与 README 明确“真实控制台兼容未验证”。

### 任务 3：队列调度

- 单次最多一个临时详情标签页，串行采集，结果与发起的 Issue/标签页匹配，外来消息不能覆盖结果。
- 超时、关闭标签页、登录失效均逐项失败，继续后续；失败项可单独重试。
- 取消阻止后续调度，停止当前采集并只关闭自己创建的标签页；用户原标签页不受影响。
- MV3 worker 重启时 collecting 项标记中断并可重试，不能永久卡住或重复创建标签页。
- storage 写入失败可见，不宣称持久化成功；清空同时删除捕获内容。

### 任务 4：管理页与集成

- 可查看、删除、清空跨页累计的队列，重复项有反馈。
- 显示采集进度和逐项失败原因；运行中禁用会冲突的开始动作。
- 导出前可预览实际将下载的字段，关闭字段不进入 JSON/Markdown；显示“自动隐私清理不保证覆盖全部敏感信息”。
- JSON 和 Markdown 分别由用户主动下载；浏览器拒绝下载时提示重试，不误报成功。
- 构建产物含有效 MV3 manifest，所有脚本/页面引用均存在，无远程代码，无真实用户数据。

## 5. 测试策略

- 当前是空仓库，无现成第三方测试框架；建议使用已安装 Node 的内置 `node:test`、assert 与原生覆盖率，避免下载依赖。
- 纯域逻辑（标识、去重、校验、序列化）100% 行覆盖；队列/存储状态逻辑至少 90%；DOM/UI/浏览器胶水不设数字，按 fixture、静态校验与行为测试验收。
- 每条行为至少有实质断言，禁止恒真断言与吞异常测试。覆盖失败、取消、重启和并发消息路径。
- 使用合成 DOM fixtures / 浏览器 API 测试替身，不导入真实崩溃或 Google 账号信息。不联网下载工具。
- 实际本机 Node v24.18.0 / npm 11.16.0，Git 身份已配置；无 submodule。零 npm 依赖，不运行联网安装。项目命令拟固定为 `npm run check`（node --check 全部 JS + manifest/引用校验）、`npm run build`（组装 dist/ 扩展）、`npm test`（全量 node:test）、`npm run test:coverage`（Node 原生行覆盖报告）；worker 最小任务用 `node --test tests/<负责模块>/*.test.js`。覆盖率只统计 src/domain、src/background 中被测业务文件，不把测试与生成产物计入；UI/DOM 胶水单列 n/a。上述命令和公共模块接口将在阶段 2 建单前写入项目 AGENTS.md 及各 Issue，不允许运行时临时发明替代任务。
- 最终集成门禁为完整静态/构建检查 + 全量单测 + 覆盖率报告；无登录态真实页面验证时明确披露，不将合成测试称作生产验证。

## 6. PRD 外决策清单

用户已确认以下 v1 方案。开发期间补充决策：底层浏览器资源操作（tabs/alarm）失败或 storage 写入失败时暂停整批、保留结果；未知本地 schema 不覆盖；运行中删除/清空需先取消。详见 DECISIONS.md「浏览器资源故障与本地数据保护」（用户明确确认）。

| 业务问题 | 建议方案 | 被否/待选备选 |
|---|---|---|
| 支持浏览器 | Chrome 与 Edge 的 Chromium MV3 | Firefox 暂不支持 |
| 每问题日志数 | 当前展示的一个代表事件，最新与完整性不作无证承诺 | 多事件/全变体留后续 |
| 自动化方式 | 串行临时标签页读取已渲染 DOM | 不拦截 Cookie、不接未公开接口 |
| 保存与隐私 | 本机持久队列与结果；清空即删除；导出前预览 | 不自动上传、不接 Harness |
| 采集受限 | 明确 unsupported/partial/unknown；支持失败重试 | 不将空堆栈视成功 |

新增会改变用户结果/失败行为的决策必须回到本节并由用户确认，不能由 worker 静默选定。

## 7. 契约影响面

空仓库，无既有埋点、Remote Config、Intent、Deep Link 或 FCM payload 契约。

本次新增：导出 schemaVersion 1、复合去重键、extension 消息 v1、本地存储 schema、Firebase 路由识别和权限范围。使用者分别为 Harness/人工读者、域逻辑、content/background/UI 及浏览器宿主。冻结后变更需同步所有受影响模块、测试和文档。

## 8. 状态协议与评审

按 skill 的 Issue milestone/comment/label 协议执行；主 Agent 单写 labels 与 DECISIONS.md。Worker 为 GPT-6.1 Sol / high；Reviewer 同为用户最新指定的 GPT-6.1 Sol / high，用户明确授权同家族例外；仍使用独立上下文与独立 worktree，不称为跨模型评审。所有产出署实际模型和档位，未知字段如实 unknown。

用户已确认 PRD；GitHub milestone/issues/PR 将按此创建；最终合并需用户单独决定。精确跨模块接口与离线命令见 `docs/contracts.md`（本 PRD 冻结附录）。START_CAPTURE 不重复采集 succeeded 项；如要重新采集成功项，显式删除该项后重新添加，界面必须明示。

## 9. 外部依赖降级契约（待确认）

| 外部依赖失败方式 | 建议期望行为 |
|---|---|
| Firebase 布局或 URL 无法可靠识别 | unsupported；停止该项；不猜 ID、不导出空成功 |
| 登录失效/跳转到认证页 | login-required；用户手动登录后重试，不自动填凭据 |
| 页面加载慢/代理网络错误 | 60 秒超时失败，可手动重试；不静默自动重试 |
| 事件或线程未加载 | 可用堆栈标记 partial/unknown，完全没有堆栈则 missing-stack |
| 临时标签页被关闭 | 当前项 tab-closed，继续后续项 |
| storage 配额/写入失败 | storage-failed，告知哪些结果未保存，不静默丢弃 |
| worker 被浏览器挂起或重启 | 恢复时标记中断，用户重试；不自动重新采集 |
| 下载权限被拒/下载失败 | download-failed，保留队列与预览，允许再次下载 |
| 列表页插件未注入/权限不足 | 显示启用/刷新指引，不要求全站权限或导出 Cookie |
