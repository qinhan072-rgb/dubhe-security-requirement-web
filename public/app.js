const state = {
  id: null,
  project: emptyProject(),
  conditions: emptyConditions(),
  cameraGroups: [],
  attachments: [],
  catalog: [],
  projects: [],
  ui: {
    openSections: new Set(["project"])
  }
};

const els = {
  projectForm: document.querySelector("#projectForm"),
  conditionsForm: document.querySelector("#conditionsForm"),
  cameraGroupList: document.querySelector("#cameraGroupList"),
  addGroupBtn: document.querySelector("#addGroupBtn"),
  addGroupLargeBtn: document.querySelector("#addGroupLargeBtn"),
  saveBtn: document.querySelector("#saveBtn"),
  newProjectBtn: document.querySelector("#newProjectBtn"),
  progressBar: document.querySelector("#progressBar"),
  progressText: document.querySelector("#progressText"),
  completionList: document.querySelector("#completionList"),
  projectList: document.querySelector("#projectList"),
  fileInput: document.querySelector("#fileInput"),
  uploadBtn: document.querySelector("#uploadBtn"),
  attachmentList: document.querySelector("#attachmentList"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  exportJsonBtn: document.querySelector("#exportJsonBtn"),
  projectStatusText: document.querySelector("#projectStatusText"),
  conditionsStatusText: document.querySelector("#conditionsStatusText"),
  toast: document.querySelector("#toast")
};

init();

async function init() {
  const catalog = await fetchJson("/api/catalog");
  state.catalog = catalog.featureCatalog;
  bindEvents();

  const url = new URL(window.location.href);
  const projectId = url.searchParams.get("project") || localStorage.getItem("dubhe:lastProjectId");
  if (projectId) {
    try {
      await loadProject(projectId);
    } catch {
      localStorage.removeItem("dubhe:lastProjectId");
      window.history.replaceState({}, "", window.location.pathname);
      state.cameraGroups = [newGroup()];
      renderAll();
    }
  } else {
    state.cameraGroups = [newGroup({ open: false })];
    renderAll();
  }

  refreshProjectList();
}

function bindEvents() {
  els.projectForm.addEventListener("input", (event) => {
    const key = event.target.dataset.project;
    if (!key) return;
    state.project[key] = event.target.value;
    updateCompletion();
  });

  els.conditionsForm.addEventListener("input", (event) => {
    const key = event.target.dataset.condition;
    if (!key) return;
    state.conditions[key] = event.target.value;
    updateCompletion();
  });

  els.addGroupBtn.addEventListener("click", () => {
    addCameraGroup();
  });
  els.addGroupLargeBtn.addEventListener("click", () => addCameraGroup());

  els.cameraGroupList.addEventListener("input", (event) => {
    const groupId = event.target.dataset.groupId;
    const key = event.target.dataset.groupField;
    if (!groupId || !key) return;
    const group = findGroup(groupId);
    if (!group) return;
    group[key] = event.target.value;
    updateCompletion();
  });

  els.cameraGroupList.addEventListener("change", (event) => {
    const groupId = event.target.dataset.groupId;
    const field = event.target.dataset.groupField;
    if (groupId && field) {
      const group = findGroup(groupId);
      if (group) group[field] = event.target.value;
      renderGroups();
      updateCompletion();
      return;
    }

    const featureId = event.target.dataset.featureId;
    if (!groupId || !featureId) return;
    toggleFeature(groupId, featureId, event.target.checked);
    renderGroups();
    updateCompletion();
  });

  els.cameraGroupList.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl || !els.cameraGroupList.contains(actionEl)) return;
    const action = actionEl.dataset.action;
    const groupId = actionEl.dataset.groupId;
    if (action === "toggle-section") {
      toggleSection(event.target.dataset.section);
      return;
    }
    if (!action || !groupId) return;

    if (action === "toggle-group") toggleGroup(groupId);
    if (action === "collapse-group") collapseGroup(groupId);
    if (action === "duplicate") duplicateGroup(groupId);
    if (action === "delete") deleteGroup(groupId);
    if (action === "add-feature") addFeature(groupId, actionEl.dataset.featureId);
    if (action === "add-all-recommended") addAllRecommended(groupId);
    renderGroups();
    updateCompletion();
  });

  document.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) return;
    const action = actionTarget.dataset.action;
    if (action !== "toggle-section") return;
    toggleSection(actionTarget.dataset.section);
  });

  els.saveBtn.addEventListener("click", () => saveProject());
  els.newProjectBtn.addEventListener("click", newProject);
  els.uploadBtn.addEventListener("click", uploadFiles);
  els.exportCsvBtn.addEventListener("click", () => exportProject("csv"));
  els.exportJsonBtn.addEventListener("click", () => exportProject("json"));
}

