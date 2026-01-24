// =====================================================
// กาดกองต้า - ระบบข้อมูลเทศบาลนครลำปาง
// Human-centered design for Government System
// =====================================================

import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import PeoplePage from './pages/PeoplePage.jsx';
import WeatherPage from './pages/WeatherPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';

const LOGO_URL = 'https://iocpiramid.com/images/citylogo/1754587002746_lampang_logo.png';

function Navigation() {
    return (
        <nav className="nav-bar">
            <div className="nav-content">
                <div className="nav-brand">
                    <img src={LOGO_URL} alt="เทศบาลนครลำปาง" className="nav-logo-img" />
                </div>
                
                <div className="nav-tabs">
                    <NavLink 
                        to="/people"
                        className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab-active' : ''}`}
                    >
                        ผู้ใช้งานพื้นที่
                    </NavLink>
                    
                    <NavLink 
                        to="/weather"
                        className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab-active' : ''}`}
                    >
                        สภาพอากาศ
                    </NavLink>
                    
                    <NavLink 
                        to="/reports"
                        className={({ isActive }) => `nav-tab ${isActive ? 'nav-tab-active' : ''}`}
                    >
                        รายงาน
                    </NavLink>
                </div>
            </div>
        </nav>
    );
}

function Footer() {
    return (
        <footer className="app-footer">
            <p>ระบบส่งรายงานสรุปไปยัง Line OA อัตโนมัติ ทุกวันเสาร์-อาทิตย์ เวลา 23.00 น.</p>
            <p className="footer-sub">เทศบาลนครลำปาง • ถนนคนเดินกาดกองต้า</p>
        </footer>
    );
}

export default function App() {
    return (
        <BrowserRouter>
            <div className="app-container">
                <Navigation />
                
                <main className="main-content">
                    <Routes>
                        <Route path="/" element={<Navigate to="/people" replace />} />
                        <Route path="/people" element={<PeoplePage />} />
                        <Route path="/weather" element={<WeatherPage />} />
                        <Route path="/reports" element={<ReportsPage />} />
                    </Routes>
                </main>
                
                <Footer />
            </div>
        </BrowserRouter>
    );
}
