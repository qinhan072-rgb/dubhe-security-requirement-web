const LAST_PROJECT_KEY = "securityRequirement:lastProjectId";
const LANGUAGE_KEY = "securityRequirement:language";

const state = {
  id: null,
  language: localStorage.getItem(LANGUAGE_KEY) || "zh",
  dirty: false,
  saving: false,
  project: emptyProject(),
  conditions: emptyConditions(),
  cameraGroups: [],
  attachments: [],
  catalog: [],
  projects: []
};

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const AUTO_SAVE_DELAY_MS = 8000;
const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "zip", "rar"
]);
let autoSaveTimer;
let saveButtonResetTimer;

const I18N = {
  zh: {
    metaTitle: "智慧安防需求调研",
    langButton: "日本語",
    brandLabel: "需求调研",
    appTitle: "智慧安防需求调研",
    welcomeKicker: "智慧安防需求调研",
    welcomeTitle: "欢迎填写智慧安防需求调研",
    welcomeLead: "请按提示填写公司信息、摄像头组和识别需求。提交后，我们会据此确认接入方式、功能范围和部署方案。",
    startSurvey: "开始",
    newProject: "新建",
    export: "导出",
    exportCsv: "CSV 文件",
    exportJson: "JSON 文件",
    exportWord: "客户确认版 Word",
    save: "保存",
    saveDirty: "待保存",
    saving: "保存中",
    savedShort: "已保存",
    progressTitle: "填写进度",
    progressReady: "准备中",
    pathTitle: "填写路径",
    navCompany: "1. 公司信息",
    navCamera: "2. 摄像头组",
    navConditions: "3. 整体约束",
    navAttachments: "4. 上传附件",
    draftTitle: "已有草稿",
    companyTitle: "公司基础信息",
    companyDesc: "仅用于联系和识别客户类型，不填写项目建设周期、预算等商务信息。",
    companyName: "公司名称",
    companyNamePh: "例如：某某制造有限公司",
    industry: "单位性质",
    contactName: "联系人",
    contactNamePh: "姓名",
    contactPhone: "联系方式",
    contactPhonePh: "手机号 / 微信 / 邮箱",
    address: "所在城市/区域",
    addressPh: "例如：武汉市 / 某某园区",
    contactRole: "联系角色",
    contactRolePh: "例如：安全负责人 / 设备负责人 / 项目联系人",
    cameraTitle: "摄像头组与功能选择",
    cameraDesc: "摄像头型号及用途相同放在同一组，若有差异则新增另一组。",
    addAnotherGroup: "新增另一组摄像头",
    conditionsTitle: "整体约束",
    conditionsDesc: "以下信息影响 AI 接入、数据安全和系统对接；不确定时可选择待确认。",
    internetPolicy: "系统网络环境",
    aiPolicy: "AI方式限制",
    compliance: "数据安全/保密要求",
    compliancePh: "没有可写无；有要求请简述",
    messageIntegration: "消息通知对接",
    messageIntegrationPh: "企业微信 / 钉钉 / 飞书 / 短信 / 不需要",
    systemIntegration: "业务系统对接",
    systemIntegrationPh: "OA / 工单 / 安防平台 / 不需要",
    extraNotes: "其他说明",
    extraNotesPh: "标准菜单外的识别目标、特殊流程或补充说明",
    attachmentTitle: "上传附件",
    attachmentDesc: "可上传现场平面图、摄像头清单或其他资料。",
    uploadAttachment: "上传附件",
    attachmentNote: "支持图片、PDF、Office、CSV、TXT、压缩包，单个文件不超过 20MB。",
    emptyGroupTitle: "还没有摄像头组",
    emptyGroupDesc: "从下方新增第一组摄像头。",
    selectPlaceholder: "请选择",
    groupDefaultName: "摄像头组 {index}",
    unnamedGroup: "未命名摄像头组",
    cameraCountUnit: "{count} 路摄像头",
    featureCount: "已选 {count} 项功能",
    groupComplete: "已完成",
    groupPending: "待配置",
    pendingFill: "待填写",
    duplicateGroup: "复制本组",
    delete: "删除",
    clickOpen: "点击展开",
    clickClose: "点击收起",
    cameraInfo: "摄像头信息",
    cameraInfoDesc: "数量和接入方式用于后续确认部署与报价。",
    groupName: "组名",
    groupNamePh: "例如：仓库摄像头 / 门岗摄像头",
    cameraCount: "摄像头数量",
    locationNote: "位置备注",
    locationNotePh: "例如：仓库A区、消防通道、园区东门",
    vendor: "厂商",
    resolution: "分辨率",
    accessMethod: "接入方式",
    notes: "补充说明",
    notesPh: "现场特殊情况、客户叫法、重点关注问题等",
    featureSelection: "功能选择",
    featureSelectionDesc: "同一组摄像头可同时选择多项识别功能。",
    addCurrentRecommended: "添加当前推荐",
    recommendedFeatures: "推荐功能",
    noRecommendWithText: "暂无匹配推荐，可从下方功能列表手动选择。",
    noRecommendEmpty: "填写组名或位置后，可出现可点击的推荐项；推荐项不会自动勾选。",
    hit: "命中",
    multiSelect: "可多选",
    selectedCount: "已选 {count}",
    finishAndCollapse: "完成本组并收起",
    noDraft: "暂无本地草稿",
    preview: "预览",
    noAttachment: "暂无附件。",
    autoSaved: "已自动保存。",
    autoSaveFailed: "自动保存失败：{message}",
    addedRecommended: "已添加 {count} 项当前推荐。",
    noRecommendedToAdd: "当前没有可添加的推荐项。",
    groupDone: "本组已完成。",
    groupCollapsed: "本组已收起，仍可继续补充。",
    keepOneGroup: "至少保留一个摄像头组。",
    saved: "已保存到本地。",
    saveFailed: "保存失败：{message}",
    cloudDraftUnavailable: "暂时无法读取云端草稿。",
    vercelAuthRequired: "当前链接被 Vercel 访问保护拦截，API 需要登录。请关闭 Deployment Protection，或使用正式生产域名。",
    blankCreated: "已新建空白调研。",
    loadedDraft: "已载入草稿。",
    chooseAttachment: "请先选择附件。",
    uploaded: "附件已上传。",
    deletedAttachment: "附件已删除。",
    confirmDeleteAttachment: "确定删除这个附件吗？",
    unsupportedFile: "不支持的附件类型：{name}",
    fileTooLarge: "附件超过 20MB：{name}",
    exportIncompleteConfirm: "以下内容仍未完成：\n\n{issues}\n\n是否继续导出？",
    requestFailed: "请求失败：{status}",
    derivedRequirement: "智慧安防需求调研",
    defaultDraftName: "智慧安防需求调研",
    progressText: "{complete}/{total} 项完成",
    checkCompany: "公司基础信息",
    checkConditions: "整体约束",
    checkGroups: "当前 {count} 个摄像头组",
    checkCompleteGroups: "{complete}/{total} 组已完成",
    checkInfoGroups: "{complete}/{total} 组已填写名称和数量",
    checkFeatureGroups: "{complete}/{total} 组已选择功能",
    issueCompany: "公司名称",
    issueIndustry: "单位性质",
    issueContact: "联系方式",
    issueInternetPolicy: "系统网络环境",
    issueAiPolicy: "AI方式限制",
    issueGroupName: "第 {index} 组名称",
    issueGroupCount: "第 {index} 组摄像头数量",
    issueGroupFeature: "第 {index} 组功能选择"
  },
  ja: {
    metaTitle: "スマート保安ニーズ調査",
    langButton: "中文",
    brandLabel: "ニーズ調査",
    appTitle: "スマート保安ニーズ調査",
    welcomeKicker: "スマート保安ニーズ調査",
    welcomeTitle: "スマート保安ニーズ調査へようこそ",
    welcomeLead: "会社情報、カメラグループ、検知したい項目を順番に入力してください。送信後、接続方式、機能範囲、導入方法を確認します。",
    startSurvey: "開始",
    newProject: "新規",
    export: "出力",
    exportCsv: "CSV ファイル",
    exportJson: "JSON ファイル",
    exportWord: "確認用 Word",
    save: "保存",
    saveDirty: "未保存",
    saving: "保存中",
    savedShort: "保存済み",
    progressTitle: "入力進捗",
    progressReady: "準備中",
    pathTitle: "入力手順",
    navCompany: "1. 会社情報",
    navCamera: "2. カメラグループ",
    navConditions: "3. 全体条件",
    navAttachments: "4. 添付資料",
    draftTitle: "下書き",
    companyTitle: "会社基本情報",
    companyDesc: "連絡先と顧客種別の確認用です。導入時期や予算などの商談情報は入力不要です。",
    companyName: "会社名",
    companyNamePh: "例：○○製造株式会社",
    industry: "業種・施設種別",
    contactName: "担当者",
    contactNamePh: "氏名",
    contactPhone: "連絡先",
    contactPhonePh: "電話 / WeChat / メール",
    address: "都市・エリア",
    addressPh: "例：武漢市 / ○○園区",
    contactRole: "担当区分",
    contactRolePh: "例：安全責任者 / 設備責任者 / 窓口担当",
    cameraTitle: "カメラグループと機能選択",
    cameraDesc: "型番と用途が同じカメラは同じグループに入れ、違いがある場合は別グループを追加してください。",
    addAnotherGroup: "別のカメラグループを追加",
    conditionsTitle: "全体条件",
    conditionsDesc: "AI 接続、データ管理、システム連携に関わる情報です。不明な場合は「要確認」を選択してください。",
    internetPolicy: "ネットワーク環境",
    aiPolicy: "AI 利用条件",
    compliance: "データ管理・機密要件",
    compliancePh: "特になければ「なし」。要件があれば簡単に記入",
    messageIntegration: "通知先連携",
    messageIntegrationPh: "WeCom / DingTalk / Feishu / SMS / 不要",
    systemIntegration: "業務システム連携",
    systemIntegrationPh: "OA / チケット / 監視平台 / 不要",
    extraNotes: "その他",
    extraNotesPh: "標準メニュー以外の検知対象、特殊な流れ、補足事項",
    attachmentTitle: "添付資料",
    attachmentDesc: "平面図、カメラ一覧、その他資料をアップロードできます。",
    uploadAttachment: "添付資料をアップロード",
    attachmentNote: "画像、PDF、Office、CSV、TXT、圧縮ファイルに対応。1ファイル 20MB まで。",
    emptyGroupTitle: "カメラグループがありません",
    emptyGroupDesc: "下のボタンから最初のグループを追加してください。",
    selectPlaceholder: "選択してください",
    groupDefaultName: "カメラグループ {index}",
    unnamedGroup: "未命名カメラグループ",
    cameraCountUnit: "カメラ {count} 台",
    featureCount: "{count} 項目選択済み",
    groupComplete: "完了",
    groupPending: "未設定",
    pendingFill: "未入力",
    duplicateGroup: "このグループを複製",
    delete: "削除",
    clickOpen: "クリックして展開",
    clickClose: "クリックして閉じる",
    cameraInfo: "カメラ情報",
    cameraInfoDesc: "台数と接続方式は、導入構成と見積確認に使用します。",
    groupName: "グループ名",
    groupNamePh: "例：倉庫カメラ / 正門カメラ",
    cameraCount: "カメラ台数",
    locationNote: "場所メモ",
    locationNotePh: "例：倉庫A、消防通路、園区東門",
    vendor: "メーカー",
    resolution: "解像度",
    accessMethod: "接続方式",
    notes: "補足",
    notesPh: "現場特有の呼び方、重点的に確認したい問題など",
    featureSelection: "機能選択",
    featureSelectionDesc: "同じグループで複数の検知機能を選択できます。",
    addCurrentRecommended: "現在のおすすめを追加",
    recommendedFeatures: "おすすめ機能",
    noRecommendWithText: "一致するおすすめはありません。下の機能一覧から選択してください。",
    noRecommendEmpty: "グループ名や場所を入力すると、おすすめ項目が表示されます。自動選択はされません。",
    hit: "該当",
    multiSelect: "複数選択可",
    selectedCount: "{count} 個選択済み",
    finishAndCollapse: "このグループを完了して閉じる",
    noDraft: "下書きはありません",
    preview: "プレビュー",
    noAttachment: "添付資料はありません。",
    autoSaved: "自動保存しました。",
    autoSaveFailed: "自動保存に失敗しました：{message}",
    addedRecommended: "現在のおすすめを {count} 件追加しました。",
    noRecommendedToAdd: "追加できるおすすめはありません。",
    groupDone: "このグループは完了しました。",
    groupCollapsed: "このグループを閉じました。あとで追加入力できます。",
    keepOneGroup: "少なくとも1つのカメラグループを残してください。",
    saved: "ローカルに保存しました。",
    saveFailed: "保存に失敗しました：{message}",
    cloudDraftUnavailable: "クラウド下書きを読み込めません。",
    vercelAuthRequired: "このリンクは Vercel のアクセス保護により API がログイン必須です。Deployment Protection を無効にするか、本番ドメインを使用してください。",
    blankCreated: "空の調査を新規作成しました。",
    loadedDraft: "下書きを読み込みました。",
    chooseAttachment: "先に添付ファイルを選択してください。",
    uploaded: "添付資料をアップロードしました。",
    deletedAttachment: "添付資料を削除しました。",
    confirmDeleteAttachment: "この添付資料を削除しますか？",
    unsupportedFile: "対応していないファイル形式：{name}",
    fileTooLarge: "添付ファイルが 20MB を超えています：{name}",
    exportIncompleteConfirm: "未完了の項目があります：\n\n{issues}\n\nこのまま出力しますか？",
    requestFailed: "リクエスト失敗：{status}",
    derivedRequirement: "スマート保安ニーズ調査",
    defaultDraftName: "スマート保安ニーズ調査",
    progressText: "{complete}/{total} 完了",
    checkCompany: "会社基本情報",
    checkConditions: "全体条件",
    checkGroups: "現在 {count} 個のカメラグループ",
    checkCompleteGroups: "{complete}/{total} グループ完了",
    checkInfoGroups: "{complete}/{total} グループが名称と台数を入力済み",
    checkFeatureGroups: "{complete}/{total} グループが機能を選択済み",
    issueCompany: "会社名",
    issueIndustry: "業種・施設種別",
    issueContact: "連絡先",
    issueInternetPolicy: "ネットワーク環境",
    issueAiPolicy: "AI 利用条件",
    issueGroupName: "第 {index} グループ名",
    issueGroupCount: "第 {index} グループのカメラ台数",
    issueGroupFeature: "第 {index} グループの機能選択"
  }
};

