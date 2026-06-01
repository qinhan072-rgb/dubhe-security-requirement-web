from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "智慧安防_成本选型逻辑模型_v3.xlsx"
BASE_URL = "http://localhost:4173"

NAVY = "07182B"
BLUE = "2563EB"
TEAL = "00A88E"
INPUT = "FFF8E1"
OUTPUT = "EAF7FF"
HEADER = "07182B"
LINE = "D9E3EA"

S_INPUT = "01项目参数输入"
S_FEATURE = "02功能需求输入"
S_PARAM = "03成本参数库"
S_DETAIL = "04计算明细"
S_SUMMARY = "05报价汇总"
S_NOTES = "06逻辑说明"


def fetch_json(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE_URL}{path}", timeout=10) as response:
        return json.load(response)


def style_cell(cell, fill="FFFFFF", bold=False, color=NAVY, size=10, align="left"):
    thin = Side(style="thin", color=LINE)
    cell.font = Font(name="Microsoft YaHei", bold=bold, color=color, size=size)
    cell.fill = PatternFill("solid", fgColor=fill)
    cell.border = Border(left=thin, right=thin, top=thin, bottom=thin)
    cell.alignment = Alignment(horizontal=align, vertical="center", wrap_text=True)


def style_title(cell, text, size=16):
    cell.value = text
    cell.font = Font(name="Microsoft YaHei", bold=True, color=NAVY, size=size)
    cell.alignment = Alignment(horizontal="left", vertical="center")


def add_header_row(ws, row_idx, headers, start_col=1):
    for offset, value in enumerate(headers):
        cell = ws.cell(row_idx, start_col + offset, value)
        style_cell(cell, fill=HEADER, bold=True, color="FFFFFF", align="center")


def set_widths(ws, widths):
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width


def fill_range(ws, min_row, max_row, min_col, max_col, fill="FFFFFF"):
    for row in ws.iter_rows(min_row=min_row, max_row=max_row, min_col=min_col, max_col=max_col):
        for cell in row:
            if cell.value is not None:
                style_cell(cell, fill=fill)


def policy_cn(policy: str) -> str:
    return {
        "none": "不需要",
        "optional": "可选",
        "suggested": "建议",
        "required": "必须",
    }.get(policy, "可选")


def rule_cost(workload: str) -> int:
    return {"light": 1000, "medium": 1800, "heavy": 3000, "custom": 5000}.get(workload, 1800)


def sample_cost(workload: str, base_cost: int) -> int:
    floor = {"light": 2000, "medium": 3500, "heavy": 6000, "custom": 12000}.get(workload, 3500)
    return max(floor, round(base_cost * 0.55 / 100) * 100)


def custom_cost(workload: str, base_cost: int) -> int:
    floor = {"light": 16000, "medium": 24000, "heavy": 36000, "custom": 50000}.get(workload, 24000)
    return max(floor, round(base_cost * 2.4 / 100) * 100)


