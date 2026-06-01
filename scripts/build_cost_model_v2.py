from __future__ import annotations

import json
import urllib.request
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / "智慧安防_成本选型逻辑模型_v2.xlsx"
BASE_URL = "http://localhost:4173"

NAVY = "07182B"
BLUE = "2563EB"
TEAL = "00A88E"
PALE = "F6FAFB"
INPUT = "FFF8E1"
OUTPUT = "EAF7FF"
HEADER = "07182B"
LINE = "D9E3EA"


def fetch_json(path: str) -> dict:
    with urllib.request.urlopen(f"{BASE_URL}{path}", timeout=10) as response:
        return json.load(response)


def style_cell(cell, fill=None, bold=False, color=NAVY, size=10, align="left"):
    thin = Side(style="thin", color=LINE)
    cell.font = Font(name="Microsoft YaHei", bold=bold, color=color, size=size)
    if fill:
        cell.fill = PatternFill("solid", fgColor=fill)
    cell.border = Border(left=thin, right=thin, top=thin, bottom=thin)
    cell.alignment = Alignment(horizontal=align, vertical="center", wrap_text=True)


def set_widths(ws, widths):
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width


def add_headers(ws, headers):
    ws.append(headers)
    for cell in ws[1]:
        style_cell(cell, fill=HEADER, bold=True, color="FFFFFF", align="center")
    ws.freeze_panes = "A2"


def style_range(ws, max_row=None, max_col=None):
    max_row = max_row or ws.max_row
    max_col = max_col or ws.max_column
    for row in ws.iter_rows(min_row=2, max_row=max_row, min_col=1, max_col=max_col):
        for cell in row:
            if cell.value is not None:
                style_cell(cell, fill="FFFFFF")


def policy_cn(policy: str) -> str:
    return {
        "none": "不需要",
        "optional": "可选",
        "suggested": "建议",
        "required": "必须",
    }.get(policy, "可选")


def rule_cost(workload: str) -> int:
    return {
        "light": 1000,
        "medium": 1800,
        "heavy": 3000,
        "custom": 5000,
    }.get(workload, 1800)


def sample_cost(workload: str, base_cost: int) -> int:
    floor = {
        "light": 2000,
        "medium": 3500,
        "heavy": 6000,
        "custom": 12000,
    }.get(workload, 3500)
    return max(floor, round(base_cost * 0.55 / 100) * 100)


def custom_cost(workload: str, base_cost: int) -> int:
    floor = {
        "light": 16000,
        "medium": 24000,
        "heavy": 36000,
        "custom": 50000,
    }.get(workload, 24000)
    return max(floor, round(base_cost * 2.4 / 100) * 100)