const OPTION_LABELS = {
  "生产厂区 / 制造业": "生産工場 / 製造業",
  "物流园区 / 仓储": "物流エリア / 倉庫",
  "产业园区 / 写字楼": "産業団地 / オフィス",
  "商超 / 商业综合体": "スーパー / 商業施設",
  "能源化工 / 高危场所": "エネルギー・化学 / 高リスク現場",
  "学校 / 医院 / 公共机构": "学校 / 病院 / 公共機関",
  "物业 / 社区": "不動産管理 / コミュニティ",
  "其他": "その他",
  "待确认": "要確認",
  "不清楚": "不明",
  "海康": "Hikvision",
  "大华": "Dahua",
  "宇视": "Uniview",
  "华为": "Huawei",
  "厂商SDK": "メーカーSDK",
  "平台API": "プラットフォームAPI",
  "可访问互联网": "インターネット接続可",
  "仅内网": "社内ネットワークのみ",
  "需审批后访问外网": "承認後に外部接続可",
  "完全离线": "完全オフライン",
  "可调用外部AI服务": "外部AIサービス利用可",
  "本地优先": "ローカル優先",
  "只能本地": "ローカルのみ"
};

const CATEGORY_LABELS_JA = {
  person: "人員・行動",
  ppe: "作業ルール・保護具",
  fire: "消防・煙火",
  vehicle: "車両・道路",
  logistics: "倉庫・物流",
  perimeter: "境界・区域",
  environment: "環境・秩序"
};

