import React, { useEffect, useState } from 'react';
import keycloak from '../keycloak';
import { useTheme } from '../contexts/ThemeContext';

const API = 'https://server67324.ddnsking.com/api';
const PAGE_SIZE = 20;

export default function Logs() {
  const { darkMode, toggleDarkMode, getStyles } = useTheme();
  const styles = getStyles();
  
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1); // 分頁 state

  const fetchLogs = async () => {
    try {
      await keycloak.updateToken(10);
      const response = await fetch(`${API}/logs`, {
        headers: { Authorization: 'Bearer ' + keycloak.token }
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
        setCurrentPage(1); // 重新載入時回到第 1 頁
      }
      setLoading(false);
    } catch (error) {
      console.error('取得日誌失敗:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const getActionStyle = (action) => {
    const actionMap = {
      'upload': styles.statusSuccess,
      'download': styles.statusInfo,
      'delete': styles.statusDanger,
      'lock': styles.statusWarning,
      'unlock': styles.statusSuccess,
      'share': styles.statusInfo,
      'view': styles.statusInfo,
    };
    return actionMap[action.toLowerCase()] || styles.statusInfo;
  };

  const getActionIcon = (action) => {
    const iconMap = {
      'upload': '⬆️',
      'download': '⬇️',
      'delete': '🗑️',
      'lock': '🔒',
      'unlock': '🔓',
      'share': '🔗',
      'view': '👁️',
    };
    return iconMap[action.toLowerCase()] || '📝';
  };

  if (loading) {
    return (
      <div style={{...styles.root, ...styles.container}}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <div style={{ fontSize: '18px', color: 'var(--text-secondary)' }}>載入中…</div>
        </div>
      </div>
    );
  }

  // ===== 分頁計算 =====
  const totalLogs = logs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, totalLogs);
  const currentLogs = logs.slice(startIndex, endIndex); // 當頁資料

  return (
    <div style={{...styles.root, ...styles.container}}>
      {/* 工具列 */}
      <div style={styles.toolbar}>
        <h1 style={styles.title}>📊 系統日誌</h1>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {/* ELK 按鈕 */}
          <a
            href="https://server67324.ddnsking.com/kibana/login?next=%2Fkibana%2F"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...styles.themeToggle,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            🔎 ELK 詳細日誌
          </a>
          <button
            style={styles.themeToggle}
            onClick={toggleDarkMode}
          >
            {darkMode ? '☀️ 淺色模式' : '🌙 深色模式'}
          </button>
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.card}>
          {totalLogs === 0 ? (
            <div style={{ color: 'var(--text-secondary)' }}>目前沒有任何日誌紀錄。</div>
          ) : (
            <>
              <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
                共 {totalLogs} 筆記錄，顯示第 {startIndex + 1}–{endIndex} 筆
              </div>
              
              <div style={{ overflowX: 'auto' }}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={{...styles.th, width: '10%'}}>ID</th>
                      <th style={{...styles.th, width: '15%'}}>使用者</th>
                      <th style={{...styles.th, width: '15%'}}>操作</th>
                      <th style={{...styles.th, width: '30%'}}>檔案</th>
                      <th style={{...styles.th, width: '20%'}}>時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentLogs.map(log => (
                      <tr 
                        key={log.id}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--bg-secondary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <td style={styles.td}>{log.id}</td>
                        <td style={styles.td}>{log.user_id}</td>
                        <td style={styles.td}>
                          <span style={{...styles.status, ...getActionStyle(log.action)}}>
                            {getActionIcon(log.action)} {log.action}
                          </span>
                        </td>
                        <td style={styles.td}>{log.filename || '—'}</td>
                        <td style={styles.td}>
                          {new Date(log.timestamp).toLocaleString('zh-TW')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 分頁控制列 */}
              {totalLogs > PAGE_SIZE && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '0.75rem',
                    fontSize: '0.9rem',
                    color: 'var(--text-secondary)'
                  }}
                >
                  <div>第 {currentPage} / {totalPages} 頁</div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      style={{
                        ...styles.themeToggle,
                        padding: '0.25rem 0.75rem',
                        fontSize: '0.85rem',
                        opacity: currentPage === 1 ? 0.6 : 1,
                        cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      上一頁
                    </button>
                    <button
                      style={{
                        ...styles.themeToggle,
                        padding: '0.25rem 0.75rem',
                        fontSize: '0.85rem',
                        opacity: currentPage === totalPages ? 0.6 : 1,
                        cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                      }}
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      下一頁
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
