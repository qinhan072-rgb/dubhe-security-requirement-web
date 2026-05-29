const state = {
  id: null,
  project: emptyProject(),
  conditions: emptyConditions(),
  cameraGroups: [],
  attachments: [],
  catalog: [],
  projects: []
};

const els = {
  conditionsForm: document.querySelector("#conditionsForm"),
  cameraGroupList: document.querySelector("#cameraGroupList"),
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
      state.cameraGroups = [newGroup({ open: false })];
      renderAll();
    }
  } else {
    state.cameraGroups = [newGroup({ open: false })];
    renderAll();
  }

  refreshProjectList();
}

function bindEvents() {
  els.conditionsForm.addEventListener("input", (event) => {
    const key = event.target.dataset.condition;
    if (!key) return;
    state.conditions[key] = event.target.value;
    updateCompletion();
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
    internetPolicy: "",
    aiPolicy: "",
    compliance: "",
    messageIntegration: "",
    systemIntegration: "",
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
    notes: "",
    features: [],
    open: false,
    ...seed
  };
}

function renderAll() {
  fillConditionsForm();
  renderGroups();
  renderAttachments();
  updateCompletion();
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
            <strong>${escapeHtml(group.name || `摄像头组 ${index + 1}`)}</strong>
            <span>${Number(group.cameraCount || 1)} 路摄像头 · 已选 ${featureCount} 项功能 · ${complete ? "已完成" : "待配置"}</span>
          </div>
        </div>
        <div class="group-actions">
          <span class="status-pill ${complete ? "ok" : ""}">${complete ? "已完成" : "待填写"}</span>
          <button class="small ghost" type="button" data-action="toggle-group" data-group-id="${group.id}">${expanded ? "收起" : "展开配置"}</button>
          <button class="small ghost" type="button" data-action="duplicate" data-group-id="${group.id}">复制</button>
          <button class="small danger" type="button" data-action="delete" data-group-id="${group.id}">删除</button>
        </div>
      </div>
      <div class="group-body">
        <div class="subheading first">
          <h3>摄像头信息</h3>
          <p>数量和接入方式用于后续确认部署与报价。</p>
        </div>
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
          <div>
            <h3>功能选择</h3>
            <p>同一组摄像头可同时选择多项识别功能。</p>
          </div>
          <button class="small ghost" type="button" data-action="add-all-recommended" data-group-id="${group.id}">添加全部推荐</button>
        </div>
        ${recommendationBlock(group, recommended)}
        <div class="feature-categories">
          ${state.catalog.map((category) => featureCategory(category, group, selected)).join("")}
        </div>
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
        <strong>推荐功能</strong>
        <span>填写组名或位置后，可出现可点击的推荐项；推荐项不会自动勾选。</span>
      </div>
    `;
  }
  return `
    <div class="recommend-box has-items">
      <strong>推荐功能</strong>
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
    <section class="feature-category">
      <header>
        <strong>${escapeHtml(category.name)}</strong>
        <span>${selectedCount ? `已选 ${selectedCount}` : "可多选"}</span>
      </header>
      <div class="feature-grid">
        ${category.items.map((item) => {
          const isSelected = selected.has(item.id);
          return `
            <label class="feature-option ${isSelected ? "selected" : ""}" title="${escapeAttr(item.description)}">
              <input type="checkbox" data-group-id="${group.id}" data-feature-id="${item.id}" ${isSelected ? "checked" : ""} />
              <span>${escapeHtml(item.name)}</span>
            </label>
          `;
        }).join("")}
      </div>
    </section>
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
  if (!group || !featureId) return;
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
  showToast(isGroupComplete(group) ? "本组已完成。" : "本组已收起，仍可继续补充。");
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
  state.project = {
    ...emptyProject(),
    projectName: deriveDraftName()
  };
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
  if (!silent) showToast("已保存到本地。");
  return response.project;
}

function deriveDraftName() {
  const firstNamedGroup = state.cameraGroups.find((group) => group.name?.trim());
  if (firstNamedGroup) return `${firstNamedGroup.name.trim()}需求`;
  return "智慧安防需求配置";
}

async function loadProject(id) {
  const response = await fetchJson(`/api/projects/${encodeURIComponent(id)}`);
  applyProject(response.project);
  renderAll();
  showToast("已载入草稿。");
}

function applyProject(project) {
  state.id = project.id;
  state.project = { ...emptyProject(), ...project.project };
  state.conditions = { ...emptyConditions(), ...project.conditions };
  state.cameraGroups = project.cameraGroups.length ? project.cameraGroups.map((group) => ({ ...newGroup(), ...group, open: false })) : [newGroup({ open: false })];
  state.attachments = project.attachments || [];
  renderAll();
}

function newProject() {
  state.id = null;
  state.project = emptyProject();
  state.conditions = emptyConditions();
  state.cameraGroups = [newGroup({ open: false })];
  state.attachments = [];
  localStorage.removeItem("dubhe:lastProjectId");
  window.history.replaceState({}, "", window.location.pathname);
  renderAll();
  showToast("已新建空白配置。");
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
  if (issues.length && !confirm(`仍有 ${issues.length} 项未完成，是否继续导出？`)) return;
  window.location.href = `/api/projects/${encodeURIComponent(state.id)}/export.${type}`;
}

function renderAttachments() {
  if (!state.attachments.length) {
    els.attachmentList.innerHTML = `<div class="empty-state compact"><p>暂无附件。</p></div>`;
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
      <strong>${escapeHtml(project.project_name || "智慧安防需求配置")}</strong>
      <span>${formatDate(project.updated_at)}</span>
    </button>
  `).join("");
  els.projectList.querySelectorAll("[data-project-id]").forEach((button) => {
    button.addEventListener("click", () => loadProject(button.dataset.projectId));
  });
}

function updateCompletion() {
  const checks = [
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
}

function validationIssues() {
  const issues = [];
  state.cameraGroups.forEach((group, index) => {
    if (!group.name) issues.push(`第 ${index + 1} 组名称`);
    if (!Number(group.cameraCount)) issues.push(`第 ${index + 1} 组摄像头数量`);
    if (!group.features.length) issues.push(`第 ${index + 1} 组功能选择`);
  });
  return issues;
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