const FEATURE_LABELS_JA = {
  "person-intrusion": "人員侵入 / 立入禁止区域",
  "line-crossing": "ライン越え検知",
  crowd: "人員密集",
  loitering: "長時間滞留 / 不審徘徊",
  fall: "転倒 / 倒れ込み",
  conflict: "衝突・トラブル疑い",
  absence: "無人持ち場 / 離席",
  sleeping: "居眠り / 寝落ち",
  helmet: "ヘルメット未着用",
  vest: "作業服 / 反射ベスト未着用",
  "other-ppe": "その他保護具未着用",
  "danger-zone": "危険区域への接近 / 侵入",
  "height-work": "高所・端部エリア人員検知",
  smoking: "喫煙検知",
  flame: "火炎 / 裸火検知",
  smoke: "煙・濃煙検知",
  "fire-lane-block": "消防通路占有",
  "exit-block": "避難口・安全出口の塞ぎ",
  "fire-equipment-block": "消防設備の遮蔽",
  plate: "車両 / ナンバープレート認識",
  "illegal-parking": "違法駐車",
  "vehicle-stay": "車両長時間停車",
  "reverse-driving": "逆走検知",
  "mixed-traffic": "人車混在",
  "traffic-count": "車流統計",
  "bike-parking": "二輪車の乱停車",
  "cargo-block": "貨物 / パレット通路占有",
  "cargo-overline": "貨物のライン越え / 異常積載",
  "dock-occupied": "積卸エリア占有",
  "forklift-block": "フォークリフト / 車両通路占有",
  "shelf-aisle-block": "棚通路の塞ぎ",
  "warehouse-restricted": "倉庫制限区域への人員侵入",
  "perimeter-intrusion": "境界侵入 / ライン越え",
  climbing: "乗り越え / よじ登り",
  "night-intrusion": "夜間境界侵入",
  "area-stay": "境界付近の長時間滞留",
  trash: "ごみ / 雑物放置",
  "channel-block": "通路塞ぎ / 物品占有",
  water: "浸水 / 水たまり",
  custom: "その他カスタム検知"
};

