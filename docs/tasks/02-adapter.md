# contract: Firebase URL/DOM 适配与批量选择入口

- 合并序号：2
- PRD：docs/prd/crashbridge-v1.md 第 2/4 节；冻结精确接口 docs/contracts.md 全文。
- 触碰范围：src/adapter/**、src/content/**、tests/adapter/**。不改 src/domain/background/UI。
- 冻结接口：parseIssueUrl/discoverIssues/extractCapture 签名及 content 入口见 docs/contracts.md。IssueRef/Capture 字段与消息格式不可擅改。

## 行为清单 / 对应测试

- [ ] firebase.test.js：真实风格合成 Firebase Android issue URL 正确取 project/app/issue；伪造域名/非 HTTPS/缺身份/非 Crashlytics/外站链接拒绝；query event ID 可读，不能用任意尾段猜 ID。
- [ ] discover.test.js：列表多条链接跨页可加入，复合 key 去重；显示 namespaced 勾选控件和加入清单按钮，刷新/SPA 不重复挂载，不拦截 Firebase 本身操作。用最小 fake document 作浏览器边界替身。
- [ ] capture.test.js：身份匹配、堆栈/因果链提取、版本/设备/统计缺失为 null，当前事件未知完整性标记 unknown/partial；200000 字符截断有 warning；无堆栈不成功。
- [ ] capture.test.js：登录失效、布局不支持和身份不匹配明确失败，不将整页文本当日志；不依赖自造 data-crashbridge fixture 标记作为唯一支持路径，采用窄范围语义/可配置选择器，并明确真实控制台未验证。
- [ ] content.test.js：job hash 与 URL 校验、等待 DOM（最多 60s，由调度兜底）、一次提交结果，失败可见；不读取 Cookie/调用私有 API/点击状态按钮。MutationObserver 生命周期合理，无无限轮询。

## Out-of-scope

无真实 DOM 样本；不得声称生产已验证，不接私有接口、BigQuery、Harness，不改变 Firebase 状态。新业务决策报告主 Agent。域函数若尚未存在可独立实现 adapter 并按契约导入；不得造重复 domain 模块。

## 测试与决策

Node v24.18.0，node --check 负责 JS；node --test tests/adapter/*.test.js。UI/DOM 胶水覆盖 n/a，但行为有断言；可分离纯 parser 并给足边界测试。读 DECISIONS.md（公开仓库隐私、同家族 high 评审、真实 DOM 未验证）。零依赖，不 npm install。依赖 Issue #1 冻结接口，先基于 main 开发无需等待其代码；由主 Agent 集成时合并依赖。

## 发布

worktree E:\work\CrashBridge-wt\wt-issue-2、分支 feat/issue-2，先 claimed 后建树。HTTP(S)_PROXY=http://127.0.0.1:7897；固定里程碑评论 claimed/compiled/tested/pr-open/rework-N/blocked；labels 主 Agent 单写。commit trailers AI-Role: worker / AI-Model: gpt-6.1-sol / AI-Level: high，PR/评论带独立 ai_role/ai_model/ai_level 块，PR Relates to #2。不要 merge main。返回实际模型/level、测试、commit 和 PR URL。

ai_role: main
ai_model: gpt-6.1-sol
ai_level: unknown
