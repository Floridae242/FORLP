-- =====================================================
-- FORLP — PostgreSQL Schema (Supabase)
-- =====================================================

CREATE TABLE IF NOT EXISTS people_counts (
  id BIGSERIAL PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT DEFAULT 'ai'
);
CREATE INDEX IF NOT EXISTS idx_people_counts_date ON people_counts(recorded_at);


CREATE TABLE IF NOT EXISTS daily_reports (
  id BIGSERIAL PRIMARY KEY,
  report_date TEXT UNIQUE NOT NULL,
  max_people INTEGER DEFAULT 0,
  avg_people REAL DEFAULT 0,
  min_people INTEGER DEFAULT 0,
  total_samples INTEGER DEFAULT 0,
  weather_summary TEXT,
  temperature_avg REAL,
  humidity_avg REAL,
  pm25_avg REAL,
  pm25_max REAL,
  pm25_status TEXT,
  is_sent_line INTEGER DEFAULT 0,
  sent_line_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON daily_reports(report_date);

CREATE TABLE IF NOT EXISTS line_broadcast_logs (
  id BIGSERIAL PRIMARY KEY,
  report_date TEXT,
  message_type TEXT DEFAULT 'daily_report',
  message_content TEXT,
  status TEXT DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_line_logs_date ON line_broadcast_logs(report_date);
CREATE INDEX IF NOT EXISTS idx_line_logs_type ON line_broadcast_logs(message_type);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO system_settings (setting_key, setting_value) VALUES
  ('polling_interval', '300000'),
  ('ai_service_url', 'http://localhost:8000'),
  ('line_enabled', 'true'),
  ('early_warning_time', '14:00'),
  ('daily_report_time', '23:00')
ON CONFLICT (setting_key) DO NOTHING;

-- Venues Table (ข้อมูลสถานที่) — from Jeff branch, converted to PostgreSQL
CREATE TABLE IF NOT EXISTS venues (
  id BIGSERIAL PRIMARY KEY,
  venue_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_venue_id ON venues(venue_id);

-- =====================================================
-- USER MANAGEMENT (ระบบจัดการผู้ใช้งาน)
-- =====================================================

-- Users Table (ข้อมูลผู้ใช้จาก LINE Login)
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  line_user_id TEXT UNIQUE NOT NULL,
  display_name TEXT,
  picture_url TEXT,
  role TEXT DEFAULT 'officer' CHECK(role IN ('officer')),
  role_verified INTEGER DEFAULT 0,
  officer_token_used TEXT,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS user_line_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS officer_tokens (
  id BIGSERIAL PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  description TEXT,
  is_used INTEGER DEFAULT 0,
  used_by_user_id BIGINT REFERENCES users(id),
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_officer_tokens_used ON officer_tokens(is_used);

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  session_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);

CREATE TABLE IF NOT EXISTS ai_people_counts (
  id BIGSERIAL PRIMARY KEY,
  camera_id TEXT NOT NULL,
  max_people INTEGER DEFAULT 0,
  avg_people REAL DEFAULT 0,
  min_people INTEGER DEFAULT 0,
  frames_processed INTEGER DEFAULT 0,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  source_type TEXT DEFAULT 'playback',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_counts_camera ON ai_people_counts(camera_id);
CREATE INDEX IF NOT EXISTS idx_ai_counts_date ON ai_people_counts(recorded_at);

CREATE TABLE IF NOT EXISTS ai_camera_status (
  id BIGSERIAL PRIMARY KEY,
  camera_id TEXT UNIQUE NOT NULL,
  camera_name TEXT,
  last_count INTEGER DEFAULT 0,
  last_max_people INTEGER DEFAULT 0,
  last_avg_people REAL DEFAULT 0,
  status TEXT DEFAULT 'unknown',
  last_seen_at TIMESTAMPTZ,
  error_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crowd_alerts (
  id BIGSERIAL PRIMARY KEY,
  alert_level TEXT NOT NULL,
  people_count INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  message TEXT,
  is_sent_line INTEGER DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crowd_alerts_date ON crowd_alerts(created_at);
CREATE INDEX IF NOT EXISTS idx_crowd_alerts_level ON crowd_alerts(alert_level);

CREATE TABLE IF NOT EXISTS zone_estimates (
  zone_code TEXT PRIMARY KEY,
  percentage REAL NOT NULL CHECK (percentage >= 0 AND percentage <= 100),
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO officer_tokens (token, description, expires_at) VALUES
  ('KKTOFC01','Token สำหรับเจ้าหน้าที่ ชุดที่ 1',NULL),
  ('KKTOFC02','Token สำหรับเจ้าหน้าที่ ชุดที่ 2',NULL),
  ('KKTOFC03','Token สำหรับเจ้าหน้าที่ ชุดที่ 3',NULL),
  ('KKTOFC04','Token สำหรับเจ้าหน้าที่ ชุดที่ 4',NULL),
  ('KKTOFC05','Token สำหรับเจ้าหน้าที่ ชุดที่ 5',NULL),
  ('KKTOFC06','Token สำหรับเจ้าหน้าที่ ชุดที่ 6',NULL),
  ('KKTOFC07','Token สำหรับเจ้าหน้าที่ ชุดที่ 7',NULL),
  ('KKTOFC08','Token สำหรับเจ้าหน้าที่ ชุดที่ 8',NULL),
  ('KKTOFC09','Token สำหรับเจ้าหน้าที่ ชุดที่ 9',NULL),
  ('KKTOFC10','Token สำหรับเจ้าหน้าที่ ชุดที่ 10',NULL),
  ('KKTOFC11','Token สำหรับเจ้าหน้าที่ ชุดที่ 11',NULL),
  ('KKTOFC12','Token สำหรับเจ้าหน้าที่ ชุดที่ 12',NULL),
  ('KKTOFC13','Token สำหรับเจ้าหน้าที่ ชุดที่ 13',NULL),
  ('KKTOFC14','Token สำหรับเจ้าหน้าที่ ชุดที่ 14',NULL),
  ('KKTOFC15','Token สำหรับเจ้าหน้าที่ ชุดที่ 15',NULL),
  ('KKTOFC16','Token สำหรับเจ้าหน้าที่ ชุดที่ 16',NULL),
  ('KKTOFC17','Token สำหรับเจ้าหน้าที่ ชุดที่ 17',NULL),
  ('KKTOFC18','Token สำหรับเจ้าหน้าที่ ชุดที่ 18',NULL),
  ('KKTOFC19','Token สำหรับเจ้าหน้าที่ ชุดที่ 19',NULL),
  ('KKTOFC20','Token สำหรับเจ้าหน้าที่ ชุดที่ 20',NULL),
  ('KKTOFC21','Token สำหรับเจ้าหน้าที่ ชุดที่ 21',NULL),
  ('KKTOFC22','Token สำหรับเจ้าหน้าที่ ชุดที่ 22',NULL),
  ('KKTOFC23','Token สำหรับเจ้าหน้าที่ ชุดที่ 23',NULL),
  ('KKTOFC24','Token สำหรับเจ้าหน้าที่ ชุดที่ 24',NULL),
  ('KKTOFC25','Token สำหรับเจ้าหน้าที่ ชุดที่ 25',NULL),
  ('KKTOFC26','Token สำหรับเจ้าหน้าที่ ชุดที่ 26',NULL),
  ('KKTOFC27','Token สำหรับเจ้าหน้าที่ ชุดที่ 27',NULL),
  ('KKTOFC28','Token สำหรับเจ้าหน้าที่ ชุดที่ 28',NULL),
  ('KKTOFC29','Token สำหรับเจ้าหน้าที่ ชุดที่ 29',NULL),
  ('KKTOFC30','Token สำหรับเจ้าหน้าที่ ชุดที่ 30',NULL)
ON CONFLICT (token) DO NOTHING;
