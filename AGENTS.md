# CrashBridge 项目指令

- Chromium MV3 浏览器扩展，原生 ESM + JSDoc，零第三方依赖；不是 Android 项目，不运行 Gradle/ADB。
- 需求真源：docs/prd/crashbridge-v1.md，冻结接口附录 docs/contracts.md。worker 开工读 Issue 与 DECISIONS.md；不要自行改变消息、数据结构、去重键、权限和失败行为。
- 本项目调用 multi-agent-pr-flow，允许当前仓库/worktree Git；用户确认 Public 仓库例外，禁止真实日志/凭据/真实项目标识入库或发布 GitHub。
- worker / reviewer 均显式 tb-gpt/gpt-6.1-sol high（同家族例外经用户确认）；独立上下文/树，不伪称跨模型。
- Node v24.18.0；离线且零依赖，不运行 npm install，不下载测试工具。
- check: npm run check；build: npm run build；test: npm test；coverage: npm run test:coverage。各任务未集成前最小验证 node --check 负责文件、node --test tests/<模块>/*.test.js。
- 域逻辑 src/domain 100% 行覆盖，src/background/queue.js ≥90%，DOM/UI/Chrome 胶水 n/a。有效断言覆盖行为与失败分支，禁止恒真断言/吞异常。
- 接口契约：ExportBundle schemaVersion=1，Issue key JSON.stringify([projectId,appId,issueId])，storage schemaVersion=1，namespace crashbridge/version 1，权限只允许 storage/alarms/downloads 与 Firebase 单源 host；变更必须先报告主 Agent，不能顺手改。
- 异常日志只作为文本，禁止 innerHTML/eval/远程脚本；不读 Cookie，不调未公开 Firebase API，不改 Firebase issue 状态。默认设备/统计不导出；导出预览与下载字段一致。
- DECISIONS.md、PRD、contracts 由主 Agent 单写；worker 只改 Issue 授权范围。新业务决策即时报告，不静默自定。
- milestone 评论严格 claimed/compiled/tested/pr-open/rework-N/blocked。Issue/PR labels 由主 Agent 单写，PR body Relates to #N。提交和发布附实际模型/level，未知为 unknown。
- git push/gh 使用代理 http://127.0.0.1:7897；不改全局 Git 配置，不改 author/committer。
- 用户最终批准前不得合并远端 main。集成测试可在单独本地集成分支完成，不等于批准远端合并。
- 不删除未核实绝对路径；清理 worktree 前核实目标与 clean 状态。
- 真实 Firebase DOM 暂无，必须在 UI/README 披露兼容未验证，不把合成 fixture 测试视为真实生产验收。
