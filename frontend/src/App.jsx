import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import PeoplePage from './pages/PeoplePage';
import ReportsPage from './pages/ReportsPage';
import WeatherPage from './pages/WeatherPage';
import CameraPage from './pages/CameraPage';
import SettingsPage from './pages/SettingsPage';

// Navigation Component ที่รองรับ Role-based Access
function Navigation() {
    const { user, isAuthenticated, canAccessCCTV } = useAuth();

    return (
        <nav className="nav-bar">
            <div className="nav-content">
                <div className="nav-brand">
                    <img src="/logo.png" alt="โลโก้เทศบาลนครลำปาง" className="nav-logo" />
                    <div>
                        <div className="nav-title">ระบบข้อมูลถนนคนเดินกาดกองต้า</div>
                        <div className="nav-subtitle">เทศบาลนครลำปาง</div>
                    </div>
                </div>
                
                <div className="nav-tabs">
                    <NavLink
                        to="/"
                        className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab-active' : ''}`}
                    >
                        ภาพรวมพื้นที่
                    </NavLink>
                    
                    {/* แสดงเมนูกล้องวงจรปิดเฉพาะเจ้าหน้าที่ */}
                    {canAccessCCTV() && (
                        <NavLink
                            to="/camera"
                            className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab-active' : ''}`}
                        >
                            กล้องวงจรปิด
                        </NavLink>
                    )}
                    
                    <NavLink
                        to="/reports"
                        className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab-active' : ''}`}
                    >
                        รายงานข้อมูล
                    </NavLink>
                    <NavLink
                        to="/weather"
                        className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab-active' : ''}`}
                    >
                        สภาพอากาศ
                    </NavLink>
                    <NavLink
                        to="/settings"
                        className={({ isActive }) => `nav-tab nav-tab-settings ${isActive ? 'nav-tab-active' : ''}`}
                    >
                        {isAuthenticated ? (
                            <span className="nav-user-icon">
                                {user?.pictureUrl ? (
                                    <img src={user.pictureUrl} alt="" className="nav-avatar" />
                                ) : (
                                    ''
                                )}
                            </span>
                        ) : (
                            'เข้าสู่ระบบ'
                        )}
                    </NavLink>
                </div>
            </div>
        </nav>
    );
}

// Protected Route Component สำหรับหน้า CCTV
function ProtectedCCTVRoute() {
    const { canAccessCCTV, isAuthenticated } = useAuth();

    if (!isAuthenticated) {
        return (
            <div className="access-denied-page">
                <div className="access-denied-content">
                    <span className="access-denied-icon">🔒</span>
                    <h2>กรุณาเข้าสู่ระบบ</h2>
                    <p>คุณต้องเข้าสู่ระบบก่อนเพื่อเข้าถึงหน้านี้</p>
                    <NavLink to="/settings" className="login-link-btn">
                        เข้าสู่ระบบ
                    </NavLink>
                </div>
            </div>
        );
    }

    if (!canAccessCCTV()) {
        return (
            <div className="access-denied-page">
                <div className="access-denied-content">
                    <span className="access-denied-icon">🔒</span>
                    <h2>ไม่มีสิทธิ์เข้าถึง</h2>
                    <p>การเข้าถึงกล้องวงจรปิดจำกัดเฉพาะเจ้าหน้าที่ที่ได้รับอนุญาตเท่านั้น</p>
                    <p className="access-denied-hint">
                        หากคุณเป็นเจ้าหน้าที่ กรุณาไปที่หน้าตั้งค่าเพื่อยืนยันสิทธิ์
                    </p>
                    <NavLink to="/settings" className="settings-link-btn">
                        ไปหน้าตั้งค่า
                    </NavLink>
                </div>
            </div>
        );
    }

    return <CameraPage />;
}

// Auth Callback Handler - สำหรับรับ callback จาก LINE Login
function AuthCallbackHandler() {
    // Callback จะถูก process ใน AuthContext แล้ว redirect กลับไปหน้า settings
    return <Navigate to="/settings" replace />;
}

function AppContent() {
    return (
        <div className="app-container">
            <Navigation />

            <main className="main-content">
                <Routes>
                    <Route path="/" element={<PeoplePage />} />
                    <Route path="/camera" element={<ProtectedCCTVRoute />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/weather" element={<WeatherPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    {/* LINE Login Callback Route */}
                    <Route path="/auth/callback" element={<AuthCallbackHandler />} />
                </Routes>
            </main>

            <footer className="app-footer">
                <div className="footer-text">
                    ระบบข้อมูลถนนคนเดินกาดกองต้า
                </div>
                <div className="footer-sub">
                    เทศบาลนครลำปาง • ข้อมูลอัปเดตอัตโนมัติทุก 5 นาที
                </div>
            </footer>
        </div>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <AuthProvider>
                <AppContent />
            </AuthProvider>
        </BrowserRouter>
    );
}
