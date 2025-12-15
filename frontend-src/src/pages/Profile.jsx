import React from 'react';
import keycloak from '../keycloak';
import { useTheme } from '../contexts/ThemeContext';

const Profile = () => {
  const { darkMode, toggleDarkMode, getStyles } = useTheme();
  const styles = getStyles();
  
  const { preferred_username, email, realm_access } = keycloak.tokenParsed || {};
  
  const handleLogout = () => {
    keycloak.logout({
      redirectUri: `${window.location.origin}/frontend/`
    });
  };

  return (
    <div style={{...styles.root, ...styles.container}}>
      {/* 工具列 */}
      <div style={styles.toolbar}>
        <h1 style={styles.title}>👤 個人資料</h1>
        <button
          style={styles.themeToggle}
          onClick={toggleDarkMode}
        >
          {darkMode ? '☀️ 淺色模式' : '🌙 深色模式'}
        </button>
      </div>

      <div style={styles.content}>
        {/* 個人資訊卡片 */}
        <div style={styles.card}>
          <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
            基本資訊
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontWeight: '600', minWidth: '100px', color: 'var(--text-secondary)' }}>
                使用者名稱:
              </span>
              <span style={{ color: 'var(--text-primary)' }}>{preferred_username}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontWeight: '600', minWidth: '100px', color: 'var(--text-secondary)' }}>
                電子郵件:
              </span>
              <span style={{ color: 'var(--text-primary)' }}>{email}</span>
            </div>
          </div>
        </div>

        {/* 角色權限卡片 */}
        <div style={styles.card}>
          <h2 style={{ marginTop: 0, marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
            角色權限
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {realm_access?.roles?.map((role) => (
              <span
                key={role}
                style={{
                  ...styles.status,
                  ...styles.statusInfo,
                }}
              >
                {role}
              </span>
            ))}
          </div>
        </div>

        {/* 操作按鈕 */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
          <button
            style={{
              ...styles.button,
              ...styles.dangerButton,
            }}
            onClick={handleLogout}
            onMouseEnter={(e) => {
              e.target.style.background = 'var(--danger-color)';
              e.target.style.color = 'white';
              e.target.style.borderColor = 'var(--danger-color)';
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = '0 4px 12px rgba(220, 38, 38, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'var(--bg-primary)';
              e.target.style.color = 'var(--danger-color)';
              e.target.style.borderColor = 'var(--border-color)';
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'var(--shadow-sm)';
            }}
          >
            🚪 登出
          </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;