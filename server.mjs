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
const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;
const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "zip", "rar"
]);

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

  CREATE TABLE IF NOT EXISTS resolution_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    compute_multiplier REAL NOT NULL,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS feature_cost_profiles (
    feature_id TEXT PRIMARY KEY,
    feature_name TEXT NOT NULL,
    category_name TEXT NOT NULL,
    algorithm_family TEXT NOT NULL,
    workload_level TEXT NOT NULL,
    base_compute_units_1080p REAL NOT NULL,
    one_time_dev_cost REAL NOT NULL DEFAULT 0,
    monthly_algorithm_ops_cost REAL NOT NULL DEFAULT 0,
    ai_review_policy TEXT NOT NULL DEFAULT 'none',
    ai_event_rate_per_camera_day REAL NOT NULL DEFAULT 0,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS hardware_profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capacity_units REAL NOT NULL,
    recommended_max_streams INTEGER NOT NULL,
    purchase_cost REAL NOT NULL,
    monthly_cost REAL NOT NULL,
    cpu TEXT,
    gpu TEXT,
    memory TEXT,
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS sizing_runs (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    input_snapshot_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
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

const resolutionDefaults = [
  ["720P", 0.55, "低分辨率，适合轻量检测或远景预筛"],
  ["1080P", 1, "默认基准分辨率"],
  ["2K", 1.8, "中高分辨率，细节识别压力明显增加"],
  ["4K", 3.2, "高分辨率，建议重点核算解码和GPU余量"],
  ["混合", 1.5, "多种分辨率混合时的保守估算"],
  ["不清楚", 1, "客户未确认时按1080P基准估算"]
];

const hardwareDefaults = [
  ["edge-mini", "轻量型AI一体机", 24, 16, 18000, 1100, "8核CPU", "入门级GPU/边缘AI卡", "32GB", "小门岗、小仓库、少量算法试点"],
  ["edge-standard", "标准型AI一体机", 70, 48, 42000, 2600, "16核CPU", "中端GPU", "64GB", "中型厂区或多场景并发"],
  ["edge-pro", "高性能AI服务器", 160, 120, 98000, 6200, "32核CPU", "高性能GPU", "128GB", "大厂区、算法较多或高分辨率接入"],
  ["cluster", "集群扩展方案", 9999, 9999, 0, 0, "按项目配置", "多GPU/多节点", "按项目配置", "超过单机容量时拆分节点，需单独设计"]
];

const featureCostOverrides = {
  "smoking": { workload: "heavy", base: 2.2, dev: 9000, monthly: 400, ai: "suggested", events: 0.12, family: "行为识别" },
  "flame": { workload: "heavy", base: 2.0, dev: 8000, monthly: 400, ai: "suggested", events: 0.08, family: "烟火识别" },
  "smoke": { workload: "heavy", base: 1.8, dev: 8000, monthly: 400, ai: "suggested", events: 0.08, family: "烟火识别" },
  "helmet": { workload: "medium", base: 1.15, dev: 5000, monthly: 250, ai: "optional", events: 0.18, family: "人员防护识别" },
  "vest": { workload: "medium", base: 1.1, dev: 5000, monthly: 250, ai: "optional", events: 0.18, family: "人员防护识别" },
  "other-ppe": { workload: "custom", base: 1.6, dev: 12000, monthly: 500, ai: "suggested", events: 0.12, family: "人员防护识别" },
  "danger-zone": { workload: "medium", base: 1.0, dev: 7000, monthly: 300, ai: "optional", events: 0.12, family: "区域规则识别" },
  "height-work": { workload: "medium", base: 1.2, dev: 9000, monthly: 350, ai: "suggested", events: 0.08, family: "区域规则识别" },
  "person-intrusion": { workload: "medium", base: 0.95, dev: 6000, monthly: 250, ai: "optional", events: 0.1, family: "区域规则识别" },
  "line-crossing": { workload: "light", base: 0.75, dev: 5000, monthly: 200, ai: "optional", events: 0.08, family: "区域规则识别" },
  "crowd": { workload: "medium", base: 1.2, dev: 8000, monthly: 300, ai: "optional", events: 0.08, family: "人员行为识别" },
  "loitering": { workload: "medium", base: 1.1, dev: 7000, monthly: 300, ai: "optional", events: 0.08, family: "人员行为识别" },
  "fall": { workload: "heavy", base: 1.8, dev: 12000, monthly: 450, ai: "suggested", events: 0.06, family: "人员姿态识别" },
  "conflict": { workload: "heavy", base: 1.9, dev: 15000, monthly: 500, ai: "suggested", events: 0.04, family: "人员行为识别" },
  "absence": { workload: "light", base: 0.65, dev: 5000, monthly: 180, ai: "none", events: 0, family: "状态识别" },
  "sleeping": { workload: "medium", base: 1.0, dev: 8000, monthly: 250, ai: "optional", events: 0.06, family: "人员姿态识别" },
  "fire-lane-block": { workload: "light", base: 0.7, dev: 4500, monthly: 180, ai: "optional", events: 0.05, family: "区域占用识别" },
  "exit-block": { workload: "light", base: 0.65, dev: 4500, monthly: 180, ai: "optional", events: 0.05, family: "区域占用识别" },
  "fire-equipment-block": { workload: "light", base: 0.6, dev: 4500, monthly: 180, ai: "optional", events: 0.04, family: "区域占用识别" },
  "plate": { workload: "medium", base: 1.0, dev: 6000, monthly: 250, ai: "none", events: 0, family: "车辆识别" },
  "illegal-parking": { workload: "medium", base: 0.95, dev: 6500, monthly: 260, ai: "optional", events: 0.12, family: "车辆秩序识别" },
  "vehicle-stay": { workload: "medium", base: 0.9, dev: 6500, monthly: 260, ai: "optional", events: 0.08, family: "车辆秩序识别" },
  "reverse-driving": { workload: "medium", base: 1.0, dev: 7000, monthly: 280, ai: "optional", events: 0.05, family: "车辆秩序识别" },
  "mixed-traffic": { workload: "heavy", base: 1.55, dev: 11000, monthly: 420, ai: "suggested", events: 0.1, family: "人车混行识别" },
  "traffic-count": { workload: "light", base: 0.7, dev: 5000, monthly: 180, ai: "none", events: 0, family: "统计识别" },
  "bike-parking": { workload: "medium", base: 0.9, dev: 6500, monthly: 260, ai: "optional", events: 0.08, family: "车辆秩序识别" },
  "cargo-block": { workload: "light", base: 0.65, dev: 4500, monthly: 180, ai: "optional", events: 0.08, family: "区域占用识别" },
  "cargo-overline": { workload: "medium", base: 0.85, dev: 6000, monthly: 220, ai: "optional", events: 0.08, family: "区域占用识别" },
  "dock-occupied": { workload: "light", base: 0.7, dev: 5000, monthly: 180, ai: "optional", events: 0.08, family: "区域占用识别" },
  "forklift-block": { workload: "medium", base: 1.0, dev: 7000, monthly: 260, ai: "optional", events: 0.08, family: "车辆秩序识别" },
  "shelf-aisle-block": { workload: "light", base: 0.65, dev: 5000, monthly: 180, ai: "optional", events: 0.08, family: "区域占用识别" },
  "warehouse-restricted": { workload: "medium", base: 0.95, dev: 6000, monthly: 250, ai: "optional", events: 0.08, family: "区域规则识别" },
  "perimeter-intrusion": { workload: "medium", base: 0.95, dev: 6000, monthly: 250, ai: "optional", events: 0.1, family: "周界识别" },
  "climbing": { workload: "heavy", base: 1.6, dev: 11000, monthly: 420, ai: "suggested", events: 0.05, family: "周界识别" },
  "night-intrusion": { workload: "medium", base: 1.2, dev: 8000, monthly: 320, ai: "suggested", events: 0.08, family: "周界识别" },
  "area-stay": { workload: "medium", base: 0.95, dev: 6500, monthly: 250, ai: "optional", events: 0.08, family: "周界识别" },
  "trash": { workload: "light", base: 0.6, dev: 4500, monthly: 160, ai: "optional", events: 0.08, family: "环境秩序识别" },
  "channel-block": { workload: "light", base: 0.65, dev: 4500, monthly: 180, ai: "optional", events: 0.08, family: "区域占用识别" },
  "water": { workload: "light", base: 0.7, dev: 5500, monthly: 180, ai: "optional", events: 0.05, family: "环境风险识别" },
  "custom": { workload: "custom", base: 2.5, dev: 20000, monthly: 800, ai: "required", events: 0.1, family: "自定义识别" }
};

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
  attachmentById: db.prepare("SELECT * FROM attachments WHERE id = ? AND project_id = ?"),
  resolutionProfiles: db.prepare("SELECT * FROM resolution_profiles ORDER BY compute_multiplier ASC"),
  featureCostProfiles: db.prepare("SELECT * FROM feature_cost_profiles ORDER BY category_name ASC, feature_name ASC"),
  featureCostById: db.prepare("SELECT * FROM feature_cost_profiles WHERE feature_id = ?"),
  hardwareProfiles: db.prepare("SELECT * FROM hardware_profiles ORDER BY capacity_units ASC"),
  insertResolutionProfile: db.prepare(`
    INSERT OR IGNORE INTO resolution_profiles (id, name, compute_multiplier, notes)
    VALUES (?, ?, ?, ?)
  `),
  insertFeatureCostProfile: db.prepare(`
    INSERT OR IGNORE INTO feature_cost_profiles (
      feature_id, feature_name, category_name, algorithm_family, workload_level,
      base_compute_units_1080p, one_time_dev_cost, monthly_algorithm_ops_cost,
      ai_review_policy, ai_event_rate_per_camera_day, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertHardwareProfile: db.prepare(`
    INSERT OR IGNORE INTO hardware_profiles (
      id, name, capacity_units, recommended_max_streams, purchase_cost, monthly_cost,
      cpu, gpu, memory, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertSizingRun: db.prepare(`
    INSERT INTO sizing_runs (id, project_id, input_snapshot_json, result_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `),
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
  `),
  deleteAttachment: db.prepare("DELETE FROM attachments WHERE id = ? AND project_id = ?")
};

seedSizingCatalog();

function nowIso() {
  return new Date().toISOString();
}

function seedSizingCatalog() {
  db.exec("BEGIN");
  try {
    resolutionDefaults.forEach(([name, multiplier, notes]) => {
      statements.insertResolutionProfile.run(slug(name), name, multiplier, notes);
    });

    featureCatalog.forEach((category) => {
      category.items.forEach((item) => {
        const profile = defaultFeatureCostProfile(category.name, item);
        statements.insertFeatureCostProfile.run(
          item.id,
          item.name,
          category.name,
          profile.family,
          profile.workload,
          profile.base,
          profile.dev,
          profile.monthly,
          profile.ai,
          profile.events,
          profile.notes
        );
      });
    });

    hardwareDefaults.forEach(([id, name, capacityUnits, maxStreams, purchaseCost, monthlyCost, cpu, gpu, memory, notes]) => {
      statements.insertHardwareProfile.run(id, name, capacityUnits, maxStreams, purchaseCost, monthlyCost, cpu, gpu, memory, notes);
    });

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function defaultFeatureCostProfile(categoryName, item) {
  const override = featureCostOverrides[item.id];
  if (override) return { ...override, notes: "默认估算，可按项目经验调整" };
  return {
    family: categoryName,
    workload: "medium",
    base: 1,
    dev: 7000,
    monthly: 250,
    ai: "optional",
    events: 0.08,
    notes: "通用默认估算，建议根据样本和算法实测校准"
  };
}

function slug(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-");
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

function getSizingCatalog() {
  return {
    resolutions: statements.resolutionProfiles.all(),
    featureCostProfiles: statements.featureCostProfiles.all(),
    hardwareProfiles: statements.hardwareProfiles.all(),
    tokenPolicy: "大模型API/token费用不计入固定成本，按实际调用量或服务包单独计费"
  };
}

function calculateSizing(project, { saveRun = false } = {}) {
  const catalog = getSizingCatalog();
  const resolutionByName = new Map(catalog.resolutions.map((profile) => [profile.name, profile]));
  const featureProfileById = new Map(catalog.featureCostProfiles.map((profile) => [profile.feature_id, profile]));
  const hardwareProfiles = catalog.hardwareProfiles;
  const warnings = [];
  const uniqueFeatures = new Map();
  const groupItems = [];

  let totalCameraCount = 0;
  let totalComputeUnits = 0;
  let estimatedAiEventsPerDay = 0;

  project.cameraGroups.forEach((group, groupIndex) => {
    const cameraCount = Number(group.cameraCount || 1);
    totalCameraCount += cameraCount;
    const resolutionName = group.resolution || "1080P";
    const resolution = resolutionByName.get(resolutionName) || resolutionByName.get("不清楚") || { name: resolutionName, compute_multiplier: 1 };
    if (!group.resolution) warnings.push(`第 ${groupIndex + 1} 组未填写分辨率，暂按1080P估算`);
    if (!resolutionByName.has(resolutionName)) warnings.push(`第 ${groupIndex + 1} 组分辨率“${resolutionName}”未在画像库中，暂按1倍估算`);
    if (!group.features.length) warnings.push(`第 ${groupIndex + 1} 组未选择算法功能，硬件估算可能偏低`);

    const featureItems = group.features.map((featureId) => {
      const featureInfo = featureMap.get(featureId);
      const featureProfile = featureProfileById.get(featureId) || defaultRuntimeFeatureProfile(featureId, featureInfo);
      const computeUnits = round2(cameraCount * resolution.compute_multiplier * featureProfile.base_compute_units_1080p);
      totalComputeUnits += computeUnits;

      if (!uniqueFeatures.has(featureId)) uniqueFeatures.set(featureId, featureProfile);
      if (featureProfile.ai_review_policy === "suggested" || featureProfile.ai_review_policy === "required") {
        estimatedAiEventsPerDay += cameraCount * featureProfile.ai_event_rate_per_camera_day;
      }

      return {
        featureId,
        featureName: featureInfo?.name || featureProfile.feature_name || featureId,
        categoryName: featureInfo?.category || featureProfile.category_name || "",
        workloadLevel: featureProfile.workload_level,
        algorithmFamily: featureProfile.algorithm_family,
        baseComputeUnits1080p: featureProfile.base_compute_units_1080p,
        computeUnits,
        aiReviewPolicy: featureProfile.ai_review_policy,
        estimatedAiEventsPerDay: round2(cameraCount * featureProfile.ai_event_rate_per_camera_day)
      };
    });

    groupItems.push({
      groupId: group.id,
      groupName: group.name || `摄像头组 ${groupIndex + 1}`,
      cameraCount,
      resolution: resolution.name,
      resolutionMultiplier: resolution.compute_multiplier,
      groupComputeUnits: round2(featureItems.reduce((sum, item) => sum + item.computeUnits, 0)),
      features: featureItems
    });
  });

  const oneTimeDevCost = [...uniqueFeatures.values()].reduce((sum, profile) => sum + Number(profile.one_time_dev_cost || 0), 0);
  const monthlyAlgorithmOpsCost = [...uniqueFeatures.values()].reduce((sum, profile) => sum + Number(profile.monthly_algorithm_ops_cost || 0), 0);
  const requiredCapacity = round2(totalComputeUnits * 1.25);
  let recommendedHardware = hardwareProfiles.find((hardware) => Number(hardware.capacity_units) >= requiredCapacity && Number(hardware.recommended_max_streams) >= totalCameraCount) || hardwareProfiles[hardwareProfiles.length - 1];
  if (recommendedHardware?.id === "cluster") {
    const nodeProfile = [...hardwareProfiles].reverse().find((hardware) => hardware.id !== "cluster") || recommendedHardware;
    const estimatedNodeCount = Math.max(1, Math.ceil(requiredCapacity / Number(nodeProfile.capacity_units || 1)));
    recommendedHardware = {
      ...recommendedHardware,
      nodeProfileId: nodeProfile.id,
      nodeProfileName: nodeProfile.name,
      estimatedNodeCount,
      purchase_cost: estimatedNodeCount * Number(nodeProfile.purchase_cost || 0),
      monthly_cost: estimatedNodeCount * Number(nodeProfile.monthly_cost || 0),
      notes: `超过单机容量，按 ${estimatedNodeCount} 台“${nodeProfile.name}”估算，最终以现场部署拓扑为准`
    };
    warnings.push("当前需求超过单台标准硬件画像，已按多节点集群估算硬件成本");
  }

  const result = {
    id: randomUUID(),
    projectId: project.id,
    calculatedAt: nowIso(),
    assumptions: {
      safetyFactor: 1.25,
      tokenCostPolicy: "大模型API/token费用按实际调用量或服务包单独计费，不纳入固定硬件与研发成本",
      devCostPolicy: "研发/适配成本按唯一算法功能计一次，后续可按客户定制规则调整",
      hardwareCostPolicy: "硬件同时给出买断成本和月付成本，推荐档位需满足总算力与总路数"
    },
    totals: {
      cameraGroups: project.cameraGroups.length,
      cameraCount: totalCameraCount,
      selectedFeatureCount: project.cameraGroups.reduce((sum, group) => sum + group.features.length, 0),
      uniqueFeatureCount: uniqueFeatures.size,
      computeUnits: round2(totalComputeUnits),
      requiredCapacityUnits: requiredCapacity,
      estimatedAiEventsPerDay: round2(estimatedAiEventsPerDay),
      estimatedAiEventsPerMonth: round2(estimatedAiEventsPerDay * 30)
    },
    hardware: {
      recommended: recommendedHardware,
      alternatives: hardwareProfiles.map((hardware) => ({
        ...hardware,
        fitsCapacity: Number(hardware.capacity_units) >= requiredCapacity,
        fitsStreams: Number(hardware.recommended_max_streams) >= totalCameraCount
      }))
    },
    fixedCosts: {
      oneTimeDevCost: roundMoney(oneTimeDevCost),
      monthlyAlgorithmOpsCost: roundMoney(monthlyAlgorithmOpsCost),
      hardwarePurchaseCost: roundMoney(recommendedHardware?.purchase_cost || 0),
      hardwareMonthlyCost: roundMoney(recommendedHardware?.monthly_cost || 0),
      fixedOneTimeCostIfPurchase: roundMoney(oneTimeDevCost + Number(recommendedHardware?.purchase_cost || 0)),
      fixedMonthlyCostIfRental: roundMoney(monthlyAlgorithmOpsCost + Number(recommendedHardware?.monthly_cost || 0))
    },
    groupItems,
    uniqueFeatureCosts: [...uniqueFeatures.values()].map((profile) => ({
      featureId: profile.feature_id,
      featureName: profile.feature_name,
      categoryName: profile.category_name,
      workloadLevel: profile.workload_level,
      oneTimeDevCost: profile.one_time_dev_cost,
      monthlyAlgorithmOpsCost: profile.monthly_algorithm_ops_cost,
      aiReviewPolicy: profile.ai_review_policy
    })),
    warnings
  };

  if (saveRun) {
    statements.insertSizingRun.run(result.id, project.id, JSON.stringify(project), JSON.stringify(result), result.calculatedAt);
  }

  return result;
}

function defaultRuntimeFeatureProfile(featureId, featureInfo) {
  const fallback = defaultFeatureCostProfile(featureInfo?.category || "未分类", {
    id: featureId,
    name: featureInfo?.name || featureId
  });
  return {
    feature_id: featureId,
    feature_name: featureInfo?.name || featureId,
    category_name: featureInfo?.category || "未分类",
    algorithm_family: fallback.family,
    workload_level: fallback.workload,
    base_compute_units_1080p: fallback.base,
    one_time_dev_cost: fallback.dev,
    monthly_algorithm_ops_cost: fallback.monthly,
    ai_review_policy: fallback.ai,
    ai_event_rate_per_camera_day: fallback.events
  };
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function roundMoney(value) {
  return Math.round(Number(value || 0));
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
  for (const file of files) {
    const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext)) return sendJson(res, 400, { error: `不支持的附件类型：${file.name}` });
    if (file.size > MAX_UPLOAD_SIZE) return sendJson(res, 400, { error: `附件超过 20MB：${file.name}` });
  }
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

async function handleDeleteAttachment(res, projectId, attachmentId) {
  const project = getProject(projectId);
  if (!project) return sendJson(res, 404, { error: "项目不存在" });

  const attachment = statements.attachmentById.get(attachmentId, projectId);
  if (!attachment) return sendJson(res, 404, { error: "附件不存在" });

  statements.deleteAttachment.run(attachmentId, projectId);
  const filePath = path.join(UPLOAD_DIR, projectId, attachment.stored_name);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  return sendJson(res, 200, { project: getProject(projectId) });
}

function safeFileName(name) {
  return name.replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || "attachment";
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

function buildCsv(project) {
  const lines = [];
  const add = (row) => lines.push(row.map(csvEscape).join(","));
  add(["DUBHE智慧安防需求导出"]);
  add([]);
  add(["导出信息", "内容"]);
  add(["配置名称", project.project?.projectName || "智慧安防需求配置"]);
  add(["导出时间", new Date().toLocaleString("zh-CN", { hour12: false })]);

  add([]);
  add(["整体约束", "内容"]);
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

function featureNames(featureIds) {
  return featureIds.map((featureId) => featureMap.get(featureId)?.name || featureId);
}

function buildCustomerDoc(project) {
  const conditions = Object.entries(project.conditions || {}).filter(([, value]) => String(value || "").trim());
  const unresolved = [];
  project.cameraGroups.forEach((group, index) => {
    if (!group.name) unresolved.push(`第 ${index + 1} 组未填写组名`);
    if (!Number(group.cameraCount)) unresolved.push(`第 ${index + 1} 组未填写摄像头数量`);
    if (!group.features.length) unresolved.push(`第 ${index + 1} 组未选择识别功能`);
  });
  const exportedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>DUBHE智慧安防需求确认单</title>
  <style>
    body { font-family: "Microsoft YaHei", Arial, sans-serif; color: #07182b; line-height: 1.55; }
    h1 { font-size: 26px; margin: 0 0 8px; }
    h2 { margin: 26px 0 10px; font-size: 18px; border-bottom: 1px solid #d9e3ea; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0 18px; }
    th, td { border: 1px solid #d9e3ea; padding: 8px 10px; vertical-align: top; }
    th { background: #f2f6fa; text-align: left; }
    .muted { color: #5f6f83; }
  </style>
</head>
<body>
  <h1>DUBHE智慧安防需求确认单</h1>
  <p class="muted">导出时间：${htmlEscape(exportedAt)}　配置名称：${htmlEscape(project.project?.projectName || "智慧安防需求配置")}</p>

  <h2>摄像头组与识别功能</h2>
  <table>
    <thead>
      <tr>
        <th>摄像头组</th>
        <th>数量</th>
        <th>位置备注</th>
        <th>接入信息</th>
        <th>识别功能</th>
        <th>补充说明</th>
      </tr>
    </thead>
    <tbody>
      ${project.cameraGroups.map((group) => `
        <tr>
          <td>${htmlEscape(group.name || "未填写")}</td>
          <td>${htmlEscape(group.cameraCount || "")}</td>
          <td>${htmlEscape(group.locationNote || "")}</td>
          <td>${htmlEscape([group.vendor, group.resolution, group.accessMethod].filter(Boolean).join(" / "))}</td>
          <td>${htmlEscape(featureNames(group.features || []).join("、") || "未选择")}</td>
          <td>${htmlEscape(group.notes || "")}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  <h2>整体约束</h2>
  <table>
    <tbody>
      ${conditions.length ? conditions.map(([key, value]) => `
        <tr><th>${htmlEscape(conditionLabels[key] || key)}</th><td>${htmlEscape(Array.isArray(value) ? value.join("；") : value)}</td></tr>
      `).join("") : `<tr><td class="muted">暂无填写。</td></tr>`}
    </tbody>
  </table>

  <h2>待确认问题</h2>
  ${unresolved.length ? `<ol>${unresolved.map((item) => `<li>${htmlEscape(item)}</li>`).join("")}</ol>` : `<p>当前未发现必填项缺失。</p>`}

  <h2>附件清单</h2>
  ${project.attachments.length ? `<ul>${project.attachments.map((file) => `<li>${htmlEscape(file.name)}（${htmlEscape(file.size)} bytes）</li>`).join("")}</ul>` : `<p class="muted">暂无附件。</p>`}
</body>
</html>`;
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
  if (type === "doc") {
    const body = `\ufeff${buildCustomerDoc(project)}`;
    res.writeHead(200, {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="dubhe-requirement-summary-${project.id}.doc"`
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
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".pdf": "application/pdf",
    ".csv": "text/csv; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip"
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

    if (req.method === "GET" && pathname === "/api/sizing/catalog") {
      return sendJson(res, 200, getSizingCatalog());
    }

    if (req.method === "GET" && pathname === "/api/projects") {
      return sendJson(res, 200, { projects: statements.projectList.all() });
    }

    if (req.method === "POST" && pathname === "/api/projects/save") {
      const saved = saveProject(await readJson(req));
      return sendJson(res, 200, { project: saved });
    }

    const attachmentMatch = pathname.match(/^\/api\/projects\/([^/]+)\/attachments\/([^/]+)$/);
    if (attachmentMatch && req.method === "DELETE") {
      const [, projectId, attachmentId] = attachmentMatch;
      return handleDeleteAttachment(res, projectId, attachmentId);
    }

    const sizingMatch = pathname.match(/^\/api\/projects\/([^/]+)\/sizing$/);
    if (sizingMatch && (req.method === "POST" || req.method === "GET")) {
      const project = getProject(sizingMatch[1]);
      if (!project) return sendJson(res, 404, { error: "项目不存在" });
      return sendJson(res, 200, { sizing: calculateSizing(project, { saveRun: req.method === "POST" }) });
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
      if (req.method === "GET" && (action === "export.csv" || action === "export.json" || action === "export.doc")) {
        const project = getProject(projectId);
        if (!project) return sendJson(res, 404, { error: "项目不存在" });
        const type = action.endsWith("json") ? "json" : action.endsWith("doc") ? "doc" : "csv";
        return serveExport(res, project, type);
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