const FEATURE_DESC_JA = {
  "person-intrusion": "立入禁止区域への人員侵入を検知します。",
  "line-crossing": "指定した境界線を越えた対象を検知します。",
  crowd: "局所的な人員密集を検知します。",
  loitering: "長時間の滞留や反復徘徊を検知します。",
  fall: "人員の転倒や倒れ込みを検知します。",
  conflict: "明らかな身体的衝突などの異常行動を検知します。",
  absence: "重要な持ち場や監視点が無人になった状態を検知します。",
  sleeping: "当直・操作席での居眠りを検知します。",
  helmet: "ヘルメット未着用を検知します。",
  vest: "指定作業服や反射ベストの未着用を検知します。",
  "other-ppe": "マスク、保護メガネ、手袋など、現場サンプルに合わせて確認します。",
  "danger-zone": "危険区域への接近や侵入を検知します。",
  "height-work": "高所、屋根、端部などの人員を検知します。",
  smoking: "喫煙行為を検知します。",
  flame: "火炎や裸火を検知します。",
  smoke: "煙、濃煙などの視覚的な火災兆候を検知します。",
  "fire-lane-block": "消防通路や消防車道の占有を検知します。",
  "exit-block": "安全出口や避難口の塞ぎを検知します。",
  "fire-equipment-block": "消火栓、消火器、消防箱周辺の遮蔽を検知します。",
  plate: "車両とナンバープレートを認識します。",
  "illegal-parking": "禁止区域への駐車を検知します。",
  "vehicle-stay": "指定区域での車両長時間停車を検知します。",
  "reverse-driving": "逆方向走行を検知します。",
  "mixed-traffic": "重点通路で人と車両が混在する状態を検知します。",
  "traffic-count": "車両の出入りや交通量を集計します。",
  "bike-parking": "自転車、電動車などの乱停車を検知します。",
  "cargo-block": "貨物やパレットによる通路占有を検知します。",
  "cargo-overline": "指定ラインを越えた積載や異常積載を検知します。",
  "dock-occupied": "積卸口やドックの占有を検知します。",
  "forklift-block": "フォークリフトや車両の通路占有・違停を検知します。",
  "shelf-aisle-block": "棚通路やピッキング通路の塞ぎを検知します。",
  "warehouse-restricted": "倉庫内の制限区域への侵入を検知します。",
  "perimeter-intrusion": "フェンス、壁、境界区域への侵入を検知します。",
  climbing: "フェンスや壁を乗り越える行為を検知します。",
  "night-intrusion": "夜間の境界侵入を検知します。",
  "area-stay": "境界付近での長時間滞留を検知します。",
  trash: "ごみや雑物の放置を検知します。",
  "channel-block": "通路、廊下、荷物搬入口の占有を検知します。",
  water: "明らかな浸水や水たまりを検知します。",
  custom: "希望する検知対象と判断基準を記入してください。"
};

const FEATURE_KEYWORD_ALIASES_JA = {
  "person-intrusion": ["入口", "立入禁止", "制限区域", "倉庫", "危険"],
  "line-crossing": ["境界", "ライン", "フェンス", "立入禁止"],
  crowd: ["入口", "食堂", "寮", "共用部", "混雑"],
  loitering: ["入口", "裏口", "フェンス", "徘徊", "滞留"],
  fall: ["階段", "高リスク", "転倒"],
  conflict: ["入口", "駐車場", "共用部", "トラブル"],
  absence: ["持ち場", "操作台", "監視", "無人"],
  sleeping: ["持ち場", "操作台", "居眠り"],
  helmet: ["工場", "作業", "施工", "設備", "ヘルメット"],
  vest: ["物流", "積卸", "作業服", "反射ベスト"],
  "other-ppe": ["溶接", "化学", "危険", "保護具"],
  "danger-zone": ["設備", "ロボット", "危険", "立入禁止"],
  "height-work": ["高所", "屋根", "端部", "足場"],
  smoking: ["喫煙", "倉庫", "休憩", "危険物"],
  flame: ["火気", "配電", "倉庫", "危険物"],
  smoke: ["煙", "配電", "倉庫", "密閉"],
  "fire-lane-block": ["消防", "通路", "道路"],
  "exit-block": ["安全出口", "避難", "階段"],
  "fire-equipment-block": ["消防設備", "消火栓", "消火器"],
  plate: ["正門", "入口", "駐車", "物流門"],
  "illegal-parking": ["道路", "正門", "消防", "駐車禁止"],
  "vehicle-stay": ["積卸", "正門", "物流"],
  "reverse-driving": ["道路", "一方通行", "逆走"],
  "mixed-traffic": ["物流", "フォークリフト", "主通路", "積卸"],
  "traffic-count": ["入口", "道路", "駐車"],
  "bike-parking": ["入口", "階段", "消防", "駐輪"],
  "cargo-block": ["倉庫", "貨物", "パレット", "通路"],
  "cargo-overline": ["倉庫", "黄線", "消防線", "棚"],
  "dock-occupied": ["積卸", "ドック", "物流"],
  "forklift-block": ["フォークリフト", "倉庫", "通路"],
  "shelf-aisle-block": ["棚", "倉庫", "ピッキング"],
  "warehouse-restricted": ["倉庫", "危険物", "制限区域"],
  "perimeter-intrusion": ["境界", "フェンス", "壁", "裏口"],
  climbing: ["フェンス", "壁", "よじ登り"],
  "night-intrusion": ["夜間", "境界", "裏口"],
  "area-stay": ["入口", "境界", "フェンス", "滞留"],
  trash: ["ごみ", "雑物", "通路", "角"],
  "channel-block": ["通路", "廊下", "荷物", "倉庫"],
  water: ["地下", "倉庫", "機械室", "水"],
  custom: ["その他", "カスタム"]
};

const els = {
  companyForm: document.querySelector("#companyForm"),
  conditionsForm: document.querySelector("#conditionsForm"),
  startSurveyBtn: document.querySelector("#startSurveyBtn"),
  langToggleBtn: document.querySelector("#langToggleBtn"),
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
  exportMenuBtn: document.querySelector("#exportMenuBtn"),
  exportMenu: document.querySelector("#exportMenu"),
  exportCsvBtn: document.querySelector("#exportCsvBtn"),
  exportJsonBtn: document.querySelector("#exportJsonBtn"),
  exportWordBtn: document.querySelector("#exportWordBtn"),
  toast: document.querySelector("#toast")
};

init();

