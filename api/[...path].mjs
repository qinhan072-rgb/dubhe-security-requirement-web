import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { featureCatalog, featureMap, conditionLabels } from "../lib/catalog.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "security-requirements";
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "zip", "rar"
]);

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(url.pathname);

    if (req.method === "GET" && pathname === "/api/catalog") {
      return sendJson(res, 200, { featureCatalog });
    }

    ensureSupabaseEnv();

    if (req.method === "GET" && pathname === "/api/projects") {
      const projects = await supabaseRest("/projects?select=id,company,project_name,updated_at&order=updated_at.desc&limit=50");
      return sendJson(res, 200, { projects });
    }

    if (req.method === "POST" && pathname === "/api/projects/save") {
      const saved = await saveProject(await readJson(req));
      return sendJson(res, 200, { project: saved });
    }

    const downloadMatch = pathname.match(/^\/api\/projects\/([^/]+)\/attachments\/([^/]+)\/download$/);
    if (downloadMatch && req.method === "GET") {
      return downloadAttachment(res, downloadMatch[1], downloadMatch[2]);
    }

    const attachmentMatch = pathname.match(/^\/api\/projects\/([^/]+)\/attachments\/([^/]+)$/);
    if (attachmentMatch && req.method === "DELETE") {
      return deleteAttachment(res, attachmentMatch[1], attachmentMatch[2]);
    }

    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)(?:\/([^/]+))?$/);
    if (projectMatch) {
      const [, projectId, action] = projectMatch;
      if (req.method === "GET" && !action) {
        const project = await getProject(projectId);
        return project ? sendJson(res, 200, { project }) : sendJson(res, 404, { error: "需求不存在" });
      }
      if (req.method === "POST" && action === "upload") {
        return uploadFiles(req, res, projectId);
      }
      if (req.method === "GET" && (action === "export.csv" || action === "export.json" || action === "export.doc")) {
        const project = await getProject(projectId);
        if (!project) return sendJson(res, 404, { error: "需求不存在" });
        const type = action.endsWith("json") ? "json" : action.endsWith("doc") ? "doc" : "csv";
        return serveExport(res, project, type);
      }
    }

    return sendJson(res, 404, { error: "未找到接口" });
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, { error: error.message || "服务器错误" });
  }
}

function ensureSupabaseEnv() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 环境变量");
  }
}

async function saveProject(payload) {
  const id = payload.id || randomUUID();
  const timestamp = new Date().toISOString();
  const project = payload.project || {};
  const groups = Array.isArray(payload.cameraGroups) ? payload.cameraGroups : [];
  const row = {
    id,
    company: clean(project.company),
    project_name: clean(project.projectName) || `${clean(project.company) || "客户"}智慧安防需求`,
    industry: clean(project.industry),
    address: clean(project.address),
    contact_name: clean(project.contactName),
    contact_phone: clean(project.contactPhone),
    contact_role: clean(project.contactRole),
    conditions: payload.conditions || {},
    updated_at: timestamp,
    created_at: timestamp
  };

  await supabaseRest("/projects?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: [row]
  });

  await supabaseRest(`/camera_groups?project_id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  if (groups.length) {
    await supabaseRest("/camera_groups", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: groups.map((group, index) => ({
        id: group.id || randomUUID(),
        project_id: id,
        sort_order: index,
        name: clean(group.name),
        camera_count: Number(group.cameraCount || 1),
        location_note: clean(group.locationNote),
        vendor: clean(group.vendor),
        resolution: clean(group.resolution),
        access_method: clean(group.accessMethod),
        notes: clean(group.notes),
        features: Array.isArray(group.features) ? group.features : [],
        updated_at: timestamp,
        created_at: timestamp
      }))
    });
  }

  return getProject(id);
}

async function getProject(id) {
  const [project] = await supabaseRest(`/projects?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  if (!project) return null;
  const [groups, attachments] = await Promise.all([
    supabaseRest(`/camera_groups?select=*&project_id=eq.${encodeURIComponent(id)}&order=sort_order.asc`),
    supabaseRest(`/attachments?select=*&project_id=eq.${encodeURIComponent(id)}&order=created_at.desc`)
  ]);
  return projectFromRows(project, groups, attachments);
}

