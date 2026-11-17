# PRD 补充：真实 Firebase 列表选择与路由解析（2026-11-17）

状态：用户已确认（采用临时标签只读导航取得真实 ID + 固定工具栏方案）。基于 candidate/v0.1.0；不合并远端 main。

## 实测证据（仅结构，无真实数据）

Ego Lite CDP本机9223实测：4条 TR[role=row]，标题组件 data-test-id=issue-caption-table-cell；标题 a.link-wrapper 的 href 全为 #，无 data-issue-id/routerLink 属性，Angular调试API不可用。点击标题可正常导航真实 /issues/<id> 地址。旧toolbar为 static，top等于viewport高度，整块在视口下；管理页0数据。未读取堆栈或Cookie。

## 用户确认行为

- 原始Firebase列表不导航、不修改，Firebase原生checkbox不复用（避免状态批处理冲突）。CrashBridge独立勾选，视觉明确区分。
- 右下固定工具栏显示已选N条、加入清单、成功/重复/失败反馈、可打开管理页。初始及无选择禁用加入；异步运行锁冲突动作。
- 支持当前实际 tr/role row + issue-caption-table-cell 的 href=#行。已有真实详情href路径继续支持。
- 选择不是已入队；点击加入后才解析临时选择。未解析行不冒充IssueRef，不生成假ID，不按标题去重。
- 后台最多一个扩展临时解析标签，复用当前列表完整URL（过滤凭据/校验同源与list路径；保留筛选参数使快照可匹配）。解析标签必须精确核实匹配的列表快照（行顺序/数量/标题结构摘要），行签名歧义或重排、过滤变动拒绝；仅标题不是ID。
- 临时页只点击已匹配标题链接，读取导航后的真实URL；项目/App必须和源列表一致。导航失败/登录/超时逐项显示失败，不按行号猜Issue ID。成功按现有复合ID域逻辑入队。
- 临时解析页清理：仅扩展创建且身份/URL核实的页面，用户导航到外站或不可核实时不误关，安全停批并提示。解析与已有capture不能并行。重启中断不静默恢复；不得永久卡锁。
- 已成功解析项可入队，失败项保留可读反馈。管理页已有采集/下载schema不变。
- 短期刷新/重新加载扩展后旧content script失效要明确提示，不能假成功。

## 授权契约变更与影响面

原有消息namespace/version1、IssueRef、ExportBundle schema1、capture参数/状态及去重key不变。允许新增 RESOLVE_SELECTION（原始listURL+临时行描述/快照摘要）以及仅tabs.sendMessage内部使用的解析指令；所有新增payload验证、发送者tab/frame校验，不能被网页伪造。允许扩展已有ADD_ISSUES内部供真实解析结果调用但不得削弱原sender鉴权。

只新增必要module/WAR条目并同步manifest测试，仍单Firebase origin，权限不增加。内容脚本路由解析不触碰状态按钮、Cookie、私有接口、Angular内存或后台网络响应。真实项目标识只在本机扩展内处理，不进入源码、Issue、PR、测试或命令输出。

## 文件与测试范围

允许修改content/adapter、background、domain protocol（如需要）及相关tests、manifest精确WAR、README/该需求文档/决策日志。域新增业务逻辑100%行，queue与新background状态模块≥90%，浏览器胶水n/a但必须实质行为断言。

每行为至少1实质断言：href#真实行挂载、原生checkbox不变、固定toolbar/计数/提交触发；snapshot匹配/歧义/重排拒绝；伪造来源/超大payload拒绝；临时页只读导航取得URL后复合去重；失败清理/取消或超时/restart收敛/禁止capture重叠；真实href兼容；无用户数据fixture。

离线check/build/test/coverage全量门禁。Worker GPT-6.1 Sol high，独立Reviewer GPT-6.1 Sol high（沿用用户同家族豁免），最多3轮。先提hotfix PR基于integration/v1或候选，不合并main；真实浏览器验证仅名单结构和入队数量，不打印ID/标题/堆栈，不下载/上传实际日志。