def main() -> Path:
    catalog = fetch_json("/api/catalog")
    sizing = fetch_json("/api/sizing/catalog")
    feature_costs = sizing["featureCostProfiles"]
    resolutions = sizing["resolutions"]
    hardware = sizing["hardwareProfiles"]

    wb = Workbook()
    wb.remove(wb.active)
    ws_input = wb.create_sheet(S_INPUT)
    ws_feature = wb.create_sheet(S_FEATURE)
    ws_param = wb.create_sheet(S_PARAM)
    ws_detail = wb.create_sheet(S_DETAIL)
    ws_summary = wb.create_sheet(S_SUMMARY)
    ws_notes = wb.create_sheet(S_NOTES)

    # 01 project parameters and camera groups
    style_title(ws_input["A1"], "项目参数输入", 18)
    ws_input["A2"] = "黄色区域为项目动态输入；这里放会随项目、模型成熟度、数据沉淀而变化的参数。"
    ws_input["A2"].font = Font(name="Microsoft YaHei", color=TEAL, size=10)
    ws_input.merge_cells("A2:H2")

    add_header_row(ws_input, 4, ["动态参数", "当前值", "用途"])
    dynamic_rows = [
        ["安全余量系数", 1.25, "硬件选型预留，避免后期补硬件困难"],
        ["算法研发成本系数", 1.00, "模型成熟、工程复用提升后可下调"],
        ["算法算力优化系数", 1.00, "模型压缩、数据反哺后可下调；保守估算时保持1"],
        ["数据复用/沉淀系数", 1.00, "已有样本、历史项目经验越多，研发与调优成本越低"],
        ["视频融合风险系数", 1.00, "老旧平台、私有协议、网络不稳时上调"],
        ["标准平台一次性成本", 20000, "事件闭环、报表、多端提醒等默认能力"],
        ["标准平台月度成本", 1500, "基础运维、报表和平台维护"],
        ["AI Agent接入标准成本", 12000, "本地小模型/大模型API接入框架，不含token"],
    ]
    for row in dynamic_rows:
        ws_input.append(row)
    for row in range(5, 13):
        style_cell(ws_input.cell(row, 1), fill="FFFFFF")
        style_cell(ws_input.cell(row, 2), fill=INPUT)
        style_cell(ws_input.cell(row, 3), fill="FFFFFF")

    style_title(ws_input["A15"], "摄像头组输入", 14)
    ws_input["A16"] = "同型号、同用途、同识别目标放在同一组；若任一条件差异明显，则新增一组。"
    ws_input["A16"].font = Font(name="Microsoft YaHei", color=TEAL, size=10)
    ws_input.merge_cells("A16:H16")
    group_header_row = 18
    group_start = 19
    group_end = 118
    add_header_row(
        ws_input,
        group_header_row,
        ["组编号", "摄像头组名称", "路数", "分辨率", "厂商/型号", "接入复杂度", "输出/融合要求", "备注"],
    )
    sample_groups = [
        ["G01", "生产车间摄像头", 48, "1080P", "海康", "标准IP流", "标准平台预览", "安全帽、工服、抽烟、危险区域"],
        ["G02", "仓库摄像头", 36, "1080P", "海康/大华混合", "NVR/国标汇聚", "多端预览/大屏/移动端", "通道占用、消防通道、货物堆放"],
        ["G03", "园区周界摄像头", 28, "2K", "大华", "标准IP流", "标准平台预览", "周界入侵、夜间越线"],
        ["G04", "门岗车辆摄像头", 12, "4K", "宇视", "厂商SDK/API", "第三方系统/API输出", "车辆识别、违停、停留超时"],
    ]
    for row in sample_groups:
        ws_input.append(row)
    for r in range(group_start + len(sample_groups), group_end + 1):
        ws_input.cell(r, 1, f"G{r - group_start + 1:02d}")
    for r in range(group_start, group_end + 1):
        for c in range(2, 9):
            ws_input.cell(r, c).fill = PatternFill("solid", fgColor=INPUT)
            style_cell(ws_input.cell(r, c), fill=INPUT)
        style_cell(ws_input.cell(r, 1), fill="FFFFFF")
    set_widths(ws_input, [18, 24, 10, 12, 18, 20, 24, 34])
    ws_input.freeze_panes = "A19"

    # 02 feature requirements
    style_title(ws_feature["A1"], "功能需求输入", 18)
    ws_feature["A2"] = "每一行表示某个摄像头组需要一个识别功能；黄色列需要工程师填写或校准。"
    ws_feature["A2"].font = Font(name="Microsoft YaHei", color=TEAL, size=10)
    ws_feature.merge_cells("A2:F2")
    add_header_row(ws_feature, 4, ["组编号", "功能ID", "功能名称", "交付口径", "AI研判", "备注"])
    feature_start = 5
    feature_end = 203
    sample_features = [
        ["G01", "helmet", "", "标准算法", "沿用默认", ""],
        ["G01", "vest", "", "标准算法", "沿用默认", ""],
        ["G01", "smoking", "", "样本微调", "建议", ""],
        ["G01", "danger-zone", "", "场景规则配置", "沿用默认", ""],
        ["G02", "cargo-block", "", "场景规则配置", "沿用默认", ""],
        ["G02", "channel-block", "", "场景规则配置", "沿用默认", ""],
        ["G02", "fire-lane-block", "", "场景规则配置", "沿用默认", ""],
        ["G02", "smoke", "", "样本微调", "建议", ""],
        ["G03", "perimeter-intrusion", "", "场景规则配置", "沿用默认", ""],
        ["G03", "line-crossing", "", "标准算法", "沿用默认", ""],
        ["G03", "night-intrusion", "", "样本微调", "建议", ""],
        ["G04", "plate", "", "标准算法", "不需要", ""],
        ["G04", "illegal-parking", "", "场景规则配置", "沿用默认", ""],
        ["G04", "vehicle-stay", "", "场景规则配置", "沿用默认", ""],
    ]
    for row in sample_features:
        ws_feature.append(row)
    feature_param_start = 15
    feature_param_end = feature_param_start + len(feature_costs) - 1
    for r in range(feature_start, feature_end + 1):
        ws_feature.cell(r, 3, f'=IFERROR(VLOOKUP(B{r},\'{S_PARAM}\'!$A${feature_param_start}:$M${feature_param_end},2,FALSE),"")')
        for c in [1, 2, 4, 5, 6]:
            style_cell(ws_feature.cell(r, c), fill=INPUT)
        style_cell(ws_feature.cell(r, 3), fill=OUTPUT)
    set_widths(ws_feature, [12, 22, 26, 18, 16, 34])
    ws_feature.freeze_panes = "A5"

    # 03 cost parameter library
    style_title(ws_param["A1"], "成本参数库", 18)
    ws_param["A2"] = "这一页是工程参数库，不是每个项目都要改；当算法成熟、样本沉淀、硬件价格变化时，优先改这里。"
    ws_param["A2"].font = Font(name="Microsoft YaHei", color=TEAL, size=10)
    ws_param.merge_cells("A2:M2")

    add_header_row(ws_param, 4, ["分辨率", "算力倍率", "说明"])
    for idx, item in enumerate(resolutions, start=5):
        ws_param.cell(idx, 1, item["name"])
        ws_param.cell(idx, 2, item["compute_multiplier"])
        ws_param.cell(idx, 3, item.get("notes", ""))
        style_cell(ws_param.cell(idx, 1), fill="FFFFFF")
        style_cell(ws_param.cell(idx, 2), fill=INPUT)
        style_cell(ws_param.cell(idx, 3), fill="FFFFFF")

    style_title(ws_param["A13"], "功能算法成本参数", 14)
    add_header_row(
        ws_param,
        14,
        [
            "功能ID",
            "功能名称",
            "类别",
            "算法族",
            "复杂度",
            "单路算力",
            "标准算法成本",
            "规则配置成本",
            "样本微调成本",
            "新目标研发成本",
            "月度运维",
            "默认AI策略",
            "单路日AI事件量",
        ],
    )
    for idx, item in enumerate(feature_costs, start=feature_param_start):
        base_cost = int(item["one_time_dev_cost"])
        workload = item["workload_level"]
        row = [
            item["feature_id"],
            item["feature_name"],
            item["category_name"],
            item["algorithm_family"],
            workload,
            item["base_compute_units_1080p"],
            base_cost,
            rule_cost(workload),
            sample_cost(workload, base_cost),
            custom_cost(workload, base_cost),
            item["monthly_algorithm_ops_cost"],
            policy_cn(item["ai_review_policy"]),
            item["ai_event_rate_per_camera_day"],
        ]
        for col, value in enumerate(row, start=1):
            ws_param.cell(idx, col, value)
            fill = INPUT if col >= 6 else "FFFFFF"
            style_cell(ws_param.cell(idx, col), fill=fill)

    video_access_header = 60
    style_title(ws_param.cell(video_access_header - 2, 1), "视频融合参数", 14)
    add_header_row(ws_param, video_access_header, ["接入复杂度", "单路融合算力", "每组适配成本", "每路接入成本", "每路月度维护", "说明"], 1)
    access_rows = [
        ["标准IP流", 0.12, 800, 40, 5, "RTSP/ONVIF 等常规接入"],
        ["NVR/国标汇聚", 0.18, 1500, 60, 8, "NVR、GB28181 或已有平台汇聚"],
        ["厂商SDK/API", 0.25, 5000, 100, 12, "需要厂商 SDK、平台 API 或权限联调"],
        ["老旧平台/私有协议", 0.35, 12000, 160, 18, "老系统、私有协议、稳定性不确定"],
        ["多协议混合/待确认", 0.30, 8000, 120, 15, "客户无法确认时的保守口径"],
    ]
    for idx, row in enumerate(access_rows, start=video_access_header + 1):
        for col, value in enumerate(row, start=1):
            ws_param.cell(idx, col, value)
            style_cell(ws_param.cell(idx, col), fill=INPUT if 2 <= col <= 5 else "FFFFFF")

    add_header_row(ws_param, video_access_header, ["输出/融合要求", "项目级输出成本", "每路输出成本", "每路月度维护", "说明"], 8)
    output_rows = [
        ["标准平台预览", 0, 0, 0, "只进入本系统平台，不做额外分发"],
        ["多端预览/大屏/移动端", 3000, 20, 8, "PC、大屏、移动端等多端输出"],
        ["多格式转码/分发", 8000, 50, 12, "RTSP/RTMP/WebRTC/HLS 等多格式输出"],
        ["第三方系统/API输出", 12000, 30, 10, "给外部平台、工单、安防平台等同步"],
        ["不清楚/待确认", 6000, 30, 8, "需求未清时预留集成成本"],
    ]
    for idx, row in enumerate(output_rows, start=video_access_header + 1):
        for col, value in enumerate(row, start=8):
            ws_param.cell(idx, col, value)
            style_cell(ws_param.cell(idx, col), fill=INPUT if 9 <= col <= 11 else "FFFFFF")

    hardware_header = 72
    style_title(ws_param.cell(hardware_header - 2, 1), "硬件档位参数", 14)
    add_header_row(
        ws_param,
        hardware_header,
        ["硬件ID", "硬件名称", "可承载算力", "建议最大路数", "买断成本", "月付成本", "CPU", "GPU", "内存", "说明", "是否满足"],
    )
    for idx, item in enumerate(hardware, start=hardware_header + 1):
        row = [
            item["id"],
            item["name"],
            item["capacity_units"],
            item["recommended_max_streams"],
            item["purchase_cost"],
            item["monthly_cost"],
            item.get("cpu", ""),
            item.get("gpu", ""),
            item.get("memory", ""),
            item.get("notes", ""),
            f'=IF(AND(C{idx}>=\'{S_SUMMARY}\'!$B$12,D{idx}>=\'{S_SUMMARY}\'!$B$5),1,0)',
        ]
        for col, value in enumerate(row, start=1):
            ws_param.cell(idx, col, value)
            style_cell(ws_param.cell(idx, col), fill=INPUT if 3 <= col <= 6 else OUTPUT if col == 11 else "FFFFFF")
    set_widths(ws_param, [22, 22, 18, 18, 14, 14, 18, 22, 16, 36, 14, 14, 16])
    ws_param.freeze_panes = "A15"

    # 04 detail calculations
    style_title(ws_detail["A1"], "计算明细", 18)
    ws_detail["A2"] = "自动计算页，通常不用填写；用于追溯每个成本从哪里来。"
    ws_detail["A2"].font = Font(name="Microsoft YaHei", color=TEAL, size=10)
    ws_detail.merge_cells("A2:S2")
    add_header_row(
        ws_detail,
        4,
        [
            "序号",
            "组编号",
            "组名称",
            "路数",
            "分辨率",
            "功能ID",
            "功能名称",
            "交付口径",
            "AI策略",
            "分辨率倍率",
            "单路算力",
            "算法算力",
            "唯一功能",
            "算法研发成本",
            "规则配置成本",
            "月度算法运维",
            "日AI事件量",
            "备注",
        ],
    )
    detail_start = 5
    detail_end = 203
    group_range = f"'{S_INPUT}'!$A${group_start}:$H${group_end}"
    feature_range = f"'{S_PARAM}'!$A${feature_param_start}:$M${feature_param_end}"
    resolution_range = f"'{S_PARAM}'!$A$5:$C$10"
    delivery_factor = 'IF(H{r}="标准算法",0.5,IF(H{r}="场景规则配置",1,IF(H{r}="样本微调",1.2,IF(H{r}="新目标定制",1.5,IF(H{r}="仅AI研判",0.4,1)))))'
    for r in range(detail_start, detail_end + 1):
        src = r
        ws_detail.cell(r, 1, r - detail_start + 1)
        ws_detail.cell(r, 2, f"='{S_FEATURE}'!A{src}")
        ws_detail.cell(r, 3, f'=IFERROR(VLOOKUP(B{r},{group_range},2,FALSE),"")')
        ws_detail.cell(r, 4, f'=IFERROR(VLOOKUP(B{r},{group_range},3,FALSE),0)')
        ws_detail.cell(r, 5, f'=IFERROR(VLOOKUP(B{r},{group_range},4,FALSE),"")')
        ws_detail.cell(r, 6, f"='{S_FEATURE}'!B{src}")
        ws_detail.cell(r, 7, f'=IFERROR(VLOOKUP(F{r},{feature_range},2,FALSE),"")')
        ws_detail.cell(r, 8, f"='{S_FEATURE}'!D{src}")
        ws_detail.cell(r, 9, f'=IF(\'{S_FEATURE}\'!E{src}="沿用默认",IFERROR(VLOOKUP(F{r},{feature_range},12,FALSE),"可选"),\'{S_FEATURE}\'!E{src})')
        ws_detail.cell(r, 10, f'=IFERROR(VLOOKUP(E{r},{resolution_range},2,FALSE),1)')
        ws_detail.cell(r, 11, f'=IFERROR(VLOOKUP(F{r},{feature_range},6,FALSE),0)')
        ws_detail.cell(r, 12, f'=IF(F{r}="",0,D{r}*J{r}*K{r}*\'{S_INPUT}\'!$B$7)')
        ws_detail.cell(r, 13, f'=IF(F{r}="",0,IF(COUNTIF($F${detail_start}:F{r},F{r})=1,1,0))')
        ws_detail.cell(
            r,
            14,
            f'=IF(M{r}=0,0,IF(H{r}="新目标定制",VLOOKUP(F{r},{feature_range},10,FALSE),IF(H{r}="样本微调",VLOOKUP(F{r},{feature_range},7,FALSE)+VLOOKUP(F{r},{feature_range},9,FALSE),IF(H{r}="仅AI研判",\'{S_INPUT}\'!$B$11,VLOOKUP(F{r},{feature_range},7,FALSE))))*\'{S_INPUT}\'!$B$5*\'{S_INPUT}\'!$B$7)',
        )
        ws_detail.cell(r, 15, f'=IF(F{r}="",0,VLOOKUP(F{r},{feature_range},8,FALSE)*{delivery_factor.format(r=r)}*\'{S_INPUT}\'!$B$5)')
        ws_detail.cell(r, 16, f'=IF(M{r}=1,VLOOKUP(F{r},{feature_range},11,FALSE)*\'{S_INPUT}\'!$B$5,0)')
        ws_detail.cell(r, 17, f'=IF(OR(I{r}="建议",I{r}="必须"),D{r}*VLOOKUP(F{r},{feature_range},13,FALSE),0)')
        ws_detail.cell(r, 18, f"='{S_FEATURE}'!F{src}")
    fill_range(ws_detail, detail_start, detail_end, 1, 18, OUTPUT)

    video_title = 207
    style_title(ws_detail.cell(video_title, 1), "视频融合计算", 14)
    video_header = video_title + 2
    video_start = video_header + 1
    video_end = video_start + 99
    add_header_row(
        ws_detail,
        video_header,
        ["组编号", "组名称", "路数", "分辨率", "接入复杂度", "输出/融合要求", "分辨率倍率", "融合算力", "接入适配成本", "输出融合成本", "月度融合维护"],
    )
    access_range = f"'{S_PARAM}'!$A$61:$F$65"
    output_range = f"'{S_PARAM}'!$H$61:$L$65"
    for r in range(video_start, video_end + 1):
        src = group_start + (r - video_start)
        ws_detail.cell(r, 1, f"='{S_INPUT}'!A{src}")
        ws_detail.cell(r, 2, f"='{S_INPUT}'!B{src}")
        ws_detail.cell(r, 3, f"='{S_INPUT}'!C{src}")
        ws_detail.cell(r, 4, f"='{S_INPUT}'!D{src}")
        ws_detail.cell(r, 5, f"='{S_INPUT}'!F{src}")
        ws_detail.cell(r, 6, f"='{S_INPUT}'!G{src}")
        ws_detail.cell(r, 7, f'=IFERROR(VLOOKUP(D{r},{resolution_range},2,FALSE),1)')
        ws_detail.cell(r, 8, f'=IF(B{r}="",0,C{r}*G{r}*VLOOKUP(E{r},{access_range},2,FALSE)*\'{S_INPUT}\'!$B$8)')
        ws_detail.cell(r, 9, f'=IF(B{r}="",0,(VLOOKUP(E{r},{access_range},3,FALSE)+C{r}*VLOOKUP(E{r},{access_range},4,FALSE))*\'{S_INPUT}\'!$B$8)')
        ws_detail.cell(r, 10, f'=IF(B{r}="",0,IF(COUNTIF($F${video_start}:F{r},F{r})=1,VLOOKUP(F{r},{output_range},2,FALSE),0)+C{r}*VLOOKUP(F{r},{output_range},3,FALSE))')
        ws_detail.cell(r, 11, f'=IF(B{r}="",0,(C{r}*VLOOKUP(E{r},{access_range},5,FALSE)+C{r}*VLOOKUP(F{r},{output_range},4,FALSE))*\'{S_INPUT}\'!$B$8)')
    fill_range(ws_detail, video_start, video_end, 1, 11, OUTPUT)
    set_widths(ws_detail, [8, 12, 22, 10, 12, 22, 24, 16, 14, 12, 12, 14, 12, 16, 16, 16, 14, 26])
    ws_detail.freeze_panes = "A5"

    # 05 summary
    style_title(ws_summary["A1"], "报价汇总", 18)
    ws_summary["A2"] = "自动汇总页：先看这里判断逻辑是否合理，再回前 3 页调参数。"
    ws_summary["A2"].font = Font(name="Microsoft YaHei", color=TEAL, size=10)
    ws_summary.merge_cells("A2:D2")
    add_header_row(ws_summary, 4, ["项目", "结果", "口径说明"])
    summary_rows = [
        ["总摄像头路数", f"=SUM('{S_INPUT}'!C{group_start}:C{group_end})", "硬件和接入的硬约束"],
        ["摄像头组数量", f'=COUNTIF(\'{S_INPUT}\'!B{group_start}:B{group_end},"<>")', "用于判断配置复杂度"],
        ["功能选择行数", f'=COUNTIF(\'{S_FEATURE}\'!B{feature_start}:B{feature_end},"<>")', "客户选择了多少项功能"],
        ["唯一功能数量", f"=SUM('{S_DETAIL}'!M{detail_start}:M{detail_end})", "标准算法包/研发成本通常按唯一功能计"],
        ["算法总算力", f"=SUM('{S_DETAIL}'!L{detail_start}:L{detail_end})", "由路数、分辨率和功能决定"],
        ["视频融合总算力", f"=SUM('{S_DETAIL}'!H{video_start}:H{video_end})", "由视频接入、转码分发和分辨率决定"],
        ["基础总算力", "=B9+B10", "算法算力 + 视频融合算力"],
        ["预留后所需算力", f"=B11*'{S_INPUT}'!$B$4", "乘安全余量系数后用于硬件选型"],
        ["预计AI事件量/月", f"=SUM('{S_DETAIL}'!Q{detail_start}:Q{detail_end})*30", "用于token/API服务包，不进入固定成本"],
        ["推荐硬件ID", f"=INDEX('{S_PARAM}'!A73:A86,MATCH(1,'{S_PARAM}'!K73:K86,0))", "同时满足路数和算力的第一档硬件"],
        ["推荐硬件名称", f"=VLOOKUP(B14,'{S_PARAM}'!A73:K86,2,FALSE)", ""],
        ["集群节点数", f'=IF(B14="cluster",CEILING(B12/VLOOKUP("edge-pro",\'{S_PARAM}\'!A73:C86,3,FALSE),1),1)', "超过单机时按高性能节点估算"],
        ["硬件买断成本", f'=IF(B14="cluster",B16*VLOOKUP("edge-pro",\'{S_PARAM}\'!A73:E86,5,FALSE),VLOOKUP(B14,\'{S_PARAM}\'!A73:E86,5,FALSE))', ""],
        ["硬件月付成本", f'=IF(B14="cluster",B16*VLOOKUP("edge-pro",\'{S_PARAM}\'!A73:F86,6,FALSE),VLOOKUP(B14,\'{S_PARAM}\'!A73:F86,6,FALSE))', ""],
        ["算法研发成本", f"=SUM('{S_DETAIL}'!N{detail_start}:N{detail_end})", "标准算法、微调、新目标研发合计"],
        ["规则配置成本", f"=SUM('{S_DETAIL}'!O{detail_start}:O{detail_end})", "按摄像头组和功能配置ROI、阈值、规则"],
        ["视频接入适配成本", f"=SUM('{S_DETAIL}'!I{video_start}:I{video_end})", "协议、NVR、SDK、老旧平台接入"],
        ["视频输出融合成本", f"=SUM('{S_DETAIL}'!J{video_start}:J{video_end})", "多端、大屏、API、多格式输出"],
        ["标准平台一次性成本", f"='{S_INPUT}'!$B$9", "默认平台能力"],
        ["AI Agent接入标准成本", f"='{S_INPUT}'!$B$11", "不含token/API"],
        ["固定买断合计", "=B17+B19+B20+B21+B22+B23+B24", "买断口径：硬件 + 研发适配 + 标准平台 + AI Agent"],
        ["算法月度运维", f"=SUM('{S_DETAIL}'!P{detail_start}:P{detail_end})", "模型、规则、样本持续优化"],
        ["视频融合月度维护", f"=SUM('{S_DETAIL}'!K{video_start}:K{video_end})", "取流、转码、接口稳定性维护"],
        ["标准平台月度成本", f"='{S_INPUT}'!$B$10", "基础平台维护"],
        ["固定月付合计", "=B18+B26+B27+B28", "月付口径：硬件月付 + 算法运维 + 视频维护 + 平台月费"],
        ["AI token/API费用", "按量或服务包另计", "根据AI事件量、模型类型和调用次数单独测算"],
    ]
    for row in summary_rows:
        ws_summary.append(row)
    for r in range(5, 5 + len(summary_rows)):
        style_cell(ws_summary.cell(r, 1), fill="FFFFFF")
        style_cell(ws_summary.cell(r, 2), fill=OUTPUT)
        style_cell(ws_summary.cell(r, 3), fill="FFFFFF")
    set_widths(ws_summary, [24, 28, 58])
    ws_summary.freeze_panes = "A5"

    # 06 notes
    style_title(ws_notes["A1"], "逻辑说明", 18)
    add_header_row(ws_notes, 3, ["主题", "说明"])
    notes = [
        ["填写顺序", "优先填写 01 项目参数输入、02 功能需求输入；03 成本参数库由工程/产品负责人维护；04 和 05 自动计算，不作为填表入口。"],
        ["为什么简化", "客户共通且差异不大的事件闭环、日报周报、多端提醒、基础权限等，不再展开为多个成本项，统一放入标准平台成本。"],
        ["大模型和数据沉淀", "随着大模型能力成熟、现场样本沉淀、历史项目复用增加，可通过算法研发成本系数、算法算力优化系数、数据复用/沉淀系数体现成本下降。"],
        ["视频融合层", "不同摄像头、协议、NVR、SDK、老旧平台会影响取流、转码、分发和联调成本，因此独立于算法成本计算。"],
        ["硬件层", "硬件不是只按摄像头数量，也不是只按算法数量，而是看总路数、算法算力、视频融合算力和安全余量。"],
        ["token/API", "大模型 token/API 不进固定成本，只估算事件量，后续按服务包或按量计费。"],
    ]
    for row in notes:
        ws_notes.append(row)
    fill_range(ws_notes, 4, 3 + len(notes), 1, 2, "FFFFFF")
    set_widths(ws_notes, [24, 86])

    # validations
    dv_res = DataValidation(type="list", formula1=f"'{S_PARAM}'!$A$5:$A$10", allow_blank=True)
    ws_input.add_data_validation(dv_res)
    dv_res.add(f"D{group_start}:D{group_end}")

    dv_access = DataValidation(type="list", formula1=f"'{S_PARAM}'!$A$61:$A$65", allow_blank=True)
    ws_input.add_data_validation(dv_access)
    dv_access.add(f"F{group_start}:F{group_end}")

    dv_output = DataValidation(type="list", formula1=f"'{S_PARAM}'!$H$61:$H$65", allow_blank=True)
    ws_input.add_data_validation(dv_output)
    dv_output.add(f"G{group_start}:G{group_end}")

    dv_delivery = DataValidation(type="list", formula1='"标准算法,场景规则配置,样本微调,新目标定制,仅AI研判"', allow_blank=True)
    ws_feature.add_data_validation(dv_delivery)
    dv_delivery.add(f"D{feature_start}:D{feature_end}")

    dv_ai = DataValidation(type="list", formula1='"沿用默认,不需要,可选,建议,必须"', allow_blank=True)
    ws_feature.add_data_validation(dv_ai)
    dv_ai.add(f"E{feature_start}:E{feature_end}")

    for ws in wb.worksheets:
        ws.sheet_view.showGridLines = False
        for row in ws.iter_rows():
            for cell in row:
                cell.alignment = Alignment(horizontal=cell.alignment.horizontal or "left", vertical="center", wrap_text=True)

    wb.save(OUT)
    return OUT


if __name__ == "__main__":
    print(main())
