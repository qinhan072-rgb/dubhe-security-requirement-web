# 智慧安防需求调研

一个用于客户按摄像头组配置智慧安防识别需求的本地 Web 原型。

## 功能

- 按摄像头组新增、复制、删除
- 进入页面默认收起摄像头组，避免一次展示过多待填内容
- 每个摄像头组填写数量、位置备注、厂商、分辨率、接入方式
- 按功能类别直接选择 AI 识别能力，不再逐类折叠
- 根据摄像头组名称和位置实时提示推荐功能，并显示命中原因，不自动勾选
- 填写项目级网络、AI、数据安全与系统对接约束
- 附件上传、预览、删除，限制类型和单文件 20MB
- 本地 SQLite 保存
- 顶部统一导出 CSV / JSON / 客户确认版 Word
- 内部成本/选型引擎：按摄像头组、分辨率和识别功能估算固定研发成本、硬件档位和预计 AI 调用量
- 欢迎页与公司基础信息填写
- 已准备 Supabase + Vercel 线上部署结构

## 运行

需要 Node.js 24 或更高版本。

```bash
node server.mjs
```

打开：

```text
http://localhost:4173
```

## 数据位置

- 数据库：`data/requirements.db`
- 上传附件：`uploads/`

这些本地数据默认不会提交到 Git。

## 成本与选型接口

当前版本已内置一版可调整的成本画像库：

- `resolution_profiles`：分辨率算力倍率
- `feature_cost_profiles`：算法功能的算力、研发/适配成本、月度运维成本、AI复核策略
- `hardware_profiles`：硬件档位、容量、买断成本和月付成本
- `sizing_runs`：每次选型计算结果快照

接口：

```text
GET  /api/sizing/catalog
GET  /api/projects/:id/sizing
POST /api/projects/:id/sizing
```

说明：

- token/API费用不并入固定报价，只估算预计 AI 事件量，后续可按用量或服务包计费。
- 研发/适配成本按唯一算法功能计一次。
- 硬件推荐同时考虑总算力单位和总摄像头路数，并预留 25% 安全余量。

## 说明

当前版本是本地原型，不包含登录、外网权限控制、HTTPS 和审计日志。正式给客户公网填写前，应增加客户身份登记/登录校验、附件访问权限、上传病毒扫描、操作日志和数据留存策略。

## 线上部署准备

已补充：

- `api/[...path].mjs`：Vercel API Function，线上读写 Supabase。
- `supabase/schema.sql`：Supabase Postgres 表和 Storage bucket。
- `vercel.json`：Vercel Function 配置。
- `.env.example`：线上环境变量示例。
- `docs/deploy-supabase-vercel.md`：部署步骤。

线上部署需要在 Vercel 设置：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```
