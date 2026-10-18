# 清单 · 后端方案评审

评审对象：后端方案与 `files.txt`。三个评审员分别负责 `COVER,LAYER`、`DATA,TXN`、`PERF,CONV`。所有「项目约定」以后端画像与仓库规范为准。

| ID | 组 | 检查项 | 严重度 | 适用 |
|----|----|--------|--------|------|
| COVER-01 | COVER | 接口定义里每个新增或变更接口都有对应的入口、业务与数据落点 | critical | all |
| COVER-02 | COVER | 每条验收标准在方案里都有落点 | major | all |
| COVER-03 | COVER | 异常流（并发、重复提交、无权限、数据不存在）都有设计 | major | all |
| COVER-04 | COVER | 存量消费方的处置结论被尊重，变更接口有兼容处理 | critical | all |
| COVER-05 | COVER | 范围边界被尊重，没有越界设计 | minor | all |
| LAYER-01 | LAYER | 各层职责符合项目分层约定，事务在约定的层收口 | major | all |
| LAYER-02 | LAYER | 接口放在正确的入站类型下，身份按入站类型的约定来源获取 | major | all |
| LAYER-03 | LAYER | 接口 id 到入口方法、请求对象、响应对象、错误码的映射完整，字段与可空性和接口定义一致 | critical | all |
| LAYER-04 | LAYER | 跨模块协作只走项目允许的机制，没有违反依赖禁令 | major | all |
| DATA-01 | DATA | 新表与新字段遵守命名、类型、可空、默认值、注释约定 | major | all |
| DATA-02 | DATA | 项目要求的通用字段（隔离键、逻辑删除、审计、版本）齐全 | critical | all |
| DATA-03 | DATA | 核心表有对外业务主键且建了唯一索引 | major | all |
| DATA-04 | DATA | 索引设计有依据（与查询条件和排序对得上），没有重复或无用索引 | major | all |
| DATA-05 | DATA | 历史表变更有迁移脚本与旧数据兼容方案 | critical | all |
| TXN-01 | TXN | 多表写在事务内，回滚条件正确，大事务已拆解 | critical | all |
| TXN-02 | TXN | 事务内没有外部调用、消息发送或大文件处理（已改为事件或 outbox 等项目机制） | critical | all |
| TXN-03 | TXN | 每个写接口的幂等设计与接口定义一致 | critical | all |
| TXN-04 | TXN | 锁的选型与粒度有理由，释放与超时已考虑 | major | all |
| TXN-05 | TXN | 并发竞争点逐一列出并有封堵方案 | major | all |
| PERF-01 | PERF | N+1、深分页、大 IN、全量加载逐个规避 | major | all |
| PERF-02 | PERF | 缓存 key 带隔离维度，有过期与穿透、击穿、雪崩防护（如涉及） | major | all |
| PERF-03 | PERF | 水平越权：资源归属校验的位置明确，覆盖所有写接口与按 ID 读的接口 | critical | all |
| PERF-04 | PERF | 不把前端透传的身份、租户、金额当可信输入 | critical | all |
| PERF-05 | PERF | 外部调用有超时与重试上限，必要的限流与降级点已标出 | minor | all |
| CONV-01 | CONV | 目录结构与命名、请求与响应对象写法符合项目约定 | major | all |
| CONV-02 | CONV | 错误码引用既有体系，新增的说明了理由 | minor | all |
| CONV-03 | CONV | 项目禁止事项（禁用库、禁用字段名、物理删除等）无一触犯 | major | all |
| CONV-04 | CONV | 契约测试方案覆盖每个新增或变更接口与每个错误码分支 | critical | all |
| CONV-05 | CONV | 任务卡的完成判定包含编译、格式检查、测试命令，表结构与迁移单独成卡 | minor | all |
