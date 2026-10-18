# just-fe 使用反馈与处理记录

## 2026-10-18 已处理（优化：去冗余与修 bug，不改文件结构、工具参数只增不改）

| # | 问题 | 处理 | 落点 |
|---|------|------|------|
| 29 | 联调脚本对 POST / PUT / PATCH / DELETE 用示例值真实发请求，会污染或删除 dev 数据 | 写接口默认不发送、标 UNVERIFIED；新增 `--allow-write <id,…>`，用户同意后放行 | `tools/contract-conformance.js`、`stages/07-api-integration.md` |
| 30 | 联调脚本把返回 HTML 登录页的 401 判 FAIL（挡住 ⑥）；空数组直接 PASS | 先判 401 / 403 再解析；2xx HTML 判 UNVERIFIED；新增 PARTIAL（有字段无法核对），summary 增加 `partial` | 同上 |
| 31 | 部署闸门合入的分支没有提交（开发 agent 不提交），推上去的 dev 不含本次代码；也没提 DDL 与网关路由 | 闸门先给待提交清单与建议 message，用户在特性分支提交，再给合入命令；补「先执行 DDL、先配网关路由」 | `SKILL.md`、`README.md`、`templates/变更日志模板.md` |
| 32 | `workspace-detect.js` 遇带注释 / 尾逗号的工作区文件、gradle-only 后端仓崩溃；带 package.json 的 Java 仓误判为 fe | JSONC 解析；pom.xml 存在才读；有构建文件且无前端框架依赖判 be | `tools/workspace-detect.js` |
| 33 | `out-of-scope.sh` 本地无 base 分支时静默漏报已提交的越界文件；用户开工前的脏文件被误判越界 | 本地无 `<base>` 时用 `origin/<base>`，输出 `baseRef`；新增可选第 4 参数（④ 开工前 `git status --porcelain` 记录），其中文件归入 `preexisting` | `tools/out-of-scope.sh`、`stages/05`、`stages/06`、`stages/08` |
| 34 | 凭证通过 `--header` 进命令行与对话记录 | 新增 `--header-file`（每行一个 Header，权限 600），阶段卡与 README 改用本地凭证文件 | `tools/contract-conformance.js`、`stages/07`、`README.md` |
| 35 | 与 just-flf 触发条件重叠 | description 写明适用的团队工作区，并注明与 just-flf 二选一安装 | `SKILL.md`、`README.md` |
| 36 | ③「未返回不计分母」可只回一个维度就通过、全失败时除零；⑥「未返回记 0」一个超时就必挂 | 统一为：所有维度必须返回，缺失重派一次，仍缺 → 无法完成，停下交用户 | `stages/02`、`stages/04`、`stages/08`、`references/评分口径.md`、`references/运行时排错.md` |
| 37 | 打回回路缺口：⑦ 打回修复后是否重跑 ⑥、部署后再改代码、契约升版后如何处理 | SKILL.md 新增「打回回路」 | `SKILL.md` |
| 38 | `route=light` 的单评审员、⑦ 只跑门禁，以及纯后端需求的 ⑤，都没有落地说明 | SKILL.md 新增「lite 档与纯后端需求」 | `SKILL.md` |
| 39 | README 称联调脚本校验错误码，实际不校验 | 改为「字段、类型、可空、统一响应体 code；错误码分支由后端契约测试覆盖」 | `README.md`、`stages/07` |
| 40 | 同一天多轮产物用 `{日期}` 命名会互相覆盖 | 方案 / 评审 / 开发 / 联调 / Review / 测试产物加 `-r{轮次}`；旧名视为 r1 照常识别 | `SKILL.md` 产物查找规则、`MEMORY.md`、`stages/03`–`09` |
| 41 | 冗余与矛盾：契约打回是否升版本前后不一；评分口径「维度速览」重复阶段卡；运行时排错「模式 A」过期章节；需求分诊指向已删除文件；README 过程性叙述与过期验证说明；报告模板嵌套代码块错位 | 统一为「修订即升版本」；删除重复与过期内容；修正引用；模板外层改用 `~~~` | `stages/02`、`references/*`、`README.md`、`MEMORY.md` |

