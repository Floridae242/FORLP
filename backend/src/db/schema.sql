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

-- =====================================================
-- USER MANAGEMENT (ระบบจัดการผู้ใช้งาน)
-- =====================================================

-- Users Table (ข้อมูลผู้ใช้จาก LINE Login)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  line_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  picture_url TEXT,
  role TEXT DEFAULT 'visitor' CHECK(role IN ('vendor', 'resident', 'tourist', 'officer')),
  role_verified INTEGER DEFAULT 0,  -- 0 = ยังไม่ยืนยัน, 1 = ยืนยันแล้ว
  officer_token_used TEXT,  -- token ที่ใช้ยืนยันสิทธิ์เจ้าหน้าที่
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_line_id ON users(line_user_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- User LINE Tokens Table (เก็บ LINE Access/Refresh Tokens ฝั่ง Backend)
-- ตาม LINE Login v2.1 Security Best Practices
CREATE TABLE IF NOT EXISTS user_line_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  access_token_expires_at TEXT NOT NULL,
  refresh_token_expires_at TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_line_tokens_user ON user_line_tokens(user_id);

-- Officer Tokens Table (Token สำหรับยืนยันสิทธิ์เจ้าหน้าที่)
CREATE TABLE IF NOT EXISTS officer_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  description TEXT,  -- คำอธิบาย เช่น "สำหรับเจ้าหน้าที่เทศกิจ"
  is_used INTEGER DEFAULT 0,
  used_by_user_id INTEGER,
  used_at TEXT,
  expires_at TEXT,  -- วันหมดอายุ (NULL = ไม่หมดอายุ)
  created_by TEXT,  -- ผู้สร้าง token
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (used_by_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_officer_tokens_token ON officer_tokens(token);
CREATE INDEX IF NOT EXISTS idx_officer_tokens_used ON officer_tokens(is_used);

-- User Sessions Table (Session สำหรับจัดการ Login)
CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

-- Insert default officer tokens (สำหรับทดสอบ)
INSERT OR IGNORE INTO officer_tokens (token, description, expires_at) VALUES 
    ('OFFICER-2024-LAMPANG-004', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 4', NULL),
    ('OFFICER-2024-LAMPANG-005', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 5', NULL),
    ('OFFICER-2024-LAMPANG-006', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 6', NULL),
    ('OFFICER-2024-LAMPANG-007', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 7', NULL),
    ('OFFICER-2024-LAMPANG-008', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 8', NULL),
    ('OFFICER-2024-LAMPANG-009', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 9', NULL),
    ('OFFICER-2024-LAMPANG-010', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 10', NULL),
    ('OFFICER-2024-LAMPANG-011', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 11', NULL),
    ('OFFICER-2024-LAMPANG-012', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 12', NULL),
    ('OFFICER-2024-LAMPANG-013', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 13', NULL),
    ('OFFICER-2024-LAMPANG-014', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 14', NULL),
    ('OFFICER-2024-LAMPANG-015', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 15', NULL),
    ('OFFICER-2024-LAMPANG-016', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 16', NULL),
    ('OFFICER-2024-LAMPANG-017', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 17', NULL),
    ('OFFICER-2024-LAMPANG-018', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 18', NULL),
    ('OFFICER-2024-LAMPANG-019', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 19', NULL),
    ('OFFICER-2024-LAMPANG-020', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 20', NULL),
    ('OFFICER-2024-LAMPANG-021', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 21', NULL),
    ('OFFICER-2024-LAMPANG-022', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 22', NULL),
    ('OFFICER-2024-LAMPANG-023', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 23', NULL),
    ('OFFICER-2024-LAMPANG-024', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 24', NULL),
    ('OFFICER-2024-LAMPANG-025', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 25', NULL),
    ('OFFICER-2024-LAMPANG-026', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 26', NULL),
    ('OFFICER-2024-LAMPANG-027', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 27', NULL),
    ('OFFICER-2024-LAMPANG-028', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 28', NULL),
    ('OFFICER-2024-LAMPANG-029', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 29', NULL),
    ('OFFICER-2024-LAMPANG-030', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 30', NULL),
    ('OFFICER-2024-LAMPANG-031', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 31', NULL),
    ('OFFICER-2024-LAMPANG-032', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 32', NULL),
    ('OFFICER-2024-LAMPANG-033', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 33', NULL),
    ('OFFICER-2024-LAMPANG-034', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 34', NULL),
    ('OFFICER-2024-LAMPANG-035', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 35', NULL),
    ('OFFICER-2024-LAMPANG-036', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 36', NULL),
    ('OFFICER-2024-LAMPANG-037', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 37', NULL),
    ('OFFICER-2024-LAMPANG-038', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 38', NULL),
    ('OFFICER-2024-LAMPANG-039', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 39', NULL),
    ('OFFICER-2024-LAMPANG-040', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 40', NULL);

