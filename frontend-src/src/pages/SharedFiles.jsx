import React, { useEffect, useState } from 'react';
import keycloak from '../keycloak';
import { useTheme } from '../contexts/ThemeContext';

const API = 'https://server67324.ddnsking.com/api';

export default function SharedFiles() {
  const { darkMode, toggleDarkMode, getStyles } = useTheme();
  const styles = getStyles();
  
  const [myFiles, setMyFiles] = useState([]);
  const [publicShares, setPublicShares] = useState({});

  // 取得我的檔案列表
  const fetchMyFiles = () => {
    keycloak.updateToken(10).then(() => {
      fetch(`${API}/files`, { 
        headers: { Authorization: 'Bearer ' + keycloak.token } 
      })
        .then(r => r.json())
        .then(setMyFiles);
    });
  };

  // 取得某個檔案的公開分享連結
  const fetchPublicShares = async (fileId) => {
    try {
      if (!fileId || fileId === 'undefined' || isNaN(fileId)) {
        console.error('無效的 fileId，跳過取得分享連結:', fileId);
        return;
      }

      await keycloak.updateToken(10);
      const r = await fetch(`${API}/files/${fileId}/public-shares`, {
        headers: { Authorization: 'Bearer ' + keycloak.token }
      });
      if (r.ok) {
        const shares = await r.json();
        setPublicShares(prev => ({ ...prev, [fileId]: shares }));
      }
    } catch (err) {
      console.error('取得分享連結失敗:', err);
    }
  };

  // 刪除單一公開分享連結
  const deleteShareLink = async (shareId, fileId) => {
    if (!window.confirm('確定刪除此分享連結？')) return;
    try {
      await keycloak.updateToken(10);
      const r = await fetch(`${API}/public-shares/${shareId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + keycloak.token }
      });
      if (r.ok) {
        fetchPublicShares(fileId);
      } else {
        alert('刪除失敗');
      }
    } catch (err) {
      alert('刪除失敗：' + err.message);
    }
  };
  
  // 刪除某檔案的所有公開分享連結
  const deleteAllLinksForFile = async (fileId) => {
    const sharesToDelete = publicShares[fileId] || [];
    if (sharesToDelete.length === 0) return;
    if (!window.confirm(`確定要一次刪除此檔案的所有 ${sharesToDelete.length} 個分享連結嗎？`)) return;

    try {
      await keycloak.updateToken(10);
      const deletePromises = sharesToDelete.map(share => 
        fetch(`${API}/public-shares/${share.id}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + keycloak.token }
        })
      );
      await Promise.all(deletePromises);
      fetchPublicShares(fileId);
    } catch (err) {
      alert('刪除過程中發生錯誤：' + err.message);
    }
  };

  // 一鍵刪除所有已過期的連結
  const deleteAllExpiredLinks = async () => {
    const allShares = Object.values(publicShares).flat();
    const expiredShares = allShares.filter(share => new Date(share.expires_at) < new Date());

    if (expiredShares.length === 0) {
      alert('太棒了！沒有任何已過期的連結。');
      return;
    }

    if (!window.confirm(`偵測到 ${expiredShares.length} 個已過期的連結，確定要將它們全部清除嗎？`)) {
      return;
    }

    try {
      await keycloak.updateToken(10);
      const deletePromises = expiredShares.map(share => 
        fetch(`${API}/public-shares/${share.id}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + keycloak.token }
        })
      );
      
      const results = await Promise.all(deletePromises);
      const failedCount = results.filter(r => !r.ok).length;

      if (failedCount > 0) {
        alert(`操作完成，但有 ${failedCount} 個連結刪除失敗，請稍後重試。`);
      } else {
        alert(`成功！已清除所有 ${expiredShares.length} 個過期連結。`);
      }

      const fileIdsToRefresh = [...new Set(expiredShares.map(share => share.file_id))];
      fileIdsToRefresh.forEach(fileId => fetchPublicShares(fileId));

    } catch (err) {
      alert('刪除過程中發生錯誤：' + err.message);
    }
  };

  // 複製連結
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('✅ 已複製到剪貼簿！');
    }).catch(() => {
      alert('❌ 複製失敗，請手動複製');
    });
  };

  useEffect(() => {
    fetchMyFiles();
  }, []);

  useEffect(() => {
  myFiles.forEach(file => {
    if (!publicShares[file.id]) {
      fetchPublicShares(file.id);
    }
  });
}, [myFiles]);

  // 計算總過期連結數
  const totalExpiredCount = Object.values(publicShares).flat().filter(s => new Date(s.expires_at) < new Date()).length;

  const customStyles = {
    fileCard: {
      ...styles.card,
      marginBottom: '1.5rem',
    },
    fileHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingBottom: '1rem',
      marginBottom: '1rem',
      borderBottom: '1px solid var(--border-color)',
    },
    fileName: {
      fontSize: '1.1rem',
      fontWeight: '600',
      color: 'var(--text-primary)',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
    },
    badge: {
      ...styles.status,
      ...styles.statusInfo,
    },
    shareItem: {
      display: 'grid',
      gridTemplateColumns: '1fr auto',
      alignItems: 'center',
      gap: '1rem',
      padding: '1rem',
      background: 'var(--bg-secondary)',
      borderRadius: '8px',
      border: '1px solid var(--border-color)',
      marginBottom: '0.75rem',
    },
    shareDetails: {
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
    },
    detailRow: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '0.875rem',
      color: 'var(--text-primary)',
    },
    linkText: {
      fontFamily: 'monospace',
      fontSize: '0.8rem',
      color: 'var(--accent-color)',
      wordBreak: 'break-all',
      background: darkMode ? '#1e3a8a' : '#f0f4ff',
      padding: '0.25rem 0.5rem',
      borderRadius: '4px',
    },
    expiredText: {
      color: 'var(--danger-color)',
      fontWeight: '600',
      fontSize: '0.75rem',
    },
    shareActions: {
      display: 'flex',
      gap: '0.5rem',
      flexDirection: 'column',
    },
    emptyState: {
      ...styles.card,
      textAlign: 'center',
      padding: '3rem',
      color: 'var(--text-secondary)',
    },
  };

  return (
    <div style={{...styles.root, ...styles.container}}>
      {/* 工具列 */}
      <div style={styles.toolbar}>
        <h1 style={styles.title}>🔗 分享管理</h1>
        <button
          style={styles.themeToggle}
          onClick={toggleDarkMode}
        >
          {darkMode ? '☀️ 淺色模式' : '🌙 深色模式'}
        </button>
      </div>

      <div style={styles.content}>
        {/* 操作按鈕 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
          <button
            onClick={deleteAllExpiredLinks}
            style={{
              ...styles.button,
              ...styles.primaryButton,
              background: 'var(--danger-color)',
            }}
            disabled={totalExpiredCount === 0}
            onMouseEnter={(e) => {
              if (totalExpiredCount > 0) {
                e.target.style.opacity = '0.9';
                e.target.style.transform = 'translateY(-2px)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.opacity = '1';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            🗑️ 一鍵清除所有過期連結 {totalExpiredCount > 0 && `(${totalExpiredCount})`}
          </button>
        </div>

        {myFiles.length === 0 ? (
          <div style={customStyles.emptyState}>您尚未上傳任何檔案</div>
        ) : (
          myFiles.map(file => {
            const shares = publicShares[file.id] || [];
            if (shares.length === 0) return null;

            return (
              <div key={file.id} style={customStyles.fileCard}>
                <div style={customStyles.fileHeader}>
                  <div style={customStyles.fileName}>
                    📄
                    <span>{file.filename}</span>
                    <span style={customStyles.badge}>{shares.length} 個連結</span>
                  </div>
                  <button
                    onClick={() => deleteAllLinksForFile(file.id)}
                    style={{...styles.button, ...styles.dangerButton}}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'var(--danger-color)';
                      e.target.style.color = 'white';
                      e.target.style.borderColor = 'var(--danger-color)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'var(--bg-primary)';
                      e.target.style.color = 'var(--danger-color)';
                      e.target.style.borderColor = 'var(--border-color)';
                    }}
                  >
                    清除全部
                  </button>
                </div>

                {shares.map(share => {
                  const isExpired = new Date(share.expires_at) < new Date();
                  return (
                    <div key={share.id} style={customStyles.shareItem}>
                      <div style={{...customStyles.shareDetails, opacity: isExpired ? 0.5 : 1}}>
                        <div style={customStyles.detailRow}>
                          <span>🔗</span>
                          <span style={customStyles.linkText}>{share.shareUrl}</span>
                        </div>
                        <div style={customStyles.detailRow}>
                          <span>⏰</span>
                          <span>{new Date(share.expires_at).toLocaleString('zh-TW')}</span>
                          {isExpired && <span style={customStyles.expiredText}>(已過期)</span>}
                        </div>
                        <div style={customStyles.detailRow}>
                          <span>📊</span>
                          <span>下載 {share.download_count} 次</span>
                          {share.has_password && <span style={{ color: 'var(--warning-color)' }}> 🔒 有密碼</span>}
                        </div>
                      </div>
                      <div style={customStyles.shareActions}>
                        <button
                          onClick={() => copyToClipboard(share.shareUrl)}
                          style={{
                            ...styles.button,
                            opacity: isExpired ? 0.5 : 1,
                            cursor: isExpired ? 'not-allowed' : 'pointer',
                          }}
                          disabled={isExpired}
                        >
                          複製
                        </button>
                        <button
                          onClick={() => deleteShareLink(share.id, file.id)}
                          style={{...styles.button, ...styles.dangerButton}}
                          onMouseEnter={(e) => {
                            e.target.style.background = 'var(--danger-color)';
                            e.target.style.color = 'white';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = 'var(--bg-primary)';
                            e.target.style.color = 'var(--danger-color)';
                          }}
                        >
                          刪除
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })
        )}

        {myFiles.length > 0 && myFiles.every(f => !publicShares[f.id] || publicShares[f.id].length === 0) && (
          <div style={customStyles.emptyState}>您尚未建立任何公開分享連結</div>
        )}
      </div>
    </div>
  );
}