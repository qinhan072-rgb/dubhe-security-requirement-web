# Supabase + Vercel 上线准备

当前仓库已经保留两套运行方式：

- 本地调试：`node server.mjs`，使用本地 SQLite 和 `uploads/`。
- 线上部署：Vercel 静态页面 + Vercel API Function + Supabase Postgres/Storage。

## 1. Supabase

1. 新建 Supabase Project。
2. 打开 SQL Editor，执行 `supabase/schema.sql`。
3. 确认创建了三张表：
   - `projects`
   - `camera_groups`
   - `attachments`
4. 确认 Storage bucket：
   - `security-requirements`
   - private
   - 单文件 20MB

当前 RLS 已启用，但没有给 `anon` 开放策略。前端不会直接写 Supabase，所有读写走 Vercel API，并使用服务端环境变量里的 `SUPABASE_SERVICE_ROLE_KEY`。

## 2. Vercel

在 Vercel 项目中设置环境变量：

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_STORAGE_BUCKET
```

`SUPABASE_STORAGE_BUCKET` 默认是：

```text
security-requirements
```

然后把 GitHub 仓库导入 Vercel。Vercel 会使用：

- `public/` 作为静态页面
- `api/[...path].mjs` 作为线上 API

## 3. 上线后的接口

线上仍然使用和本地一致的接口：

```text
GET  /api/catalog
GET  /api/projects
GET  /api/projects/:id
POST /api/projects/save
POST /api/projects/:id/upload
DELETE /api/projects/:id/attachments/:attachmentId
GET  /api/projects/:id/export.csv
GET  /api/projects/:id/export.json
GET  /api/projects/:id/export.doc
```

## 4. 后续必须补的安全项

当前是“可真实上线的表单收集版本”，但还没有登录。正式广泛开放前建议补：

- 客户登录或一次性访问 token。
- 草稿列表按客户隔离。
- 附件下载权限校验。
- 操作日志。
- 数据留存和删除策略。
