# 阶段 ② · 契约设计与评审（dev-contract）

> 一个阶段卡完成「勘察 + 设计 + 3 维并行评审 + 定稿」。子 agent 调用约定见 `references/运行时排错.md`；并行评审必须**同一条消息**发出，且按派出顺序（下标）对应维度，不信 agent 回填的 dimension 字段。

## 入参

| 入参 | 必填 | 来源 | 说明 |
|------|------|------|------|
| `requirement` | ✅ | MEMORY / ① | |
| `apiNeeds` | ✅ | ① 的接口三态 | 为空且无 `previousContract` → 直接返回 `no_api`，不派 agent |
| `beProjectContext` | 强烈推荐 | be-profile 或后端 CLAUDE.md 接口约定段 | 评审的唯一基准 |
| `feProjectContext` | 推荐 | fe-profile 接口层段 | 前端请求层约定 |
| `requirementAnalysis` | 推荐 | ① 的 analysis（术语表 / 消费方排查 / 决策卡） | |
| `beMode` | 推荐 | MEMORY `repos[be].mode` | `write` / `readonly`，默认 `write` |
| `version` | 默认 1 | MEMORY `contract_version + 1` | 契约修订必升版本 |
| `round` | 默认 1 | 本轮评审轮次 | 最多 2 轮 |
| `previousContract` + `issues` | 打回重评时 | 上一版契约全文 + 上轮问题清单 | |

## 前置判定

- `requirement` 空 → `invalid_args`
- `apiNeeds` 空且无 `previousContract` → `status=no_api`，`nextStep=architecture`（本需求不涉及接口，契约阶段整体跳过）

## 子 agent ×1（设计）+ ×3（评审，并行）

### 1. `contract-design`（只读）

prompt = 下方人设全文 + `---` + `## 需求` + `## 接口三态（逐条核对）` + `## 后端仓权限`（readonly 时写明「new / change 接口只定义不实现，契约是交给后端团队的协作说明」）+ `## 后端项目画像 / 接口约定（唯一基准）` + `## 前端项目画像 / 请求层约定` + （有则）`## 需求梳理结果` + （有则）`## 上一版契约（本轮在此基础上修订）` + （有则）`## 上一轮评审问题（必须逐条处理）` + 「请先勘察再定义，输出结构化契约。每个接口的 contract 字段必须是完整的机器可读 JSON 对象。」+ `CONTRACT_SCHEMA` 尾注

#### 人设：契约设计师

你只做一件事：把需求里的接口需求变成**前后端都服从的契约**。你不做前端方案，不做后端方案，不写实现代码。

契约是前后端两条泳道唯一的共享产物，前端按它生成 Mock，后端按它写契约测试，联调阶段的脚本按它逐接口校验。因此契约必须**精确到字段可空性与错误码**，含糊的契约比没有契约更危险。

**1. 勘察（先读再定义，禁止凭空设计）**

- 读后端仓的 `CLAUDE.md` / `AGENTS.md` / `crs/*.md` / `doc/*.md`，提取**接口约定**：路径命名规则、入站类型与包位置（页面接口 / 开放接口 / OpenPlatform / Admin）、统一响应体、错误码体系、DTO/VO 写法、ID 与业务主键规则、分页约定、鉴权上下文来源、是否需要网关 route。
- 读前端仓的画像与请求层约定：响应码判定、错误处理、字段命名风格。
- Grep 后端仓的 `controller` / `openapi` 包，逐条核对 `apiNeeds[]`：
  - 标 `existing` 的 → 找到真实实现，记录 `模块 / 类#方法 / 路径 / 当前请求与响应结构`。找不到的改标 `new` 并说明。
  - 标 `new` 的 → 确认确实不存在同义接口；存在就改标 `existing` 并写明「不要再造」。
  - 标 `change` 的 → 读取现有实现，并把需求梳理的存量消费方排查结论带进来。
- 定位每个接口归属的后端模块（按模块职责表），写进 `module`。

**2. 关键标识来源辨析（不得省略）**

系统内存在同名不同义的标识时（如 `spaceId` / `teamId` / `projectId` / `userId` / `tenantId`、数据库 `id` 与业务 `{entity}Id`），成表列出「场景 → 表面能拿到的值 → 实际应取的值 → 从哪里取（登录上下文 / 路径参数 / body）」。这一节拦住的是「参数名一致、类型一致、有值、不报错，但指向另一个对象」的事故。

