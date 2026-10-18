---
workflow: just-fe
requirement: (未启动)
started: -
last_updated: -
status: idle
mode: full | resume
gate_mode: gated | auto
scope: 全流程            # 本期做到哪个阶段（stopAt），如 ②
source: -                # 需求来源与优先级，如 prd-v2.2.md > 在线原型 > prd.md
report_dir: -            # 流程产物目录，默认 <会话区>/新需求/<需求短名>/
stack: fe | be | fullstack       # 即 ① 返回的 stackScope
route: light | full | blocked
current_stage: -
resume_from: -
design: -                # 设计稿 / 原型链接，或用户原话「无设计稿，按现有风格」
contract_version: -      # v1 / v2 …；契约改动必须升版本重评
be_modules: []           # 契约阶段定下的后端目标模块
repos:
  - { lane: fe, name: -, path: -, branch: -, base: develop, mode: write }
  - { lane: be, name: -, path: -, branch: -, base: dev,     mode: write | readonly }
env:
  dev: { gatewayUrl: -, auth: "凭证来源说明，只写来源不写明文" }
deploy: { deployedAt: -, pipelines: [] }
---

> `current_stage` 是唯一可信的「当前阶段」。向用户汇报前先读它；用户点名某阶段时先改它。
> `repos[be].mode = readonly` 是正式状态：前端消费已有接口、后端不改。此时 BE 泳道与部署闸门不启动，但契约阶段仍要勘察后端仓给证据。
> `design` 在 ④-FE 之前必须非空（或 ④-FE 被标记跳过）。
> 流程**不执行任何 git 写操作**。⑧ 只产出提交清单，commit / 合入由用户做。

## 阶段进度

| 阶段 | 泳道 | 状态 | 完成时间 | 产物（相对 report_dir） |
|------|------|------|----------|------------------------|
| ⓪ 工作区确认 | — | ⏳ | - | MEMORY.md 头部字段 |
| ① 需求梳理 | — | ⏳ | - | triage-{日期}.md |
| ② 契约设计 + ③a 契约评审 | — | ⏳ | - | contract-v{N}.md、contract-review-v{N}.md |
| ② 方案架构 | fe | ⏳ | - | fe/architecture-{日期}-r{轮次}.md |
| ② 方案架构 | be | ⏳ | - | be/architecture-{日期}-r{轮次}.md |
| ③ 方案评审 | fe | ⏳ | - | fe/arch-review-{日期}-r{轮次}.md |
| ③ 方案评审 | be | ⏳ | - | be/arch-review-{日期}-r{轮次}.md |
| ④ UI 开发 | fe | ⏳ | - | fe/ui-{日期}-r{轮次}.md、fe/baseline-status.txt（原型走查另有 prototype-interactions-{日期}.md） |
| ④ 接口开发 | be | ⏳ | - | be/impl-{日期}-r{轮次}.md、be/baseline-status.txt |
| 🚀 部署闸门 | be | ⏳ | - | MEMORY `deploy` 字段 |
| ⑤ 接口联调 | fe | ⏳ | - | conformance-{日期}-r{轮次}.json、integration-{日期}-r{轮次}.md |
| ⑥ 代码 Review | fe | ⏳ | - | fe/code-review-{日期}-r{轮次}.md |
| ⑥ 代码 Review | be | ⏳ | - | be/code-review-{日期}-r{轮次}.md |
| ⑦ 测试评估 | fe | ⏳ | - | fe/test-assessment-{日期}-r{轮次}.md |
| ⑦ 测试评估 | be | ⏳ | - | be/test-assessment-{日期}-r{轮次}.md |
| ⑧ 变更说明 + 提交清单 | — | ⏳ | - | change-{日期}.md |

状态取值：`⏳ 未开始` / `🔄 进行中` / `⏸ 已完成，等待用户确认` / `✅ 完成` / `✅ 用户确认完成` / `⏭ 用户跳过` / `⏭ 不适用（stack / mode 决定）` / `❌ 打回`

## 阶段闸门记录

| 阶段 | 用户决定 | 时间 | 备注（用户要求的调整、跳过理由） |
|------|----------|------|--------------------------------|

## 阶段跳转记录

| 时间 | 从 | 到 | 中间阶段处理（✅ 用户确认完成 / ⏭ 用户跳过） |
|------|----|----|------------------------------------------|

## 决策卡裁定

<!-- ① 产出的每张决策卡，用户拍板后记一行；下游阶段只认这里的结论 -->

| 决策卡 | 用户裁定 | 时间 |
|--------|----------|------|

## 评审记录

| 评审类型 | 泳道 | 轮次 | 分数 | 结果 | 打回目标 |
|----------|------|------|------|------|----------|
| 契约评审 | — | - | - | - | ② 契约（升版本） |
| 方案评审 | fe | - | - | - | ② fe 方案 |
| 方案评审 | be | - | - | - | ② be 方案 |
| 代码 Review | fe | - | - | - | ④ fe 开发 |
| 代码 Review | be | - | - | - | ④ be 开发 |
| 测试评估 | fe | - | - | - | ④ fe 开发 / ② fe 方案 |
| 测试评估 | be | - | - | - | ④ be 开发 / ② be 方案 |

## 需求涉及文件（变更边界基准，按仓库分组）

<!-- ② 的文件清单 + ④ 报告的 completedFiles；⑥ 用 tools/out-of-scope.sh 判越界，⑧ 据此列提交清单 -->

### fe
-

### be
-

## 契约校验结果摘要

<!-- ⑤ 之前 tools/contract-conformance.js 的 summary：PASS / FAIL / UNVERIFIED 数与 FAIL 接口 id -->

-

## 当前状态

**中断原因**: （如有中断）
**中断阶段**: （如有中断）
**待处理**: （下一步行动）

## 进度记录

<!-- 每个阶段完成后追加一条：{日期} {时间} - {阶段}[{泳道}]: {状态} ({分数}) -->
