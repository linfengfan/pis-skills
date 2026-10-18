# 阶段卡 · test 本地测试评估

## 何时运行

每个启用泳道各一次，在 review 通过（或用户接受）之后。全部在本地进行：前端用 Mock 数据，后端只跑单测与契约测试，需要真实数据库或联调环境的项标「未验证」。

## 每条泳道的步骤

### 1. 开始

```bash
node <skill>/tools/state.js start --dir <d> --stage test --lane <l>
```

### 2. 取证（先跑，串行）

- 角色卡：`roles/verifier.md`，key `verify`
- 输入：需求梳理报告（验收标准）、本泳道最新的改动范围（`state.js get --dir <d> --key stages.review.lanes.<l>.paths.scope`）、本泳道画像（门禁命令）、仓库路径；后端再给接口定义 `api-v<N>.json`（逐个确认契约测试）。
- 输出：报告 `paths.verify`，逐条结果写到同名 `.criteria.json`。

```bash
node <skill>/tools/state.js receipt --dir <d> --stage test --lane <l> --role verifier --reviewer verify --json '<回执>'
```

### 3. 测试质量评审（取证完成后）

- 角色卡：`roles/reviewer.md`，key `quality`，负责 `checklists/test.md` 的 `TQ` 组
- 输入：取证报告 `paths.verify` 与 `.criteria.json`、改动范围、仓库路径、画像。
- 输出：`paths.review`（`{reviewer}` 换成 `quality`）及同名 `.items.json`。

```bash
node <skill>/tools/state.js receipt --dir <d> --stage test --lane <l> --role reviewer --reviewer quality \
  --checklist checklists/test.md --groups TQ --json '<回执>'
node <skill>/tools/state.js score --dir <d> --stage test --lane <l> --expect verify,quality
```

分数 = 验收标准（每条按 critical 计权，「未验证」算未通过）+ 测试质量项。**一票否决**：任一验收标准取证失败、任一回归失败、任一契约测试失败。

## 闸门

`state.js finish --dir <d> --stage test`，汇报：测试汇总路径、分数、否决项、未验证的验收标准（会进入交付说明的人工验证清单）。

- 通过：`gate --stage test --lane <l> --choice next`。
- 不通过：回 dev 修复（`gate --choice fix`；修完要重新走 review 再回到 test）、接受现状（`accept --note`）、先停。
