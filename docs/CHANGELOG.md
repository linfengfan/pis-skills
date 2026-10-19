# just-flf 变更记录

just-fe 的反馈与处理记录在 `just-fe/todo.md`，两个 Skill 分开维护。

## 2026-10-19 接入项目规则（以后端 SQL 规则为例）

| # | 问题 / 需求 | 处理 | 落点 |
|---|------|------|------|
| 7 | 后端仓有按 `globs` 生效的项目规则（如 SQL 规则），但评审员卡没要求读，代码评审可能不对照红线；Claude Code 也不会自动加载 `.cursor/rules` | 评审员与开发共用规则明确：按评审对象 / 要改的文件找出匹配的项目规则逐条对照，违反时注明规则编号；架构师要把匹配规则落到方案里。规则原文仍只留在项目仓，不抄进 Skill | `roles/reviewer.md`、`roles/dev-rules.md`、`roles/fe-architect.md`、`roles/be-architect.md` |
| 8 | 子 agent 不知道改哪些文件时该读哪条规则 | 画像「规范文件索引」新增「什么时候必读」列，由画像生成者按规则的 `globs` 填写 | `templates/profile-fe.md`、`templates/profile-be.md`、`roles/profiler.md` |
| 10 | 项目规则的红线（违反即打回）在评分里没有一票否决的通道，只能按清单项自身严重度计 | 评审员可对违反规则红线的项加 `escalate: "critical"` + `rule` + `consequence`，`state.js` 按 critical 计分并一票否决；缺 rule / consequence 的回执不合格 | `roles/reviewer.md`、`tools/state.js`、`tests/just-flf/tools/state.test.js` |
| 11 | 评审员不按规则给出的检查方法查；开发不自证 SQL 命中哪条索引 | 评审员按规则写的方法查（对照 DDL、看执行计划）；后端开发报告新增「SQL 与索引对照」（每条新增 / 修改 SQL 的列、命中索引及 DDL 位置、预计锁行、执行计划或「推断」） | `roles/reviewer.md`、`roles/be-developer.md` |
| 12 | 规则里的点在各阶段没有落点：手写 SQL 不经租户插件、后台检索、FORCE INDEX、热点行分桶、定时任务分批、页码上限、数据源止损配置 | 清单：改 LOGIC-08、DATA-04、TXN-05，新增 ARCH-14、ARCH-15、TXN-06、PERF-07、IMPL-07；后端架构师、后端开发、接口设计师卡写明对应要求 | `checklists/*`、`roles/be-architect.md`、`roles/be-developer.md`、`roles/api-designer.md` |
| 13 | 没有「已知问题」的概念，规则里的待修清单无处落地 | 画像新增「已知问题清单」位置与「数据源止损配置现状」，由画像生成者探测；需求梳理对照影响面，触碰已知问题就出决策卡（顺带修还是不修） | `templates/profile-*.md`、`roles/profiler.md`、`roles/analyst.md` |
| 9 | 清单缺少通用 SQL 检查项 | 代码评审新增 ARCH-11（UPDATE / DELETE 锁范围）、ARCH-12（大表分页）、ARCH-13（扫描投影与跨租户扫描）、LOGIC-12（热点行最后写）、BLAST-06（索引在 DDL 中存在）；后端方案评审新增 DATA-06（查询形状对应索引）、PERF-06（后台检索不拖垮线上表） | `checklists/code.md`、`checklists/design-be.md` |

## 2026-10-18 just-flf 技能本体

| # | 问题 / 需求 | 处理 | 落点 |
|---|------|------|------|
| 4 | 计划 1 先做工具、流程过重，跑了几个小时仍看不到技能本体（用户叫停） | 改为直接按设计文档写技能本体：`SKILL.md`、8 张阶段卡、10 张角色卡（前后端各有架构师与开发）、5 份清单、2 个画像模板、安装 / 卸载说明 | `just-flf/` |
| 5 | 状态靠模型改 Markdown 表格 | 压缩版 `state.js`：init / status / get / set / start / receipt / score / finish / gate / decide / deliver；回执按角色卡模板与清单指派校验；按严重度权重机械算分；评审员缺失判「无法完成」；接口升版与重跑自动把下游标为过期；交付说明自动组装 | `just-flf/tools/state.js`、`tests/just-flf/tools/state.test.js` |
| 6 | 计划 1 把 `just-fe/docs/`、`just-fe/todo.md` 移出了 just-fe，改变了仍在使用的旧 Skill 的结构 | 移回原位（保留清除内部信息后的内容）；just-flf 的记录单独放在本文件 | `just-fe/docs/`、`just-fe/todo.md`、`docs/CHANGELOG.md` |

## 2026-10-18 just-flf 计划 1：三个独立工具

| # | 问题 | 处理 | 落点 |
|---|------|------|------|
| 1 | `workspace-detect.js` 遇 gradle-only 崩溃、JSONC 崩溃、Java 仓带 package.json 误判为 fe、写死项目值 | 新 `workspace.js`：JSONC、画像优先、构建文件综合判定、单仓模式、无工作区文件时提示创建、范式路径用户级配置 | `just-flf/tools/workspace.js` |
| 2 | `out-of-scope.sh` 本地无 base 分支时漏报、把用户原有脏文件误报为越界 | 新 `scope.js`：开工基线快照 + 内容哈希，区分 preexisting，排除 `.just-flf/` | `just-flf/tools/scope.js` |
| 3 | `contract-conformance.js` HTML 401 误判 FAIL、空数组 PASS、真实发送写请求、不校验错误码、凭证走命令行 | 新 `conformance.js`：先判鉴权、四态含 PARTIAL、写接口默认不发、errorProbes、`--auth-file` | `just-flf/tools/conformance.js` |