## 2026-10-16 已处理（全栈改造，按 docs/全栈流程设计-20261016.md）

| # | 问题 / 需求 | 处理 | 落点 |
|---|------|------|------|
| 28 | 用户裁定：不做 Codex 适配；「这么多文件味道不对」——要的是多 agent 工作流技能，不是软件工程 | **删除整个脚本层与生成器**：`src/`（49）、`agents/`（7 codex 已先于本条目删）、`build.js`、`tests/`、9 个 JS Workflow 脚本、`references/模式A执行手册.md`、`templates/{评分协议,需求梳理报告模板,架构方案模板}.md`。流程改为**单一执行方式**：编排者读 `stages/*.md` 阶段卡（人设 / schema / 公式 / 报告模板全部内联，内容自 JS 模板平移）派子 agent，模式 A/B 双轨、模式判定、注册表、scriptPath、模式 A 手册随之消失。`roles/fe-dev.md` 是 ④-FE 与 ⑤ 唯一共享人设（防漂移）。评分协议改为 `references/评分口径.md`（薄，维度以阶段卡为准）。最终 28 个文件 | `stages/`（9 张卡）、`roles/`、`references/`、SKILL.md、README.md、INSTALL.md、UNINSTALL.md |


| # | 问题 / 需求 | 处理 | 落点 |
|---|------|------|------|
| 14 | 同一人设在 scripts / ~/.cursor/agents / ~/.codex/agents / 前端仓 .claude/agents 有 4～5 份定义，评分协议与脚本维度漂移，手册按行号引用脚本 | 建 `src/` 唯一真源：`roles/`（11 个人设）、`dims/`（5 组维度，配分合计强制 100）、`workflows/`（9 个模板，占位符 `__ROLE__ / __DIMS__ / __ARGS__ / __HEADER__`）、`agents/manifest.json`；`build.js` 生成 `scripts/`、`agents/cursor/`（只适配 Cursor，不做 Codex 适配，用户 2026-10-16 定）、`templates/评分协议.md`，`--check` 比对一致性并校验 meta 首行 / 无 import / 无 Date / 语法可编译；`FRONTEND_DEV_SYSTEM` 两份副本改为生成；手册改按常量名引用 | `src/`、`build.js`、`agents/`、`references/模式A执行手册.md` |
| 15 | 桩运行时只在会话里跑过、没提交 | `tests/stub-runtime.js`（模拟 agent / parallel / phase / log，拒绝 Date / Math.random / meta 不在首行）+ `tests/run.js` 73 个用例：每脚本 4 种 args 形态 + agent 返回 null + lane 分支 + 关键判定（一票否决、分母规则、needs_* 前置） | `tests/` |
| 16 | 评审类脚本按 agent 回填的 `dimension` 字段对应维度，agent 填错一个名字整张表归零（桩测试暴露） | 三个评审脚本改为按 `parallel` 保序下标对应，`dimension` 一律覆盖为 key | `src/workflows/{contract,architecture-review,code-arch-review}.js` |
| 17 | 评分协议 70～79 同时是「条件通过」和「必须打回」；维度表与脚本不一致 | 评分协议改为由 `src/dims/` 生成，删掉「及格」档；维度表、一票否决、汇总公式、打回机制统一写入 | `src/templates/评分协议.md` → `templates/评分协议.md` |
| 18 | 幽灵名字 `fe-guild` / `fe-profile-init` / `fe-feature-team`；`references/前端功能团队.md` 的四角色与 ③⑥ 重叠且无人触发 | 重写 `需求分诊.md`（route / stackScope / 范式接入）与 `项目画像初始化.md`（fe + be）；删除 `前端功能团队.md` | `references/` |
| 19 | 加入后端：前后端分仓、契约先行、后端不能本地跑 | 新增 `dev-contract`（勘察 + 设计 + 3 维评审，Markdown + `json contract` 块）、`dev-be-implementation`（rd-dev 人设 + 变更边界 + 强制契约测试 + 收尾 compile/spotless/test）；`architecture` / `architecture-review` / `code-review` / `test-assessment` 加 `lane`；⑥ 每维 prompt 含「通用 / 前端 / 后端」三段清单；⑦ 取证者按栈选手段，后端需 DB 的路径标 unverified；新增 🚀 部署闸门（流程只产出合入命令） | `src/workflows/`、`src/roles/{contract-designer,be-architect,be-dev,verification-runner}.md`、`src/dims/{arch-review-be,contract-review}/`、SKILL.md |
| 20 | ⑤ 的 `awaiting_apis` 等接口、无人设 `e2e-test` 与 ⑦ 重叠 | 重写 `dev-api-integration`：删 `api-list` / `e2e-test`；前置 `tools/contract-conformance.js` 对 dev 网关逐接口校验（字段 / 类型 / 可空 / 统一响应体）；FAIL 接口保留 Mock 不做前端补丁，不进 ⑥ | `src/workflows/api-integration.js`、`src/roles/integration-addendum.md`、`tools/contract-conformance.js` |
| 21 | 越界改动靠评审员读 diff 判断 | `tools/out-of-scope.sh`（已提交 ∪ 工作区改动 − 需求涉及文件，支持目录前缀，`core.quotepath=false`）结果作为 ⑥ 入参 | `tools/out-of-scope.sh`、⑥ 的 `outOfScopeFiles` |
| 22 | MEMORY 里被手工加的 `report_dir / scope / source / frontend_repo / backend_repo` 转正；工作区三目录如何定位 | `tools/workspace-detect.js` 读 `.code-workspace` 探测两仓（lane / 分支 / base 取自部署流水线触发分支 / 画像 / dev 网关 / 模块与流水线表）与会话区（`新需求/`、范式文件）；MEMORY 模板新增 `repos[] / report_dir / scope / source / contract_version / be_modules / env / deploy`，阶段表拆 fe / be 两行，新增「决策卡裁定」「契约校验摘要」 | `tools/workspace-detect.js`、`MEMORY.md`、SKILL.md「⓪ 工作区确认」 |
| 23 | ① 返回 16 条一句话待决问题，违反范式 DC-1 | ① 人设接入《需求处理范式》阶段一（台账 / 冲突 / 术语 / 矩阵 / 缺口 / 边界六扫 / 反向清单 / 消费方排查 / 决策卡），范式全文作 `paradigm` 入参传入、不复制进 Skill；schema 新增 `reqLedger / glossary / scenarioMatrix / coverageGaps / consumerImpact / decisionCards / stackScope / apiNeeds / route`；`pendingQuestions` 降为决策卡标题别名 | `src/roles/requirement-analyst.md`、`src/workflows/triage.js`、`templates/需求梳理报告模板.md` |
| 24 | 用户裁定：代码提交由用户决策，流程不自己做 | ⑧ 改为「变更说明 + 提交清单」（每仓待 add 文件 / 越界文件建议回退 / 建议 message / 合入命令），删除所有 `git add` / `commit` 动作；fe-dev / be-dev / verification-runner 人设加「不执行任何 git 写操作」；部署闸门只产出命令 | SKILL.md、`templates/变更日志模板.md`、`src/roles/` |
| 25 | SKILL.md 约 40% 篇幅是运行时 bug 绕行记录 | 下沉到 `references/运行时排错.md`；SKILL.md 只放流程协议 | `references/运行时排错.md`、SKILL.md |
| 26 | `rd-dev.md` 写死 MyBatis/JPA，与实际 MyBatis-Flex 不符 | `be-dev` 人设改为「以仓库 CLAUDE.md 为准，不假设固定框架」 | `src/roles/be-dev.md` |
| 27 | 脚本 `meta.name` 从 `fe-*` 改为 `dev-*`（lane 参数后前缀不再准确） | INSTALL / UNINSTALL 同时匹配新旧名字，升级时清旧脚本；子 agent 安装步骤 D（覆盖前 diff 给用户看） | INSTALL.md、UNINSTALL.md |

