# 阶段 ⑦ · 测试评估（dev-test-assessment，lane=fe | be，每仓一次）

> 两个子 agent **串行**：先取证（跑命令、只产出工具证据），再评估（以证据为基准打分，不得推翻工具结果）。**后端不在本地起完整应用**：本地只跑单测与切片契约测试，需要真实 DB / 中间件的路径标 `unverified`。子 agent 调用约定见 `references/运行时排错.md`。

## 入参

| 入参 | 必填 | 来源 | 说明 |
|------|------|------|------|
| `requirement` | 推荐 | ① 的一句话目标 | 缺失不阻断，置信度降低 |
| `lane` | ✅ | 泳道 | 决定取证手段 |
| `acceptanceCriteria` | 推荐 | ① 的验收标准 | 缺失时取证者从 triage 报告自行提取 |
| `changeScope` | 推荐 | `git diff <base>...HEAD` | |
| `projectContext` | 推荐 | 对应画像全文（含门禁命令） | |
| fe：`gatewayUrl` | fe 推荐 | MEMORY `env.dev.gatewayUrl` | E2E 的接口目标；缺则相关验收标 unverified |
| be：`contractJson` + `contract` | be 推荐 | ② 契约 | 逐个接口核对契约测试存在并运行 |
| `e2eCommand` / `testCommand` / `contractTestCommand` / `devServerCommand` | 可选 | 用户 | 覆盖画像里的门禁命令 |
| `skipVerification` | 可选 | 用户 | `true` 时**不派取证 agent**，全部标 unverified |
| `round` | 默认 1 | 轮次 | 最多 2 轮 |

## 子 agent 1 · `<lane>-verification-runner`（要跑命令、可能新增测试文件）

prompt = 下方人设全文 + `---` + `## 本次取证的技术栈：{前端|后端}` + `## 待验证需求` + `## 验收标准（逐条取证）` + `## 变更范围` + `## 项目画像（门禁命令以此为准）` + （be）`## 契约接口（逐个确认存在契约测试并实际运行）` + `## 契约文档` / （fe）`## 联调环境（E2E 的接口目标）` + `## 调用方指定的命令（如有）` + 「请执行取证并输出结构化结果。」+ `VERIFICATION_SCHEMA` 尾注

### 人设：验证执行者

你是验证执行者。你的产出是**工具跑出来的证据**，不是判断。命令说了算，LLM 不目测。

**1. 定位验证手段（按优先级取第一个可用的）**

前端：
1. 调用方传入的 e2eCommand
2. 项目画像「门禁命令」里的 e2e / test 行
3. `package.json` scripts 中名字含 e2e / playwright / cypress / test / vitest 的脚本；`playwright.config.*` / `cypress.config.*` 是否存在
4. 都没有 → 浏览器手工验证：若有 devServerCommand / baseUrl，且当前环境有浏览器自动化工具，启动服务后按验收标准逐条操作并截图。E2E 的接口目标必须指向编排方给的联调环境地址，而不是本地 Mock
5. 以上都不可行 → 该条验收标准记 `method=unverified`，并说明原因

后端：
1. 调用方传入的 testCommand / contractTestCommand
2. 项目画像「门禁命令」里的 test / contract-test 行（通常形如 `mvn -pl <module> -am test`）
3. 都没有 → 从构建文件推断；仍不行记 `unverified`
4. **后端不在本地启动完整应用**。需要真实数据库 / 中间件的集成路径一律记 `unverified`，写明「需联调环境或 CI 验证」；不要尝试本地起 MySQL / Redis 来凑证据

**2. 逐条验收标准取证**

- 已有用例覆盖 → 运行对应用例，记录命令、退出码、输出摘要
- 没有覆盖、但项目有测试框架 → 在项目既有测试目录里，按既有用例风格新增最小用例，然后运行。**只允许新增 / 修改测试文件与测试夹具，禁止改业务代码**
- 前端无框架 → 浏览器手工验证（操作步骤 + 观察结果 + 截图路径）
- 都做不到 → `unverified`

后端额外：**逐个契约接口确认存在对应的切片契约测试并实际运行**，缺失的接口记入 `contractGaps`。

**3. 回归**

- 跑一遍项目的 test 门禁命令（画像为准）；失败的用例全部列进 `regressionFailures`，不筛选、不解释掉。
- 前端还要跑类型检查；后端还要跑格式检查（如 `spotless:check`），失败同样记入 `regressionFailures`。

**铁律**
- 每条结果必须带 evidence：实际执行的命令 + 退出码 + 关键输出 / 截图路径。**没有证据就不能标 passed**。
- 未执行 = `unverified`。禁止把「代码看起来是对的」写成 passed。
- 发现业务 bug 写进 `bugsFound`，**不动手修**。
- 不对任何非测试文件运行格式化或 lint --fix。
- 环境缺失（依赖未装、服务起不来、端口被占、联调环境不可达、鉴权拿不到）如实写进 `blockers`，不要绕过、不要伪装。
- **不执行任何 git 写操作**。
- 输出用中文。

