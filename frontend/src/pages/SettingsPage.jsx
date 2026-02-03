/* =====================================================
   Settings Page - หน้าตั้งค่าบัญชีผู้ใช้งาน
   ออกแบบตามหลัก Human-centered design
   รองรับ LINE Login v2.1 (OAuth 2.0)
   ===================================================== */

import { useState } from 'react';
import { useAuth, ROLE_INFO, ROLES } from '../contexts/AuthContext';

export default function SettingsPage() {
    const { 
        user, 
        isAuthenticated, 
        logout, 
        updateRole, 
        error, 
        clearError, 
        loading,
        isProcessingCallback 
    } = useAuth();
    const [selectedRole, setSelectedRole] = useState(user?.role || 'tourist');
    const [officerToken, setOfficerToken] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [localError, setLocalError] = useState('');
    const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

    // แสดง Loading ขณะประมวลผล callback จาก LINE
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

    const currentRoleInfo = ROLE_INFO[user.role];

    const handleRoleChange = (role) => {
        setSelectedRole(role);
        setOfficerToken('');
        setLocalError('');
        setSuccessMessage('');
        clearError();
    };

    const handleSaveRole = async () => {
        if (selectedRole === user.role) {
            setLocalError('คุณใช้บทบาทนี้อยู่แล้ว');
            return;
        }

        // ตรวจสอบ Token สำหรับเจ้าหน้าที่
        if (selectedRole === ROLES.OFFICER && !officerToken.trim()) {
            setLocalError('กรุณากรอกรหัสยืนยันตัวตนสำหรับเจ้าหน้าที่');
            return;
        }

        setIsUpdating(true);
        setLocalError('');
        setSuccessMessage('');

        const result = await updateRole(selectedRole, officerToken || null);

        setIsUpdating(false);

        if (result.success) {
            setSuccessMessage(result.message);
            setOfficerToken('');
        } else {
            setLocalError(result.error);
        }
    };

    const handleLogout = async () => {
        setShowLogoutConfirm(false);
        await logout();
    };

    return (
        <div className="settings-page">
            <header className="settings-header">
                <h1 className="settings-title">ตั้งค่าบัญชีผู้ใช้งาน</h1>
                <p className="settings-subtitle">จัดการข้อมูลและบทบาทของคุณในระบบ</p>
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
                    <div className="account-role-badge" data-role={user.role}>
                        <span className="role-icon">{currentRoleInfo.icon}</span>
                        <span className="role-label">{currentRoleInfo.label}</span>
                        {user.roleVerified && user.role === 'officer' && (
                            <span className="verified-badge">ยืนยันแล้ว</span>
                        )}
                    </div>
                </div>
            </section>

            {/* สิทธิ์ปัจจุบัน */}
            <section className="settings-section">
                <h2 className="section-heading">สิทธิ์การใช้งานของคุณ</h2>
                <p className="section-description">{currentRoleInfo.description}</p>
                <div className="permissions-card">
                    <ul className="permissions-list">
                        {currentRoleInfo.permissions.map((perm, idx) => (
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

            {/* เปลี่ยนบทบาท */}
            <section className="settings-section">
                <h2 className="section-heading">เปลี่ยนบทบาทผู้ใช้งาน</h2>
                <p className="section-description">
                    เลือกบทบาทที่ตรงกับคุณ เพื่อให้ระบบแสดงข้อมูลที่เหมาะสม
                </p>

                <div className="role-selector">
                    {Object.entries(ROLE_INFO).map(([roleKey, roleData]) => (
                        <div 
                            key={roleKey}
                            className={`role-option ${selectedRole === roleKey ? 'selected' : ''} ${user.role === roleKey ? 'current' : ''}`}
                            onClick={() => handleRoleChange(roleKey)}
                        >
                            <div className="role-option-header">
                                <span className="role-option-icon">{roleData.icon}</span>
                                <span className="role-option-label">{roleData.label}</span>
                                {user.role === roleKey && (
                                    <span className="current-badge">ปัจจุบัน</span>
                                )}
                                {selectedRole === roleKey && user.role !== roleKey && (
                                    <span className="role-check">●</span>
                                )}
                            </div>
                            <p className="role-option-desc">{roleData.description}</p>
                            
                            {/* แจ้งเตือนสำหรับ Role เจ้าหน้าที่ */}
                            {roleKey === 'officer' && (
                                <p className="role-option-note">
                                    ต้องมีรหัสยืนยันจากผู้ดูแลระบบ
                                </p>
                            )}
                        </div>
                    ))}
                </div>

                {/* ช่องกรอกรหัสยืนยันสำหรับเจ้าหน้าที่ */}
                {selectedRole === ROLES.OFFICER && selectedRole !== user.role && (
                    <div className="officer-token-section">
                        <div className="officer-notice">
                            <span className="notice-icon">ℹ</span>
                            <div>
                                <p className="notice-title">สิทธิ์เจ้าหน้าที่</p>
                                <p className="notice-text">
                                    สำหรับเจ้าหน้าที่เทศบาลที่ปฏิบัติหน้าที่ดูแลพื้นที่กาดกองต้าเท่านั้น
                                </p>
                            </div>
                        </div>
                        <label className="token-label">
                            รหัสยืนยันตัวตน
                        </label>
                        <input
                            type="text"
                            className="token-input"
                            placeholder="กรอกรหัสที่ได้รับจากผู้ดูแลระบบ"
                            value={officerToken}
                            onChange={(e) => setOfficerToken(e.target.value)}
                        />
                        <p className="token-hint">
                            รหัสนี้ได้รับจากหัวหน้างานหรือผู้ดูแลระบบ และใช้ได้เพียงครั้งเดียว
                        </p>
                    </div>
                )}

                {/* แสดง Error */}
                {(localError || error) && (
                    <div className="settings-message error">
                        <span className="message-icon">!</span>
                        <p>{localError || error}</p>
                    </div>
                )}

                {/* แสดง Success */}
                {successMessage && (
                    <div className="settings-message success">
                        <span className="message-icon">✓</span>
                        <p>{successMessage}</p>
                    </div>
                )}

                {/* ปุ่มบันทึก */}
                {selectedRole !== user.role && (
                    <button 
                        className="save-role-btn"
                        onClick={handleSaveRole}
                        disabled={isUpdating}
                    >
                        {isUpdating ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
                    </button>
                )}
            </section>

            {/* ข้อมูลความเป็นส่วนตัว (PDPA) */}
            <section className="settings-section privacy-section">
                <h2 className="section-heading">ข้อมูลความเป็นส่วนตัว</h2>
                <div className="privacy-card">
                    <ul className="privacy-list">
                        <li>
                            <span className="privacy-icon">🔒</span>
                            <p>ระบบใช้ข้อมูลจาก LINE เพื่อยืนยันตัวตนเท่านั้น</p>
                        </li>
                        <li>
                            <span className="privacy-icon">📋</span>
                            <p>ไม่จัดเก็บข้อมูลส่วนบุคคลเกินความจำเป็น</p>
                        </li>
                        <li>
                            <span className="privacy-icon">🎥</span>
                            <p>การเข้าถึงกล้องวงจรปิดจำกัดเฉพาะเจ้าหน้าที่ที่ได้รับอนุญาต</p>
                        </li>
                        <li>
                            <span className="privacy-icon">📊</span>
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
        // ไม่ต้อง setIsLoggingIn(false) เพราะจะ redirect ไป LINE
    };

    // แสดง Loading ขณะประมวลผล
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
                {/* Logo และหัวข้อ */}
                <div className="login-header">
                    <div className="login-logo">
                        <span className="logo-icon">🏮</span>
                    </div>
                    <h1 className="login-title">ระบบข้อมูลถนนคนเดิน</h1>
                    <h2 className="login-title-sub">กาดกองต้า</h2>
                    <p className="login-org">เทศบาลนครลำปาง</p>
                </div>
                
                {/* การ์ดเข้าสู่ระบบ */}
                <div className="login-card">
                    <h3 className="login-card-title">เข้าสู่ระบบ</h3>
                    <p className="login-description">
                        เข้าสู่ระบบด้วยบัญชี LINE เพื่อใช้งานและตั้งค่าบทบาทผู้ใช้
                    </p>

                    {/* แสดง Error */}
                    {error && (
                        <div className="settings-message error" style={{ marginBottom: '1rem' }}>
                            <span className="message-icon">!</span>
                            <p>{error}</p>
                        </div>
                    )}
                    
                    {/* ปุ่ม LINE Login ตาม LINE Design Guidelines */}
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
                
                {/* ข้อมูลบทบาท */}
                <div className="login-roles-info">
                    <h4>บทบาทผู้ใช้งานในระบบ</h4>
                    <div className="roles-preview">
                        {Object.entries(ROLE_INFO).map(([key, role]) => (
                            <div key={key} className="role-preview-item">
                                <span className="role-preview-icon">{role.icon}</span>
                                <span className="role-preview-label">{role.label}</span>
                            </div>
                        ))}
                    </div>
                    <p className="roles-hint">
                        หลังเข้าสู่ระบบ คุณสามารถเลือกบทบาทที่ตรงกับการใช้งานได้
                    </p>
                </div>
                
                {/* Footer */}
                <div className="login-footer">
                    <p>ข้อมูลของคุณจะถูกใช้ตามนโยบายความเป็นส่วนตัว</p>
                    <p>ของเทศบาลนครลำปาง</p>
                </div>
            </div>
        </div>
    );
}