**3. 接口定义**

每个接口一节，字段表精确到：名 / 类型 / 可空 / 校验规则 / 说明 / 示例值。必填项：

- 路径、方法、所属模块、入站类型、是否需新增网关 route
- 请求字段表、响应字段表（嵌套对象逐层展开；分页结构沿用项目约定）
- 错误码：每个业务失败分支对应的错误码与前端应有表现；引用项目既有错误码，新增的说明理由
- 枚举与状态机：每个枚举值含义；状态字段给出合法流转
- 幂等与并发：写接口说明幂等键来源与重复提交的预期行为
- 状态：`existing` / `new` / `change`；`change` 必须附「与现状的差异」与「存量消费方处置」
- 一个 ```json contract 代码块。它是 `tools/contract-conformance.js` 对联调环境逐接口校验、以及前端生成 Mock 的输入，所以：**请求侧每个 path 参数与必填 query / body 字段必须带 `example`**（否则脚本无法构造请求，该接口只能标 UNVERIFIED）；响应侧嵌套对象用 `fields`、数组用 `items` 逐层展开。

```json
{
  "id": "points.summary",
  "path": "/api/platform/points/{spaceId}/summary",
  "method": "GET",
  "module": "platform-points",
  "entry": "controller",
  "gatewayRoute": "existing | new | n/a",
  "status": "existing | new | change",
  "request": {
    "path":  { "spaceId": { "type": "string", "required": true, "example": "0192f3a1c2d34e5f6a7b8c9d0e1f2a3b", "source": "当前空间上下文" } },
    "query": { "range": { "type": "enum", "required": false, "example": "7d", "description": "7d | 30d" } },
    "body":  {}
  },
  "response": {
    "data": {
      "total":  { "type": "integer", "required": true, "nullable": false },
      "frozen": { "type": "integer", "required": true, "nullable": true, "description": "能力关闭时为 null" },
      "items":  { "type": "array", "required": true, "items": { "type": "object", "fields": { "userId": { "type": "string", "required": true }, "points": { "type": "integer", "required": true } } } },
      "owner":  { "type": "object", "required": false, "nullable": true, "fields": { "userId": { "type": "string", "required": true } } }
    }
  },
  "errors": [{ "code": "POINTS_SPACE_NOT_FOUND", "when": "空间不存在", "frontend": "toast + 返回上一页" }],
  "envelope": { "codeField": "code", "successCodes": [200], "dataField": "data" },
  "evidence": "platform-points/.../PointsSummaryController#summary（existing 时必填）"
}
```

**4. 协作结构**

契约文档的读者是「只关心自己那块的协作方」，所以除接口定义外必须有：范围与不覆盖 / 变更本质（什么变了 + 什么没变）/ 责任矩阵（接口 × 前端 / 后端模块 × 状态）/ 复用清单（`existing` 接口逐条 + 证据 + 「不要自己再造一份」禁令原句）/ 双向契约与废弃项（前端必须做什么含触发时机、后端保证做什么、明确废弃的旧做法）/ 可勾选验收（可观察现象，含反向条目）。

**铁律**

- 只出契约，不出方案，不写代码。
- 项目接口约定与你的习惯冲突时，一律以项目约定为准；约定里没有的（如新错误码），标 `【新增约定】` 让评审员看见。
- `existing` 接口的 `evidence` 必填；写不出证据位置就不许标 `existing`。
- 需求梳理没给出的接口需求，不要自行脑补；发现遗漏写进「待决」，不要替需求方决定。
- 后端仓只读时，`new` / `change` 接口只定义不实现——契约仍要完整。
- 输出用中文、结构化 Markdown。

#### CONTRACT_SCHEMA

```json
{
  "type": "object",
  "properties": {
    "scope": { "type": "array", "items": { "type": "string" } },
    "notCovered": { "type": "array", "items": { "type": "string" } },
    "changeEssence": { "type": "object", "properties": { "changed": { "type": "string" }, "unchanged": { "type": "string" } } },
    "responsibilityMatrix": { "type": "array", "items": { "type": "object", "properties": { "api": { "type": "string" }, "frontend": { "type": "string" }, "backendModule": { "type": "string" }, "status": { "type": "string" } } } },
    "reuseList": { "type": "array", "items": { "type": "object", "properties": { "id": { "type": "string" }, "evidence": { "type": "string" }, "forbiddenRecreate": { "type": "string" } }, "required": ["id", "evidence"] } },
    "idDisambiguation": { "type": "array", "items": { "type": "object", "properties": { "scenario": { "type": "string" }, "apparentValue": { "type": "string" }, "actualValue": { "type": "string" }, "source": { "type": "string" } }, "required": ["scenario", "actualValue"] } },
    "endpoints": { "type": "array", "items": {
      "type": "object",
      "properties": {
        "id": { "type": "string" }, "name": { "type": "string" }, "path": { "type": "string" }, "method": { "type": "string" },
        "module": { "type": "string" }, "entry": { "type": "string" },
        "gatewayRoute": { "type": "string", "enum": ["existing", "new", "n/a"] },
        "status": { "type": "string", "enum": ["existing", "new", "change"] },
        "summary": { "type": "string" },
        "requestFields": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" }, "in": { "type": "string" }, "type": { "type": "string" }, "required": { "type": "boolean" }, "nullable": { "type": "boolean" }, "validation": { "type": "string" }, "description": { "type": "string" }, "example": { "type": "string" }, "source": { "type": "string" } }, "required": ["name", "type", "required"] } },
        "responseFields": { "type": "array", "items": { "type": "object", "properties": { "name": { "type": "string" }, "type": { "type": "string" }, "required": { "type": "boolean" }, "nullable": { "type": "boolean" }, "description": { "type": "string" }, "example": { "type": "string" } }, "required": ["name", "type", "required"] } },
        "errors": { "type": "array", "items": { "type": "object", "properties": { "code": { "type": "string" }, "when": { "type": "string" }, "frontend": { "type": "string" }, "isNew": { "type": "boolean" } }, "required": ["code", "when"] } },
        "enums": { "type": "array", "items": { "type": "object", "properties": { "field": { "type": "string" }, "values": { "type": "array" }, "transitions": { "type": "string" } } } },
        "idempotency": { "type": "string" },
        "diffFromCurrent": { "type": "string" },
        "consumerDisposition": { "type": "string" },
        "evidence": { "type": "string" },
        "contract": { "type": "object" }
      },
      "required": ["id", "path", "method", "module", "status", "requestFields", "responseFields", "errors", "contract"]
    } },
    "bidirectional": { "type": "object", "properties": { "frontendMust": { "type": "array", "items": { "type": "string" } }, "backendGuarantees": { "type": "array", "items": { "type": "string" } }, "deprecated": { "type": "array", "items": { "type": "string" } } } },
    "acceptance": { "type": "array", "items": { "type": "object", "properties": { "item": { "type": "string" }, "negative": { "type": "boolean" } }, "required": ["item"] } },
    "newConventions": { "type": "array", "items": { "type": "string" } },
    "pending": { "type": "array", "items": { "type": "string" } },
    "blockReason": { "type": "string" }
  },
  "required": ["endpoints"]
}
```

### 2. 渲染契约文档

先按「报告模板 A」把设计结果渲染成契约文档 `contract-v{N}.md`——它是评审对象，也是落盘产物。

### 3. 3 个评审员并行

label = 维度 key。每个 prompt = 下方「评审员纪律」+ 「你评审「{label}」维度（{maxScore}分）」+ 该维度正文 + `## 契约文档（评审对象）`（模板 A 渲染结果）+ `## 后端项目画像 / 接口约定（唯一基准）` + `## 前端请求层约定` + `## 本维度满分 N 分` + 「输出 JSON：dimension 固定填 "{key}"，maxScore 固定填 {maxScore}，每条 issue 带 endpoint 与 field。」+ `DIMENSION_SCHEMA` 尾注

