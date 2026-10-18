# 阶段 ⑤ · 契约校验 + 接口联调（dev-api-integration）

> 两段：**先跑确定性脚本**，再把结果交给一个联调 agent。没有校验结果就不联调——不让 agent 边接边猜。子 agent 调用约定见 `references/运行时排错.md`。**人设不在本卡**：读 `roles/fe-dev.md` 全文放在 prompt 开头（与 ④-FE 共用同一份）。

## 第一步：契约符合性校验（Bash，不是 agent）

```bash
node <just-fe>/tools/contract-conformance.js \
  --contract <report_dir>/contract-v{N}.md \
  --base-url <env.dev.gatewayUrl> \
  --header-file <用户本地的凭证文件，如 ~/.just-fe/auth> \
  [--allow-write <接口 id,…>] \
  --out <report_dir>/conformance-{日期}-r{轮次}.json
```

- 鉴权：部署闸门时请用户把请求头写进本地文件（每行一个 `Header: value`，`chmod 600`），用 `--header-file` 传入；MEMORY `env.dev.auth` 只记文件位置，不让用户把 token 贴进对话。不需要鉴权的环境省略该参数
- **写接口默认不发送**：POST / PUT / PATCH / DELETE 会在联调环境真实写数据，脚本默认标 UNVERIFIED。要校验写接口，先问用户、得到明确同意后再加 `--allow-write <id,…>`
- 结果四态：PASS / PARTIAL（没有不符项，但有字段无法核对，如数组为空）/ FAIL / UNVERIFIED（鉴权不足、返回 HTML 登录页、环境不可达、写接口未放行）
- 脚本只核对成功路径（字段、类型、可空、统一响应体 code），不发请求验证契约里的错误码；错误码分支由后端契约测试覆盖
- 联调环境不可达 / 鉴权拿不到同样要跑——结果全是 UNVERIFIED，联调 agent 据此只写接入代码、不宣称已验证
- 退出码：有 FAIL → 1；PARTIAL / UNVERIFIED 不算失败
- summary（PASS / PARTIAL / FAIL / UNVERIFIED 数与 FAIL 接口 id）写进 MEMORY「契约校验结果摘要」

## 入参（给联调 agent）

| 入参 | 必填 | 来源 |
|------|------|------|
| `requirement` | ✅ | MEMORY / ① |
| `conformanceResult` | ✅ | 上一步脚本输出的 JSON（对象或原文） | 缺 → `needs_conformance`，**不派 agent** |
| `contract` | 推荐 | `contract-v{N}.md` 全文 |
| `uiCompleted` | 推荐 | 最新的 `fe/ui-{日期}-r{轮次}.md` 全文或改动文件清单 | 含 Mock 文件位置 |
| `gatewayUrl` | 推荐 | MEMORY `env.dev.gatewayUrl` |
| `projectContext` | 推荐 | fe-profile 全文 |

## 前置判定（都不派 agent）

- `requirement` 空 → `invalid_args`
- `conformanceResult` 缺 → `status=needs_conformance`，把上面的命令给编排者

## 子 agent ×1（必须有写权限）

label `api-integration`。prompt = `roles/fe-dev.md` 全文 + 下方「联调专项要求」+ `---` + `## 待联调需求` + `## 联调环境` + `## 契约文档` + `## 契约符合性校验结果（以此为准，不要自行判断接口对不对）`（逐条：`- [PASS] id method path` / `- [PARTIAL] id → 未核对: …` / `- [FAIL] id → 差异: …` / `- [UNVERIFIED] id → 原因: …`）+ `## 已有 UI 代码与 Mock（其文件清单即为「需求涉及文件」的基准）` + `## 项目画像` + 「请执行接口联调开发并输出结构化报告。PASS 的接口接入并移除 Mock；PARTIAL 的接口接入并在 pending 里列出未核对的字段；FAIL 的接口保留 Mock 并把差异原文写进 issues；UNVERIFIED 的接口接入代码照写但在 pending 里注明未经验证。」+ `INTEGRATION_SCHEMA` 尾注

### 联调专项要求（接在人设之后）

1. **以契约校验结果为准**
   - `PASS` 的接口：直接接入，把该接口的 Mock 整体移除。
   - `PARTIAL` 的接口（有字段无法核对，如数组为空）：接入并移除 Mock，在 `pending` 里列出未核对的字段，进 ⑦ 的人工验证清单。
   - `FAIL` 的接口（字段缺失 / 类型不符 / 统一响应体 code 不是成功码）：**不要在前端做兼容补丁掩盖差异**。保留 Mock，把差异原文写进 `issues`，`integrationStatus` 标 `partial`；这是后端或契约要改的事。
   - `UNVERIFIED` 的接口（鉴权拿不到、环境不可达）：接入代码照写，但在 `pending` 里注明「未经联调环境验证」。
