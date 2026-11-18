# v1 公共模块契约（PRD 冻结附录）

本文件由主 Agent 冻结，worker 不得改动；业务行为以 docs/prd/crashbridge-v1.md 为准。

## 文件归属与导出

所有 JS 使用 ESM / JSDoc，零第三方依赖。域对象与消息均为可 JSON 序列化值。不得依赖 chrome 全局来导入域或 adapter 模块。

### Issue 1：domain / 基线

- `src/domain/model.js`：导出 `LIMITS`（maxIssues:100,maxIdLength:512,maxTitleLength:1000,maxStackLength:200000,maxStorageBytes:4194304,timeoutMs:60000）、`issueKey(issue)`、`validateIssue(value)`（返回校验/规范化后的 IssueRef，无效抛 Error）、`createQueueItem(issue)`。
- `src/domain/export.js`：导出 `createBundle(items, options, exportedAt)`、`toMarkdown(bundle)`。options 为 `{stacktrace:boolean,version:boolean,device:boolean,statistics:boolean}`；导出 bundle 为 PRD ExportBundle。关掉 stacktrace 删 capture.stacktrace；version 删 appVersion/versionCode；device 删 osVersion/deviceModel；statistics 删 statistics。不得原地修改 items。输出只允许已声明字段，错误和 warnings 不删。动态 Markdown 围栏、标题及链接需防注入。
- `src/domain/protocol.js`：导出 `parseMessage(value)` 校验 namespace/version/type/payload；成功返回规范消息，失败抛 Error。payload 约定见下节。
- `scripts/check.mjs`、`scripts/build.mjs`、`scripts/coverage.mjs`：离线检查、复制 extension 目录及 src 到 dist、解析 Node coverage 并执行分层门禁。build 不删除未知目录，只写构建文件。
- `tests/domain/*.test.js`：100% 行覆盖。

### Issue 2：adapter/content

- `src/adapter/firebase.js`：`parseIssueUrl(url)` 返回 IssueRef（title:null）或 null；`discoverIssues(document,url)` 返回 IssueRef[]；`extractCapture(document,issue,now)` 返回 Capture，无堆栈/布局不支持时抛带 code 的 Error；必须验证页面身份匹配。支持合成的真实风格路由 `/project/<project>/crashlytics/app/android:<package>/issues/<issue>` 及可选 query eventId；额外明确支持的路由要有测试，不泛化猜尾段。
- `src/content/main.js`：经典入口，dynamic import(chrome.runtime.getURL('src/content/app.js'))。
- `src/content/app.js`：列表勾选控件和加入队列按钮，MutationObserver 处理 SPA；优先使用 query `crashbridge-job=<uuid>`（兼容 legacy hash `#crashbridge-job=<uuid>`）等待可用详情 DOM 并发 CAPTURE_RESULT，捕获 URL 使用现存真实问题路径而非拼造接口。Firebase SPA 可清除 hash，不能因此丢失任务身份。不得点击 Firebase 状态按钮。独立注入 UI 放 Shadow DOM；Firebase 原节点标记应使用 namespaced 属性。
- `tests/adapter/*.test.js` 与合成 fixtures，无第三方 DOM 库；可用最小 fake document 接口作边界替身，不 mock 被测解析函数。

### Issue 3：background

- `src/background/queue.js` 导出 `createController(platform)`；返回 `{handle(message,sender),recover()}` 两个 async 方法。
- platform：`read():Promise<object|null>`、`write(state):Promise<void>`、`open(url):Promise<number>`、`close(tabId):Promise<void>`、`getTab(tabId):Promise<{id:number,url?:string}|null>`、`alarm(name,when):Promise<void>`、`clearAlarm(name):Promise<void>`、`now():string`（ISO 时间）、`uuid():string`、`extensionUrl(path):string`。
- persisted state：`{schemaVersion:1,items:QueueItem[],active:null|{key,tabId,jobId,url,deadline},running:boolean,lastError:null|{code,message}}`。单写者串行操作；写入先验证体积。若持久化失败，返回 error，不宣称成功；保留可在 GET_STATE 看到的内存状态并标记 lastError。
- `src/background/service-worker.js` 接 chrome API，alarm 触发 controller.handle 内部 `{namespace:'crashbridge',version:1,type:'TIMEOUT',payload:{jobId}}`；tabs.onRemoved 触发内部 TAB_CLOSED `{tabId}`。内部消息不接受 runtime 外部 sender。
- recover 只在首次加载调用；active 若存在标记 cancelled + error cancelled（中断），核实 getTab 的 ID 和 URL（含 job hash）后清理，不继续旧批次。运行期间所有异步回调必须校验 jobId，取消后旧结果不能污染。
- 用户补充确认：tabs.open/getTab/close 与 alarm/clearAlarm 底层失败记 unsupported + 具体原因，安全停批并保留结果；storage 失败 storage-failed + 停批，保留可见内存结果不误报持久化成功。未知 schema 拒绝写回。运行中 REMOVE_ISSUE/CLEAR_QUEUE 拒绝，须用户先取消。普通单项加载/DOM/超时错误仍继续后续。
- `tests/background/*.test.js` ≥90% 行覆盖；service-worker Chrome 胶水 n/a。