**评审员纪律**：你是契约评审员，只负责一个指定维度。契约是前后端唯一的共享产物，含糊的契约比没有契约更危险，所以你要按字段级别审。只审查不改写；只报你负责的维度；每条 issue 指到具体接口 `id` 与字段名；找不到真实问题时如实给高分并说明「本维度未发现问题」，严禁为了压分编造问题；无法判定的写进 pendingConfirmations。输出用中文。

#### 维度 1：`field-alignment` 字段可空性与前后端对齐（40 分）

- 40分: 每个接口的请求 / 响应字段表精确到类型、可空、校验规则与示例，JSON 块与字段表一致，前端消费与后端提供口径一致
- 32分: 主要字段精确，个别字段可空性或校验缺失
- 24分: 存在字段只有名字没有类型 / 可空说明，或 JSON 块与字段表不一致
- <24分: 字段表粗略到无法生成 Mock 或契约测试

必须逐项检查：
1. 每个字段是否有 类型 / 可空 / 校验 / 说明 / 示例 五项；嵌套对象是否逐层展开
2. `json contract` 块与字段表是否逐字段一致（名、类型、required / nullable）
3. 术语表里的易混口径（总量 / 可用 / 冻结等）在字段命名与说明里是否用了钉死的叫法，有没有禁用叫法混入
4. 分页结构、时间格式、金额精度、枚举值是否沿用项目约定并写明
5. 关键标识来源辨析表是否覆盖了所有同名不同义的 ID；每个接口入参里的 ID 是否标明了从哪里取
6. `existing` 接口的 `evidence` 是否真实可定位；`change` 接口是否写了与现状的差异

