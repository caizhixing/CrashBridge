# contract: 本地持久队列与可取消单标签页采集

- 合并序号：3
- PRD：docs/prd/crashbridge-v1.md；冻结接口 docs/contracts.md 全文（尤其 platform/controller 与消息）。
- 触碰范围：src/background/**、tests/background/**。不得改 domain/adapter/UI/manifest/contracts。
- 冻结接口：createController(platform) -> {handle,recover}；platform 方法、persisted state、消息 sender 鉴权、错误格式以 contracts 为准。

## 行为清单 / 对应测试

- [ ] queue.test.js：ADD_ISSUES 复合去重、跨 app/project 区分、限制 100 条；无效/不匹配发送者拒绝；manager 专有命令不能被 Firebase 页面或其他扩展发起。
- [ ] capture.test.js：单标签页串行采集，结果匹配 tab/job/issue/URL；完成后清理自己的标签页，保留用户页面；伪造与旧回调拒绝。
- [ ] capture.test.js：单项 60s timeout、标签页关闭、登录/DOM 失败均记录具体错误并继续；RETRY_FAILED 只重试失败项，START_CAPTURE 不重采成功项，重新采集需删除再加。
- [ ] recovery.test.js：取消停止后续项、旧结果不能覆盖；recover 标记中断并仅关闭 ID/URL 双校验的旧任务标签页；无状态正常初始化、未知 schema 不悄悄擦除。
- [ ] storage.test.js：4 MiB UTF-8 预算/配额/写入失败不能宣称持久化成功，内存 lastError 可见；清空删除日志；竞态单写者不丢队列，open/close/alarm 抛错可收敛，不产生无限 retry。
- [ ] service-worker 胶水：storage/alarms/tabs/runtime action 正确接线，parseMessage 拒绝内部 TIMEOUT/TAB_CLOSED 外部伪造；action 打开 manager.html；GET_STATE 只给 manager。

## Out-of-scope

不实现 DOM/导出/管理页面；不动用户原标签页、不读 Cookie、不接外站。真实 DOM 未验证；不安装第三方依赖；新业务决策上报主 Agent。依赖 #1 接口：允许先写队列逻辑与 fake platform 测试，但不造复制的域模块；最终有依赖后复测。

## 测试与决策

Node v24.18.0，node --check 负责 JS；node --experimental-test-coverage --test tests/background/*.test.js，queue.js ≥90% 行覆盖（不能 mock 被测控制器），service worker Chrome 胶水 n/a。读 DECISIONS.md 模型、隐私、Git 范围与 PRD 确认；零依赖离线。

## 发布

先 claimed 评论，worktree E:\work\CrashBridge-wt\wt-issue-3，分支 feat/issue-3，从 main 建树。依赖域模块必要时找主 Agent 要实现 commit，不擅改域模块。HTTP(S)_PROXY=http://127.0.0.1:7897；评论仅 claimed/compiled/tested/pr-open/rework-N/blocked；labels 主 Agent 单写。提交 trailers AI-Role: worker / AI-Model: gpt-6.1-sol / AI-Level: high；评论/PR ai_role/ai_model/ai_level 独立块；PR Relates to #3。不要合并 main。返回实际模型/level、测试/覆盖、commit、PR URL。

ai_role: main
ai_model: gpt-6.1-sol
ai_level: unknown