function projectFromRows(project, groups, attachments) {
  return {
    id: project.id,
    project: {
      company: project.company || "",
      projectName: project.project_name || "",
      industry: project.industry || "",
      address: project.address || "",
      contactName: project.contact_name || "",
      contactPhone: project.contact_phone || "",
      contactRole: project.contact_role || ""
    },
    conditions: project.conditions || {},
    cameraGroups: groups.map((group) => ({
      id: group.id,
      name: group.name || "",
      cameraCount: group.camera_count || 1,
      locationNote: group.location_note || "",
      vendor: group.vendor || "",
      resolution: group.resolution || "",
      accessMethod: group.access_method || "",
      notes: group.notes || "",
      features: Array.isArray(group.features) ? group.features : [],
      open: false
    })),
    attachments: attachments.map((file) => ({
      id: file.id,
      name: file.original_name,
      storedName: file.stored_name,
      mimeType: file.mime_type,
      size: file.size,
      createdAt: file.created_at,
      url: `/api/projects/${encodeURIComponent(project.id)}/attachments/${encodeURIComponent(file.id)}/download`
    })),
    createdAt: project.created_at,
    updatedAt: project.updated_at
  };
}

async function uploadFiles(req, res, projectId) {
  const project = await getProject(projectId);
  if (!project) return sendJson(res, 404, { error: "需求不存在" });

  const request = new Request(`https://localhost${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: "half"
  });
  const formData = await request.formData();
  const files = formData.getAll("files").filter((file) => file && file.name && file.size > 0);
  for (const file of files) {
    const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) return sendJson(res, 400, { error: `不支持的附件类型：${file.name}` });
    if (file.size > MAX_UPLOAD_SIZE) return sendJson(res, 400, { error: `附件超过 20MB：${file.name}` });
  }

  const uploaded = [];
  for (const file of files) {
    const id = randomUUID();
    const storedName = `${Date.now()}-${id}-${safeFileName(file.name)}`;
    const storagePath = `${projectId}/${storedName}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    await storageRequest(`/object/${STORAGE_BUCKET}/${encodeStoragePath(storagePath)}`, {
      method: "POST",
      headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" },
      rawBody: buffer
    });
    await supabaseRest("/attachments", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: [{
        id,
        project_id: projectId,
        original_name: file.name,
        stored_name: storedName,
        storage_path: storagePath,
        mime_type: file.type || "",
        size: file.size,
        created_at: new Date().toISOString()
      }]
    });
    uploaded.push({ id, name: file.name, size: file.size });
  }

  return sendJson(res, 200, { uploaded, project: await getProject(projectId) });
}

async function deleteAttachment(res, projectId, attachmentId) {
  const [attachment] = await supabaseRest(`/attachments?select=*&id=eq.${encodeURIComponent(attachmentId)}&project_id=eq.${encodeURIComponent(projectId)}&limit=1`);
  if (!attachment) return sendJson(res, 404, { error: "附件不存在" });
  await supabaseRest(`/attachments?id=eq.${encodeURIComponent(attachmentId)}&project_id=eq.${encodeURIComponent(projectId)}`, { method: "DELETE" });
  await storageRequest(`/object/${STORAGE_BUCKET}/${encodeStoragePath(attachment.storage_path)}`, { method: "DELETE", ignoreNotFound: true });
  return sendJson(res, 200, { project: await getProject(projectId) });
}