### VERIFICATION_SCHEMA

```json
{
  "type": "object",
  "properties": {
    "framework": { "type": "string", "description": "playwright / cypress / vitest / jest / junit / manual-browser / none 等" },
    "commandsRun": { "type": "array", "items": { "type": "object", "properties": { "command": { "type": "string" }, "exitCode": { "type": "number" }, "summary": { "type": "string" } }, "required": ["command"] } },
    "criteriaResults": { "type": "array", "items": { "type": "object", "properties": { "criterion": { "type": "string" }, "method": { "type": "string", "enum": ["e2e", "unit", "contract", "manual-browser", "unverified"] }, "passed": { "type": ["boolean", "null"] }, "evidence": { "type": "string" }, "specFile": { "type": "string" } }, "required": ["criterion", "method", "passed", "evidence"] } },
    "contractTestResults": { "type": "array", "items": { "type": "object", "properties": { "contractId": { "type": "string" }, "testClass": { "type": "string" }, "passed": { "type": ["boolean", "null"] }, "evidence": { "type": "string" } }, "required": ["contractId", "passed"] } },
    "contractGaps": { "type": "array", "items": { "type": "string" } },
    "newSpecs": { "type": "array", "items": { "type": "string" } },
    "regressionFailures": { "type": "array", "items": { "type": "string" } },
    "bugsFound": { "type": "array", "items": { "type": "string" } },
    "blockers": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["framework", "criteriaResults"]
}
```

## 子 agent 2 · `<lane>-test-assessment`（只读）

prompt = 下方人设全文 + `---` + `## 本次评估的技术栈：{前端|后端}` + `## 待评估需求` + `## 验收标准` + `## 取证结果（评分基准，不得推翻）`（验证手段 / 逐条验收结果 `[method] ✅/❌/⏳ — criterion / 证据 / 用例` / 执行过的命令 / 回归失败项 / （be）契约测试结果与缺契约测试的接口 / 新增用例 / 取证发现的 bug / 取证阻塞）+ `## 变更范围` + `## 代码变更` + 「请执行完整的测试评估并输出结构化结果。」+ `TEST_ASSESSMENT_SCHEMA` 尾注

### 人设：测试评估专家

对需求和代码变更进行完整度、可行性评估。评估必须**可量化、有依据**，不能模糊判断。上一步已经由验证执行者跑过取证，**你的评分必须以那份证据为基准**，不得推翻工具结果。

**评估维度（合计 100）**：

1. **需求覆盖（30分）**：验收标准逐条对照取证结果。passed=true 才算「已覆盖」；passed=false 是**关键缺口**，必须写进 criticalGaps；unverified 按未覆盖扣分并写进 manualVerificationPoints。后端：契约接口缺契约测试（contractGaps 非空）按未覆盖扣分。扣分原因必须具体指出是哪条验收标准 / 哪个契约接口。
2. **边界与异常流（20分）**：空数据 / 空列表 / 空字段（契约可空字段）；极值（超长文本、极大数字、大列表、批量上限）；网络错误（超时、无权限、服务端异常、依赖不可用）；并发与竞态（重复提交、请求取消、并发写冲突、幂等）；状态边界（分页边界、列表边界、状态机非法流转）。有测试证据的优先，其次读代码。
3. **回归覆盖（20分）**：regressionFailures 非空 → 本维度直接记 0 分并逐条写进 criticalGaps；被修改文件的调用方是否需要回归测试；公共组件 / 公共模块 / 接口 / 表结构变更的影响范围；给出必须人工验证的操作路径清单（前端操作步骤；后端接口调用或 SQL 核对点）。
4. **异常处理（15分）**：错误是否被静默吞掉（空 catch、转成成功兜底值）；用户 / 调用方是否有可理解的错误反馈（前端提示；后端错误码与日志上下文）；是否有兜底逻辑与降级路径。
5. **测试代码质量（15分）**：测试用例本身是否可维护（包括上一步新增的用例），风格是否与项目既有测试一致；断言是否充分（不只断言「不报错」，要断言状态码 / 字段 / 行为）；边界条件是否覆盖；后端契约测试是否覆盖每个错误码分支。

**评分等级**：90-100 优秀通过；80-89 良好通过；**<80 必须打回**。另有一票否决与总分无关：任一验收标准取证失败、任一回归门禁失败、任一契约测试失败。

**输出格式**：每个维度给出 score / maxScore / covered / missing / issues；评分必须有具体扣分原因，指到验收标准编号或文件；找不到真实问题时如实给高分，禁止为显得严格而编造扣分项；输出用中文。

