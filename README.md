# pis-skills

Claude Code / Cursor 的 Agent Skills 集合。一个目录一个 Skill，各自独立安装。

## Skills

- **[just-flf](just-flf/README.md)** —— 全栈研发流程：需求梳理 → 接口梳理确认 → 方案 → 开发 → 代码评审 → 本地测试评估 → 交付说明，部署后可选联调。每个阶段结束都停下来问你；评审按清单逐项判定、脚本算分；全程不执行 git 写操作，提交由你决定。
- **[just-fe](just-fe/README.md)** —— 原有的全栈研发流程（阶段卡 ⓪–⑧，含部署闸门），仍在使用并继续维护，与 just-flf 各自独立安装。

每个 Skill 目录下三份文档：`README.md` 给人看怎么用；`INSTALL.md` / `UNINSTALL.md` 给 AI 读，分别负责安装与卸载——对 AI 说「读 `<skill>/INSTALL.md` 帮我装上」即可。

仓库根目录的 `docs/`（设计文档、实施计划、历史纪要、变更记录）与 `tests/` 不随 Skill 安装。
