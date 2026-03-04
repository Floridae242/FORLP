/* =====================================================
   หน้าตั้งค่าบัญชีผู้ใช้งาน
   Human-centered Design: แสดงข้อมูลชัดเจน เข้าใจง่าย
   LINE Login Persistent: login ครั้งเดียว จำได้ถาวร
   ===================================================== */

import { useState } from 'react';
import { useAuth, ROLE_INFO } from '../contexts/AuthContext';

export default function SettingsPage() {
    const { 
        user, 
        isAuthenticated, 
        logout, 
        error, 
        clearError, 
        loading,
        isProcessingCallback 
    } = useAuth();
    
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    // Loading State
    if (loading || isProcessingCallback) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p className="loading-text">
                    {isProcessingCallback ? 'กำลังเข้าสู่ระบบ...' : 'กำลังโหลด...'}
                </p>
            </div>
        );
    }

    // ถ้ายังไม่ได้เข้าสู่ระบบ แสดงหน้า Login
    if (!isAuthenticated) {
        return <LoginPrompt />;
    }

    const officerRoleInfo = ROLE_INFO.officer;
    const isOfficer = user.role === 'officer' && user.roleVerified;

    const handleLogout = async () => {
        setShowLogoutConfirm(false);
        await logout();
    };

    return (
        <div className="settings-page">
            <header className="settings-header">
                <h1 className="settings-title">ตั้งค่าบัญชีผู้ใช้งาน</h1>
                <p className="settings-subtitle">จัดการข้อมูลของคุณในระบบ</p>
            </header>

            {/* ข้อมูลบัญชี LINE */}
            <section className="settings-section">
                <h2 className="section-heading">ข้อมูลบัญชี</h2>
                <div className="account-card">
                    <div className="account-profile">
                        {user.pictureUrl ? (
                            <img 
                                src={user.pictureUrl} 
                                alt="รูปโปรไฟล์" 
                                className="account-avatar"
                            />
                        ) : (
                            <div className="account-avatar-placeholder">
                                {user.displayName?.charAt(0) || '?'}
                            </div>
                        )}
                        <div className="account-info">
                            <p className="account-name">{user.displayName}</p>
                            <div className="account-line-status">
                                <span className="line-connected-icon">●</span>
                                <span>เชื่อมต่อกับ LINE แล้ว</span>
                            </div>
                        </div>
                    </div>
                    {isOfficer && (
                        <div className="account-role-badge" data-role="officer">
                            <span className="role-label">{officerRoleInfo.label}</span>
                            <span className="verified-badge">ยืนยันแล้ว</span>
                        </div>
                    )}
                </div>
            </section>

            {/* สิทธิ์การใช้งาน - แสดงเฉพาะเจ้าหน้าที่ */}
            {isOfficer && (
                <section className="settings-section">
                    <h2 className="section-heading">สิทธิ์การใช้งานของคุณ</h2>
                    <p className="section-description">{officerRoleInfo.description}</p>
                    <div className="permissions-card">
                        <ul className="permissions-list">
                            {officerRoleInfo.permissions.map((perm, idx) => (
                                <li key={idx} className={`permission-item ${perm.allowed ? 'allowed' : 'denied'}`}>
                                    <span className="permission-icon">
                                        {perm.allowed ? '✓' : '—'}
                                    </span>
                                    <span className="permission-text">{perm.text}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>
            )}

            {/* Error Message */}
            {error && (
                <div className="settings-message error" style={{ margin: '0 0 1rem 0' }}>
                    <span className="message-icon">!</span>
                    <p>{error}</p>
                </div>
            )}

            {/* ข้อมูลความเป็นส่วนตัว */}
            <section className="settings-section privacy-section">
                <h2 className="section-heading">ข้อมูลความเป็นส่วนตัว</h2>
                <div className="privacy-card">
                    <ul className="privacy-list">
                        <li>
                            <p>ระบบใช้ข้อมูลจาก LINE เพื่อยืนยันตัวตนเท่านั้น</p>
                        </li>
                        <li>
                            <p>ไม่จัดเก็บข้อมูลส่วนบุคคลเกินความจำเป็น</p>
                        </li>
                        <li>
                            <p>การเข้าถึงกล้องวงจรปิดจำกัดเฉพาะเจ้าหน้าที่ที่ได้รับอนุญาต</p>
                        </li>
                        <li>
                            <p>ข้อมูลใช้เพื่อการบริหารจัดการพื้นที่สาธารณะของเทศบาล</p>
                        </li>
                    </ul>
                </div>
            </section>

            {/* ปุ่มออกจากระบบ */}
            <section className="settings-section logout-section">
                <button 
                    className="logout-btn" 
                    onClick={() => setShowLogoutConfirm(true)}
                >
                    ออกจากระบบ
                </button>
                <p className="logout-hint">
                    การออกจากระบบจะยกเลิกการเชื่อมต่อกับบัญชี LINE ของคุณ
                </p>
            </section>

            {/* Modal ยืนยันออกจากระบบ */}
            {showLogoutConfirm && (
                <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <h3 className="modal-title">ยืนยันการออกจากระบบ</h3>
                        <p className="modal-text">
                            คุณต้องการออกจากระบบหรือไม่?
                        </p>
                        <div className="modal-actions">
                            <button 
                                className="modal-btn cancel"
                                onClick={() => setShowLogoutConfirm(false)}
                            >
                                ยกเลิก
                            </button>
                            <button 
                                className="modal-btn confirm"
                                onClick={handleLogout}
                            >
                                ออกจากระบบ
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Footer */}
            <footer className="settings-footer">
                <p>ระบบข้อมูลถนนคนเดินกาดกองต้า</p>
                <p>เทศบาลนครลำปาง</p>
            </footer>
        </div>
    );
}

// Component สำหรับแสดงเมื่อยังไม่ได้เข้าสู่ระบบ
function LoginPrompt() {
    const { login, error, clearError, loading, isProcessingCallback } = useAuth();
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleLineLogin = async () => {
        setIsLoggingIn(true);
        clearError();
        await login();
    };

    if (loading || isProcessingCallback) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p className="loading-text">
                    {isProcessingCallback ? 'กำลังเข้าสู่ระบบ...' : 'กำลังโหลด...'}
                </p>
            </div>
        );
    }

    return (
        <div className="login-prompt-page">
            <div className="login-prompt-container">
                <div className="login-header">
                    <h1 className="login-title">ระบบข้อมูลถนนคนเดิน</h1>
                    <h2 className="login-title-sub">กาดกองต้า</h2>
                    <p className="login-org">เทศบาลนครลำปาง</p>
                </div>
                
                <div className="login-card">
                    <h3 className="login-card-title">เข้าสู่ระบบ</h3>
                    <p className="login-description">
                        เข้าสู่ระบบด้วยบัญชี LINE สำหรับเจ้าหน้าที่เทศบาล
                    </p>

                    {error && (
                        <div className="settings-message error" style={{ marginBottom: '1rem' }}>
                            <span className="message-icon">!</span>
                            <p>{error}</p>
                        </div>
                    )}
                    
                    <button 
                        className="line-login-btn" 
                        onClick={handleLineLogin}
                        disabled={isLoggingIn}
                    >
                        <span className="line-icon">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                            </svg>
                        </span>
                        <span className="line-btn-text">
                            {isLoggingIn ? 'กำลังเชื่อมต่อ...' : 'เข้าสู่ระบบด้วย LINE'}
                        </span>
                    </button>
                    
                    <p className="login-note">
                        ระบบใช้บัญชี LINE เพื่อยืนยันตัวตน<br/>
                        ไม่มีการเก็บรหัสผ่านของคุณ
                    </p>
                </div>
                
                <div className="login-footer">
                    <p>ข้อมูลของคุณจะถูกใช้ตามนโยบายความเป็นส่วนตัว</p>
                    <p>ของเทศบาลนครลำปาง</p>
                </div>
            </div>
        </div>
    );
}