2. **接入方式**
   - 请求统一走项目封装的请求层，禁止绕过；错误码处理走项目统一的拦截 / 处理约定。
   - 响应到视图模型的规整放在方案指定的规整层，组件里不直接消费原始响应。
   - 契约里标为可空的字段，接入后再核对一次视图层兜底是否仍然成立。
3. **防御性复查**
   - 异步状态机、竞态（切换筛选条件时旧响应覆盖新响应）、重复提交，在真实接口延迟下重新走一遍。
   - Loading / 空数据 / 失败态在真实接口下是否仍然正确展示。
4. **收尾**
   - Mock 相关代码与夹具必须整体移除，不留「暂时注释掉」。
   - 改动文件清单与 `git status` 一致；清单外文件逐个说明理由。

## INTEGRATION_SCHEMA

```json
{
  "type": "object",
  "properties": {
    "integrated": { "type": "array", "items": { "type": "string" }, "description": "已接入真实接口的契约 id" },
    "keptMock": { "type": "array", "items": { "type": "object", "properties": { "contractId": { "type": "string" }, "reason": { "type": "string" } }, "required": ["contractId", "reason"] } },
    "pending": { "type": "array", "items": { "type": "string" } },
    "removedMockFiles": { "type": "array", "items": { "type": "string" } },
    "completedFiles": { "type": "array", "items": { "type": "string" } },
    "outOfScopeChanges": { "type": "array", "items": { "type": "object", "properties": { "file": { "type": "string" }, "reason": { "type": "string" } }, "required": ["file", "reason"] } },
    "commandsRun": { "type": "array", "items": { "type": "object", "properties": { "command": { "type": "string" }, "exitCode": { "type": "number" }, "summary": { "type": "string" } }, "required": ["command"] } },
    "issues": { "type": "array", "items": { "type": "string" } },
    "integrationStatus": { "type": "string", "enum": ["complete", "partial", "blocked"] }
  }
}
```

## 汇总与判定

- 校验结果里有 FAIL 且 agent 报 `complete` → 降为 `partial`
- `canProceed = 无 FAIL && integrationStatus ≠ 'blocked'`
- **有 FAIL → `status=contract_mismatch`，不进 ⑥**：后端修实现，或契约升版本（v+1 重评）后重新部署，再跑第一步与本卡
- `completedFiles` 写进 MEMORY fe 仓「需求涉及文件」

## 报告模板（落盘 `<report_dir>/integration-{日期}-r{轮次}.md`）

```markdown
# 接口联调报告

## 基本信息
| 字段 | 值 |
|------|-----|
| 需求 | {requirement} |
| 联调环境 | {gatewayUrl} |
| 契约版本 | {vN} |
| 联调时间 | {timestamp} |
| 联调状态 | {complete / partial / blocked} |

## 契约符合性校验（脚本结果）
| 契约 id | 方法 | 路径 | 结果 | 差异 / 原因 |
|---------|------|------|------|-------------|
{results 逐行：✅ PASS / 🟡 PARTIAL / ❌ FAIL / ⏳ UNVERIFIED}

## 接入情况
### ✅ 已接入真实接口（Mock 已移除）
### 🧪 仍保留 Mock
| 契约 id | 原因 |
|---------|------|
### ⏳ 待完成 / 未经验证
### 移除的 Mock 文件
### 实际改动文件（应与 git status 一致）
### ⚠️ 需求清单外被触碰的文件
| 文件 | 理由 |
|------|------|

## 自验收命令
## 问题记录
## 下一步
{有 FAIL：存在 N 个契约校验 FAIL 的接口。**不进入代码 Review**：需后端修正实现或升版契约（v+1 重评）后重新部署，再跑一次契约校验与本阶段。
 blocked：联调阻断，需解决后重新联调
 否则：联调完成（M 个接口未经联调环境验证，进 ⑦ 的人工验证清单）。确认后进入代码 Review}
```

## 返回对象（写进 MEMORY）

`conformance{pass,partial,fail,unverified,failItems}, integrated, keptMock, pending, removedMockFiles, completedFiles, outOfScopeChanges, commandsRun, issues, integrationStatus, report, status(complete/partial/blocked/contract_mismatch/needs_conformance/invalid_args), nextStep(code-review / resolve_contract_mismatch / resolve_block / run_conformance), canProceed`
