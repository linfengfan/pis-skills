# just-fe 使用反馈与处理记录

## 2026-09-21 已处理（第一轮实战反馈）

| # | 问题 | 处理 | 落点 |
|---|------|------|------|
| 1 | 开发 agent 识别到页面改动时，缺少向用户要 UI 链接的过程 | 新增「设计稿闸门」：① triage 产出 `uiChange` / `designAssets`，涉及界面且无设计稿时待决问题第一条强制要链接；主 agent 进 ④ 前必须问用户拿 `figmaUrl` 或明确的「无设计稿」原话作 `noDesignReason`；脚本层兜底：两者都缺时 `fe-ui-implementation` 直接返回 `needs_design`、不启动开发 agent | `SKILL.md`「设计稿闸门」、`scripts/triage-workflow.js`、`scripts/ui-implementation-workflow.js`、`references/需求分诊.md`（UI形态默认值改为无默认） |
| 2 | 每个阶段完成后需向用户确认还有没有工作，由用户决定是否进入下一阶段 | 新增「阶段闸门协议」：每阶段结束 落盘 → 更新 MEMORY → 汇报 → AskUserQuestion 三选项（进入下一阶段 / 本阶段继续 / 先停），用户选进入才调下一阶段；默认 gated，`--auto` 才连续跑（阻断/打回/达上限仍停） | `SKILL.md`「阶段闸门协议」、`MEMORY.md`「阶段闸门记录」 |
| 3 | 用户要求开始代码评审了，agent 状态还是 UI 开发阶段 | 新增「用户点名阶段：跳转优先，状态先同步」：话术→阶段映射表；先改 MEMORY `current_stage` 再执行；中间阶段问用户标「确认完成 / 跳过」；汇报阶段名必须读 `current_stage` | `SKILL.md`、`MEMORY.md`（新增 `current_stage`、阶段跳转记录） |
| 4 | 第六步报错 `TypeError: undefined is not an object (evaluating 'context.requirement')` | 根因：不带参数调用 workflow 时 `args` 为 `undefined`（官方文档明确）。7 个脚本统一 `args` 归一化（undefined / 字符串 / 对象），缺关键入参返回 `status: 'invalid_args'`（评审类从 diff 推断并降置信度）；agent 返回 null 也有兜底。用桩运行时验证三种形态全部不崩 | `scripts/*-workflow.js`、`SKILL.md`「阶段编排表（入参必须带齐）」 |
| 5 | 第七步加入 test-e2e 优化验证流程 | ⑦ 拆成「E2E 执行 → 综合评估 → 结论」：E2E 执行者按画像 `e2e` / `test` 门禁逐条验收标准取证（有框架补最小用例、无框架浏览器手工验证、都不行记 `unverified`），评估员以证据为基准打分；**任一验收失败或回归失败一票否决**；`unverified` 进人工验证清单；支持 `e2eCommand` / `devServerCommand` / `baseUrl` / `skipE2E` | `scripts/test-assessment-workflow.js`、`templates/项目画像模板.md`（新增 e2e / dev server 行）、`references/项目画像初始化.md`、`templates/评分协议.md` |
| 6 | 进入开发时报错 `Unknown skill: 前端开发工程师` | 脚本头注释「基于前端开发工程师的精华 prompt」被模型当成外部 Skill。改为明示「只是内联 prompt 角色名，不要 Skill(...) 调用」；`SKILL.md` 新增「各阶段的执行方式」（模式 B/C 走 Workflow，模式 A 把脚本内 system prompt 交子 agent）+ 红旗清单 | `scripts/*-workflow.js` 头注释、`SKILL.md` |
| 7 | 从第一步开始时，关键步骤应与用户确认是否进入下一阶段 | 与 #2 同一机制，覆盖全部 ①~⑧ 闸门 | 同 #2 |
| 8 | 开发 agent 只改本次需求涉及文件，不要对全局代码格式化 | `FRONTEND_DEV_SYSTEM`（④⑤ 两份副本同步）新增最高优先级「变更边界铁律」：只改需求涉及文件；禁止全局 prettier / eslint --fix / 整理导入 / 顺手重构；开工记 git status 基线，收工 git diff --stat 回退自己引入的无关改动；报告 `completedFiles` + `outOfScopeChanges`。⑥ 爆炸半径维度新增越界改动检测（minor 要求回退；淹没真实改动记 critical），入参 `requirementFiles`；⑧ 只 add 需求涉及文件 | `scripts/ui-implementation-workflow.js`、`scripts/api-integration-workflow.js`、`scripts/code-arch-review-workflow.js`、`SKILL.md`「编排纪律 7」 |
| 9 | 模式 A 启动 ① 时 `Agent` 工具连报两次 `Invalid tool parameters`，模型判定「Workflow 和 Agent 工具都遇到问题」，退化成主上下文直接做分析 | 根因：SKILL.md 只说「交给子 agent（Task/Agent 工具）」没给参数形态，模型把脚本内 `agent(prompt, {label, schema})` 的选项照搬给 `Agent` 工具；两次失败后把「参数错」误判为「工具不可用」。修法：SKILL.md 新增「工具怎么调」——`Workflow` 工具是 `{name, args}`（args 必须是对象），`Agent` 工具是 `{description, prompt, subagent_type}`，给出 `label→description`、`schema→写进 prompt 末尾` 的映射表和示例；新增「工具报错怎么处理」表，`Invalid tool parameters` = 参数错、重读 schema 改一次、仍失败停下报告；**明令禁止退化为主上下文直接干**。红旗清单加两条。顺带处理运行时已知 bug：`args` 可能以 JSON 字符串传入（#67627）→ 7 个脚本归一化时先尝试 `JSON.parse`；按 `name` 解析不到 `~/.claude/workflows` 脚本（#63876）→ 文档给出 `scriptPath` 退路 | `SKILL.md`「工具怎么调」「工具报错怎么处理」「红旗清单」、`scripts/*-workflow.js` args 归一化 |

## 待观察 / 下一轮

- 真实 Claude Code Workflow 运行时端到端跑完整流程（本轮验证是桩运行 + 子 agent 场景推演）
- `templates/评分协议.md` 的维度表与脚本实际维度不一致（协议写「扩展性/性价比」，脚本是「模块结构/状态管理」），本轮只补了一票否决规则，维度表未动
- 闸门提问频率是否过高：如果实际使用中觉得 ①→② 之间不需要停，可考虑只在 ③④⑥⑦ 后设闸门，其余用 `--auto`
- #9 的修法是文档层的：给了正确参数形态和错误处理规则，但没法在真实 Claude Code 里验证 `Agent` 工具的参数名是否随版本变化。若再出现 `Invalid tool parameters`，把模型实际发出的参数 JSON 贴进来
- 本机 `~/.claude/workflows/` 目前为空（16:41 清空后未重装），所以最近一次运行走的是模式 A；重装 B 后 ① 应直接走 `Workflow` 工具
2.架构方案评审 Agent 正在后台运行。让我等待评审结果：

⏺ Task Output
Error: Task ID is required

  Thought for 11s

⏺ Task Output a4725ef14acb8ba0e
Task is still running…