async function downloadAttachment(res, projectId, attachmentId) {
  const [attachment] = await supabaseRest(`/attachments?select=*&id=eq.${encodeURIComponent(attachmentId)}&project_id=eq.${encodeURIComponent(projectId)}&limit=1`);
  if (!attachment) return sendJson(res, 404, { error: "附件不存在" });
  const response = await storageRequest(`/object/${STORAGE_BUCKET}/${encodeStoragePath(attachment.storage_path)}`, { method: "GET", returnResponse: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  res.writeHead(200, {
    "Content-Type": attachment.mime_type || "application/octet-stream",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`
  });
  res.end(buffer);
}

async function supabaseRest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) throw new Error(await response.text());
  if (response.status === 204) return [];
  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function storageRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      ...(options.headers || {})
    },
    body: options.rawBody
  });
  if (!response.ok && !(options.ignoreNotFound && response.status === 404)) {
    throw new Error(await response.text());
  }
  return options.returnResponse ? response : null;
}

function serveExport(res, project, type) {
  if (type === "json") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="security-requirement-${project.id}.json"`
    });
    res.end(JSON.stringify(project, null, 2));
    return;
  }
  if (type === "doc") {
    res.writeHead(200, {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="security-requirement-summary-${project.id}.doc"`
    });
    res.end(`\ufeff${buildCustomerDoc(project)}`);
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="security-requirement-${project.id}.csv"`
  });
  res.end(buildCsv(project));
}

function buildCsv(project) {
  const lines = [];
  const add = (row) => lines.push(row.map(csvEscape).join(","));
  add(["智慧安防需求导出"]);
  add([]);
  add(["公司基础信息", "内容"]);
  add(["公司名称", project.project?.company || ""]);
  add(["单位性质", project.project?.industry || ""]);
  add(["联系人", project.project?.contactName || ""]);
  add(["联系方式", project.project?.contactPhone || ""]);
  add(["所在城市/区域", project.project?.address || ""]);
  add(["联系角色", project.project?.contactRole || ""]);
  add([]);
  add(["整体约束", "内容"]);
  Object.entries(project.conditions || {}).forEach(([key, value]) => add([conditionLabels[key] || key, value]));
  add([]);
  add(["摄像头组", "摄像头数量", "位置备注", "厂商", "分辨率", "接入方式", "补充说明", "功能类别", "功能"]);
  project.cameraGroups.forEach((group) => {
    const selected = group.features.length ? group.features : [""];
    selected.forEach((featureId) => {
      const featureInfo = featureMap.get(featureId);
      add([group.name, group.cameraCount, group.locationNote, group.vendor, group.resolution, group.accessMethod, group.notes, featureInfo?.category || "", featureInfo?.name || featureId]);
    });
  });
  return `\ufeff${lines.join("\r\n")}`;
}

function buildCustomerDoc(project) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>智慧安防需求确认单</title>
  <style>body{font-family:"Microsoft YaHei",Arial,sans-serif;color:#07182b;line-height:1.55}table{width:100%;border-collapse:collapse;margin:10px 0 18px}th,td{border:1px solid #d9e3ea;padding:8px 10px;vertical-align:top}th{background:#f2f6fa;text-align:left}.muted{color:#5f6f83}</style></head><body>
  <h1>智慧安防需求确认单</h1>
  <h2>公司基础信息</h2>
  <table><tbody>
    <tr><th>公司名称</th><td>${htmlEscape(project.project?.company || "")}</td></tr>
    <tr><th>单位性质</th><td>${htmlEscape(project.project?.industry || "")}</td></tr>
    <tr><th>联系人</th><td>${htmlEscape(project.project?.contactName || "")}</td></tr>
    <tr><th>联系方式</th><td>${htmlEscape(project.project?.contactPhone || "")}</td></tr>
    <tr><th>所在城市/区域</th><td>${htmlEscape(project.project?.address || "")}</td></tr>
    <tr><th>联系角色</th><td>${htmlEscape(project.project?.contactRole || "")}</td></tr>
  </tbody></table>
  <h2>摄像头组与识别功能</h2>
  <table><thead><tr><th>摄像头组</th><th>数量</th><th>位置备注</th><th>接入信息</th><th>识别功能</th><th>补充说明</th></tr></thead><tbody>
    ${project.cameraGroups.map((group) => `<tr><td>${htmlEscape(group.name || "")}</td><td>${htmlEscape(group.cameraCount || "")}</td><td>${htmlEscape(group.locationNote || "")}</td><td>${htmlEscape([group.vendor, group.resolution, group.accessMethod].filter(Boolean).join(" / "))}</td><td>${htmlEscape(featureNames(group.features || []).join("、") || "未选择")}</td><td>${htmlEscape(group.notes || "")}</td></tr>`).join("")}
  </tbody></table>
  </body></html>`;
}

function featureNames(featureIds) {
  return featureIds.map((featureId) => featureMap.get(featureId)?.name || featureId);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeFileName(name) {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || "attachment";
}

function encodeStoragePath(storagePath) {
  return storagePath.split("/").map(encodeURIComponent).join("/");
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}
