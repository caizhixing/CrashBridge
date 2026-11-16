# 集成与交付验收清单

状态：待实现完成、独立 review 与集成后填写。不把本清单视为验证已通过。

## 1. 本地离线集成

- 按 Issue 1→2→3→4 顺序，将实现组合到单独 integration 分支；不在用户最终批准前合并远端 main。
- 每项 PR 必须有 claimed/compiled/tested/pr-open，实际模型/level 与有效 review-verdict。
- 原始域依赖 commit 被多个分支 cherry-pick 时按 patch identity 处理，不能覆盖已有新代码。
- reviewer 独立 worktree 运行同样最小测试；最终 npm run check / npm run build / npm test / npm run test:coverage。
- 覆盖门禁：domain 全部业务文件逐文件 100% 行，queue.js ≥90%；无空断言，不通过减少统计范围凑数字。
- check 验 manifest 和所有 HTML/JS 引用；构建 dist 内 module/import/getURL 路径与 content resource 单源权限匹配。
- 记录完整集成 commit、测试数、覆盖率、命令结果、已知缺陷；无真实控制台验收不得声称已适配。

## 2. 静态安全与权限

- host/content/resource matches 仅 Firebase 控制台 HTTPS；无 cookies/debugger/webRequest/全站/远程代码。
- manager 权限与 Firebase sender 严格区分；GET_STATE 不能泄露日志给网页；CAPTURE_RESULT 需 tab/job/issue匹配。
- 页面堆栈不经 innerHTML/eval；导出白名单；所有关闭标签动作验证扩展创建记录与预期 URL。
- 单项失败继续，浏览器资源/存储底层失败安全停批；取消/重启旧回调不能污染新批次。
- 清空删除本地日志，未知 schema 不覆盖；4MiB预算失败不虚报成功。
- 默认关闭设备/统计，预览/双格式下载一致；下载 complete/interrupted 有区别，失败不丢队列。
- 源码/fixtures/GitHub 无真实项目、凭据、Cookie 或用户日志。

## 3. 用户本机手工验收（真实站点未提供，待用户后续验证）

以下需用户在自己的 Chrome/Edge 登录态检查，不向仓库上传真实 DOM 或崩溃数据：

1. 加载 dist 后 action 打开管理页，显示兼容性未验证提示。
2. Firebase Android 问题列表已加载行可勾选；分页/筛选累计不重复，项目/App身份准确。
3. 选中两个合成/可安全测试问题采集，最多一个临时详情标签页；原始页面保持。
4. 支持布局取得堆栈；不支持布局明确 unsupported/missing-stack，不把整页当成功日志。
5. 取消/关闭临时页/失败重试行为符合文档，manager 刷新不丢已保存结果。
6. 预览关闭设备/统计等字段，两种下载都不含；缺失信息与完整性未确认明确显示。
7. 清空前确认，清空后本地捕获为空，但不删除已下载文件。

## 4. 最终用户决策材料

交付：未合并 PR 链接、可加载扩展目录/zip、验证摘要、PRD外决策（含代码位置）、冻结契约核对、真实兼容限制。用户最终拍板后才执行远端合并和清理干净 worktree。