## 待观察 / 下一轮（2026-10-16）

- **未在真实 Claude Code Workflow 运行时端到端跑过 fullstack**。本轮验证：`build --check` 绿、`tests/run.js` 73/73、三个 tools 对真实工作区（team-fullstack）试跑通过。建议用「示例需求」的后续迭代做第一次真跑
- `tools/contract-conformance.js` 只做了 dry-run 与结构测试，未对真实 dev 网关跑过；鉴权头的具体形态（Bearer / Cookie / 自定义 Header）要等第一次联调确认
- 后端 dev 域名规则 `dev-{module}.example.com` 是推断，be-profile 初始化时需探测确认
- `route=light` 的裁剪路径（跳过 ②③、⑥ 单评审员、⑦ 只跑门禁）在 SKILL.md 定义了，脚本层没有专门分支——light 时编排方少调几个脚本即可，但 ⑥ 单评审员目前没有现成脚本形态（可用 `code-audit` 子 agent 顶替）
- Skill 是否改名 `just-dev`、前端仓 `.claude/agents/` 的 5 份手写人设是否删除：待用户定

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
| 10 | Workflow 后台运行时，模型空参调 `TaskOutput` 报 `Task ID is required`，随后又去轮询 | SKILL.md「工具怎么调」加一条：Workflow 是后台异步，返回 `async_launched` + `taskId` 后**等**完成通知；不空参调 `TaskOutput`、不反复轮询；确需看进度带 `taskId` 或让用户看 `/workflows`。报错表加 `Task ID is required` 行，红旗清单加一条 | `SKILL.md` |
| 11 | ⑥ 跑了 8 分钟后报 `Date.now() / new Date() are unavailable in workflow scripts (breaks resume)`，结果全丢 | **7 个脚本全中**：报告模板里都有 `new Date().toISOString()`，且位于所有 agent 完成之后的拼报告处。运行时为可 resume 强制确定性，禁 `Date` / `Math.random`。修法：全部改为 `context.timestamp \|\| '（由编排方落盘时填写）'`，SKILL.md 要求编排方每次调用带 `timestamp`（`date -u +%FT%TZ`）；INSTALL.md 硬约束附录与 Step 2 校验加 `rg "new Date\|Date\.now\|Math\.random"` 检查。桩运行时补上 Date/Math.random 禁令：旧脚本复现同样报错，新脚本 7 × 4 形态全过 | `scripts/*-workflow.js`、`SKILL.md`、`INSTALL.md` |
| 12 | Workflow 模式「经常不可用」：`Workflow` 按 name 调 `fe-triage` 等报 not found，多次退到模式 A；但 ⑥ 却能以 Workflow 跑 | **真实根因是我们自己的脚本**：运行时 metaParser 要求 `export const meta` 是第一条语句（允许前置注释、不允许任何语句）。7 个脚本里只有 ⑥ 是「注释→meta」，其余 6 个是「注释→`const`→meta」，从来没注册成功过——这解释了为什么只有 ⑥ 出现过 `Dynamic workflow … failed` 而 ①③⑤ 都在走 Agent。修法：7 个脚本 meta 全部移到第 1 行；SKILL.md 模式判定改为「工具列表里有没有 `Workflow`」（不再用 `/` 补全或按名试探），调用首选 `scriptPath` 直接跑 Skill 目录里的脚本（不经注册表、不需复制到 `.claude/workflows/`、不需新开会话），`name` 降为可选便利；INSTALL 模式 B 标为可选，Step 2 校验加 meta 首行检查；桩运行时加 metaParser 模拟，HEAD 版脚本复现被拒 | `scripts/*-workflow.js`、`SKILL.md`「各阶段的执行方式」「工具怎么调」「工具报错怎么处理」「红旗清单」、`INSTALL.md` |
| 13 | 用户提出「Workflow 经常不可用，是否做成 Agent / Workflow 两个版本」 | 驳回拆版本：两种模式只差执行器不差协议，拆开会让 7 套 prompt/schema 双份漂移。改为「一个 skill、两个执行器」：脚本仍是唯一真源，新增 `references/模式A执行手册.md`（148 行）——通用换算规则（`agent()`→`Agent`/`Task` 参数映射、schema 尾注、parallel→同一条消息并行、兜底与重试）、7 张阶段卡（取哪些常量、prompt 按脚本哪段拼、派几个子 agent、汇总公式、返回对象）、汇总公式速查表（③ 未返回不计分母 / ⑥ 记 0 分母 100 / ⑦ E2E 一票否决）、模式 A 特有错法表。SKILL.md 模式 A 行标 REQUIRED 读手册。子 agent 场景推演（Cursor 环境跑 ⑥，含一个维度未返回 + 一条 critical）：7 个并行、prompt 拼接正确、77 分 / reject / 分母 100、不自己补评、timestamp 用 date 取、识别出 passed=false 不进 ⑦ | `references/模式A执行手册.md`、`SKILL.md` |
| 9 | 模式 A 启动 ① 时 `Agent` 工具连报两次 `Invalid tool parameters`，模型判定「Workflow 和 Agent 工具都遇到问题」，退化成主上下文直接做分析 | 根因：SKILL.md 只说「交给子 agent（Task/Agent 工具）」没给参数形态，模型把脚本内 `agent(prompt, {label, schema})` 的选项照搬给 `Agent` 工具；两次失败后把「参数错」误判为「工具不可用」。修法：SKILL.md 新增「工具怎么调」——`Workflow` 工具是 `{name, args}`（args 必须是对象），`Agent` 工具是 `{description, prompt, subagent_type}`，给出 `label→description`、`schema→写进 prompt 末尾` 的映射表和示例；新增「工具报错怎么处理」表，`Invalid tool parameters` = 参数错、重读 schema 改一次、仍失败停下报告；**明令禁止退化为主上下文直接干**。红旗清单加两条。顺带处理运行时已知 bug：`args` 可能以 JSON 字符串传入（#67627）→ 7 个脚本归一化时先尝试 `JSON.parse`；按 `name` 解析不到 `~/.claude/workflows` 脚本（#63876）→ 文档给出 `scriptPath` 退路 | `SKILL.md`「工具怎么调」「工具报错怎么处理」「红旗清单」、`scripts/*-workflow.js` args 归一化 |

## 待观察 / 下一轮

- 真实 Claude Code Workflow 运行时端到端跑完整流程（本轮验证是桩运行 + 子 agent 场景推演）
- `templates/评分协议.md` 的维度表与脚本实际维度不一致（协议写「扩展性/性价比」，脚本是「模块结构/状态管理」），本轮只补了一票否决规则，维度表未动
- 闸门提问频率是否过高：如果实际使用中觉得 ①→② 之间不需要停，可考虑只在 ③④⑥⑦ 后设闸门，其余用 `--auto`
- #9 的修法是文档层的：给了正确参数形态和错误处理规则，但没法在真实 Claude Code 里验证 `Agent` 工具的参数名是否随版本变化。若再出现 `Invalid tool parameters`，把模型实际发出的参数 JSON 贴进来
- #11 暴露了桩运行时的盲区：之前只模拟了 `agent/parallel/phase/log/args`，没模拟运行时的确定性约束。现已补 Date/Math.random 禁令；若官方再加别的限制（如 `setTimeout`、`fetch`），同样要补进桩里
- 本机已装的 `~/.claude/workflows/` 脚本需要按 INSTALL.md Step 4 重新同步，否则 ⑥ 会继续在拼报告时崩



