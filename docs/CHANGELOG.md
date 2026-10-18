# just-flf 变更记录

just-fe 的反馈与处理记录在 `just-fe/todo.md`，两个 Skill 分开维护。

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