function emptyProject() {
  return {
    company: "",
    projectName: "",
    industry: "",
    address: "",
    contactName: "",
    contactPhone: ""
  };
}

function emptyConditions() {
  return {
    siteCount: "",
    totalCameras: "",
    hasCameraList: "",
    internetPolicy: "",
    evidencePolicy: "",
    aiPolicy: "",
    compliance: "",
    messageIntegration: "",
    systemIntegration: "",
    priorityAreas: "",
    testStream: "",
    projectMode: "",
    paymentMode: "",
    budgetRange: "",
    extraNotes: ""
  };
}

function newGroup(seed = {}) {
  return {
    id: crypto.randomUUID(),
    name: "",
    cameraCount: 1,
    locationNote: "",
    vendor: "",
    resolution: "",
    accessMethod: "",
    existingPlatform: "",
    videoPlatformName: "",
    nightCondition: "",
    imageQuality: "",
    networkLocation: "",
    needsNewCamera: "",
    notes: "",
    features: [],
    open: false,
    ...seed
  };
}

function renderAll() {
  fillProjectForm();
  fillConditionsForm();
  renderSections();
  renderGroups();
  renderAttachments();
  updateCompletion();
}

function renderSections() {
  document.querySelectorAll("[data-section]").forEach((section) => {
    const name = section.dataset.section;
    const isOpen = state.ui.openSections.has(name);
    section.classList.toggle("is-open", isOpen);
  });
}

function fillProjectForm() {
  for (const input of els.projectForm.querySelectorAll("[data-project]")) {
    input.value = state.project[input.dataset.project] || "";
  }
}

function fillConditionsForm() {
  for (const input of els.conditionsForm.querySelectorAll("[data-condition]")) {
    input.value = state.conditions[input.dataset.condition] || "";
  }
}

function renderGroups() {
  if (!state.cameraGroups.length) {
    els.cameraGroupList.innerHTML = document.querySelector("#emptyGroupTemplate").innerHTML;
    return;
  }

  els.cameraGroupList.innerHTML = state.cameraGroups.map((group, index) => groupCard(group, index)).join("");
}

