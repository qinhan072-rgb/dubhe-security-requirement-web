import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { createReadStream, existsSync, mkdirSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(DATA_DIR, "requirements.db");
const PORT = Number(process.env.PORT || 4173);

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    company TEXT,
    project_name TEXT,
    industry TEXT,
    address TEXT,
    contact_name TEXT,
    contact_phone TEXT,
    expected_launch TEXT,
    project_status TEXT,
    conditions_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS camera_groups (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    name TEXT,
    camera_count INTEGER,
    location_note TEXT,
    vendor TEXT,
    resolution TEXT,
    access_method TEXT,
    existing_platform TEXT,
    video_platform_name TEXT,
    night_condition TEXT,
    image_quality TEXT,
    network_location TEXT,
    needs_new_camera TEXT,
    notes TEXT,
    features_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

const yesNo = ["是", "否", "待确认"];

const featureCatalog = [
  {
    id: "person",
    name: "人员与行为",
    items: [
      feature("person-intrusion", "人员闯入/禁区进入", "人员进入不应进入的区域。", ["门岗", "围栏", "周界", "仓库", "危险", "禁区"]),
      feature("line-crossing", "越线检测", "识别人员或目标跨越指定边界。", ["围栏", "边界", "周界", "禁区"]),
      feature("crowd", "人员聚集", "识别局部区域人员聚集。", ["食堂", "门岗", "入口", "宿舍", "公共"]),
      feature("loitering", "长时间滞留/异常徘徊", "识别人员长时间停留或反复徘徊。", ["门岗", "周界", "后门", "入口", "围栏"]),
      feature("fall", "人员倒地/摔倒", "识别人员倒地、摔倒等异常姿态。", ["公共", "楼道", "高危", "偏僻"]),
      feature("conflict", "疑似冲突行为", "识别明显肢体冲突等异常行为。", ["门岗", "停车", "公共", "宿舍"]),
      feature("absence", "岗位无人/离岗", "识别值守点或关键岗位无人。", ["值守", "操作台", "监控", "岗位"]),
      feature("sleeping", "睡岗/趴睡", "识别值守人员趴睡、睡岗。", ["值守", "操作台", "岗位"])
    ]
  },
  {
    id: "ppe",
    name: "作业规范与防护",
    items: [
      feature("helmet", "未戴安全帽", "识别未佩戴安全帽。", ["车间", "施工", "检修", "生产", "设备"]),
      feature("vest", "未穿工服/反光背心", "识别未穿指定工服或反光背心。", ["车间", "施工", "装卸", "物流"]),
      feature("other-ppe", "其他防护用品未佩戴", "如口罩、护目镜、手套等，需结合现场样本确认。", ["焊接", "化工", "危险", "高危"]),
      feature("danger-zone", "危险区域靠近/闯入", "识别人员靠近或进入危险区域。", ["设备", "机器人", "危险", "禁入", "检修"]),
      feature("height-work", "登高/临边区域人员识别", "识别登高、临边、屋面等区域人员。", ["高空", "登高", "临边", "屋面", "脚手架"])
    ]
  },
  {
    id: "fire",
    name: "消防与烟火",
    items: [
      feature("smoking", "抽烟识别", "识别人员抽烟行为。", ["车间", "仓库", "休息", "危险品"]),
      feature("flame", "明火/火焰识别", "识别明显火焰或明火。", ["动火", "配电", "仓库", "危险品"]),
      feature("smoke", "烟雾/浓烟识别", "识别烟雾、浓烟等视觉现象。", ["仓库", "配电", "封闭", "通道"]),
      feature("fire-lane-block", "消防通道占用", "识别消防通道或消防车道被占用。", ["消防", "通道", "道路"]),
      feature("exit-block", "安全出口堵塞", "识别安全出口、疏散口被堵塞。", ["安全出口", "疏散", "楼梯"]),
      feature("fire-equipment-block", "消防设施遮挡", "识别消火栓、灭火器、消防箱周边遮挡。", ["消防设施", "消火栓", "灭火器"])
    ]
  },
  {
    id: "vehicle",
    name: "车辆与道路",
    items: [
      feature("plate", "车辆识别/车牌识别", "识别车辆和车牌。", ["门岗", "出入口", "停车", "物流门"]),
      feature("illegal-parking", "车辆违停", "识别车辆停在禁停区域。", ["道路", "门岗", "消防", "临停"]),
      feature("vehicle-stay", "车辆停留超时", "识别车辆在指定区域停留超时。", ["装卸", "门岗", "临停", "物流"]),
      feature("reverse-driving", "车辆逆行", "识别车辆逆向行驶。", ["道路", "单行", "坡道"]),
      feature("mixed-traffic", "人车混行", "识别人员与车辆在重点通道混行。", ["物流", "叉车", "主路", "装卸"]),
      feature("traffic-count", "车流统计", "统计车辆进出或车流量。", ["出入口", "道路", "停车"]),
      feature("bike-parking", "非机动车乱停", "识别电动车、自行车等乱停。", ["楼栋", "消防", "入口", "停车"])
    ]
  },
  {
    id: "logistics",
    name: "仓储与物流",
    items: [
      feature("cargo-block", "货物/托盘占道", "识别货物、托盘占用通道。", ["仓库", "货梯", "托盘", "通道"]),
      feature("cargo-overline", "货物堆放超线/堆放异常", "识别越线堆放或异常堆放。", ["仓库", "黄线", "消防线", "货架"]),
      feature("dock-occupied", "装卸区占用", "识别装卸口、月台被占用。", ["装卸", "月台", "物流"]),
      feature("forklift-block", "叉车/车辆占道或违停", "识别叉车或车辆占道、违停。", ["叉车", "仓库", "物流", "通道"]),
      feature("shelf-aisle-block", "货架通道堵塞", "识别货架区、拣货通道堵塞。", ["货架", "仓库", "拣货"]),
      feature("warehouse-restricted", "人员进入仓库禁区", "识别人员进入仓库限制区域。", ["仓库", "危险品", "禁区"])
    ]
  },
  {
    id: "perimeter",
    name: "周界与区域",
    items: [
      feature("perimeter-intrusion", "周界入侵/越线", "识别围栏、围墙、边界入侵。", ["周界", "围栏", "围墙", "后门"]),
      feature("climbing", "翻越/攀爬", "识别翻越围栏、攀爬墙体等行为。", ["围栏", "围墙", "周界"]),
      feature("night-intrusion", "夜间周界入侵", "识别夜间边界区域入侵。", ["夜间", "周界", "后门", "偏僻"]),
      feature("area-stay", "边界附近长时间滞留", "识别边界附近长时间停留。", ["门岗", "围栏", "周界"])
    ]
  },
  {
    id: "environment",
    name: "环境与秩序",
    items: [
      feature("trash", "垃圾/杂物堆放", "识别垃圾、杂物堆放。", ["公共", "仓库", "通道", "角落"]),
      feature("channel-block", "通道堵塞/物品占道", "识别通道、走廊、货梯口被占用。", ["通道", "货梯", "消防", "仓库"]),
      feature("water", "水浸/积水", "识别明显积水、水浸风险。", ["地下", "仓库", "机房"]),
      feature("custom", "其他自定义识别", "请描述希望识别的目标和判断标准。", ["其他", "自定义"])
    ]
  }
];

function feature(id, name, description, keywords) {
  return { id, name, description, keywords };
}

const featureMap = new Map(featureCatalog.flatMap((category) => category.items.map((item) => [item.id, { ...item, category: category.name }])));

const optionCatalog = {
  yesNo,
  vendors: ["海康", "大华", "宇视", "华为", "其他", "不清楚"],
  resolutions: ["720P", "1080P", "2K", "4K", "混合", "不清楚"],
  accessMethods: ["RTSP", "ONVIF", "GB28181", "厂商SDK", "平台API", "不清楚"],
  internetPolicies: ["可访问互联网", "仅内网", "需审批后访问外网", "完全离线", "待确认"],
  aiPolicies: ["可调用外部AI服务", "本地优先", "只能本地", "待确认"],
  dataPolicies: ["允许", "脱敏后允许", "不允许", "需审批", "待确认"],
  projectModes: ["试点验证", "一期建设", "全园区建设", "多园区建设", "分阶段建设", "待确认"],
  paymentModes: ["项目制", "按月服务", "项目+服务", "待确认"]
};

const conditionLabels = {
  internetPolicy: "系统网络环境",
  aiPolicy: "AI方式限制",
  compliance: "数据安全/保密要求",
  messageIntegration: "消息通知对接",
  systemIntegration: "业务系统对接",
  extraNotes: "其他说明"
};

const statements = {
  projectById: db.prepare("SELECT * FROM projects WHERE id = ?"),
  projectList: db.prepare("SELECT id, company, project_name, updated_at FROM projects ORDER BY updated_at DESC LIMIT 50"),
  groupsByProject: db.prepare("SELECT * FROM camera_groups WHERE project_id = ? ORDER BY sort_order ASC"),
  attachmentsByProject: db.prepare("SELECT * FROM attachments WHERE project_id = ? ORDER BY created_at DESC"),
  insertProject: db.prepare(`
    INSERT INTO projects (id, company, project_name, industry, address, contact_name, contact_phone, expected_launch, project_status, conditions_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  updateProject: db.prepare(`
    UPDATE projects
    SET company = ?, project_name = ?, industry = ?, address = ?, contact_name = ?, contact_phone = ?, expected_launch = ?, project_status = ?, conditions_json = ?, updated_at = ?
    WHERE id = ?
  `),
  deleteGroups: db.prepare("DELETE FROM camera_groups WHERE project_id = ?"),
  insertGroup: db.prepare(`
    INSERT INTO camera_groups (
      id, project_id, sort_order, name, camera_count, location_note, vendor, resolution, access_method,
      existing_platform, video_platform_name, night_condition, image_quality, network_location,
      needs_new_camera, notes, features_json, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertAttachment: db.prepare(`
    INSERT INTO attachments (id, project_id, original_name, stored_name, mime_type, size, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
};

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function projectFromRows(projectRow, groupRows, attachmentRows) {
  if (!projectRow) return null;
  return {
    id: projectRow.id,
    project: {
      company: projectRow.company || "",
      projectName: projectRow.project_name || "",
      industry: projectRow.industry || "",
      address: projectRow.address || "",
      contactName: projectRow.contact_name || "",
      contactPhone: projectRow.contact_phone || "",
      expectedLaunch: projectRow.expected_launch || "",
      projectStatus: projectRow.project_status || ""
    },
    conditions: parseJson(projectRow.conditions_json, {}),
    cameraGroups: groupRows.map((row) => ({
      id: row.id,
      name: row.name || "",
      cameraCount: row.camera_count || 1,
      locationNote: row.location_note || "",
      vendor: row.vendor || "",
      resolution: row.resolution || "",
      accessMethod: row.access_method || "",
      existingPlatform: row.existing_platform || "",
      videoPlatformName: row.video_platform_name || "",
      nightCondition: row.night_condition || "",
      imageQuality: row.image_quality || "",
      networkLocation: row.network_location || "",
      needsNewCamera: row.needs_new_camera || "",
      notes: row.notes || "",
      features: parseJson(row.features_json, [])
    })),
    attachments: attachmentRows.map((row) => ({
      id: row.id,
      name: row.original_name,
      storedName: row.stored_name,
      mimeType: row.mime_type,
      size: row.size,
      createdAt: row.created_at,
      url: `/uploads/${projectRow.id}/${encodeURIComponent(row.stored_name)}`
    })),
    createdAt: projectRow.created_at,
    updatedAt: projectRow.updated_at
  };
}

function getProject(id) {
  const row = statements.projectById.get(id);
  if (!row) return null;
  return projectFromRows(row, statements.groupsByProject.all(id), statements.attachmentsByProject.all(id));
}

function saveProject(payload) {
  const id = payload.id || randomUUID();
  const project = payload.project || {};
  const conditions = payload.conditions || {};
  const groups = Array.isArray(payload.cameraGroups) ? payload.cameraGroups : [];
  const timestamp = nowIso();
  const existing = statements.projectById.get(id);

  db.exec("BEGIN");
  try {
    if (existing) {
      statements.updateProject.run(
        clean(project.company),
        clean(project.projectName),
        clean(project.industry),
        clean(project.address),
        clean(project.contactName),
        clean(project.contactPhone),
        clean(project.expectedLaunch),
        clean(project.projectStatus),
        JSON.stringify(conditions),
        timestamp,
        id
      );
    } else {
      statements.insertProject.run(
        id,
        clean(project.company),
        clean(project.projectName),
        clean(project.industry),
        clean(project.address),
        clean(project.contactName),
        clean(project.contactPhone),
        clean(project.expectedLaunch),
        clean(project.projectStatus),
        JSON.stringify(conditions),
        timestamp,
        timestamp
      );
    }

    statements.deleteGroups.run(id);
    groups.forEach((group, index) => {
      statements.insertGroup.run(
        group.id || randomUUID(),
        id,
        index,
        clean(group.name),
        Number(group.cameraCount || 1),
        clean(group.locationNote),
        clean(group.vendor),
        clean(group.resolution),
        clean(group.accessMethod),
        clean(group.existingPlatform),
        clean(group.videoPlatformName),
        clean(group.nightCondition),
        clean(group.imageQuality),
        clean(group.networkLocation),
        clean(group.needsNewCamera),
        clean(group.notes),
        JSON.stringify(Array.isArray(group.features) ? group.features : []),
        timestamp,
        timestamp
      );
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return getProject(id);
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(body);
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function handleUpload(req, res, projectId) {
  const project = getProject(projectId);
  if (!project) return sendJson(res, 404, { error: "项目不存在" });

  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: Readable.toWeb(req),
    duplex: "half"
  });
  const formData = await request.formData();
  const files = formData.getAll("files").filter((file) => file && file.name && file.size > 0);
  const targetDir = path.join(UPLOAD_DIR, projectId);
  mkdirSync(targetDir, { recursive: true });

  const uploaded = [];
  for (const file of files) {
    const id = randomUUID();
    const storedName = `${Date.now()}-${id}-${safeFileName(file.name)}`;
    const targetPath = path.join(targetDir, storedName);
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(targetPath, buffer);
    statements.insertAttachment.run(id, projectId, file.name, storedName, file.type || "", file.size, nowIso());
    uploaded.push({ id, name: file.name, size: file.size });
  }

  sendJson(res, 200, { uploaded, project: getProject(projectId) });
}

function safeFileName(name) {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || "attachment";
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildCsv(project) {
  const lines = [];
  const add = (row) => lines.push(row.map(csvEscape).join(","));
  add(["DUBHE智慧安防需求导出"]);
  add([]);
  add(["项目字段", "内容"]);
  Object.entries({
    客户单位: project.project.company,
    项目名称: project.project.projectName,
    行业: project.project.industry,
    地址: project.project.address,
    联系人: project.project.contactName,
    联系方式: project.project.contactPhone
  }).forEach(([key, value]) => add([key, value]));

  add([]);
  add(["项目条件", "内容"]);
  Object.entries(project.conditions || {}).forEach(([key, value]) => {
    add([conditionLabels[key] || key, Array.isArray(value) ? value.join("；") : value]);
  });

  add([]);
  add(["摄像头组", "摄像头数量", "位置备注", "厂商", "分辨率", "接入方式", "补充说明", "功能类别", "功能"]);
  project.cameraGroups.forEach((group) => {
    const selected = group.features.length ? group.features : [""];
    selected.forEach((featureId) => {
      const featureInfo = featureMap.get(featureId);
      add([
        group.name,
        group.cameraCount,
        group.locationNote,
        group.vendor,
        group.resolution,
        group.accessMethod,
        group.notes,
        featureInfo?.category || "",
        featureInfo?.name || featureId
      ]);
    });
  });

  add([]);
  add(["附件", "大小", "上传时间"]);
  project.attachments.forEach((file) => add([file.name, file.size, file.createdAt]));
  return `\ufeff${lines.join("\r\n")}`;
}

function serveExport(res, project, type) {
  if (type === "json") {
    const body = JSON.stringify(project, null, 2);
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dubhe-requirement-${project.id}.json"`
    });
    res.end(body);
    return;
  }
  const body = buildCsv(project);
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="dubhe-requirement-${project.id}.csv"`
  });
  res.end(body);
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".svg": "image/svg+xml"
  }[ext] || "application/octet-stream";
}

function serveFile(res, filePath) {
  if (!existsSync(filePath)) {
    sendText(res, 404, "Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": contentType(filePath) });
  createReadStream(filePath).pipe(res);
}

function routeUploads(reqPath, res) {
  const parts = reqPath.split("/").filter(Boolean);
  const projectId = parts[1];
  const storedName = decodeURIComponent(parts.slice(2).join("/"));
  const filePath = path.normalize(path.join(UPLOAD_DIR, projectId || "", storedName || ""));
  if (!filePath.startsWith(UPLOAD_DIR)) return sendText(res, 403, "Forbidden");
  serveFile(res, filePath);
}

async function router(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  try {
    if (req.method === "GET" && pathname === "/api/catalog") {
      return sendJson(res, 200, { featureCatalog, options: optionCatalog });
    }

    if (req.method === "GET" && pathname === "/api/projects") {
      return sendJson(res, 200, { projects: statements.projectList.all() });
    }

    if (req.method === "POST" && pathname === "/api/projects/save") {
      const saved = saveProject(await readJson(req));
      return sendJson(res, 200, { project: saved });
    }

    const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)(?:\/([^/]+))?$/);
    if (projectMatch) {
      const [, projectId, action] = projectMatch;
      if (req.method === "GET" && !action) {
        const project = getProject(projectId);
        return project ? sendJson(res, 200, { project }) : sendJson(res, 404, { error: "项目不存在" });
      }
      if (req.method === "POST" && action === "upload") {
        return handleUpload(req, res, projectId);
      }
      if (req.method === "GET" && (action === "export.csv" || action === "export.json")) {
        const project = getProject(projectId);
        if (!project) return sendJson(res, 404, { error: "项目不存在" });
        return serveExport(res, project, action.endsWith("json") ? "json" : "csv");
      }
    }

    if (req.method === "GET" && pathname.startsWith("/uploads/")) {
      return routeUploads(pathname, res);
    }

    if (req.method === "GET") {
      const safePath = pathname === "/" ? "/index.html" : pathname;
      const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
      if (!filePath.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");
      return serveFile(res, filePath);
    }

    sendJson(res, 404, { error: "未找到接口" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: error.message || "服务器错误" });
  }
}

createServer(router).listen(PORT, () => {
  console.log(`DUBHE requirement app running at http://localhost:${PORT}`);
});
