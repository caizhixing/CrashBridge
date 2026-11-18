# CrashBridge 0.1.0 — 候选版本

## 可用范围

Chrome / Edge Manifest V3 扩展：从支持识别的 Crashlytics Android 问题列表逐项勾选并跨页加入本地队列，按项目 + App + Issue ID 去重；串行采集每问题一个当前代表事件，预览并分别下载 JSON / Markdown。支持取消、失败重试、清空本地数据，默认不导出设备与聚合统计。

不上传、不创建 Harness 会话、不修改 Firebase Issue 状态；不读取 Cookie，不调用私有 Firebase 接口。日志是数据，不执行其中的 HTML、脚本或提示词。

## 不能作为生产兼容保证

目前没有用户真实 Firebase DOM 样本，也未在登录态实际 Chrome / Edge 中验收。DOM 适配只经过合成边界测试：英语窄标签与少量语义选择器。你的控制台可能需要补充适配。无法识别会明确失败，不会把整页文本或空堆栈当成功。

当前事件不保证最新、全线程或全变体；完整性只标 partial / unknown。一个采集 document 仅用于初始 job 身份，内部 SPA 身份变动会保守失败，应通过新采集标签重试。隐藏 DOM 内容不读取。

## 安装与使用

1. 本地源码运行 `npm run build`（Node 24+，零依赖，无需 npm install），或解压候选 ZIP。
2. 在 chrome://extensions 或 edge://extensions 开启开发者模式，“加载已解压的扩展程序”，选中包含 manifest.json 的构建目录。
3. 刷新 Firebase Android Crashlytics 列表；勾选可识别的问题并加入清单。
4. 点击 CrashBridge 工具栏入口打开管理页，主动开始采集。
5. 预览、检查字段与警告，再分别下载 JSON / Markdown。手工脱敏后再分享给 Harness。

不要把本地真实崩溃数据附在公开 Issue 或 PR 中。完整安装、隐私说明和真实站点验收清单见 README.md。

## 限制与失败处理

- 队列上限 100 项；单项 60 秒；单堆栈 200000 字符，截断需警告；本地 UTF-8 JSON 4 MiB 上限。
- 单项普通失败保留并继续，底层标签页/定时器/存储故障安全停批；标签身份无法核实时不误关页面、不继续新建。
- 运行中须先取消，临时页清理完成后才能删除、清空或导出。若无法清理，保留现场，不直接解锁冲突操作。
- 未知存储 schema 不覆盖；存储写入失败可能仅保留内存，请尽快取消并导出，不保证扩展 worker 挂起后的未保存内容。
- 导出包含整个过滤后的清单及错误项，不只成功项；下载收到浏览器 complete 才显示完成。

## 验证说明

验证只包括源码静态检查、离线构建、Node 内置单元/模块集成测试与独立评审。不把 DOM 边界替身或 Chrome API 替身称作真实浏览器 UI 验收。最终测试数字、覆盖率、PR 结论及候选 commit 见 integration-report.md（最终门禁完成后生成）。

最终合并尚需用户决定；候选构建可供本机试用，不代表已发布浏览器商店。
