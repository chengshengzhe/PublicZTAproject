import React from 'react';
import { useTheme } from '../contexts/ThemeContext';

const Application = () => {
  // 獲取主題和樣式
  const { darkMode, toggleDarkMode, getStyles } = useTheme();
  const styles = getStyles();

  // 網址配置
  const serviceLinks = [
    {
      name: '📂 File Browser',
      url: 'https://server67324.ddnsking.com/filebrowser/login',
      description: '檔案瀏覽服務',
      // File Browser 保持原有的 primary-color
      color: 'var(--primary-color)',
      // 新增 text_color 屬性來處理 Immich 的白色要求
      text_color: 'var(--primary-color)', 
    },
    {
      name: '🖼️ Immich',
      url: 'http://server67324.ddnsking.com:30041/auth/login',
      description: '個人相片庫服務',
      color: 'var(--success-color)',
      // 🎯 Immich 字體要白色
      text_color: 'white', 
    },
  ];

  // 定義連結按鈕的額外樣式，用於滑鼠懸停效果
  const linkButtonStyle = {
    ...styles.button,
    padding: '1rem 1.5rem',
    fontSize: '1.1rem',
    fontWeight: '700',
    backgroundColor: 'var(--bg-secondary)', // 使用不同的背景色以區分
    color: 'var(--text-primary)',
    border: '2px solid var(--border-color)',
    boxShadow: 'var(--shadow-md)',
    transition: 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)',
    textAlign: 'left',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '0.3rem',
    // 🎯 移除文字底線
    textDecoration: 'none', 
  };

  return (
    <div style={{...styles.root, ...styles.container}}>
      {/* 工具列 */}
      <div style={styles.toolbar}>
        <h1 style={styles.title}>🚀 服務跳轉</h1>
        <button
          style={styles.themeToggle}
          onClick={toggleDarkMode}
        >
          {darkMode ? '☀️ 淺色模式' : '🌙 深色模式'}
        </button>
      </div>

      <div style={styles.content}>
        {/* 服務連結卡片 */}
        <div style={{ ...styles.card, padding: '2rem' }}>
          <h2 style={{ marginTop: 0, marginBottom: '2rem', color: 'var(--text-primary)' }}>
            常用服務連結
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {serviceLinks.map((link) => (
              <a
                key={link.name}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                style={linkButtonStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-3px)';
                  e.currentTarget.style.boxShadow = `0 6px 15px ${link.color}60`; // 懸停時使用服務顏色陰影
                  e.currentTarget.style.borderColor = link.color;
                  // 🎯 確保懸停時也沒有文字底線
                  e.currentTarget.style.textDecoration = 'none'; 
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  e.currentTarget.style.borderColor = 'var(--border-color)';
                  // 🎯 確保離開懸停時也沒有文字底線
                  e.currentTarget.style.textDecoration = 'none';
                }}
              >
                <span style={{ 
                    fontSize: '1.3rem', 
                    // 🎯 使用 link.text_color 來控制字體顏色
                    color: link.text_color 
                }}>
                  {link.name}
                </span>
                <span style={{ fontWeight: '400', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                  {link.description}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Application;