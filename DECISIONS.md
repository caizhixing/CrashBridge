# CrashBridge 决策日志

## 2026-11-16：多 Agent 流程与模型选择（选型已完成）

### 背景

使用 `E:\work\.agents\skills\multi-agent-pr-flow` 实现 Crashlytics 批量日志导出浏览器扩展。当前仓库尚无提交。阶段 0 完成前不进入 PRD 冻结、建单或开发。

### 选定方案

| 角色 | 用户选择 | 计划推理档位 | 可确认的实际配置 |
|---|---|---|---|
| main | 当前会话 GPT-6.1 Sol | 当前档位，未另行指定 | 模型由运行时声明为 gpt-6.1-sol；level 不可见，记 unknown |
| worker | tb-gpt/gpt-6.1-sol | high（用户明确指定） | 四项实际 subagent 调用均显式传 provider=tb-gpt、model=gpt-6.1-sol、reasoning_effort=high；子 Agent 已确认收到派单参数 |
| reviewer | tb-gpt/gpt-6.1-sol（用户在 GLM 不可用后明确改选） | high（用户明确指定，优先于 skill 的最高档默认） | 实际独立 Reviewer 调用显式传 tb-gpt / gpt-6.1-sol / high；PR verdict 如实署名 |

初次及后续查询仅列出 provider `tb-gpt` 的模型 `gpt-6.1-sol`，支持 medium/high/xhigh。用户先不接受同家族评审并指定 GLM-5.3 / high；在告知 GLM 尚不可调用后，用户明确改为 Reviewer 也使用 GPT-6.1 Sol / high。该最新指令构成同模型家族评审的明确例外，覆盖先前等待跨家族模型的要求。Worker 与 Reviewer 均显式传 tb-gpt/gpt-6.1-sol、reasoning_effort=high；评审保留独立上下文、独立 worktree、测试复核，承认错误相关性风险，不宣称跨模型评审。模型选型已完成；进入 PRD 草案确认，冻结前不建单或开发。

被否方案：worker 使用 medium（用户改为 high）；同家族 reviewer 使用 xhigh（用户明确不豁免）。

## 2026-11-16：公开仓库与日志隐私

### 背景

GitHub 仓库 `caizhixing/CrashBridge` 实际可见性为 PUBLIC；skill 默认要求私有仓库。

### 选定方案

用户明确要求保持 Public，豁免 skill 的私有仓库要求。仅向 GitHub 提交源码、文档和合成测试数据。真实崩溃日志、真实项目/事件标识、凭据、Cookie 和登录会话不得进入代码、Issue、PR、评论或测试样本。扩展导出数据仅落在用户本机，不自动上传。

被否方案：修改 GitHub 仓库为 Private。

## 2026-11-16：Git 操作与验证范围

用户显式调用 multi-agent-pr-flow；按该 skill 的项目内豁免允许 CrashBridge 仓库及后续 worktree 的 Git 操作，不外溢到其他仓库。ADB/模拟器/UI 验证豁免即使存在也仅限本项目，不授权控制 Firebase 或其他应用；本任务是浏览器扩展，不需要 Android 设备操作。隐私最小化要求持续有效。

初始阶段检查了当前目录、Git 状态与远端、GitHub 登录、远端可见性和模型。用户确认 PRD 后已提交并推送规格、建立 milestone / Issue #1–#4、并行开发并创建 PR #5–#8；实现仅组合到本地 integration/v1，未获最终批准前不合并远端 main。远端可见性保持 Public。

## 待确认事项

- 模型选择及 PRD 已确认；worker / reviewer 实际调用均显式 tb-gpt/gpt-6.1-sol / high；同家族例外经用户明确授权。独立评审已实际执行，不使用开发 Agent 自审。
- 已收到用户“继续”指令；尝试恢复持久化目标时工具返回 `the model cannot resume a paused goal; the user must resume it`。未将目标标记完成，也未绕过工具限制创建重复目标；不影响本轮整理草案。
- 用户确认 worktree 父目录 `E:\work\CrashBridge-wt`；用户确认 v1 PRD 并选择暂无真实 DOM 样本，先开发且明确兼容性未验证。
- v1 PRD 已确认冻结；精确模块附录 docs/contracts.md，任务 #1–#4 已创建并认领。生产 Firebase DOM 兼容仍未验证。

## 2026-11-16：浏览器资源故障与本地数据保护