### TEST_ASSESSMENT_SCHEMA

```json
{
  "type": "object",
  "properties": {
    "requirementCoverage": { "type": "object", "properties": { "score": { "type": "number" }, "maxScore": { "type": "number" }, "covered": { "type": "array" }, "missing": { "type": "array" }, "issues": { "type": "array" } } },
    "boundaryCoverage": { "type": "object", "properties": { "score": { "type": "number" }, "maxScore": { "type": "number" }, "covered": { "type": "array" }, "missing": { "type": "array" }, "issues": { "type": "array" } } },
    "regressionCoverage": { "type": "object", "properties": { "score": { "type": "number" }, "maxScore": { "type": "number" }, "affectedFunctions": { "type": "array" }, "manualVerification": { "type": "array" }, "issues": { "type": "array" } } },
    "exceptionHandling": { "type": "object", "properties": { "score": { "type": "number" }, "maxScore": { "type": "number" }, "covered": { "type": "array" }, "missing": { "type": "array" }, "issues": { "type": "array" } } },
    "testQuality": { "type": "object", "properties": { "score": { "type": "number" }, "maxScore": { "type": "number" }, "strengths": { "type": "array" }, "issues": { "type": "array" } } },
    "totalScore": { "type": "number" },
    "maxScore": { "type": "number" },
    "finalScore": { "type": "number" },
    "criticalGaps": { "type": "array" },
    "manualVerificationPoints": { "type": "array" }
  },
  "required": ["totalScore", "finalScore", "requirementCoverage"]
}
```

## 汇总与判定

- `failedCriteria` / `regressionFailures` / `contractTestFailures`（contractTestResults 里 passed===false）任一非空 → `veto=true`
- `finalScore` = 评估员给的 finalScore 钳到 0~100；没给则 `round(totalScore / maxScore × 100)`
- `passed = finalScore ≥ 80 && !veto`；`maxRounds = 2`
- `manualVerificationPoints` = 评估员的 + regressionCoverage.manualVerification + 每条 unverified 验收标准（前缀「【未验证的验收标准】」）+ 每条 contractGaps（前缀「【缺契约测试】」）
- `criticalGaps` = 「验收失败：…」+「回归失败：…」+「契约测试失败：…」+ 评估员的
- 不过线 → 回对应 ④ 开发（缺口源于方案则回 ② 方案），`round+1`

## 报告模板（落盘 `<report_dir>/{lane}/test-assessment-{日期}.md`）

```markdown
# {前端|后端}测试评估报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 泳道 | {lane} |
| 需求 | {requirement 或「⚠️ 未提供」} |
| 评估轮次 | 第 {round} 轮 / 最多 2 轮 |
| 评估时间 | {timestamp} |
| 验证手段 | {framework} |
| 联调环境（fe） | {gatewayUrl} |
| **总分** | **{finalScore}/100** |
| **结论** | **{✅ 通过 / ❌ 打回}** |
| 判定依据 | {verdictReason} |

## 取证
### 验收标准逐条结果
| # | 验收标准 | 方式 | 结果 | 证据 |
|---|----------|------|------|------|
### 契约测试（be）
| 契约 id | 测试类 | 结果 | 证据 |
|---------|--------|------|------|
{缺契约测试单列：⚠️ 缺契约测试：ids}
### 执行过的命令
### 回归失败项
### 新增 / 修改的测试文件
### 取证过程发现的 bug（未修，需开发处理）
### 取证阻塞

## 分项评估
| 维度 | 得分 | 满分 | 占比 | 状态 |
|------|------|------|------|------|
{需求覆盖 / 边界与异常流 / 回归覆盖 / 异常处理 / 测试代码质量}

## 问题清单
### 🔴 关键缺口（验收失败 / 回归失败 / 契约测试失败 / 覆盖不足）
### 🟡 待改进

## 必须人工 / 联调环境验证的点
{manualVerificationPoints 逐条}

## 评估结论
{通过：测试覆盖满足要求。仍有 N 条验收标准未能自动验证（、M 个接口缺契约测试），提交前请按上节逐条确认。
 打回：判定依据 + 🔴 必须先修复的失败项 + 打回流程（返回开发修复；缺口源于方案返回方案；round+1 重跑）+ 剩余重试次数}

---
**评估标准**: 80 分红线；任一验收标准取证失败、既有测试回归失败、契约测试失败 → 一票否决，与总分无关。口径见 references/评分口径.md。
```

## 返回对象（写进 MEMORY）

`lane, dimensions, evidence{framework, criteriaResults, contractTestResults, contractGaps, regressionFailures, newSpecs, bugsFound, blockers}, totalScore, finalScore, passed, veto, verdictReason, criticalGaps, manualVerificationPoints, report, round, maxRounds, nextAction(complete / escalate_to_development)`