async function init() {
  applyLanguage();
  const catalog = await loadCatalog();
  state.catalog = catalog.featureCatalog;
  bindEvents();

  const url = new URL(window.location.href);
  const projectId = url.searchParams.get("project") || localStorage.getItem(LAST_PROJECT_KEY);
  if (projectId) {
    try {
      await loadProject(projectId, { silent: true });
    } catch {
      localStorage.removeItem(LAST_PROJECT_KEY);
      window.history.replaceState({}, "", window.location.pathname);
      state.cameraGroups = [newGroup({ open: false })];
      renderAll();
    }
  } else {
    state.cameraGroups = [newGroup({ open: false })];
    renderAll();
  }

  safeRefreshProjectList();
}

async function loadCatalog() {
  try {
    return await fetchJson("/api/catalog");
  } catch {
    return fetchJson("/catalog.json");
  }
}

function bindEvents() {
  els.langToggleBtn.addEventListener("click", () => {
    state.language = state.language === "zh" ? "ja" : "zh";
    localStorage.setItem(LANGUAGE_KEY, state.language);
    applyLanguage();
    renderAll();
    safeRefreshProjectList();
  });

  els.startSurveyBtn.addEventListener("click", () => enterSurvey());

  els.companyForm.addEventListener("input", (event) => {
    const key = event.target.dataset.project;
    if (!key) return;
    state.project[key] = event.target.value;
    markDirty();
  });

  els.companyForm.addEventListener("change", (event) => {
    const key = event.target.dataset.project;
    if (!key) return;
    state.project[key] = event.target.value;
    markDirty();
  });

  els.conditionsForm.addEventListener("input", (event) => {
    const key = event.target.dataset.condition;
    if (!key) return;
    state.conditions[key] = event.target.value;
    markDirty();
  });

  els.conditionsForm.addEventListener("change", (event) => {
    const key = event.target.dataset.condition;
    if (!key) return;
    state.conditions[key] = event.target.value;
    markDirty();
  });

  els.addGroupLargeBtn.addEventListener("click", () => addCameraGroup());

  els.cameraGroupList.addEventListener("input", (event) => {
    const groupId = event.target.dataset.groupId;
    const key = event.target.dataset.groupField;
    if (!groupId || !key) return;
    const group = findGroup(groupId);
    if (!group) return;
    group[key] = event.target.value;
    updateGroupDynamicUi(group);
    markDirty();
  });

  els.cameraGroupList.addEventListener("change", (event) => {
    const groupId = event.target.dataset.groupId;
    const field = event.target.dataset.groupField;
    if (groupId && field) {
      const group = findGroup(groupId);
      if (group) group[field] = event.target.value;
      renderGroups();
      markDirty();
      return;
    }

    const featureId = event.target.dataset.featureId;
    if (!groupId || !featureId) return;
    toggleFeature(groupId, featureId, event.target.checked);
    renderGroups();
    markDirty();
  });

  els.cameraGroupList.addEventListener("click", (event) => {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl || !els.cameraGroupList.contains(actionEl)) return;
    const action = actionEl.dataset.action;
    const groupId = actionEl.dataset.groupId;
    if (!action || !groupId) return;

    let dataChanged = false;
    if (action === "toggle-group") toggleGroup(groupId);
    if (action === "collapse-group") collapseGroup(groupId);
    if (action === "duplicate") {
      duplicateGroup(groupId);
      dataChanged = true;
    }
    if (action === "delete") {
      dataChanged = deleteGroup(groupId);
    }
    if (action === "add-feature") {
      dataChanged = addFeature(groupId, actionEl.dataset.featureId);
    }
    if (action === "add-all-recommended") {
      const addedCount = addAllRecommended(groupId);
      dataChanged = addedCount > 0;
      showToast(addedCount ? t("addedRecommended", { count: addedCount }) : t("noRecommendedToAdd"));
    }
    renderGroups();
    if (dataChanged) markDirty();
    else updateCompletion();
  });

  els.saveBtn.addEventListener("click", () => saveProject(false).catch(() => {}));
  els.newProjectBtn.addEventListener("click", newProject);
  els.uploadBtn.addEventListener("click", uploadFiles);
  els.exportMenuBtn.addEventListener("click", () => toggleExportMenu());
  els.exportCsvBtn.addEventListener("click", () => exportProject("csv"));
  els.exportJsonBtn.addEventListener("click", () => exportProject("json"));
  els.exportWordBtn.addEventListener("click", () => exportProject("doc"));
  els.attachmentList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-action='delete-attachment']");
    if (!deleteButton) return;
    deleteAttachment(deleteButton.dataset.attachmentId);
  });
  document.addEventListener("click", (event) => {
    if (event.target.closest(".export-combo")) return;
    closeExportMenu();
  });
}

function enterSurvey() {
  document.body.classList.remove("welcome-active");
  document.querySelector("#companyCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyLanguage() {
  document.documentElement.lang = state.language === "ja" ? "ja-JP" : "zh-CN";
  document.title = t("metaTitle");
  els.langToggleBtn.textContent = t("langButton");
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = t(node.dataset.i18nPlaceholder);
  }
  translateStaticOptions();
  if (els.saveBtn && !state.saving) setSaveButtonState(state.dirty ? "dirty" : "idle");
}

function translateStaticOptions() {
  for (const option of document.querySelectorAll("option")) {
    if (!option.value) {
      option.textContent = t("selectPlaceholder");
      continue;
    }
    option.textContent = optionLabel(option.value);
  }
}

function t(key, params = {}) {
  const template = I18N[state.language]?.[key] ?? I18N.zh[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => params[name] ?? "");
}

function optionLabel(value) {
  if (!value) return t("selectPlaceholder");
  if (state.language === "ja") return OPTION_LABELS[value] || value;
  return value;
}

function categoryLabel(category) {
  if (state.language === "ja") return CATEGORY_LABELS_JA[category.id] || category.name;
  return category.name;
}

function featureLabel(item) {
  if (state.language === "ja") return FEATURE_LABELS_JA[item.id] || item.name;
  return item.name;
}

function featureDescription(item) {
  if (state.language === "ja") return FEATURE_DESC_JA[item.id] || item.description;
  return item.description;
}

function toggleExportMenu() {
  const isOpen = !els.exportMenu.hidden;
  els.exportMenu.hidden = isOpen;
  els.exportMenuBtn.setAttribute("aria-expanded", String(!isOpen));
}

