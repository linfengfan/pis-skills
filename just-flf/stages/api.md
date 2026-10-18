# 阶段卡 · api 接口梳理确认

## 何时运行

triage 判定需求涉及接口（`state.json` 的 `triage.apis` 三项之和 > 0）。否则在 triage 闸门后直接 `state.js gate --dir <d> --stage api --choice skip`。

前置：后端仓存在时需要后端画像，前端泳道启用时需要前端画像（缺失见 `stages/triage.md`「画像」）。

## 步骤

### 1. 开始

```bash
node <skill>/tools/state.js start --dir <d> --stage api
```

首次运行是 v1；本阶段已完成后再次运行会升版本（v2…），并把下游已完成的阶段标为过期。

### 2. 派接口设计师（1 个）

- 角色卡：`roles/api-designer.md`
- 输入：需求梳理报告（triage 最新报告）、前端 / 后端画像、仓库路径、后端仓可写性（`repos.be.mode`）、已裁定的决策卡（`state.json` 的 `decisions`）。修订时再给：上一轮评审汇总 `paths.summary` 的上一版路径。
- 输出：`paths.report`（人读）与 `paths.apiJson`（机读）。

回执：`state.js receipt --dir <d> --stage api --role api-designer --json '<回执>'`

### 3. 评审（仅当回执 `endpoints.new + endpoints.change > 0`）

**并行**派 3 个评审员（同一条消息）：

| 评审员 key | 角色卡 | 负责清单组 |
|------------|--------|------------|
| `fe-arch` | `roles/fe-architect.md` + `roles/reviewer.md` | `checklists/api.md` 的 `CONSUME` |
| `be-arch` | `roles/be-architect.md` + `roles/reviewer.md` | `checklists/api.md` 的 `IMPL` |
| `doc` | `roles/reviewer.md` | `checklists/api.md` 的 `DOC` |

- 输入：接口定义 `paths.report` 与 `paths.apiJson`、需求梳理报告、画像。
- 输出：`paths.review`（`{reviewer}` 换成 key），以及同名 `.items.json`。
- 前端泳道未启用（纯后端需求）时，`fe-arch` 照常派，它审的是「接口能否被正常消费」。

每个回执：

```bash
node <skill>/tools/state.js receipt --dir <d> --stage api --role <角色卡名> --reviewer <key> \
  --checklist checklists/api.md --groups <组> --json '<回执>'
node <skill>/tools/state.js score --dir <d> --stage api --expect fe-arch,be-arch,doc
```

- 不通过且本版本评审轮次 < 2：`state.js start --stage api`（同版本、轮次 +1），把评审汇总路径作为「上一轮评审问题」交给接口设计师修订，再评审。
- 第 2 轮仍不通过：停下，把汇总交给用户决定（接受 / 继续改 / 拆需求）。
- 只有已有接口：不评审，直接进闸门。

### 4. 闸门

`state.js finish --dir <d> --stage api`，汇报：接口定义路径、版本、已有 / 新增 / 变更数量、评审分数、待决项。提醒用户：确认后接口定义就是前后端共同的唯一依据，之后再改要升版本，已完成的下游阶段会被标为过期。
