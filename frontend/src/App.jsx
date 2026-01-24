import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import PeoplePage from './pages/PeoplePage';
import ReportsPage from './pages/ReportsPage';
import WeatherPage from './pages/WeatherPage';
import CameraPage from './pages/CameraPage';

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-container">
                <nav className="nav-bar">
                    <div className="nav-content">
                        <div className="nav-brand">
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
                            <NavLink
                                to="/camera"
                                className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab-active' : ''}`}
                            >
                                กล้องวงจรปิด
                            </NavLink>
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
                        </div>
                    </div>
                </nav>

                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<PeoplePage />} />
                        <Route path="/camera" element={<CameraPage />} />
                        <Route path="/reports" element={<ReportsPage />} />
                        <Route path="/weather" element={<WeatherPage />} />
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
        </BrowserRouter>
    );
}
