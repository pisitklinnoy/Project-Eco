"""
Master Pipeline: Run Water Level Detection Across All 3 Stations
รันประมวลผลกล้อง CCTV ตรวจวัดระดับน้ำทั้ง 3 สถานีพร้อมกันในคำสั่งเดียว
และอัปเดตไฟล์ water_levels.xlsx โดยอัตโนมัติ
1. สถานีสะพานบ้านม่วงก็อง (X.173A)
2. สถานีสะพานบางศาลา (X.90)
3. สถานีสะพานหาดใหญ่นอก (X.44)
"""

import os
import sys
import argparse
import subprocess

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import openpyxl


def main():
    print("=" * 80)
    print("🌊 HATYAI FLOOD VISION — MASTER PIPELINE (ALL 3 STATIONS)")
    print("   ระบบตรวจวัดระดับน้ำอัตโนมัติจากกล้อง CCTV ครอบคลุม 3 สถานีหลักลุ่มน้ำคลองอู่ตะเภา")
    print("=" * 80)

    # 1. รันสถานีที่ 1: ม่วงก็อง
    print("\n▶️ [1/3] กำลังประมวลผล สถานีสะพานบ้านม่วงก็อง (X.173A)...")
    cmd1 = [sys.executable, os.path.join(BASE_DIR, "pipelines", "run_station1_muangkong.py")]
    subprocess.run(cmd1, check=True)

    # 2. รันสถานีที่ 2: บางศาลา
    print("\n▶️ [2/3] กำลังประมวลผล สถานีสะพานบางศาลา (X.90)...")
    cmd2 = [sys.executable, os.path.join(BASE_DIR, "pipelines", "run_station2_bangsala.py")]
    subprocess.run(cmd2, check=True)

    # 3. รันสถานีที่ 3: หาดใหญ่นอก
    print("\n▶️ [3/3] กำลังประมวลผล สถานีสะพานหาดใหญ่นอก (X.44)...")
    cmd3 = [sys.executable, os.path.join(BASE_DIR, "pipelines", "run_station3_hatyainai.py")]
    subprocess.run(cmd3, check=True)

    # อ่านและแสดงสรุปผลล่าสุดจาก Excel
    excel_path = os.path.join(BASE_DIR, "water_levels.xlsx")
    if os.path.exists(excel_path):
        wb = openpyxl.load_workbook(excel_path)
        ws = wb.active
        print("\n" + "=" * 80)
        print("📊 ตารางระดับน้ำล่าสุดที่บันทึกลง Excel (water_levels.xlsx):")
        print("=" * 80)
        rows = list(ws.iter_rows(values_only=True))
        if len(rows) > 0:
            header = rows[0]
            header_str = " | ".join(f"{str(h):^24}" for h in header)
            print(header_str)
            print("-" * len(header_str))
            # แสดง 5 แถวล่าสุด
            for r in rows[-5:]:
                if r == rows[0]:
                    continue
                row_str = " | ".join(f"{str(v) if v is not None else '-':^24}" for v in r)
                print(row_str)
        print("=" * 80)

    print("\n🎉 ประมวลผลเสร็จสมบูรณ์ทั้ง 3 สถานี!")


if __name__ == "__main__":
    main()
