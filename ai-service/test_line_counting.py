#!/usr/bin/env python3
"""
Unit test สำหรับ LineCounter — ตรวจ logic การข้ามเส้น/นับทิศ/กันนับซ้ำ
รันเร็ว ไม่ต้องโหลด YOLO:  python test_line_counting.py
"""
from line_counter import LineCounter

passed = 0
failed = 0


def check(name, cond):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        print(f"  ❌ {name}")


# เส้นแนวตั้งที่ x=300 (จาก (300,0) ถึง (300,600)) → ฝั่งซ้าย=A(-), ขวา=B(+)
def new_counter():
    return LineCounter((300, 0), (300, 600), deadzone_px=8.0, invert=False)


print("1) คนเดินซ้าย→ขวา (A→B) = เข้า (in)")
c = new_counter()
for x in (100, 200, 290, 310, 400, 500):
    c.update(track_id=1, px=x, py=300)
check("in=1", c.in_count == 1)
check("out=0", c.out_count == 0)

print("2) คนเดินขวา→ซ้าย (B→A) = ออก (out)")
c = new_counter()
for x in (500, 400, 310, 290, 200, 100):
    c.update(track_id=2, px=x, py=300)
check("out=1", c.out_count == 1)
check("in=0", c.in_count == 0)

print("3) อยู่ฝั่งเดิมตลอด = ไม่นับ")
c = new_counter()
for x in (100, 150, 200, 120):
    c.update(track_id=3, px=x, py=300)
check("in=0 out=0", c.in_count == 0 and c.out_count == 0)

print("4) สั่นไปมาในเส้น deadzone = ไม่นับซ้ำ")
c = new_counter()
for x in (305, 298, 302, 297, 303):  # คร่อมเส้น ±ภายใน deadzone(8px)
    c.update(track_id=4, px=x, py=300)
check("in=0 out=0 (กันสั่น)", c.in_count == 0 and c.out_count == 0)

print("5) คนเดียวข้ามจริง 1 ครั้ง ไม่นับซ้ำแม้มีหลายเฟรมหลังข้าม")
c = new_counter()
for x in (100, 320, 350, 360, 370):  # ข้าม 1 ครั้งแล้วอยู่ฝั่งขวา
    c.update(track_id=5, px=x, py=300)
check("in=1 (ครั้งเดียว)", c.in_count == 1)

print("6) ข้ามไป-กลับ นับทั้ง in และ out")
c = new_counter()
for x in (100, 400, 100):  # ซ้าย→ขวา→ซ้าย
    c.update(track_id=6, px=x, py=300)
check("in=1 out=1", c.in_count == 1 and c.out_count == 1)

print("7) สองคนแยก ID ข้ามคนละทิศ")
c = new_counter()
for x in (100, 500):
    c.update(track_id=10, px=x, py=300)   # in
for x in (500, 100):
    c.update(track_id=11, px=x, py=300)   # out
check("in=1 out=1 (แยก track)", c.in_count == 1 and c.out_count == 1)

print("8) invert_direction สลับทิศ")
c = LineCounter((300, 0), (300, 600), deadzone_px=8.0, invert=True)
for x in (100, 500):  # A→B ปกติ=in แต่ invert → out
    c.update(track_id=20, px=x, py=300)
check("out=1 (invert)", c.out_count == 1 and c.in_count == 0)

print(f"\nผลรวม: ผ่าน {passed} / ล้มเหลว {failed}")
exit(1 if failed else 0)