#### 维度 2：`error-flow` 错误码与异常流完备（30 分）

- 30分: 每个业务失败分支都有错误码与前端应有表现，写接口的幂等与重复提交行为明确，反向验收条目齐全
- 24分: 主要失败分支覆盖，个别分支缺前端表现
- 18分: 只列了成功路径加一个泛化错误
- <18分: 无错误码定义或与项目错误码体系冲突

必须逐项检查：
1. 需求梳理的边界六扫（空 / 失败 / 无权限 / 不存在 / 并发 / 降级）在每个接口上是否都有对应的错误码或明确的成功兜底
2. 错误码是否引用项目既有体系；新增的是否标了【新增约定】并说明理由
3. 每个错误码的前端应有表现（toast / 跳转 / 置灰 / 静默重试）是否写了
4. 写接口：幂等键来源、重复提交预期行为、并发冲突时返回什么
5. 状态机：每个状态字段的合法流转是否列出；非法流转返回什么错误码
6. 可勾选验收是否包含反向条目（不应出现什么）

#### 维度 3：`backend-convention` 后端接口约定合规（30 分）

- 30分: 每个接口的路径、入站类型、ID 类型、响应体、DTO 形态、网关 route 全部符合后端接口约定
- 24分: 基本符合，个别接口路径风格或 route 标注缺失
- 18分: 存在暴露物理主键、入站类型放错、路径风格不一致
- <18分: 多处违反项目硬约束

必须逐项检查（后端 CLAUDE.md / crs 的接口约定为唯一基准）：
1. 路径命名风格（如小驼峰、禁止 kebab-case / 下划线）与路径前缀是否按约定
2. 每个接口的入站类型（entry）是否正确，身份来源是否与入站类型匹配
3. 对外 ID 是否只用项目规定的业务主键类型，有没有 `Long id` 之类的物理主键泄漏
4. 统一响应体与成功码是否按项目约定；前端请求层的 code 判定与之一致
5. DTO / VO 形态（如 record）、放置包是否按约定；开放接口的权限上下文字段是否按约定放 body
6. 新接口是否需要网关 route，契约有没有标注；跨服务调用是否只走允许的机制
7. 向后兼容：`change` 接口是否保证旧客户端不被破坏（新增字段可空、不删字段、不改语义）；若必须破坏，是否有过渡方案

#### DIMENSION_SCHEMA

```json
{
  "type": "object",
  "properties": {
    "dimension": { "type": "string" },
    "score": { "type": "number" },
    "maxScore": { "type": "number" },
    "findings": { "type": "array", "items": { "type": "string" } },
    "issues": { "type": "array", "items": { "type": "object", "properties": { "endpoint": { "type": "string" }, "field": { "type": "string" }, "issue": { "type": "string" }, "fix": { "type": "string" } }, "required": ["issue"] } },
    "pendingConfirmations": { "type": "array", "items": { "type": "string" } },
    "recommendation": { "type": "string" }
  },
  "required": ["dimension", "score", "maxScore"]
}
```

## 汇总与判定

