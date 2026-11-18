# CrashBridge v0.1.0 候选版本集成验证

## 当前结论

实现与离线集成门禁已完成；最终远端合并待用户批准。真实 Firebase DOM 与 Chrome / Edge 登录态/下载行为尚未验收，不宣称生产页面已适配。

## 实际验证

- 环境：Windows，Node v24.18.0 / npm 11.16.0；原生 ESM + Node 内置测试，零第三方依赖，未运行 npm install、未下载工具。
- 实现组合：domain 5562e07 + tooling f1b16ad、adapter a055141 + 6abc61b、background ab786c0 + 3a0e2f0、UI 8c1f511 + 6a71d5d；依赖域 cherry-pick 按 patch identity 去重，未覆盖域围栏 DoS 修复。
- `npm run check`：通过，16 个扩展/源码资源的语法和引用检查。
- `npm run build`：通过，16 个文件组装到 dist；不会删除未知文件。
- `npm test`：**103 passed，0 failed，0 skipped，0 cancelled**。
- `npm run test:coverage`：通过；src/domain/export.js、model.js、protocol.js 均 **100% 行覆盖**；src/background/queue.js **100% 行覆盖**（门禁 ≥90%）。缺失/未加载模块也会被门禁拒绝，不以 aggregate 隐藏漏测。
- 测试构成：域/脚本16 + adapter/content37 + background23 + UI25 + 跨模块集成2 =103。
- DOM/UI/Chrome 胶水不设覆盖百分比；使用合成 DOM/API 边界替身，不冒充真实浏览器验证。manager 实际模块接线及 adapter→protocol→queue→字段过滤导出均有实质测试。

## 独立评审

所有 worker/reviewer 实际参数显式 tb-gpt / gpt-6.1-sol / high，主 Agent level 不可见为 unknown；用户明确批准同模型家族例外。Reviewer 独立上下文和 detached worktree，实跑测试，不称跨模型评审。

| 任务 | PR | 有效轮次与结果 |
|---|---|---|
| domain / tooling | #6 | round1 pass；独立16项测试，恶意输入与路径边界额外验证 |
| Firebase adapter/content | #5 | round1 fail，rework-1修复；round2 pass，独立49项相关测试与28个隐藏文本交叉场景 |
| background | #8 | round1 fail；round2 pass，独立23项测试及missing URL六场景 |
| manager | #7 | round1 fail；round2 pass，独立25项测试及真实manager额外12场景 |

已修主要问题：隐藏 DOM 泄漏、SPA URL先变时误归属堆栈、无URL标签清理误判导致第二采集页、下载期间在途读取替换预览、Markdown大量反引号参数溢出。background三条guard测试曾因错误payload出现假阳性，已修为有效payload并断言状态/资源不变。有效空断言/假阳性打回1次。

## 契约核对

- 新增且保持冻结：ExportBundle schemaVersion=1、namespace crashbridge/version1、复合Issue key、storage schemaVersion=1、平台接口与允许消息枚举。
- 无未经授权改契约；当前空仓库无旧埋点、Remote Config、Intent、Deep Link 或 FCM payload 被变更。
- 权限仅 storage / alarms / downloads + https://console.firebase.google.com/*；WAR 精确三个导入模块，无 cookies/debugger/webRequest/全站访问。
- 日志仅文本；未发现运行时代码 fetch / XMLHttpRequest / document.cookie / innerHTML / eval 路径；不调用私有Firebase接口，不上传或修改问题状态。

## PRD 外决策与补充（供最终确认）

| 业务问题 | 实际行为 | 代码位置 |
|---|---|---|
| 底层浏览器/存储故障是否继续 | 用户已补充确认安全停批、保留结果；未知schema不覆盖 | src/background/queue.js |
| 页内身份变化能否继续认定堆栈归属 | 同document绑定初始job/issue/event，变化后unsupported，必须新采集标签重试 | src/content/app.js:71；src/adapter/firebase.js:79 |
| 写入失败的内存状态如何显示 | 管理页可见时每2s只读GET_STATE兜底，不启动采集；隐藏暂停、无重叠 | extension/state-sync.js；extension/manager.js |
| 下载中是否能更新预览 | 冻结快照，在途旧读取过期，终态后再刷新 | extension/manager.js:107、148 |
| 清空是否影响已下载文件 | 先确认，仅删本地队列/捕获，不删除已下载文件 | extension/manager.js:126 |
| 隐私字段默认 | 设备与统计默认关闭只影响下载，不等于没有暂存；警告与身份始终保留 | extension/ui-model.js:1；src/domain/export.js:4 |

其中安全停批已单独经用户确认，其余为既定“不猜成功/防冲突/安全提示”要求的技术细化；不新增数据来源或扩大采集范围。详见 DECISIONS.md。

## 尚未验证 / 用户试用注意

- 无真实Firebase页面结构样本；选择器与英语标签支持窄，实际列表/详情可能报unsupported，需要后续脱敏结构适配。
- 未在Chrome/Edge实际加载扩展、登录用户账号、操作真实问题或执行真实浏览器下载；README有手工验收清单。
- 仅一个当前代表事件，不保证最新、完整、全线程、全部变体；缺event ID为null。
- storage失败的内存结果可能随MV3 worker挂起丢失：请尽快先取消、清理临时页再备份，清理失败保留现场。
- 最终合并前保留worker/reviewer/worktree与PR现场，不为清理而丢未合并工作。

## 流程复盘

四项开发任务并行；有效review分布为1/2/2/2轮，异常未发布verdict不计轮次。阶段2–5额外人触点1次（资源故障安全停批补充）；模型/PRD/最终合并为设计内门。候选集成未合并远端main，最终合并率目前0/4；没有把待批准当已合并。首版无遗留小修统计，不编造吞吐收益。
