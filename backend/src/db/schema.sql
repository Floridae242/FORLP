-- =====================================================
-- Kad Kong Ta Smart Insight - Database Schema (Minimal)
-- ระบบติดตามอัจฉริยะ ถนนคนเดินกาดก้องตา
-- Version: 2.0 - Simplified
-- =====================================================

-- Zone Configuration (โซนหลัก A, B, C เท่านั้น)
CREATE TABLE IF NOT EXISTS zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_code VARCHAR(10) UNIQUE NOT NULL,      -- A, B, C
  zone_name VARCHAR(100) NOT NULL,
  description TEXT,
  capacity INTEGER DEFAULT 500,               -- ความจุสูงสุด (คน)
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Seed initial zones (ถนนคนเดิน Zone A/B/C เท่านั้น)
INSERT OR IGNORE INTO zones (zone_code, zone_name, description, capacity) VALUES
  ('A', 'โซน A - ทางเข้าหลัก', 'บริเวณทางเข้าหลักถนนคนเดิน', 500),
  ('B', 'โซน B - ตลาดกลาง', 'บริเวณตลาดกลางถนนคนเดิน', 800),
  ('C', 'โซน C - โซนอาหาร', 'บริเวณศูนย์อาหารและเวที', 600);

-- People Counts (บันทึกจำนวนคนตาม Zone)
CREATE TABLE IF NOT EXISTS people_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  zone_code VARCHAR(10) NOT NULL,             -- A, B, C
  people_count INTEGER DEFAULT 0,
  recorded_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (zone_code) REFERENCES zones(zone_code)
);

CREATE INDEX IF NOT EXISTS idx_people_counts_zone ON people_counts(zone_code);
CREATE INDEX IF NOT EXISTS idx_people_counts_recorded ON people_counts(recorded_at);

-- Daily Reports (สรุปข้อมูลรายวัน)
CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL UNIQUE,           -- YYYY-MM-DD
  zone_a_total INTEGER DEFAULT 0,             -- รวมคน Zone A ทั้งวัน
  zone_a_peak INTEGER DEFAULT 0,              -- สูงสุด Zone A
  zone_b_total INTEGER DEFAULT 0,             -- รวมคน Zone B ทั้งวัน
  zone_b_peak INTEGER DEFAULT 0,              -- สูงสุด Zone B
  zone_c_total INTEGER DEFAULT 0,             -- รวมคน Zone C ทั้งวัน
  zone_c_peak INTEGER DEFAULT 0,              -- สูงสุด Zone C
  weather_summary TEXT,                       -- สรุปสภาพอากาศ
  temperature_avg REAL,                       -- อุณหภูมิเฉลี่ย
  pm25_avg REAL,                              -- PM2.5 เฉลี่ย
  pm25_max REAL,                              -- PM2.5 สูงสุด
  pm25_level TEXT,                            -- ระดับคุณภาพอากาศ
  is_sent_line INTEGER DEFAULT 0,             -- ส่ง LINE แล้วหรือยัง
  sent_line_at TEXT,                          -- เวลาที่ส่ง LINE
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);

-- LINE Broadcast Logs (บันทึกการส่ง LINE)
CREATE TABLE IF NOT EXISTS line_broadcast_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT NOT NULL,
  message_content TEXT,
  status TEXT DEFAULT 'pending',              -- pending, sent, failed
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default settings
INSERT OR IGNORE INTO system_settings (setting_key, setting_value, description) VALUES
  ('daily_report_time', '18:00', 'เวลาสรุปข้อมูลและส่ง LINE ประจำวัน'),
  ('polling_interval', '60', 'ความถี่ในการดึงข้อมูล (วินาที)'),
  ('mock_mode', 'true', 'โหมด Mock Data สำหรับ Demo');