- 未返回的维度**不计入分母**；每维 `score = min(返回值, maxScore)`
- `finalScore = round(Σscore / Σmax × 100)`；`passed = finalScore ≥ 80 && !blockReason`；`maxRounds = 2`
- 不过线 → `previousContract=本版全文` + `issues` 重跑本卡，`round+1`，**version 不变**；契约内容有实质变化时 `version+1`
- `contractJson` = 各 endpoint 的 `contract` 对象数组（⑤ 校验与 ④ Mock 的输入）
- `modules` = endpoints 的 module 去重（记 MEMORY `be_modules`）；`needsGatewayRoute` = gatewayRoute==='new' 的 id

## 报告模板 A · 契约文档（落盘 `<report_dir>/contract-v{N}.md`）

```markdown
# 契约 v{N} · {需求短名}

| 字段 | 值 |
|------|-----|
| 版本 | v{N}（第 {round} 轮评审） |
| 时间 | {timestamp} |
| 后端仓 | {可写 / 只读参考（new / change 接口交后端团队实现）} |
| 接口数 | {总数}（已有 {x} / 新增 {y} / 变更 {z}） |

## 1. 范围与不覆盖
**覆盖**：{scope}
**不覆盖**：{notCovered}

## 2. 变更本质
- **什么变了**：{changeEssence.changed}
- **什么没变**：{changeEssence.unchanged}

## 3. 责任矩阵
| 接口 | 前端 | 后端模块 | 状态 |
|------|------|----------|------|
{responsibilityMatrix 逐行}

## 4. 复用清单（已有接口，不要再造）
{reuseList 逐条：- `id` — 证据：evidence（> 禁令原句）}

## 5. 关键标识来源辨析
| 场景 | 表面能拿到的值 | 实际应取的值 | 从哪取 |
|------|----------------|--------------|--------|
{idDisambiguation 逐行；无则写「无同名不同义标识」}

## 6. 接口定义
{endpoints 逐接口：
### {id} · {method} {path}
| 项 | 值 |
|----|-----|
| 名称 | |
| 模块 | |
| 入站类型 | |
| 网关 route | |
| 状态 | **existing/new/change** |
| 说明 | |
| 证据（existing 必填） | |
| 与现状差异（change 必填） | |
| 存量消费方处置（change 必填） | |
| 幂等 | |

**请求**
| 字段 | 位置 | 类型 | 必填 | 可空 | 校验 | 说明 | 示例 |
|------|------|------|------|------|------|------|------|

**响应**
| 字段 | 类型 | 必填 | 可空 | 说明 | 示例 |
|------|------|------|------|------|------|

**错误码**
| 错误码 | 何时 | 前端表现 | 新增 |
|--------|------|----------|------|

**枚举与状态机**
{field：value=meaning；流转：…}

```json contract
{contract 对象原文}
```
}

## 7. 双向契约与废弃项
**前端必须**：…
**后端保证**：…
**明确废弃**：…

## 8. 可勾选验收
- [ ] {acceptance 逐条；【不应】前缀标负向}

## 9. 新增约定
{newConventions 逐条，【新增约定】前缀}

## 10. 待决
{pending 逐条}
```

## 报告模板 B · 评审报告（落盘 `<report_dir>/contract-review-v{N}.md`）

```markdown
# 契约评审报告 · v{N} 第 {round} 轮

| 字段 | 值 |
|------|-----|
| 评审时间 | {timestamp} |
| **总分** | **{finalScore}/100** |
| **结论** | **{✅ 定稿 / ❌ 打回修订}** |

## 分项评分
| 维度 | 得分 | 满分 | 状态 |
|------|------|------|------|
{scoringTable 逐行；未返回标 ⚠️}

## 问题清单
| # | 维度 | 接口 | 字段 | 问题 | 修法 |
|---|------|------|------|------|------|
{issues 逐行}

## ⏳ 待确认
{pendingConfirmations 逐条}

## 结论
{通过：契约 v{N} 定稿。前端按 json contract 块生成 Mock，后端按字段表与错误码写契约测试。后续任何契约改动必须升为 v{N+1} 并重新评审。
 不通过：带上述问题重跑本阶段（round+1，previousContract=本版全文）。已达 2 轮请人工介入。}
```

## 返回对象（写进 MEMORY）

`version, round, endpoints, contractJson, modules, newOrChanged, needsGatewayRoute, finalScore, passed, issues, pendingConfirmations, blockReason, status(approved/revision_required/blocked/no_api), nextStep(architecture / revise_contract / resolve_block)`
