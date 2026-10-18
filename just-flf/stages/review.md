# 阶段卡 · review 代码评审

## 何时运行

每个启用泳道各一次。dev 修复后再次运行。

## 每条泳道的步骤

### 1. 开始并计算改动范围

```bash
node <skill>/tools/state.js start --dir <d> --stage review --lane <l>
node <skill>/tools/scope.js diff --repo <该泳道仓库根> --baseline <d>/<l>/baseline.json \
  [--files <d>/<l>/files.txt] --out <paths.scope>
```

`files.txt` 只在 `full` 档存在；`lite` 档不传 `--files`，结果里 `outOfScope` 为 `null`，表示未判越界。

### 2. 派评审员

**full 档：并行派 3 个（同一条消息）**

| 评审员 key | 角色卡 | 负责清单组（`checklists/code.md`） |
|-----------|--------|-----------------------------------|
| `arch` | 本泳道架构师（`fe-architect.md` / `be-architect.md`）+ `reviewer.md` | `DESIGN,ARCH,BLAST` |
| `correct` | `reviewer.md` | `LOGIC,ROBUST,TYPE` |
| `conv` | `reviewer.md` | `CONV,SEC` |

**lite 档：派 1 个**，key `all`，角色卡 `reviewer.md`，负责全部组 `DESIGN,ARCH,BLAST,LOGIC,ROBUST,TYPE,CONV,SEC`，并加 `--min-severity major`（跳过 minor 项；没有方案，`DESIGN` 组判 na）。

- 输入：改动范围 `paths.scope`、仓库路径（评审员自己用 `git diff` 看改动）、需求梳理报告、接口定义、方案（full 档）、本泳道画像、开发报告。
- 输出：`paths.review`（`{reviewer}` 换成 key）及同名 `.items.json`。
- 负责 `BLAST` 组的评审员要在回执里额外给出改动摘要、建议 commit message、必须人工验证的点（交付说明会用到）。

```bash
node <skill>/tools/state.js receipt --dir <d> --stage review --lane <l> --role <角色卡名> --reviewer <key> \
  --checklist checklists/code.md --groups <组> [--min-severity major] --json '<回执>'
node <skill>/tools/state.js score --dir <d> --stage review --lane <l> --expect <arch,correct,conv 或 all>
```

## 闸门

`state.js finish --dir <d> --stage review`（或分泳道），汇报：评审汇总路径、每仓分数、critical 不通过项、越界文件数。

- 通过：用户确认后 `gate --stage review --lane <l> --choice next`。
- 不通过：给用户三个选项——回 dev 修复（推荐，`gate --choice fix`，下一步 dev 只修汇总里的不通过项，之后重新 review）、接受现状（`gate --choice accept --note <理由>`，取舍写进交付说明）、先停。