def main():
    catalog = fetch_json("/api/catalog")
    sizing_catalog = fetch_json("/api/sizing/catalog")

    feature_costs = sizing_catalog["featureCostProfiles"]
    resolutions = sizing_catalog["resolutions"]
    hardware = sizing_catalog["hardwareProfiles"]

    wb = Workbook()
    wb.remove(wb.active)

    ws_overview = wb.create_sheet("01逻辑总览")
    ws_groups = wb.create_sheet("02摄像头组输入")
    ws_select = wb.create_sheet("03功能选择输入")
    ws_algo = wb.create_sheet("04算法成本画像")
    ws_video_param = wb.create_sheet("05视频融合参数")
    ws_calc = wb.create_sheet("06算法计算明细")
    ws_video_calc = wb.create_sheet("07视频融合明细")
    ws_summary = wb.create_sheet("08硬件与报价汇总")
    ws_param = wb.create_sheet("09参数-分辨率硬件")
    ws_notes = wb.create_sheet("10口径说明")

    # 01
    ws_overview["A1"] = "智慧安防成本选型逻辑模型 v2"
    ws_overview["A1"].font = Font(name="Microsoft YaHei", bold=True, size=18, color=NAVY)
    ws_overview["A3"] = "本表用于内部复盘：把客户需求拆成摄像头组、功能算法、视频接入融合、硬件承载和报价口径。客户共通且差异不大的平台能力，统一放到标准成本，不再逐项拆散。"
    ws_overview.merge_cells("A3:H4")
    ws_overview["A3"].alignment = Alignment(wrap_text=True)
    ws_overview.append([])
    add_headers(ws_overview, ["层级", "解决什么问题", "主要影响成本", "本表对应页"])
    for row in [
        ["1 摄像头组", "有多少路视频、分辨率多高、是否同型号同用途", "硬件路数、解码压力、融合工作量", "02"],
        ["2 功能算法", "每组摄像头到底要识别什么", "算法算力、标准算法包、规则配置、样本微调/新研发", "03/04/06"],
        ["3 视频融合", "不同协议、不同厂商、历史平台是否能统一接入和输出", "协议适配、转码分发、对接调试、融合算力", "05/07"],
        ["4 硬件承载", "总路数和总算力是否够，是否需要单机或多节点", "买断成本、月付成本、后续扩容风险", "08/09"],
        ["5 报价口径", "哪些是固定成本，哪些按量收", "硬件、研发适配、算法运维、标准平台、AI token", "08/10"],
    ]:
        ws_overview.append(row)
    style_range(ws_overview)
    set_widths(ws_overview, [18, 34, 34, 18, 14, 14, 14, 14])

    # 02
    add_headers(
        ws_groups,
        ["组编号", "摄像头组名称", "摄像头路数", "分辨率", "厂商/型号", "接入方式", "接入复杂度", "输出/融合要求", "位置/用途备注"],
    )
    group_rows = [
        ["G01", "生产车间摄像头", 48, "1080P", "海康", "RTSP", "标准IP流", "标准平台预览", "安全帽、工服、抽烟、危险区域"],
        ["G02", "仓库摄像头", 36, "1080P", "海康/大华混合", "GB28181/NVR", "NVR/国标汇聚", "多端预览/大屏/移动端", "通道占用、消防通道、货物堆放"],
        ["G03", "园区周界摄像头", 28, "2K", "大华", "ONVIF", "标准IP流", "标准平台预览", "周界入侵、夜间越线"],
        ["G04", "门岗车辆摄像头", 12, "4K", "宇视", "厂商SDK", "厂商SDK/API", "第三方系统/API输出", "车辆识别、违停、停留超时"],
        ["G05", "历史老旧摄像头", 20, "混合", "不清楚", "私有协议", "老旧平台/私有协议", "多格式转码/分发", "需现场确认能否稳定取流"],
    ]
    for row in group_rows:
        ws_groups.append(row)
    for r in range(7, 101):
        ws_groups.cell(r, 1, f"G{r-1:02d}")
    for row in range(2, 101):
        for col in range(2, 10):
            ws_groups.cell(row, col).fill = PatternFill("solid", fgColor=INPUT)
    style_range(ws_groups, 100, 9)
    set_widths(ws_groups, [10, 22, 12, 12, 18, 16, 20, 22, 32])

    # 03
    add_headers(ws_select, ["组编号", "功能ID", "功能名称", "交付口径", "AI研判策略", "备注"])
    selections = [
        ["G01", "helmet", "", "标准算法", "沿用算法画像", ""],
        ["G01", "vest", "", "标准算法", "沿用算法画像", ""],
        ["G01", "smoking", "", "样本微调", "建议", ""],
        ["G01", "danger-zone", "", "场景规则配置", "沿用算法画像", ""],
        ["G02", "cargo-block", "", "场景规则配置", "沿用算法画像", ""],
        ["G02", "channel-block", "", "场景规则配置", "沿用算法画像", ""],
        ["G02", "fire-lane-block", "", "场景规则配置", "沿用算法画像", ""],
        ["G02", "smoke", "", "样本微调", "建议", ""],
        ["G03", "perimeter-intrusion", "", "场景规则配置", "沿用算法画像", ""],
        ["G03", "line-crossing", "", "标准算法", "沿用算法画像", ""],
        ["G03", "night-intrusion", "", "样本微调", "建议", ""],
        ["G04", "plate", "", "标准算法", "不需要", ""],
        ["G04", "illegal-parking", "", "场景规则配置", "沿用算法画像", ""],
        ["G04", "vehicle-stay", "", "场景规则配置", "沿用算法画像", ""],
        ["G05", "custom", "", "新目标定制", "必须", "历史摄像头识别效果需现场验证"],
    ]
    for row in selections:
        ws_select.append(row)
    for row in range(2, 201):
        ws_select.cell(row, 3, f'=IFERROR(VLOOKUP(B{row},\'04算法成本画像\'!$A:$N,2,FALSE),"")')
        for col in [1, 2, 4, 5, 6]:
            ws_select.cell(row, col).fill = PatternFill("solid", fgColor=INPUT)
    style_range(ws_select, 200, 6)
    set_widths(ws_select, [10, 20, 24, 18, 18, 30])

    # 04
    add_headers(
        ws_algo,
        [
            "功能ID",
            "功能名称",
            "类别",
            "算法族",
            "功能复杂度",
            "1080P单路算力",
            "标准算法包/接入成本",
            "每组规则配置成本",
            "样本验证/微调成本",
            "新目标研发成本",
            "月度算法运维",
            "默认AI策略",
            "单路日AI事件量",
            "成本口径说明",
        ],
    )
    for item in feature_costs:
        base_cost = int(item["one_time_dev_cost"])
        workload = item["workload_level"]
        ws_algo.append(
            [
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
                "标准算法包按功能计一次；规则配置按摄像头组计；样本微调/新目标研发按项目判断。",
            ]
        )
    for row in range(2, ws_algo.max_row + 1):
        for col in range(6, 14):
            ws_algo.cell(row, col).fill = PatternFill("solid", fgColor=INPUT)
    style_range(ws_algo)
    set_widths(ws_algo, [22, 24, 18, 18, 14, 14, 18, 18, 18, 18, 16, 14, 16, 40])

    # 05 video fusion parameters
    ws_video_param["A1"] = "接入复杂度参数"
    ws_video_param["A1"].font = Font(name="Microsoft YaHei", bold=True, size=14, color=NAVY)
    ws_video_param.append([])
    headers_access = ["接入复杂度", "视频融合单路算力", "每组适配成本", "每路接入成本", "每路月度维护", "复杂度倍率", "说明"]
    ws_video_param.append(headers_access)
    for cell in ws_video_param[3]:
        style_cell(cell, fill=HEADER, bold=True, color="FFFFFF", align="center")
    access_rows = [
        ["标准IP流", 0.12, 800, 40, 5, 1.00, "RTSP/ONVIF 等常规接入"],
        ["NVR/国标汇聚", 0.18, 1500, 60, 8, 1.10, "NVR、GB28181 或已有平台汇聚"],
        ["厂商SDK/API", 0.25, 5000, 100, 12, 1.25, "需要厂商 SDK、平台 API 或权限联调"],
        ["老旧平台/私有协议", 0.35, 12000, 160, 18, 1.45, "老系统、私有协议、稳定性不确定"],
        ["多协议混合/待确认", 0.30, 8000, 120, 15, 1.35, "客户无法确认时的保守口径"],
    ]
    for row in access_rows:
        ws_video_param.append(row)
    start_output = 11
    ws_video_param.cell(start_output, 1, "输出/融合要求参数")
    ws_video_param.cell(start_output, 1).font = Font(name="Microsoft YaHei", bold=True, size=14, color=NAVY)
    output_header_row = start_output + 2
    headers_output = ["输出/融合要求", "项目级输出成本", "每路输出成本", "每路月度维护", "说明"]
    for col, value in enumerate(headers_output, start=1):
        c = ws_video_param.cell(output_header_row, col, value)
        style_cell(c, fill=HEADER, bold=True, color="FFFFFF", align="center")
    output_rows = [
        ["标准平台预览", 0, 0, 0, "只进入本系统平台，不做额外分发"],
        ["多端预览/大屏/移动端", 3000, 20, 8, "PC、大屏、移动端等多端输出"],
        ["多格式转码/分发", 8000, 50, 12, "RTSP/RTMP/WebRTC/HLS 等多格式输出"],
        ["第三方系统/API输出", 12000, 30, 10, "给外部平台、工单、安防平台等同步"],
        ["不清楚/待确认", 6000, 30, 8, "需求未清时预留集成成本"],
    ]
    for row in output_rows:
        ws_video_param.append(row)
    style_range(ws_video_param)
    set_widths(ws_video_param, [24, 18, 18, 16, 16, 14, 40])

    # 09 params
    ws_param["A1"] = "分辨率参数"
    ws_param["A1"].font = Font(name="Microsoft YaHei", bold=True, size=14, color=NAVY)
    ws_param.append([])
    ws_param.append(["分辨率", "算力倍率", "说明"])
    for cell in ws_param[3]:
        style_cell(cell, fill=HEADER, bold=True, color="FFFFFF", align="center")
    for item in resolutions:
        ws_param.append([item["name"], item["compute_multiplier"], item.get("notes", "")])
    hw_start = 12
    ws_param.cell(hw_start, 1, "硬件档位参数")
    ws_param.cell(hw_start, 1).font = Font(name="Microsoft YaHei", bold=True, size=14, color=NAVY)
    hw_header = hw_start + 2
    hw_headers = ["硬件ID", "硬件名称", "可承载算力", "建议最大路数", "买断成本", "月付成本", "CPU", "GPU", "内存", "说明", "是否满足当前需求"]
    for col, value in enumerate(hw_headers, start=1):
        c = ws_param.cell(hw_header, col, value)
        style_cell(c, fill=HEADER, bold=True, color="FFFFFF", align="center")
    for idx, item in enumerate(hardware, start=hw_header + 1):
        ws_param.cell(idx, 1, item["id"])
        ws_param.cell(idx, 2, item["name"])
        ws_param.cell(idx, 3, item["capacity_units"])
        ws_param.cell(idx, 4, item["recommended_max_streams"])
        ws_param.cell(idx, 5, item["purchase_cost"])
        ws_param.cell(idx, 6, item["monthly_cost"])
        ws_param.cell(idx, 7, item.get("cpu", ""))
        ws_param.cell(idx, 8, item.get("gpu", ""))
        ws_param.cell(idx, 9, item.get("memory", ""))
        ws_param.cell(idx, 10, item.get("notes", ""))
        ws_param.cell(idx, 11, f'=IF(AND(C{idx}>=\'08硬件与报价汇总\'!$B$15,D{idx}>=\'08硬件与报价汇总\'!$B$9),1,0)')
    style_range(ws_param)
    set_widths(ws_param, [18, 22, 14, 14, 14, 14, 16, 18, 14, 34, 18])

    # 06 algorithm calculation
    add_headers(
        ws_calc,
        [
            "序号",
            "组编号",
            "摄像头组名称",
            "路数",
            "分辨率",
            "功能ID",
            "功能名称",
            "交付口径",
            "分辨率倍率",
            "单路算力",
            "本项算法算力",
            "唯一功能标记",
            "算法包/研发成本",
            "本组规则配置成本",
            "月度算法运维",
            "最终AI策略",
            "本项日AI事件量",
            "备注",
        ],
    )
    delivery_multiplier = 'IF(H{r}="标准算法",1,IF(H{r}="场景规则配置",1.5,IF(H{r}="样本微调",1.8,IF(H{r}="新目标定制",2,IF(H{r}="仅AI研判",0.8,1)))))'
    for row in range(2, 201):
        ws_calc.cell(row, 1, row - 1)
        ws_calc.cell(row, 2, f"='03功能选择输入'!A{row}")
        ws_calc.cell(row, 3, f'=IFERROR(VLOOKUP(B{row},\'02摄像头组输入\'!$A:$I,2,FALSE),"")')
        ws_calc.cell(row, 4, f'=IFERROR(VLOOKUP(B{row},\'02摄像头组输入\'!$A:$I,3,FALSE),0)')
        ws_calc.cell(row, 5, f'=IFERROR(VLOOKUP(B{row},\'02摄像头组输入\'!$A:$I,4,FALSE),"")')
        ws_calc.cell(row, 6, f"='03功能选择输入'!B{row}")
        ws_calc.cell(row, 7, f'=IFERROR(VLOOKUP(F{row},\'04算法成本画像\'!$A:$N,2,FALSE),"")')
        ws_calc.cell(row, 8, f"='03功能选择输入'!D{row}")
        ws_calc.cell(row, 9, f'=IFERROR(VLOOKUP(E{row},\'09参数-分辨率硬件\'!$A:$C,2,FALSE),1)')
        ws_calc.cell(row, 10, f'=IFERROR(VLOOKUP(F{row},\'04算法成本画像\'!$A:$N,6,FALSE),0)')
        ws_calc.cell(row, 11, f'=IF(F{row}="",0,IF(H{row}="仅AI研判",D{row}*I{row}*0.25,D{row}*I{row}*J{row}))')
        ws_calc.cell(row, 12, f'=IF(F{row}="",0,IF(COUNTIF($F$2:F{row},F{row})=1,1,0))')
        ws_calc.cell(
            row,
            13,
            f'=IF(L{row}=0,0,IF(H{row}="新目标定制",VLOOKUP(F{row},\'04算法成本画像\'!$A:$N,10,FALSE),IF(H{row}="样本微调",VLOOKUP(F{row},\'04算法成本画像\'!$A:$N,7,FALSE)+VLOOKUP(F{row},\'04算法成本画像\'!$A:$N,9,FALSE),IF(H{row}="仅AI研判",\'08硬件与报价汇总\'!$B$4,VLOOKUP(F{row},\'04算法成本画像\'!$A:$N,7,FALSE)))))',
        )
        ws_calc.cell(row, 14, f'=IF(F{row}="",0,VLOOKUP(F{row},\'04算法成本画像\'!$A:$N,8,FALSE)*{delivery_multiplier.format(r=row)})')
        ws_calc.cell(row, 15, f'=IF(L{row}=1,VLOOKUP(F{row},\'04算法成本画像\'!$A:$N,11,FALSE),0)')
        ws_calc.cell(row, 16, f'=IF(\'03功能选择输入\'!E{row}="沿用算法画像",IFERROR(VLOOKUP(F{row},\'04算法成本画像\'!$A:$N,12,FALSE),"可选"),\'03功能选择输入\'!E{row})')
        ws_calc.cell(row, 17, f'=IF(OR(P{row}="建议",P{row}="必须"),D{row}*VLOOKUP(F{row},\'04算法成本画像\'!$A:$N,13,FALSE),0)')
    style_range(ws_calc, 200, 18)
    set_widths(ws_calc, [8, 10, 20, 10, 12, 20, 24, 16, 12, 12, 14, 12, 18, 18, 16, 14, 16, 24])

    # 07 video fusion calculation
    add_headers(
        ws_video_calc,
        ["组编号", "摄像头组名称", "路数", "分辨率", "接入复杂度", "输出/融合要求", "分辨率倍率", "视频融合算力", "接入适配成本", "输出融合成本", "月度融合维护", "说明"],
    )
    for row in range(2, 101):
        ws_video_calc.cell(row, 1, f"='02摄像头组输入'!A{row}")
        ws_video_calc.cell(row, 2, f"='02摄像头组输入'!B{row}")
        ws_video_calc.cell(row, 3, f"='02摄像头组输入'!C{row}")
        ws_video_calc.cell(row, 4, f"='02摄像头组输入'!D{row}")
        ws_video_calc.cell(row, 5, f"='02摄像头组输入'!G{row}")
        ws_video_calc.cell(row, 6, f"='02摄像头组输入'!H{row}")
        ws_video_calc.cell(row, 7, f'=IFERROR(VLOOKUP(D{row},\'09参数-分辨率硬件\'!$A:$C,2,FALSE),1)')
        ws_video_calc.cell(row, 8, f'=IF(B{row}="",0,C{row}*G{row}*VLOOKUP(E{row},\'05视频融合参数\'!$A$4:$G$8,2,FALSE))')
        ws_video_calc.cell(row, 9, f'=IF(B{row}="",0,VLOOKUP(E{row},\'05视频融合参数\'!$A$4:$G$8,3,FALSE)+C{row}*VLOOKUP(E{row},\'05视频融合参数\'!$A$4:$G$8,4,FALSE))')
        ws_video_calc.cell(row, 10, f'=IF(B{row}="",0,IF(COUNTIF($F$2:F{row},F{row})=1,VLOOKUP(F{row},\'05视频融合参数\'!$A$14:$E$18,2,FALSE),0)+C{row}*VLOOKUP(F{row},\'05视频融合参数\'!$A$14:$E$18,3,FALSE))')
        ws_video_calc.cell(row, 11, f'=IF(B{row}="",0,C{row}*VLOOKUP(E{row},\'05视频融合参数\'!$A$4:$G$8,5,FALSE)+C{row}*VLOOKUP(F{row},\'05视频融合参数\'!$A$14:$E$18,4,FALSE))')
    style_range(ws_video_calc, 100, 12)
    set_widths(ws_video_calc, [10, 22, 10, 12, 20, 24, 12, 14, 16, 16, 16, 30])

    # 08 summary
    ws_summary["A1"] = "硬件与报价汇总"
    ws_summary["A1"].font = Font(name="Microsoft YaHei", bold=True, size=18, color=NAVY)
    ws_summary["A3"] = "可调整参数"
    ws_summary["A3"].font = Font(name="Microsoft YaHei", bold=True, color=TEAL)
    summary_rows = [
        ["安全余量系数", 1.25, "给硬件留余量，避免后续补硬件困难"],
        ["标准平台一次性成本", 20000, "事件闭环、报表、多端提醒等默认都给，差异不大时放这里"],
        ["标准平台月度成本", 1500, "标准平台维护、基础运维"],
        ["AI Agent/大模型接入标准成本", 12000, "本地小模型/线上API接入框架、提示词与规则，不含token"],
        ["", "", ""],
        ["总摄像头路数", "=SUM('02摄像头组输入'!C2:C100)", "硬件选型硬约束"],
        ["已选择功能行数", '=COUNTIF(\'03功能选择输入\'!B2:B200,"<>")', "客户真正选择了多少项需求"],
        ["唯一功能数量", "=SUM('06算法计算明细'!L2:L200)", "算法包/研发成本通常按唯一功能计"],
        ["算法总算力", "=SUM('06算法计算明细'!K2:K200)", "由功能、路数、分辨率共同决定"],
        ["视频融合总算力", "=SUM('07视频融合明细'!H2:H100)", "由接入复杂度、分辨率和路数共同决定"],
        ["基础总算力", "=B12+B13", "算法算力 + 视频融合算力"],
        ["预留后所需算力", "=B14*B4", "用于硬件选型"],
        ["预计AI事件量/月", "=SUM('06算法计算明细'!Q2:Q200)*30", "用于后续token/API服务包，不进固定成本"],
        ["", "", ""],
        ["推荐硬件ID", '=INDEX(\'09参数-分辨率硬件\'!A15:A30,MATCH(1,\'09参数-分辨率硬件\'!K15:K30,0))', "同时满足路数和算力的第一档硬件"],
        ["推荐硬件名称", '=VLOOKUP(B18,\'09参数-分辨率硬件\'!A:K,2,FALSE)', ""],
        ["集群节点数", '=IF(B18="cluster",CEILING(B15/VLOOKUP("edge-pro",\'09参数-分辨率硬件\'!A:C,3,FALSE),1),1)', "超过单机时按高性能节点估算"],
        ["硬件买断成本", '=IF(B18="cluster",B20*VLOOKUP("edge-pro",\'09参数-分辨率硬件\'!A:E,5,FALSE),VLOOKUP(B18,\'09参数-分辨率硬件\'!A:E,5,FALSE))', ""],
        ["硬件月付成本", '=IF(B18="cluster",B20*VLOOKUP("edge-pro",\'09参数-分辨率硬件\'!A:F,6,FALSE),VLOOKUP(B18,\'09参数-分辨率硬件\'!A:F,6,FALSE))', ""],
        ["", "", ""],
        ["算法包/研发成本", "=SUM('06算法计算明细'!M2:M200)", "唯一功能计一次"],
        ["摄像头组规则配置成本", "=SUM('06算法计算明细'!N2:N200)", "每组每功能都可能要ROI、阈值、规则调试"],
        ["月度算法运维成本", "=SUM('06算法计算明细'!O2:O200)", "按唯一功能计"],
        ["视频接入适配成本", "=SUM('07视频融合明细'!I2:I100)", "协议、平台、NVR、SDK等接入适配"],
        ["视频输出融合成本", "=SUM('07视频融合明细'!J2:J100)", "多端、多格式、第三方输出"],
        ["月度视频融合维护", "=SUM('07视频融合明细'!K2:K100)", ""],
        ["", "", ""],
        ["固定买断合计", "=B21+B24+B25+B27+B28+B5+B7", "硬件买断 + 研发适配 + 标准平台 + AI Agent框架"],
        ["固定月付合计", "=B22+B26+B29+B6", "硬件月付 + 月度算法运维 + 视频融合维护 + 标准平台月费"],
        ["AI token/API费用", "按量或服务包另计", "不进入固定成本，按事件量和模型策略单独测算"],
    ]
    for row in summary_rows:
        ws_summary.append(row)
    for row in range(4, 8):
        ws_summary.cell(row, 2).fill = PatternFill("solid", fgColor=INPUT)
    for row in range(9, ws_summary.max_row + 1):
        if ws_summary.cell(row, 2).value not in ("", None):
            ws_summary.cell(row, 2).fill = PatternFill("solid", fgColor=OUTPUT)
    for row in ws_summary.iter_rows(min_row=4, max_row=ws_summary.max_row, min_col=1, max_col=3):
        for cell in row:
            style_cell(cell, fill=cell.fill.fgColor.rgb[-6:] if cell.fill and cell.fill.fill_type == "solid" else "FFFFFF")
    set_widths(ws_summary, [28, 26, 54])

    # 10 notes
    add_headers(ws_notes, ["主题", "口径"])
    for row in [
        ["为什么加入视频融合层", "不同厂商、协议、NVR、SDK、老旧平台会直接影响研发适配和解码/转码压力，不能只按算法算。"],
        ["为什么算法成本拆成三段", "标准算法包按功能计一次；每个摄像头组仍需规则配置；样本微调或新目标研发按实际难度追加。"],
        ["为什么硬件同时看路数和算力", "路数影响取流、解码和稳定性；算法复杂度和分辨率影响GPU/AI算力，两者任何一个超限都会造成后期扩容困难。"],
        ["哪些内容不细拆", "事件闭环、报表、多端提醒、基础账号权限等默认平台能力，差异不大时只放到标准平台成本。"],
        ["AI token/API怎么处理", "token/API按事件量、模型类型和调用次数做服务包或按量计费，不混入一次性固定报价。"],
        ["下一步校准", "用已完成大厂区项目复盘：每类算法实际占用、每类接入方式工期、硬件真实承载上限和安全余量。"],
    ]:
        ws_notes.append(row)
    style_range(ws_notes)
    set_widths(ws_notes, [24, 80])

    # validations
    dv_res = DataValidation(type="list", formula1="'09参数-分辨率硬件'!$A$4:$A$9", allow_blank=True)
    ws_groups.add_data_validation(dv_res)
    dv_res.add("D2:D100")
    dv_access = DataValidation(type="list", formula1="'05视频融合参数'!$A$4:$A$8", allow_blank=True)
    ws_groups.add_data_validation(dv_access)
    dv_access.add("G2:G100")
    dv_output = DataValidation(type="list", formula1="'05视频融合参数'!$A$14:$A$18", allow_blank=True)
    ws_groups.add_data_validation(dv_output)
    dv_output.add("H2:H100")
    dv_delivery = DataValidation(type="list", formula1='"标准算法,场景规则配置,样本微调,新目标定制,仅AI研判"', allow_blank=True)
    ws_select.add_data_validation(dv_delivery)
    dv_delivery.add("D2:D200")
    dv_ai = DataValidation(type="list", formula1='"沿用算法画像,不需要,可选,建议,必须"', allow_blank=True)
    ws_select.add_data_validation(dv_ai)
    dv_ai.add("E2:E200")

    for ws in wb.worksheets:
        ws.sheet_view.showGridLines = False
        for row in ws.iter_rows():
            for cell in row:
                cell.alignment = Alignment(horizontal=cell.alignment.horizontal or "left", vertical="center", wrap_text=True)

    wb.save(OUT)
    return OUT


if __name__ == "__main__":
    print(main())