function groupCard(group, index) {
  const recommended = recommendFeatures(group);
  const featureCount = group.features.length;
  const selected = new Set(group.features);
  const complete = isGroupComplete(group);
  const expanded = Boolean(group.open);
  return `
    <article class="group-card ${complete ? "is-complete" : ""} ${expanded ? "is-open" : "is-collapsed"}">
      <div class="group-header" data-action="toggle-group" data-group-id="${group.id}">
        <div class="group-title">
          <span class="group-index">${index + 1}</span>
          <div>
            <strong>${escapeHtml(group.name || "未命名摄像头组")}</strong>
            <span>${Number(group.cameraCount || 1)} 路摄像头 · 已选 ${featureCount} 项功能 · ${complete ? "已完成" : "待填写"}</span>
          </div>
        </div>
        <div class="group-actions">
          <button class="small ghost" type="button" data-action="toggle-group" data-group-id="${group.id}">${expanded ? "收起" : "展开填写"}</button>
          <button class="small ghost" type="button" data-action="duplicate" data-group-id="${group.id}">复制</button>
          <button class="small danger" type="button" data-action="delete" data-group-id="${group.id}">删除</button>
        </div>
      </div>
      <div class="group-body">
        <div class="subheading"><h3>摄像头信息</h3></div>
        <div class="grid-form">
          ${field("组名", group, "name", "例如：仓库摄像头 / 门岗摄像头")}
          ${field("摄像头数量", group, "cameraCount", "1", "number")}
          ${field("位置备注", group, "locationNote", "例如：仓库A区、消防通道、园区东门")}
          ${selectField("厂商", group, "vendor", ["", "海康", "大华", "宇视", "华为", "其他", "不清楚"])}
          ${selectField("分辨率", group, "resolution", ["", "720P", "1080P", "2K", "4K", "混合", "不清楚"])}
          ${selectField("接入方式", group, "accessMethod", ["", "RTSP", "ONVIF", "GB28181", "厂商SDK", "平台API", "不清楚"])}
          ${textareaField("补充说明", group, "notes", "现场特殊情况、客户叫法、重点关注问题等", "span-2")}
        </div>

        <div class="subheading">
          <h3>功能选择</h3>
          <button class="small ghost" type="button" data-action="add-all-recommended" data-group-id="${group.id}">添加全部推荐</button>
        </div>
        ${recommendationBlock(group, recommended)}
        ${state.catalog.map((category) => featureCategory(category, group, selected)).join("")}
        <div class="group-done-row">
          <button class="primary" type="button" data-action="collapse-group" data-group-id="${group.id}">完成本组并收起</button>
        </div>
      </div>
    </article>
  `;
}

function field(label, group, key, placeholder, type = "text") {
  return `
    <label>${label}
      <input type="${type}" min="1" data-group-id="${group.id}" data-group-field="${key}" value="${escapeAttr(group[key] ?? "")}" placeholder="${escapeAttr(placeholder)}" />
    </label>
  `;
}

function textareaField(label, group, key, placeholder, className = "") {
  return `
    <label class="${className}">${label}
      <textarea data-group-id="${group.id}" data-group-field="${key}" placeholder="${escapeAttr(placeholder)}">${escapeHtml(group[key] || "")}</textarea>
    </label>
  `;
}

function selectField(label, group, key, options) {
  return `
    <label>${label}
      <select data-group-id="${group.id}" data-group-field="${key}">
        ${options.map((option) => `<option value="${escapeAttr(option)}" ${group[key] === option ? "selected" : ""}>${option || "请选择"}</option>`).join("")}
      </select>
    </label>
  `;
}