function closeExportMenu() {
  els.exportMenu.hidden = true;
  els.exportMenuBtn.setAttribute("aria-expanded", "false");
}

function emptyProject() {
  return {
    company: "",
    projectName: "",
    industry: "",
    address: "",
    contactName: "",
    contactPhone: "",
    contactRole: ""
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
  applyLanguage();
  fillCompanyForm();
  fillConditionsForm();
  renderGroups();
  renderAttachments();
  updateCompletion();
}

function markDirty() {
  state.dirty = true;
  updateCompletion();
  setSaveButtonState("dirty");
  queueAutoSave();
}

function queueAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSave().catch(() => {});
  }, AUTO_SAVE_DELAY_MS);
}

async function autoSave() {
  if (!state.dirty || state.saving) return;
  await saveProject(true, { auto: true });
}

function setSaveButtonState(mode) {
  clearTimeout(saveButtonResetTimer);
  if (mode === "saving") {
    els.saveBtn.textContent = t("saving");
    els.saveBtn.disabled = true;
    return;
  }
  els.saveBtn.disabled = false;
  if (mode === "dirty") {
    els.saveBtn.textContent = t("saveDirty");
    return;
  }
  if (mode === "saved") {
    els.saveBtn.textContent = t("savedShort");
    saveButtonResetTimer = setTimeout(() => setSaveButtonState(state.dirty ? "dirty" : "idle"), 1800);
    return;
  }
  els.saveBtn.textContent = t("save");
}

function fillCompanyForm() {
  for (const input of els.companyForm.querySelectorAll("[data-project]")) {
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
    applyLanguage();
    return;
  }

  els.cameraGroupList.innerHTML = state.cameraGroups.map((group, index) => groupCard(group, index)).join("");
}

function groupCard(group, index) {
  const recommended = recommendFeatures(group);
  const selected = new Set(group.features);
  const complete = isGroupComplete(group);
  const expanded = Boolean(group.open);
  return `
    <article class="group-card ${complete ? "is-complete" : ""} ${expanded ? "is-open" : "is-collapsed"}">
      <div class="group-header" data-action="toggle-group" data-group-id="${group.id}">
        <div class="group-title">
          <span class="group-index">${index + 1}</span>
          <div>
            <div class="group-title-line">
              <strong data-group-title="${group.id}">${escapeHtml(group.name || t("groupDefaultName", { index: index + 1 }))}</strong>
              <button class="small ghost copy-inline" type="button" data-action="duplicate" data-group-id="${group.id}">${t("duplicateGroup")}</button>
            </div>
            <span data-group-summary="${group.id}">${groupSummary(group)}</span>
          </div>
        </div>
        <div class="group-actions">
          <span class="status-pill ${complete ? "ok" : ""}">${complete ? t("groupComplete") : t("pendingFill")}</span>
          <span class="toggle-hint">${expanded ? t("clickClose") : t("clickOpen")}</span>
          <button class="small danger" type="button" data-action="delete" data-group-id="${group.id}">${t("delete")}</button>
        </div>
      </div>
      <div class="group-body">
        <div class="subheading first">
          <h3>${t("cameraInfo")}</h3>
          <p>${t("cameraInfoDesc")}</p>
        </div>
        <div class="grid-form">
          ${field(t("groupName"), group, "name", t("groupNamePh"))}
          ${field(t("cameraCount"), group, "cameraCount", "1", "number")}
          ${field(t("locationNote"), group, "locationNote", t("locationNotePh"))}
          ${selectField(t("vendor"), group, "vendor", ["", "海康", "大华", "宇视", "华为", "其他", "不清楚"])}
          ${selectField(t("resolution"), group, "resolution", ["", "720P", "1080P", "2K", "4K", "混合", "不清楚"])}
          ${selectField(t("accessMethod"), group, "accessMethod", ["", "RTSP", "ONVIF", "GB28181", "厂商SDK", "平台API", "不清楚"])}
          ${textareaField(t("notes"), group, "notes", t("notesPh"), "span-2")}
        </div>

        <div class="subheading">
          <div>
            <h3>${t("featureSelection")}</h3>
            <p>${t("featureSelectionDesc")}</p>
          </div>
          <button class="small ghost" type="button" data-action="add-all-recommended" data-group-id="${group.id}">${t("addCurrentRecommended")}</button>
        </div>
        <div data-recommendations="${group.id}">
          ${recommendationBlock(group, recommended)}
        </div>
        <div class="feature-categories">
          ${state.catalog.map((category) => featureCategory(category, group, selected)).join("")}
        </div>
        <div class="group-done-row">
          <button class="primary" type="button" data-action="collapse-group" data-group-id="${group.id}">${t("finishAndCollapse")}</button>
        </div>
      </div>
    </article>
  `;
}

function groupSummary(group) {
  return `${t("cameraCountUnit", { count: Number(group.cameraCount || 1) })} · ${t("featureCount", { count: group.features.length })} · ${isGroupComplete(group) ? t("groupComplete") : t("groupPending")}`;
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
        ${options.map((option) => `<option value="${escapeAttr(option)}" ${group[key] === option ? "selected" : ""}>${escapeHtml(optionLabel(option))}</option>`).join("")}
      </select>
    </label>
  `;
}

function recommendationBlock(group, recommended) {
  if (!recommended.length) {
    const hasText = normalize(`${group.name} ${group.locationNote} ${group.notes}`).trim();
    return `
      <div class="recommend-box">
        <strong>${t("recommendedFeatures")}</strong>
        <span>${hasText ? t("noRecommendWithText") : t("noRecommendEmpty")}</span>
      </div>
    `;
  }
  return `
    <div class="recommend-box has-items">
      <strong>${t("recommendedFeatures")}</strong>
      <div class="recommend-list">
        ${recommended.map((item) => `
          <button class="chip recommended" type="button" data-action="add-feature" data-group-id="${group.id}" data-feature-id="${item.id}" title="${t("hit")}：${escapeAttr(item.matches.join("、"))}">
            <span>${escapeHtml(featureLabel(item))}</span>
            <small>${t("hit")}：${escapeHtml(item.matches.join("、"))}</small>
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
        <strong>${escapeHtml(categoryLabel(category))}</strong>
        <span>${selectedCount ? t("selectedCount", { count: selectedCount }) : t("multiSelect")}</span>
      </header>
      <div class="feature-grid">
        ${category.items.map((item) => {
          const isSelected = selected.has(item.id);
          return `
            <label class="feature-option ${isSelected ? "selected" : ""}" title="${escapeAttr(featureDescription(item))}">
              <input type="checkbox" data-group-id="${group.id}" data-feature-id="${item.id}" ${isSelected ? "checked" : ""} />
              <span>${escapeHtml(featureLabel(item))}</span>
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
      const keywords = [...(item.keywords || []), ...(FEATURE_KEYWORD_ALIASES_JA[item.id] || [])];
      const matches = keywords.filter((keyword) => text.includes(normalize(keyword)));
      if (matches.length > 0) scored.push({ ...item, score: matches.length, matches: [...new Set(matches)] });
    }
  }
  return scored.sort((a, b) => b.score - a.score || featureLabel(a).localeCompare(featureLabel(b), localeCode())).slice(0, 8);
}