背景：PRD 已覆盖单项采集错误，但未明确浏览器 tabs/alarm 操作本身失败时能否继续。用户在开发期间明确确认安全停批方案。

选定：临时标签页创建/查询/关闭或 alarm 创建/清理失败，标记 unsupported 和具体原因并暂停整批，保留已取得结果；storage 写入失败为 storage-failed，保留可见内存结果、暂停批次，不静默自动重试。未知本地 schema 只报错，不覆盖旧数据。运行中删除/清空拒绝，用户必须先取消，不隐式取消运行。普通单项 timeout/login/unsupported DOM/missing-stack/tab-closed 仍逐项记录并继续。

备选否决：底层资源状态不明时继续开下一页；写入失败仍报告保存成功；未知 schema 自动清空；删除动作隐式取消。

影响面：src/background/queue.js 调度与错误收敛，service-worker Chrome 桥接，管理页操作禁用与 lastError 展示，相关恢复/存储/取消测试。公共消息与错误枚举不变。

human-touch: 阶段 3，用户确认 PRD 未覆盖的浏览器资源故障安全停批规则（1 次）。

## 2026-11-16：导出快照与清理说明

管理页运行中禁止修改、重试及导出，避免变动快照；下载期间固定预览/字段选项，完成/中断分别提示，保留队列。导出包含过滤后的整个清单（含失败、待处理与取消项），符合保留失败信息的 PRD；清空先确认并明确不删除已下载文件。此处为现有动作的冲突防护/安全提示，不扩大采集范围。

## 2026-11-16：页面识别支持边界

暂仅精确 Android Crashlytics issue 路由；appId 使用路由字面值 android:<package>。堆栈只在限定语义区域提取且验证 Android Java/native frame；多个歧义区域 unsupported，空/无 frame missing-stack。元数据缺失或歧义留 null，不读取整页文本替代堆栈。属保守适配技术边界，不宣称真实页面已经验证。使用者为 adapter、域 validateIssue、background sender 校验与 fixtures；身份约定保持一致。

评审要求补强同一边界：只读取实际显示文本（hidden / aria-hidden / CSS 隐藏后代不读），每个采集 document 绑定初始 job/issue/event 身份；文档内 SPA 身份变动后不猜测旧堆栈归属，保守失败并由新标签重试。无需新增虚构 Firebase DOM 标记。该策略是纠正“仅当前渲染且身份可靠”既有要求的误实现，接口、采集范围与错误枚举不变。

## 2026-11-16：状态同步与下载快照的竞态

为了确保 storage 写入失败后保留的内存状态可见，管理页可见时每 2 秒 GET_STATE 只读兜底，隐藏暂停、在途合并、页面销毁停止；不联网、不触发采集。已有 GET_STATE 在下载开始后返回时，必须忽略该过期结果，下载终态再刷新。预览与 Blob 始终来自同一快照，不能用新读取覆盖下载中的预览。此为冻结预览契约的修复，不新增业务范围。

## 2026-11-16：独立评审与返工记账（进行中）

- PR #6（domain/tooling）round 1 pass：独立 16 项测试、逐域文件 100% 行覆盖，并实际恶意输入/路径测试。
- PR #8（background）round 1 fail：缺 URL 标签页身份被误判清理成功；3 条运行 guard 测试误传 payload，只验证了协议拒绝。rework-1 修复并增加回归；round 2 pass：23 项测试、queue 100% 行覆盖。
- PR #5（adapter）round 1 fail：读取隐藏文本、SPA URL 先变造成旧堆栈误归属；返工中。
- PR #7（manager）round 1 fail：在途读取覆盖下载快照；rework-1 已补真实 manager glue 回归，round 2 pass：25 项 UI 测试，独立复现实验 12 个终态/读取时序场景通过。
- 主 Agent 新增跨模块 pipeline 两项集成测试（实际 adapter→protocol→queue→双格式过滤导出），不是用 mock 替代被测模块。
- 异常退出/未发布 verdict 的 reviewer 启动不计评审轮；不会将无结论任务算 pass。页面适配原 worker 多次异常且进度停滞后，主 Agent 先 interrupt，再由新的相同模型/high worker 接管原树未提交修改，不丢弃现场、不双写；评审仍由原独立 Reviewer 执行。
- 有效空断言/假阳性打回次数：1（background guard 测试的 payload 错误；其余断言未被笼统否定）。
- 阶段 2–5 额外人触点：1（安全停批补充确认）；模型选择、PRD定稿、最终合并属于设计内门，不计额外干预。
