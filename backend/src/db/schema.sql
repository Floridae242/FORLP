-- People Counts (บันทึกจำนวนคนรวมทั้งหมด - ไม่แยก Zone)
CREATE TABLE IF NOT EXISTS people_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  count INTEGER NOT NULL DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  source TEXT DEFAULT 'ai'
);

CREATE INDEX IF NOT EXISTS idx_people_counts_date 
ON people_counts(DATE(recorded_at));

CREATE INDEX IF NOT EXISTS idx_people_counts_hour 
ON people_counts(strftime('%Y-%m-%d %H', recorded_at));

-- Daily Reports (สรุปข้อมูลรายวัน + สภาพอากาศ + PM2.5)
CREATE TABLE IF NOT EXISTS daily_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT UNIQUE NOT NULL,
  -- ข้อมูลจำนวนคน (รวมทุกกล้อง)
  max_people INTEGER DEFAULT 0,
  avg_people REAL DEFAULT 0,
  min_people INTEGER DEFAULT 0,
  total_samples INTEGER DEFAULT 0,
  -- ข้อมูลสภาพอากาศ
  weather_summary TEXT,
  temperature_avg REAL,
  humidity_avg REAL,
  -- ข้อมูล PM2.5
  pm25_avg REAL,
  pm25_max REAL,
  pm25_status TEXT,  -- ดี / ปานกลาง / เสี่ยง
  -- สถานะการส่ง LINE
  is_sent_line INTEGER DEFAULT 0,
  sent_line_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);

-- LINE Broadcast Logs (บันทึกการส่ง LINE)
CREATE TABLE IF NOT EXISTS line_broadcast_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_date TEXT,
  message_type TEXT DEFAULT 'daily_report',  -- daily_report / early_warning
  message_content TEXT,
  status TEXT DEFAULT 'pending',  -- pending / sent / failed
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_line_logs_date ON line_broadcast_logs(report_date);
CREATE INDEX IF NOT EXISTS idx_line_logs_type ON line_broadcast_logs(message_type);

-- System Settings
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default settings
INSERT OR IGNORE INTO system_settings (setting_key, setting_value) VALUES 
    ('polling_interval', '300000'),
    ('ai_service_url', 'http://localhost:8000'),
    ('line_enabled', 'true'),
    ('early_warning_time', '14:00'),
    ('daily_report_time', '23:00');