### Issue 4：UI/manifest/docs

- `extension/manifest.json`，service worker 路径 `src/background/service-worker.js`、type module；content entry `src/content/main.js`；web_accessible_resources 仅需要的 content/adapter/domain modules，matches 为 Firebase 单源。
- `extension/manager.html`、`extension/manager.js`、`extension/manager.css`：管理页引用最终 dist/src 域模块路径；downloads 在管理页显式触发，检查 onChanged complete/interrupted 不把开始请求当下载成功。object URL 使用后回收。
- action 点击通过 service-worker 打开 `manager.html`（Chrome 胶水归 Issue 3；manifest 默认不设 popup）。
- README.md：安装 dist、工作流、隐私、已知兼容性限制与真实站点手工验收步骤；无虚假“生产已验证”。
- tests/ui/*.test.js：可测试纯 UI helpers（可放 extension/ui-model.js），有 HTML 安全与字段过滤断言；浏览器胶水 n/a。

## 消息 payload

`{namespace:'crashbridge',version:1,type,payload}`。

- ADD_ISSUES `{issues:IssueRef[]}`
- GET_STATE `{}`
- REMOVE_ISSUE `{key:string}`
- CLEAR_QUEUE `{}`
- START_CAPTURE `{}`（将 pending + cancelled 作为本批；已成功项保留；需显式 RETRY_FAILED 才重试失败项；需重新采集成功项可从清单移除后重新添加，UI 明示）
- RETRY_FAILED `{}`（失败项重置 pending 并启动，成功项不重采）
- CANCEL_CAPTURE `{}`
- CAPTURE_RESULT `{jobId:string,issueKey:string,capture:Capture|null,error:{code,message}|null}`
- TIMEOUT/TAB_CLOSED 仅 controller 内部事件，不在 parseMessage 允许的 runtime 消息中。

返回统一 `{ok:true,data}` / `{ok:false,error:{code,message}}`。GET_STATE data 是 state；变更操作 data 也返回 state（ADD_ISSUES 可在 data 同级 added/duplicates 数字，UI 不依赖其存在）。只允许 extension manager URL 发管理消息；GET_STATE 也只给 manager；ADD_ISSUES 要求 Firebase 同源 tab、sender.id 为自身扩展，且每个 issue 项目/App 与列表 sender URL 匹配；CAPTURE_RESULT 匹配 tab/job/issue 与 URL 身份。

## 2026-11-17 授权新增：真实列表路由解析

用户确认方案及行为以 docs/prd/real-list-hotfix.md 为准；不改变旧 schema1、IssueRef、去重key或既有消息语义。新增独立 adapter/selection.js 与 background/resolver.js。

- RESOLVE_SELECTION `{listUrl,snapshot:[{title,subtitle,href,cells}],selected:[index]}`：顶层自身扩展 Firebase 源列表content请求；listUrl与sender原始列表URL匹配，身份/长度/数量校验，最多100行，标题/副标题仅临时匹配不作ID。cells为gridcell数量，是结构校验而非身份。
- GET_RESOLUTION `{}`：仅发起的源列表tab/frame0读取自己的解析进度/错误，不能取得其他tab状态。
- RESOLVER_READY `{token}`：仅后台owned临时tab/frame0握手；必须绑定当前随机解析任务标识及精确URL，不能由源列表冒充。
- CANCEL_RESOLUTION `{}`：仅发起源列表tab/frame0取消，安全清理后释放；未知标签身份保留active及错误，不能误关或继续新建。
- OPEN_MANAGER `{}`：仅顶层自身Firebase content请求打开manager，不接受外站。
- tabs.sendMessage内部 RESOLVE_ROW `{token,snapshot,index}`：只给owned临时列表tab（任务标识绑定），content重建完整有序快照，匹配唯一row fingerprint，才可点击标题；真实detail通过tabs.onUpdated匹配project/app后交现有controller ADD_ISSUES，以真实临时Firebase sender身份执行，不削弱旧校验。
- tabs.sendMessage内部 CHECK_SELECTION `{snapshot,index}`：只核验发起源列表快照，绝不点击原列表；接收者校验扩展sender和顶层frame。
- 增加精确selection.js WAR但不增加权限，session storage仅解析状态；重启中断可见，capture和resolve互斥。
- 消息固定namespace/version1；所有新增消息必须校验extension id、tab和frame0、来源/任务标识、payload形状及大小。未知/伪造/过期拒绝，不改Firebase状态、不读私有Angular数据。

## 离线命令

Node v24.18.0，无 npm install。package.json 主 Agent 建立并固定：

- npm run check → node scripts/check.mjs
- npm run build → node scripts/build.mjs
- npm test → node --test tests/**/*.test.js
- npm run test:coverage → node scripts/coverage.mjs

覆盖率用 node --experimental-test-coverage --test，统计 src/domain 全部模块 100%，src/background/queue.js ≥90%；未加载模块也必须计为未覆盖，不得仅展示 aggregate。UI、DOM adapter、service worker 胶水 n/a，但对应行为测试必需。脚本待 Issue 1 实现，其他任务在自己分支运行 node --check <files> 和自己模块 node --test，最终集成复核全命令。
