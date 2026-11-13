#!/usr/bin/env python3
"""Export the current i18n registry to a temporary CSV for the local workbench.

This is read-only with respect to the source workbook.
"""
from __future__ import annotations

import argparse
import csv
import tempfile
from pathlib import Path

from openpyxl import load_workbook


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_WORKBOOK = ROOT / "outputs" / "01a1a5d6-2784-7eb0-9310-cc0f0d8bb4b9" / "i18n_text_inventory.xlsx"
DEFAULT_OUTPUT = Path(tempfile.gettempdir()) / "shellbreak_i18n_workbench.csv"
SHEET_NAME = "文案底表"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbook", type=Path, default=DEFAULT_WORKBOOK)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    workbook = load_workbook(args.workbook, read_only=True, data_only=True)
    try:
        if SHEET_NAME not in workbook.sheetnames:
            raise SystemExit(f"找不到工作表：{SHEET_NAME}")
        sheet = workbook[SHEET_NAME]
        args.output.parent.mkdir(parents=True, exist_ok=True)
        with args.output.open("w", newline="", encoding="utf-8-sig") as output:
            writer = csv.writer(output, dialect="excel", lineterminator="\n")
            rows = sheet.iter_rows(values_only=True)
            count = 0
            for row in rows:
                writer.writerow(["" if value is None else value for value in row])
                count += 1
    finally:
        workbook.close()

    print(f"已导出 {max(0, count - 1)} 行：{args.output}")
    print("原始 Excel 只读，未修改。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