function updateGroupDynamicUi(group) {
  const title = document.querySelector(`[data-group-title="${group.id}"]`);
  if (title) title.textContent = group.name || t("unnamedGroup");
  const summary = document.querySelector(`[data-group-summary="${group.id}"]`);
  if (summary) summary.textContent = groupSummary(group);
  const target = document.querySelector(`[data-recommendations="${group.id}"]`);
  if (target) target.innerHTML = recommendationBlock(group, recommendFeatures(group));
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
  if (!group || !featureId || group.features.includes(featureId)) return false;
  group.features.push(featureId);
  return true;
}

function addAllRecommended(groupId) {
  const group = findGroup(groupId);
  if (!group) return 0;
  let addedCount = 0;
  for (const item of recommendFeatures(group)) {
    const before = group.features.length;
    addFeature(groupId, item.id);
    if (group.features.length > before) addedCount += 1;
  }
  return addedCount;
}

function addCameraGroup() {
  state.cameraGroups.forEach((group) => {
    group.open = false;
  });
  state.cameraGroups.push(newGroup({ open: true }));
  renderGroups();
  markDirty();
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
  showToast(isGroupComplete(group) ? t("groupDone") : t("groupCollapsed"));
}

function duplicateGroup(groupId) {
  const group = findGroup(groupId);
  if (!group) return;
  const copy = newGroup({
    ...structuredClone(group),
    id: crypto.randomUUID(),
    name: `${group.name || t("unnamedGroup")} ${state.language === "ja" ? "コピー" : "副本"}`,
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
    showToast(t("keepOneGroup"));
    return false;
  }
  state.cameraGroups = state.cameraGroups.filter((group) => group.id !== groupId);
  return true;
}

async function saveProject(silent = false, options = {}) {
  if (state.saving) return null;
  clearTimeout(autoSaveTimer);
  state.saving = true;
  setSaveButtonState("saving");
  try {
    state.project = {
      ...emptyProject(),
      ...state.project,
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
    state.dirty = false;
    localStorage.setItem(LAST_PROJECT_KEY, state.id);
    const url = new URL(window.location.href);
    url.searchParams.set("project", state.id);
    window.history.replaceState({}, "", url);
    safeRefreshProjectList();
    setSaveButtonState("saved");
    if (!silent) showToast(t("saved"));
    if (options.auto) showToast(t("autoSaved"));
    return response.project;
  } catch (error) {
    const message = errorMessage(error);
    setSaveButtonState("dirty");
    showToast(options.auto ? t("autoSaveFailed", { message }) : t("saveFailed", { message }));
    throw error;
  } finally {
    state.saving = false;
  }
}

function deriveDraftName() {
  if (state.project.company?.trim()) return `${state.project.company.trim()}${state.language === "ja" ? " ニーズ調査" : "智慧安防需求"}`;
  const firstNamedGroup = state.cameraGroups.find((group) => group.name?.trim());
  if (firstNamedGroup) return `${firstNamedGroup.name.trim()}${state.language === "ja" ? " ニーズ" : "需求"}`;
  return t("defaultDraftName");
}

async function loadProject(id, options = {}) {
  const response = await fetchJson(`/api/projects/${encodeURIComponent(id)}`);
  applyProject(response.project);
  renderAll();
  if (!options.silent) showToast(t("loadedDraft"));
}

function applyProject(project) {
  state.id = project.id;
  state.project = { ...emptyProject(), ...project.project };
  state.conditions = { ...emptyConditions(), ...project.conditions };
  state.cameraGroups = project.cameraGroups.length ? project.cameraGroups.map((group) => ({ ...newGroup(), ...group, open: false })) : [newGroup({ open: false })];
  state.attachments = project.attachments || [];
  state.dirty = false;
  renderAll();
}

function newProject() {
  state.id = null;
  state.project = emptyProject();
  state.conditions = emptyConditions();
  state.cameraGroups = [newGroup({ open: false })];
  state.attachments = [];
  state.dirty = false;
  localStorage.removeItem(LAST_PROJECT_KEY);
  window.history.replaceState({}, "", window.location.pathname);
  document.body.classList.remove("welcome-active");
  renderAll();
  showToast(t("blankCreated"));
}

async function uploadFiles() {
  const files = [...els.fileInput.files];
  if (!files.length) {
    showToast(t("chooseAttachment"));
    return;
  }
  const fileIssue = validateFiles(files);
  if (fileIssue) {
    showToast(fileIssue);
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
  showToast(t("uploaded"));
}

function validateFiles(files) {
  for (const file of files) {
    const ext = file.name.includes(".") ? file.name.split(".").pop().toLowerCase() : "";
    if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) return t("unsupportedFile", { name: file.name });
    if (file.size > MAX_ATTACHMENT_SIZE) return t("fileTooLarge", { name: file.name });
  }
  return "";
}

async function exportProject(type) {
  closeExportMenu();
  await saveProject(true);
  const issues = validationIssues();
  if (issues.length) {
    const issueText = issues.map((issue, index) => `${index + 1}. ${issue}`).join("\n");
    if (!confirm(t("exportIncompleteConfirm", { issues: issueText }))) return;
  }
  window.location.href = apiUrl(`/api/projects/${encodeURIComponent(state.id)}/export.${type}`);
}

function renderAttachments() {
  if (!state.attachments.length) {
    els.attachmentList.innerHTML = `<div class="empty-state compact"><p>${t("noAttachment")}</p></div>`;
    return;
  }
  els.attachmentList.innerHTML = state.attachments.map((file) => `
    <div class="attachment-item">
      <div class="attachment-main">
        <a href="${apiUrl(file.url)}" target="_blank" rel="noreferrer">${escapeHtml(file.name)}</a>
        <span>${formatSize(file.size)} · ${escapeHtml(file.mimeType || "")} · ${formatDate(file.createdAt)}</span>
      </div>
      <div class="attachment-actions">
        <a class="small-link" href="${apiUrl(file.url)}" target="_blank" rel="noreferrer">${t("preview")}</a>
        <button class="small danger" type="button" data-action="delete-attachment" data-attachment-id="${file.id}">${t("delete")}</button>
      </div>
    </div>
  `).join("");
}

async function deleteAttachment(attachmentId) {
  if (!state.id || !attachmentId) return;
  if (!confirm(t("confirmDeleteAttachment"))) return;
  const response = await fetchJson(`/api/projects/${encodeURIComponent(state.id)}/attachments/${encodeURIComponent(attachmentId)}`, {
    method: "DELETE"
  });
  applyProject(response.project);
  showToast(t("deletedAttachment"));
}

async function refreshProjectList() {
  const response = await fetchJson("/api/projects");
  state.projects = response.projects || [];
  if (!state.projects.length) {
    els.projectList.innerHTML = `<span class="muted">${t("noDraft")}</span>`;
    return;
  }
  els.projectList.innerHTML = state.projects.map((project) => `
    <button class="project-item" type="button" data-project-id="${project.id}">
      <strong>${escapeHtml(project.company || project.project_name || t("defaultDraftName"))}</strong>
      <span>${formatDate(project.updated_at)}</span>
    </button>
  `).join("");
  els.projectList.querySelectorAll("[data-project-id]").forEach((button) => {
    button.addEventListener("click", () => {
      document.body.classList.remove("welcome-active");
      loadProject(button.dataset.projectId);
    });
  });
}

async function safeRefreshProjectList() {
  try {
    await refreshProjectList();
  } catch {
    els.projectList.innerHTML = `<span class="muted">${t("cloudDraftUnavailable")}</span>`;
  }
}

function updateCompletion() {
  const totalGroups = state.cameraGroups.length;
  const completeGroups = state.cameraGroups.filter(isGroupComplete).length;
  const companyComplete = isCompanyComplete();
  const conditionsComplete = isConditionsComplete();
  const totalUnits = totalGroups + 2;
  const completeUnits = completeGroups + (companyComplete ? 1 : 0) + (conditionsComplete ? 1 : 0);
  const percent = totalUnits ? Math.round((completeUnits / totalUnits) * 100) : 0;
  const groupsWithInfo = state.cameraGroups.filter((group) => group.name && Number(group.cameraCount) > 0).length;
  const groupsWithFeatures = state.cameraGroups.filter((group) => group.features.length > 0).length;
  const checks = [
    [t("checkCompany"), companyComplete],
    [t("checkConditions"), conditionsComplete],
    [t("checkGroups", { count: totalGroups }), totalGroups > 0],
    [t("checkCompleteGroups", { complete: completeGroups, total: totalGroups }), totalGroups > 0 && completeGroups === totalGroups],
    [t("checkInfoGroups", { complete: groupsWithInfo, total: totalGroups }), totalGroups > 0 && groupsWithInfo === totalGroups],
    [t("checkFeatureGroups", { complete: groupsWithFeatures, total: totalGroups }), totalGroups > 0 && groupsWithFeatures === totalGroups]
  ];
  els.progressBar.style.width = `${percent}%`;
  els.progressText.textContent = t("progressText", { complete: completeUnits, total: totalUnits });
  els.completionList.innerHTML = checks.map(([label, ok]) => `
    <li class="${ok ? "ok" : ""}"><span>${ok ? "✓" : "○"}</span>${label}</li>
  `).join("");
}

function isCompanyComplete() {
  return Boolean(state.project.company?.trim() && state.project.industry?.trim() && state.project.contactPhone?.trim());
}

function isConditionsComplete() {
  return Boolean(state.conditions.internetPolicy?.trim() && state.conditions.aiPolicy?.trim());
}

function validationIssues() {
  const issues = [];
  if (!state.project.company?.trim()) issues.push(t("issueCompany"));
  if (!state.project.industry?.trim()) issues.push(t("issueIndustry"));
  if (!state.project.contactPhone?.trim()) issues.push(t("issueContact"));
  if (!state.conditions.internetPolicy?.trim()) issues.push(t("issueInternetPolicy"));
  if (!state.conditions.aiPolicy?.trim()) issues.push(t("issueAiPolicy"));
  state.cameraGroups.forEach((group, index) => {
    if (!group.name) issues.push(t("issueGroupName", { index: index + 1 }));
    if (!Number(group.cameraCount)) issues.push(t("issueGroupCount", { index: index + 1 }));
    if (!group.features.length) issues.push(t("issueGroupFeature", { index: index + 1 }));
  });
  return issues;
}

async function fetchJson(url, options) {
  const response = await fetch(apiUrl(url), options);
  if (!response.ok) {
    const body = await response.text();
    if (response.status === 401 && /Vercel Authentication|Authentication Required/i.test(body)) {
      throw new Error(t("vercelAuthRequired"));
    }
    throw new Error(cleanErrorBody(body) || t("requestFailed", { status: response.status }));
  }
  return response.json();
}

function apiUrl(url) {
  const value = String(url || "");
  if (!value.startsWith("/api/")) return value;
  if (["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)) return value;
  return `/api?path=${encodeURIComponent(value.slice("/api/".length))}`;
}

function cleanErrorBody(body) {
  const text = String(body || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.slice(0, 180);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error || "");
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
  return new Date(value).toLocaleString(localeCode(), { hour12: false });
}

function localeCode() {
  return state.language === "ja" ? "ja-JP" : "zh-CN";
}

let toastTimer;
function showToast(message) {
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}
