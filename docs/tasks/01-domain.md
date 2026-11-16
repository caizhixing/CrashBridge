# contract: 域模型、导出与离线工程门禁

- 合并序号：1
- PRD：docs/prd/crashbridge-v1.md 第 2/4/5 节；精确接口 docs/contracts.md（必须完整读取）
- 触碰范围：src/domain/**、tests/domain/**、scripts/**；package.json 已冻结，如需修改先报告。不得改其他目录。
- 冻结接口：docs/contracts.md 的 Issue 1 全部导出函数/常量、ExportBundle schemaVersion=1、消息 v1、Issue 复合键；不得改签名。

## 行为清单 / 对应测试

- [ ] model.test.js：复合 key 跨项目/App 不碰撞，输入校验拒绝空/超长/无效 URL，createQueueItem 生成明确 pending 状态。
- [ ] protocol.test.js：所有允许消息可解析，未知命令/错误类型/超大 payload 拒绝；CAPTURE_RESULT capture/errors/identity/schema 有实际校验，不仅检查对象存在。
- [ ] export.test.js：JSON 与 Markdown 保留来源/完整性/错误，所有字段排除选项双格式一致；不修改输入，不泄露未声明字段；堆栈含 Markdown 围栏/HTML 时不能注入 UI。
- [ ] scripts.test.js 或实质 CLI 测试：check 遍历语法与 manifest 引用；build 复制真实文件到 dist 不删除任意目录；coverage 对全部 domain 文件逐文件强制 100%，缺模块不能悄悄跳过，queue ≥90%。不 mock 被测逻辑。

## Out-of-scope

不实现 Firebase DOM、队列调度、UI；不安装依赖，不引入真实数据，不改变冻结业务行为。scripts 对其他任务未完成造成的失败应说明，不伪造占位 src 或 manifest。可在后续集成后复核完整 check/build。

## 测试

Node v24.18.0 内置 node:test；最小 node --check src/domain/*.js（逐文件）及 node --experimental-test-coverage --test tests/domain/*.test.js。domain 每文件 100% 行覆盖；构建脚本 n/a。每个边界有实质断言；完成反馈数字。

## 相关决策（开工必读）

DECISIONS.md 的模型选择（worker GPT-6.1 Sol high，review 同家族例外）、公开仓库隐私、Git 范围；用户已确认 PRD 与暂无真实 DOM 样本。发现新用户行为决策立即向主 Agent 上报，不自行拍板。

## 环境与发布

读 AGENTS.md 与 docs/contracts.md。worktree E:\work\CrashBridge-wt\wt-issue-1，分支 feat/issue-1，基于 main。先 claimed 评论再建树。所有 GitHub/push 命令设置 HTTP(S)_PROXY=http://127.0.0.1:7897。零依赖离线，不 npm install。只评论 claimed/compiled/tested/pr-open/rework-N/blocked；labels 主 Agent 单写。提交 trailers AI-Role: worker / AI-Model: gpt-6.1-sol / AI-Level: high；评论、PR body 独立 ai_role/ai_model/ai_level 块；PR 写 Relates to #1。不要合并 main。向主 Agent 返回实际模型/level、commit、测试/覆盖、PR URL。

ai_role: main
ai_model: gpt-6.1-sol
ai_level: unknown