function recommendationBlock(group, recommended) {
  if (!recommended.length) {
    return `
      <div class="recommend-box">
        <strong>推荐项</strong>
        <span class="muted">填写组名或位置后会出现推荐；推荐项不会自动勾选。</span>
      </div>
    `;
  }
  return `
    <div class="recommend-box">
      <strong>根据组名和位置推荐，点击可添加</strong>
      <div class="recommend-list">
        ${recommended.map((item) => `
          <button class="chip recommended" type="button" data-action="add-feature" data-group-id="${group.id}" data-feature-id="${item.id}">
            ${escapeHtml(item.name)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function featureCategory(category, group, selected) {
  const selectedCount = category.items.filter((item) => selected.has(item.id)).length;
  return `
    <details class="feature-category" ${selectedCount ? "open" : ""}>
      <summary>
        <span>${escapeHtml(category.name)}</span>
        <small>${selectedCount ? `已选 ${selectedCount} 项` : "展开选择"}</small>
      </summary>
      <div class="feature-grid">
        ${category.items.map((item) => {
          const isSelected = selected.has(item.id);
          return `
            <label class="feature-option ${isSelected ? "selected" : ""}" title="${escapeAttr(item.description)}">
              <input type="checkbox" data-group-id="${group.id}" data-feature-id="${item.id}" ${isSelected ? "checked" : ""} />
              ${escapeHtml(item.name)}
            </label>
          `;
        }).join("")}
      </div>
    </details>
  `;
}

function recommendFeatures(group) {
  const text = normalize(`${group.name} ${group.locationNote} ${group.notes}`);
  if (!text.trim()) return [];
  const selected = new Set(group.features);
  const scored = [];
  for (const category of state.catalog) {
    for (const item of category.items) {
      if (selected.has(item.id)) continue;
      const score = (item.keywords || []).reduce((total, keyword) => total + (text.includes(normalize(keyword)) ? 1 : 0), 0);
      if (score > 0) scored.push({ ...item, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "zh-Hans-CN")).slice(0, 8);
}

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function findGroup(id) {
  return state.cameraGroups.find((group) => group.id === id);
}

function toggleFeature(groupId, featureId, checked) {
  const group = findGroup(groupId);
  if (!group) return;
  const next = new Set(group.features);
  if (checked) next.add(featureId);
  else next.delete(featureId);
  group.features = [...next];
}

function addFeature(groupId, featureId) {
  const group = findGroup(groupId);
  if (!group) return;
  if (!group.features.includes(featureId)) group.features.push(featureId);
}

function addAllRecommended(groupId) {
  const group = findGroup(groupId);
  if (!group) return;
  for (const item of recommendFeatures(group)) addFeature(groupId, item.id);
}

function addCameraGroup() {
  state.cameraGroups.forEach((group) => {
    group.open = false;
  });
  state.cameraGroups.push(newGroup({ open: true }));
  renderGroups();
  updateCompletion();
  requestAnimationFrame(() => {
    document.querySelector(".group-card.is-open")?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function isGroupComplete(group) {
  return Boolean(group.name && Number(group.cameraCount) > 0 && group.features.length > 0);
}

function toggleGroup(groupId) {
  const group = findGroup(groupId);
  if (!group) return;
  group.open = !group.open;
}

function collapseGroup(groupId) {
  const group = findGroup(groupId);
  if (!group) return;
  group.open = false;
  showToast(isGroupComplete(group) ? "本组已完成并收起。" : "已收起，本组还有内容可继续补充。");
}

function duplicateGroup(groupId) {
  const group = findGroup(groupId);
  if (!group) return;
  const copy = newGroup({
    ...structuredClone(group),
    id: crypto.randomUUID(),
    name: `${group.name || "摄像头组"} 副本`,
    open: true
  });
  state.cameraGroups.forEach((item) => {
    item.open = false;
  });
  const index = state.cameraGroups.findIndex((item) => item.id === groupId);
  state.cameraGroups.splice(index + 1, 0, copy);
}

function deleteGroup(groupId) {
  if (state.cameraGroups.length === 1) {
    showToast("至少保留一个摄像头组。");
    return;
  }
  state.cameraGroups = state.cameraGroups.filter((group) => group.id !== groupId);
}

async function saveProject(silent = false) {
  const response = await fetchJson("/api/projects/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: state.id,
      project: state.project,
      conditions: state.conditions,
      cameraGroups: state.cameraGroups
    })
  });
  applyProject(response.project);
  localStorage.setItem("dubhe:lastProjectId", state.id);
  const url = new URL(window.location.href);
  url.searchParams.set("project", state.id);
  window.history.replaceState({}, "", url);
  refreshProjectList();
  if (!silent) showToast("已保存到本地数据库。");
  return response.project;
}

async function loadProject(id) {
  const response = await fetchJson(`/api/projects/${encodeURIComponent(id)}`);
  applyProject(response.project);
  renderAll();
  showToast("已载入项目草稿。");
}

function applyProject(project) {
  state.id = project.id;
  state.project = { ...emptyProject(), ...project.project };
  state.conditions = { ...emptyConditions(), ...project.conditions };
  state.cameraGroups = project.cameraGroups.length ? project.cameraGroups.map((group) => ({ ...group, open: false })) : [newGroup({ open: false })];
  state.attachments = project.attachments || [];
  renderAll();
}

function newProject() {
  state.id = null;
  state.project = emptyProject();
  state.conditions = emptyConditions();
  state.ui.openSections = new Set(["project"]);
  state.cameraGroups = [newGroup({ open: false })];
  state.attachments = [];
  localStorage.removeItem("dubhe:lastProjectId");
  window.history.replaceState({}, "", window.location.pathname);
  renderAll();
  showToast("已创建空白项目。");
}

async function uploadFiles() {
  const files = [...els.fileInput.files];
  if (!files.length) {
    showToast("请先选择附件。");
    return;
  }
  await saveProject(true);

  const data = new FormData();
  files.forEach((file) => data.append("files", file));
  const response = await fetchJson(`/api/projects/${encodeURIComponent(state.id)}/upload`, {
    method: "POST",
    body: data
  });
  applyProject(response.project);
  els.fileInput.value = "";
  showToast("附件已上传。");
}

async function exportProject(type) {
  await saveProject(true);
  const issues = validationIssues();
  if (issues.length && !confirm(`还有 ${issues.length} 项建议补充，仍然导出吗？`)) return;
  window.location.href = `/api/projects/${encodeURIComponent(state.id)}/export.${type}`;
}

function renderAttachments() {
  if (!state.attachments.length) {
    els.attachmentList.innerHTML = `<div class="empty-state"><p>暂无附件。必要时可上传现场资料。</p></div>`;
    return;
  }
  els.attachmentList.innerHTML = state.attachments.map((file) => `
    <div class="attachment-item">
      <a href="${file.url}" target="_blank" rel="noreferrer">${escapeHtml(file.name)}</a>
      <span>${formatSize(file.size)}</span>
    </div>
  `).join("");
}

async function refreshProjectList() {
  const response = await fetchJson("/api/projects");
  state.projects = response.projects || [];
  if (!state.projects.length) {
    els.projectList.innerHTML = `<span class="muted">暂无本地草稿</span>`;
    return;
  }
  els.projectList.innerHTML = state.projects.map((project) => `
    <button class="project-item" type="button" data-project-id="${project.id}">
      <strong>${escapeHtml(project.project_name || project.company || "未命名项目")}</strong>
      <span>${escapeHtml(project.company || "")} · ${formatDate(project.updated_at)}</span>
    </button>
  `).join("");
  els.projectList.querySelectorAll("[data-project-id]").forEach((button) => {
    button.addEventListener("click", () => loadProject(button.dataset.projectId));
  });
}

function updateCompletion() {
  const checks = [
    ["项目基本信息", Boolean(state.project.company && state.project.contactPhone)],
    ["至少一个摄像头组", state.cameraGroups.length > 0],
    ["每组填写名称和数量", state.cameraGroups.every((group) => group.name && Number(group.cameraCount) > 0)],
    ["每组选择至少一项功能", state.cameraGroups.every((group) => group.features.length > 0)]
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const percent = Math.round((done / checks.length) * 100);
  els.progressBar.style.width = `${percent}%`;
  els.progressText.textContent = `${done}/${checks.length} 项已完成`;
  els.completionList.innerHTML = checks.map(([label, ok]) => `
    <li class="${ok ? "ok" : ""}"><span>${ok ? "✓" : "○"}</span>${label}</li>
  `).join("");
  els.projectStatusText.textContent = checks[0][1] ? "已填写" : "待填写";
  els.projectStatusText.classList.toggle("ok", checks[0][1]);
  const hasConditions = Object.values(state.conditions).some((value) => String(value || "").trim());
  els.conditionsStatusText.textContent = hasConditions ? "已填写" : "可选";
  els.conditionsStatusText.classList.toggle("ok", hasConditions);
  renderSections();
}

function validationIssues() {
  const issues = [];
  if (!state.project.company) issues.push("客户单位");
  if (!state.project.contactPhone) issues.push("联系方式");
  state.cameraGroups.forEach((group, index) => {
    if (!group.name) issues.push(`第${index + 1}组名称`);
    if (!Number(group.cameraCount)) issues.push(`第${index + 1}组摄像头数量`);
    if (!group.features.length) issues.push(`第${index + 1}组功能选择`);
  });
  return issues;
}

function toggleSection(section) {
  if (!section) return;
  if (state.ui.openSections.has(section)) state.ui.openSections.delete(section);
  else state.ui.openSections.add(section);
  renderSections();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `请求失败：${response.status}`);
  }
  return response.json();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function formatSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}
