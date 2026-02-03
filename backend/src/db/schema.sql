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
    ('KKTOFC01', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 1', NULL),
    ('KKTOFC02', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 2', NULL),
    ('KKTOFC03', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 3', NULL),
    ('KKTOFC04', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 4', NULL),
    ('KKTOFC05', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 5', NULL),
    ('KKTOFC06', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 6', NULL),
    ('KKTOFC07', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 7', NULL),
    ('KKTOFC08', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 8', NULL),
    ('KKTOFC09', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 9', NULL),
    ('KKTOFC10', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 10', NULL),
    ('KKTOFC11', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 11', NULL),
    ('KKTOFC12', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 12', NULL),
    ('KKTOFC13', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 13', NULL),
    ('KKTOFC14', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 14', NULL),
    ('KKTOFC15', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 15', NULL),
    ('KKTOFC16', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 16', NULL),
    ('KKTOFC17', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 17', NULL),
    ('KKTOFC18', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 18', NULL),
    ('KKTOFC19', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 19', NULL),
    ('KKTOFC20', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 20', NULL),
    ('KKTOFC21', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 21', NULL),
    ('KKTOFC22', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 22', NULL),
    ('KKTOFC23', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 23', NULL),
    ('KKTOFC24', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 24', NULL),
    ('KKTOFC25', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 25', NULL),
    ('KKTOFC26', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 26', NULL),
    ('KKTOFC27', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 27', NULL),
    ('KKTOFC28', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 28', NULL),
    ('KKTOFC29', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 29', NULL),
    ('KKTOFC30', 'Token สำหรับเจ้าหน้าที่เทศบาลนครลำปาง ชุดที่ 30', NULL);

-- =====================================================
-- AI PEOPLE COUNTING (ข้อมูลจาก AI Service)
-- =====================================================

-- AI People Counts (บันทึกข้อมูลจากแต่ละกล้อง)
CREATE TABLE IF NOT EXISTS ai_people_counts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id TEXT NOT NULL,
  max_people INTEGER DEFAULT 0,
  avg_people REAL DEFAULT 0,
  min_people INTEGER DEFAULT 0,
  frames_processed INTEGER DEFAULT 0,
  window_start TEXT,
  window_end TEXT,
  source_type TEXT DEFAULT 'playback',  -- playback / realtime
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_counts_camera ON ai_people_counts(camera_id);
CREATE INDEX IF NOT EXISTS idx_ai_counts_date ON ai_people_counts(DATE(recorded_at));
CREATE INDEX IF NOT EXISTS idx_ai_counts_window ON ai_people_counts(window_start, window_end);

-- AI Camera Status (สถานะกล้องแต่ละตัว)
CREATE TABLE IF NOT EXISTS ai_camera_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  camera_id TEXT UNIQUE NOT NULL,
  camera_name TEXT,
  last_count INTEGER DEFAULT 0,
  last_max_people INTEGER DEFAULT 0,
  last_avg_people REAL DEFAULT 0,
  status TEXT DEFAULT 'unknown',  -- online / offline / error
  last_seen_at TEXT,
  error_message TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_camera_status_id ON ai_camera_status(camera_id);

-- Crowd Alerts (แจ้งเตือนความแออัด)
CREATE TABLE IF NOT EXISTS crowd_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_level TEXT NOT NULL,  -- warning / critical
  people_count INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  message TEXT,
  is_sent_line INTEGER DEFAULT 0,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crowd_alerts_date ON crowd_alerts(DATE(created_at));
CREATE INDEX IF NOT EXISTS idx_crowd_alerts_level ON crowd_alerts(alert_level);

