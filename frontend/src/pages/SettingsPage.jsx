/* =====================================================
   Settings Page - หน้าตั้งค่าบัญชีผู้ใช้งาน
   ออกแบบสำหรับระบบเทศบาล ใช้งานง่าย เข้าใจทันที
   ===================================================== */

import { useState } from 'react';
import { useAuth, ROLE_INFO, ROLES } from '../contexts/AuthContext';

export default function SettingsPage() {
    const { user, isAuthenticated, logout, updateRole, error, clearError, loading } = useAuth();
    const [selectedRole, setSelectedRole] = useState(user?.role || 'tourist');
    const [officerToken, setOfficerToken] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [localError, setLocalError] = useState('');

    // แสดง Loading
    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p className="loading-text">กำลังโหลด...</p>
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
            setLocalError('กรุณากรอก Token สำหรับเจ้าหน้าที่');
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
        if (window.confirm('ต้องการออกจากระบบหรือไม่?')) {
            await logout();
        }
    };

    return (
        <div className="settings-page">
            <header className="settings-header">
                <h1 className="settings-title">ตั้งค่าบัญชีผู้ใช้งาน</h1>
                <p className="settings-subtitle">จัดการข้อมูลบัญชีและบทบาทของคุณ</p>
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
                            <p className="account-source">เข้าสู่ระบบผ่าน LINE</p>
                        </div>
                    </div>
                    <div className="account-role-badge" data-role={user.role}>
                        <span className="role-label">{currentRoleInfo.label}</span>
                        {user.roleVerified && user.role === 'officer' && (
                            <span className="verified-badge">✓ ยืนยันแล้ว</span>
                        )}
                    </div>
                </div>
            </section>

            {/* สิทธิ์ปัจจุบัน */}
            <section className="settings-section">
                <h2 className="section-heading">สิทธิ์การใช้งานปัจจุบัน</h2>
                <div className="permissions-card">
                    <ul className="permissions-list">
                        {currentRoleInfo.permissions.map((perm, idx) => (
                            <li key={idx} className={`permission-item ${perm.allowed ? 'allowed' : 'denied'}`}>
                                <span className="permission-icon">
                                    {perm.allowed ? '✓' : '✕'}
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
                    เลือกบทบาทที่ตรงกับการใช้งานของคุณ เพื่อให้ระบบแสดงข้อมูลที่เหมาะสม
                </p>

                <div className="role-selector">
                    {Object.entries(ROLE_INFO).map(([roleKey, roleData]) => (
                        <div 
                            key={roleKey}
                            className={`role-option ${selectedRole === roleKey ? 'selected' : ''} ${roleKey === 'officer' ? 'officer-role' : ''}`}
                            onClick={() => handleRoleChange(roleKey)}
                        >
                            <div className="role-option-header">
                                <span className="role-option-label">{roleData.label}</span>
                                {selectedRole === roleKey && (
                                    <span className="role-check">✓</span>
                                )}
                            </div>
                            <p className="role-option-desc">{roleData.description}</p>
                            
                            {/* แสดงสิทธิ์ย่อ */}
                            <div className="role-option-perms">
                                {roleData.permissions.map((p, i) => (
                                    <span key={i} className={`perm-badge ${p.allowed ? 'yes' : 'no'}`}>
                                        {p.allowed ? '✓' : '✕'} {p.text.replace('ดูข้อมูล', '').replace('เข้าถึง', '')}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                {/* ช่องกรอก Token สำหรับเจ้าหน้าที่ */}
                {selectedRole === ROLES.OFFICER && (
                    <div className="officer-token-section">
                        <div className="officer-warning">
                            <p>สิทธิ์เจ้าหน้าที่ใช้สำหรับการปฏิบัติงานของเทศบาลเท่านั้น</p>
                        </div>
                        <label className="token-label">
                            Token สำหรับเจ้าหน้าที่
                            <span className="required">*</span>
                        </label>
                        <input
                            type="text"
                            className="token-input"
                            placeholder="กรอก Token ที่ได้รับจากผู้ดูแลระบบ"
                            value={officerToken}
                            onChange={(e) => setOfficerToken(e.target.value)}
                        />
                        <p className="token-hint">
                            Token จะได้รับจากผู้ดูแลระบบหรือหัวหน้างาน
                        </p>
                    </div>
                )}

                {/* แสดง Error */}
                {(localError || error) && (
                    <div className="settings-error">
                        <span className="error-icon">!</span>
                        <p>{localError || error}</p>
                    </div>
                )}

                {/* แสดง Success */}
                {successMessage && (
                    <div className="settings-success">
                        <span className="success-icon">✓</span>
                        <p>{successMessage}</p>
                    </div>
                )}

                {/* ปุ่มบันทึก */}
                <button 
                    className="save-role-btn"
                    onClick={handleSaveRole}
                    disabled={isUpdating || selectedRole === user.role}
                >
                    {isUpdating ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
                </button>
            </section>

            {/* ข้อมูลความเป็นส่วนตัว */}
            <section className="settings-section privacy-section">
                <h2 className="section-heading">ความเป็นส่วนตัวและความปลอดภัย</h2>
                <div className="privacy-card">
                    <ul className="privacy-list">
                        <li>
                            <p>ระบบไม่จัดเก็บข้อมูลส่วนบุคคลเกินความจำเป็น</p>
                        </li>
                        <li>
                            <p>การเข้าถึงกล้องวงจรปิดจำกัดเฉพาะเจ้าหน้าที่ที่ได้รับอนุญาต</p>
                        </li>
                        <li>
                            <p>ข้อมูลใช้เพื่อการบริหารจัดการพื้นที่สาธารณะเท่านั้น</p>
                        </li>
                    </ul>
                </div>
            </section>

            {/* ปุ่มออกจากระบบ */}
            <section className="settings-section logout-section">
                <button className="logout-btn" onClick={handleLogout}>
                    ออกจากระบบ
                </button>
            </section>

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
    const { login, error, isLiffConfigured } = useAuth();

    const handleLineLogin = () => {
        login();
    };

    return (
        <div className="login-prompt-page">
            <div className="login-prompt-container">
                <div className="login-logo">
                </div>
                <h1 className="login-title">ระบบข้อมูลถนนคนเดินกาดกองต้า</h1>
                <p className="login-subtitle">เทศบาลนครลำปาง</p>
                
                <div className="login-card">
                    <h2>เข้าสู่ระบบ</h2>
                    <p className="login-description">
                        เข้าสู่ระบบด้วยบัญชี LINE เพื่อใช้งานระบบและตั้งค่าบทบาทผู้ใช้งาน
                    </p>

                    {error && (
                        <div className="settings-error" style={{ marginBottom: '1rem' }}>
                            <span className="error-icon">!</span>
                            <p>{error}</p>
                        </div>
                    )}

                    {!isLiffConfigured && (
                        <div className="settings-error" style={{ marginBottom: '1rem' }}>
                            <span className="error-icon">!</span>
                            <p>ระบบยังไม่ได้ตั้งค่า LINE Login กรุณาติดต่อผู้ดูแลระบบ</p>
                        </div>
                    )}
                    
                    <button 
                        className="line-login-btn" 
                        onClick={handleLineLogin}
                        disabled={!isLiffConfigured}
                    >
                        <span className="line-icon">
                            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                                <path d="M12 2C6.48 2 2 5.82 2 10.5c0 2.74 1.78 5.15 4.44 6.58-.17.57-.46 1.53-.53 1.76-.09.3.11.59.44.44.23-.1 2.67-1.57 3.75-2.2.62.09 1.26.13 1.9.13 5.52 0 10-3.82 10-8.5S17.52 2 12 2z"/>
                            </svg>
                        </span>
                        เข้าสู่ระบบด้วย LINE
                    </button>
                    
                    <p className="login-note">
                        ระบบใช้บัญชี LINE เพื่อยืนยันตัวตน<br/>
                        ไม่มีการเก็บรหัสผ่านของคุณ
                    </p>
                </div>
                
                <div className="login-footer">
                    <p>ข้อมูลของคุณจะถูกใช้ตาม<br/>นโยบายความเป็นส่วนตัวของเทศบาลนครลำปาง</p>
                </div>
            </div>
        </div>
    );
}
