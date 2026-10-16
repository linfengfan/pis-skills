# pis-skills

Claude Code / Cursor 的 Agent Skills 集合。一个目录一个 Skill，各自独立安装。

## Skills

- **[just-fe](just-fe/README.md)** —— 全栈研发流程：需求梳理 → 接口契约 → 方案（前端 / 后端）→ 方案评审 → 开发 → 部署闸门 → 契约校验与联调 → 代码 Review → 测试评估 → 变更说明与提交清单。四道关卡 80 分红线，契约先行，提交权归用户。

每个 Skill 目录下三份文档：`README.md` 给人看怎么用；`INSTALL.md` / `UNINSTALL.md` 给 AI 读，分别负责完整安装与彻底卸载——对 Claude 说「读 `<skill>/INSTALL.md` 帮我装上」即可。
