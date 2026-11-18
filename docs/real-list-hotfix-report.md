# 真实 Firebase 列表修复验证

## 范围

问题：真实列表标题链接 href=#，无法按原真实href发现Issue；旧工具栏static落在viewport下，选择无清晰反馈。用户批准独立勾选、固定工具栏及临时标签只读导航取得真实ID后入队。

## 实现

- 固定Shadow DOM工具栏、已选数量、打开管理页、加入/取消解析、成功/重复/失败反馈。
- 按真实data-test-id标题结构发现hash行；完整有序快照与唯一行指纹匹配，提交前重验，标题仅临时匹配不作去重ID。
- 最多一个后台临时标签；项目/App和真实detail URL验证后走现有复合ID去重队列，用户原列表不导航。
- 新解析消息严格来源/frame0/token校验，capture与resolve原子互斥；未知session fail-closed。
- 用户激活临时页即sticky中断、不后续点击/入队/误关；重启不凭持久化detail URL认领关闭页面，提示手工close。
- 新selection WAR精确单文件，浏览器权限不增加，旧导出schema/IssueRef/key不变。

## 当前离线证据

Node v24.18.0，零第三方依赖，无下载工具。

- npm run check：通过，18个源码/扩展文件。
- npm run build：通过，18文件构建至dist。
- npm test：129 passed / 0 failed / 0 skipped。
- npm run test:coverage：domain model/export/protocol、queue、resolver逐文件100%行覆盖；DOM/UI/Chrome glue n/a，行为有实质断言。
- 实现提交：60c2ddf、58a56f0、1310bf8；当前候选已分别集成，未合并main。
- PR #11，base integration/v1；round1独立fail两项：prefix等待期间visible→hidden仍可点击、非法active原始值绕过session校验。rework-1已修并新增三时序与非法根/active回归。round2正式独立结论：PASS（PR #11，独立20个回归场景通过；contract_touched=no，assertion_quality=ok）。

## 真实 Ego 调试证据与尚未完成项

已真实验证：列表4条、href均#、无可用DOM Issue ID，点击标题导航真实detail路径后返回；原toolbar在viewport下；源列表与临时副本的4个行摘要顺序完全一致且唯一。只输出结构/数量/布尔值，未将真实标题/ID/URL/堆栈写入仓库。

尚未验证修复版的实际入队/重复去重：Ego当前加载的是另一目录中的旧副本，不含新toolbar/resolver；已通知用户切换到当前仓库dist。不能把129项合成测试冒充真实入队成功。真实日志采集/下载、Chrome实际页面兼容不在此轮已验证范围。

## 用户确认与降级

临时页被激活即停止保护已经用户选择批准。普通逐项错误有反馈；无法核实页面或清理失败保留安全锁与页，用户关闭临时页后可重试。不承诺辨别其他扩展/CDP在inactive页的恶意导航因果。无自动上传、Cookie访问、私有接口或Firebase状态写入。

最终远端合并仍需用户单独批准。
