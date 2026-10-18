# 阶段卡 · design 方案

## 何时运行

仅 `full` 档。对 `state.js status` 输出的每个启用泳道（`lanes`）各跑一次，两条泳道并行推进，最后合并为一道闸门。

前置：api 已完成或已跳过；该泳道有画像。

## 每条泳道的步骤

### 1. 开始

```bash
node <skill>/tools/state.js start --dir <d> --stage design --lane <fe|be>
```

### 2. 派本泳道架构师（1 个）

- 角色卡：`roles/fe-architect.md` 或 `roles/be-architect.md`
- 输入：需求梳理报告、接口定义（`api-v<N>.md` 与 `.json`，有则给）、本泳道画像、仓库路径、已裁定的决策卡。修订时再给上一轮评审汇总路径。
- 输出：方案 `paths.report`；需求涉及文件清单 `paths.files`（一行一个相对仓库根的路径，目录以 `/` 结尾）。

```bash
node <skill>/tools/state.js receipt --dir <d> --stage design --lane <l> --role <fe-architect|be-architect> --json '<回执>'
```

回执 `needsClarification` 非空：需求或接口有缺口。把缺口交给用户；需要回到 triage 或 api 时，按用户选择重跑对应阶段。

### 3. 评审：并行派 3 个评审员（同一条消息）

| 泳道 | 评审员 key | 负责清单组 |
|------|-----------|-----------|
| fe | `cover` | `checklists/design-fe.md` 的 `COVER,FEAS` |
| fe | `struct` | `checklists/design-fe.md` 的 `STRUCT,STATE` |
| fe | `risk` | `checklists/design-fe.md` 的 `RISK,CONV` |
| be | `cover` | `checklists/design-be.md` 的 `COVER,LAYER` |
| be | `data` | `checklists/design-be.md` 的 `DATA,TXN` |
| be | `risk` | `checklists/design-be.md` 的 `PERF,CONV` |

- 角色卡：都用 `roles/reviewer.md`（方案由架构师写，不让架构师评自己的方案）。
- 输入：方案 `paths.report`、`paths.files`、需求梳理报告、接口定义、画像、仓库路径。
- 输出：`paths.review`（`{reviewer}` 换成 key）及同名 `.items.json`。

```bash
node <skill>/tools/state.js receipt --dir <d> --stage design --lane <l> --role reviewer --reviewer <key> \
  --checklist checklists/design-<l>.md --groups <组> --json '<回执>'
node <skill>/tools/state.js score --dir <d> --stage design --lane <l> --expect <三个 key>
```

不通过且轮次 < 3：`start --stage design --lane <l>`，把评审汇总路径交给架构师修订后再评审。第 3 轮仍不通过：停下交给用户。

## 闸门（两条泳道都结束后一次）

`state.js finish --dir <d> --stage design`（不带 `--lane` 即作用于所有泳道），汇报：两份方案路径、各自分数、任务卡数量、风险与取舍要点、待决项。用户确认后 `gate --stage design --choice next`。
