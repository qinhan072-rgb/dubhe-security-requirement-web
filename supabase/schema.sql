-- 智慧安防需求调研线上数据结构
-- 在 Supabase SQL Editor 中执行。Vercel API 使用 service_role 访问，前端不直接写表。

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id text primary key default gen_random_uuid()::text,
  company text,
  project_name text,
  industry text,
  address text,
  contact_name text,
  contact_phone text,
  contact_role text,
  conditions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.camera_groups (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references public.projects(id) on delete cascade,
  sort_order integer not null default 0,
  name text,
  camera_count integer not null default 1,
  location_note text,
  vendor text,
  resolution text,
  access_method text,
  notes text,
  features jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references public.projects(id) on delete cascade,
  original_name text not null,
  stored_name text not null,
  storage_path text not null,
  mime_type text,
  size bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists camera_groups_project_id_sort_idx
  on public.camera_groups(project_id, sort_order);

create index if not exists attachments_project_id_created_idx
  on public.attachments(project_id, created_at desc);

alter table public.projects enable row level security;
alter table public.camera_groups enable row level security;
alter table public.attachments enable row level security;

-- 不创建 anon 公开访问策略。
-- 线上由 Vercel API 使用 SUPABASE_SERVICE_ROLE_KEY 进行服务端读写。
-- 如未来加入登录，可按用户/组织维度补 RLS policy。

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'security-requirements',
  'security-requirements',
  false,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'text/plain',
    'application/zip',
    'application/x-rar-compressed',
    'application/vnd.rar'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
