import React, { useEffect, useState } from 'react';
import keycloak from '../keycloak';
import { useTheme } from '../contexts/ThemeContext';
console.log("🔍 tokenParsed=", keycloak.tokenParsed);

const API = 'https://server67324.ddnsking.com/api';

//驗證token過期與否
const authFetch = async (path, options = {}) => {
  try {
    await keycloak.updateToken(10);
  } catch (err) {
    console.error(' Token 過期或刷新失敗：', err);
    alert('登入已逾時，請重新登入。');
    keycloak.login();          // 直接導回 Keycloak 登入頁
    throw err;
  }

  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: 'Bearer ' + keycloak.token,
    },
  });

  // 如果後端回 401，一樣當作登入失效處理
  if (res.status === 401) {
    console.warn('收到 401，視為登入失效');
    alert('登入狀態已失效，請重新登入。');
    keycloak.login();
    throw new Error('Unauthorized');
  }

  return res;
};

export default function FileManager() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // ========== 網址分享相關狀態 ==========
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareDialogFile, setShareDialogFile] = useState(null);
  const [shareForm, setShareForm] = useState({
    expiresInHours: 24,
    password: ''
  });
  const [generatedLink, setGeneratedLink] = useState(null);
  const [publicShares, setPublicShares] = useState({});

  const { darkMode, toggleDarkMode, getStyles } = useTheme();
  const styles = getStyles();

  // 視圖模式切換狀態
  // 偵測是否為手機裝置
  const isMobile = () => window.innerWidth <= 768;

  // 視圖模式切換狀態 - 手機預設卡片檢視，桌面預設表格檢視
  const [viewMode, setViewMode] = useState(isMobile() ? 'grid' : 'table');

  
  // ========== 新增缺少的狀態 ==========
  const [uploading, setUploading] = useState(false);
  const [myFiles, setMyFiles] = useState([]);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareExpiry, setShareExpiry] = useState('24');
  const [sharePassword, setSharePassword] = useState('');
  const [currentShareFileId, setCurrentShareFileId] = useState(null);
  
  //檔案列表
  // 檔案列表
  const fetchFiles = async () => {
    try {
      const r = await authFetch('/files');
      const data = await r.json();
      setFiles(data);
      setMyFiles(data);   //  讓 myFiles 也有資料，列表才看得到
      setLoading(false);
    } catch (err) {
      console.error('載入檔案清單失敗：', err);
    }
  };

  // 監聽視窗大小變化，自動切換檢視模式
  useEffect(() => {
    const handleResize = () => {
      const mobile = isMobile();
      if (mobile) {
        setViewMode('grid'); // 手機強制卡片檢視
      } else if (!mobile && viewMode === 'grid') {
        setViewMode('table'); // 桌面切回表格檢視
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [viewMode]);

  const waitForFreshToken = async (maxTries = 15, gapMs = 200) => {
    for (let i = 0; i < maxTries; i++) {
      try { await keycloak.updateToken(0); } catch {}
      if (keycloak.token && keycloak.tokenParsed) return true;
      await new Promise(r => setTimeout(r, gapMs));
    }
    return false;
  };

  const viewFile = async (id, filename) => {
    let res;
    try {
      res = await authFetch(`/files/${id}/view`, { method: 'GET' });
    } catch {
      // 若是 401 / token 過期，authFetch 會處理並導回登入
      return;
    }

    if (!res.ok) {
      if (res.status === 403) {
        alert('檔案被鎖定，無法檢視');
      } else if (res.status === 404) {
        alert('檔案不存在');
      } else {
        alert('讀取檔案發生錯誤。');
      }
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };


  //通用執行 Lock/Unlock API
  async function doLock(id, locked) {
  console.log(' doLock() with tokenParsed=', keycloak.tokenParsed);
    try {
      const r = await authFetch(`/files/${id}/${locked ? 'unlock' : 'lock'}`, {
        method: 'POST',
      });
      if (!r.ok) {
        const msg = await r.text();
        console.error(' lock/unlock failed:', msg);
      } else {
        console.log(` ${locked ? 'Unlocked' : 'Locked'} file ${id}`);
        fetchFiles();
      }
    } catch {}
  }

  /* ——— 通用 Step‑Up MFA ——— */
  const STEPUP_FLAG = 'stepup_in_progress';

  const hasMfaClaim = (t) =>
    !!(t && ((t.amr && t.amr.includes('otp')) || /aal2|mfa/i.test(t.acr || t.aal || '')));

  const needMfa = async (id, locked) => {
    const roles = keycloak.tokenParsed?.realm_access?.roles || [];
    const isSuper = roles.includes('platform_super');
    const t = keycloak.tokenParsed;

    if (isSuper || hasMfaClaim(t)) return true;

    if (sessionStorage.getItem(STEPUP_FLAG) === '1') return false;

    const url = new URL(window.location.href);
    url.searchParams.set('postLock', String(id));
    url.searchParams.set('op', locked ? 'unlock' : 'lock');

    sessionStorage.setItem(STEPUP_FLAG, '1');
    await keycloak.login({
      acr: 'aal2',
      prompt: 'login',
      redirectUri: url.toString(),
    });
    return false;
  };

  /* ——— Upload ——— */
  const handleUpload = async e => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fd = new FormData();
    fd.append('file', file);

    try {
      const r = await authFetch('/upload', {
        method: 'POST',
        body: fd,   // 讓瀏覽器自動加 multipart 的 Content-Type
      });

      if (r.ok) {
        await fetchFiles();
        alert('✅ 上傳成功！');
      } else {
        alert('❌ 上傳失敗');
      }
    } catch (err) {
      // token 過期 / 401 都已在 authFetch 裡 alert + login 了
      console.error('上傳失敗：', err);
    } finally {
      setUploading(false);
    }
  };


  const upload = handleUpload;

  const download = async (id, filename) => {
    await downloadFile(id, filename);
  };

  const del = async (id) => {
    await doDelete(id);
  };

  /* ——— Delete ——— */
  const doDelete = async id => {
    if (!window.confirm('確定刪除?')) return;

    try {
      const r = await authFetch(`/files/${id}`, {
        method: 'DELETE',
      });

      if (r.ok) {
        fetchFiles();
      } else if (r.status === 409) {
        alert('檔案已分享，先撤銷分享申請');
      } else {
        alert('刪除失敗');
      }
    } catch (err) {
      console.error('刪除失敗：', err);
      // token 過期的情況已在 authFetch 裡處理（alert + login）
    }
  };

  /* ——— Lock / Unlock ——— */
  const toggleLock = async (id, locked) => {
    const ok = await needMfa(id, locked);
    if (!ok) return;
    await doLock(id, locked);
  };

  useEffect(() => {
    console.log(
      '🔎 MFA Signals:',
      'amr=', keycloak.tokenParsed?.amr,
      'acr=', keycloak.tokenParsed?.acr,
      'aal=', keycloak.tokenParsed?.aal
    );

    (async () => {
      const url = new URL(window.location.href);
      const postLock = url.searchParams.get('postLock');
      const postDelete = url.searchParams.get('postDelete');
      const op = url.searchParams.get('op');

      if (!postLock && !postDelete) {
        sessionStorage.removeItem(STEPUP_FLAG);
      }

      if (postLock) {
        console.log(`🔁 Detected post-login action: ${op} file ${postLock}`);

        const ok = await waitForFreshToken();
        const t = keycloak.tokenParsed;

        if (ok && hasMfaClaim(t)) {
          await doLock(postLock, op === 'unlock');
        } else {
          console.warn('MFA claim 未就緒，略過這次自動鎖定');
        }

        sessionStorage.removeItem(STEPUP_FLAG);
        url.searchParams.delete('postLock');
        url.searchParams.delete('op');
        window.history.replaceState({}, '', url.toString());
      }

      await fetchFiles();
    })();
  }, []);

  /* ——— Share & Revoke ——— */
  const sendShare = async id => {
    const target = prompt('輸入分享對象帳號');
    if (!target) return;

    try {
      const r = await authFetch(`/files/${id}/share-requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ targetUser: target }),
      });

      if (r.ok) {
        fetchFiles();
      } else {
        alert('分享申請失敗');
      }
    } catch (err) {
      console.error('分享申請失敗：', err);
    }
  };
  const revokeShare = async srid => {
    try {
      const r = await authFetch(`/share-requests/${srid}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'revoke' }),
      });

      if (r.ok) {
        fetchFiles();
      } else {
        alert('撤銷失敗');
      }
    } catch (err) {
      console.error('撤銷失敗：', err);
    }
  };



  /* ——— Download ——— */
  const downloadFile = async (id, filename) => {
    try {
      const response = await authFetch(`/files/${id}/download`, {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('下載失敗');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;

      document.body.appendChild(link);
      link.click();

      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('下載失敗: ' + error.message);
    }
  };

  // ========== 網址分享功能 ==========
  
  const openShareDialog = (file) => {
    if (!file || !file.id) {
      alert('檔案資訊不完整，無法開啟分享對話框');
      return;
    }
    setShareDialogFile(file);
    setShowShareDialog(true);
    setGeneratedLink(null);
    setShareForm({ expiresInHours: 24, password: '' });
    fetchPublicShares(file.id);
  };

  const openShareModal = (fileId) => {
    const file = myFiles.find(f => f.id === fileId);
    if (!file) {
      alert('找不到檔案資訊');
      return;
    }
    setCurrentShareFileId(fileId);
    setShareModalOpen(true);
    setGeneratedLink(null);
    setShareExpiry('24');
    setSharePassword('');
    fetchPublicShares(fileId);
  };

  const closeShareModal = () => {
    setShareModalOpen(false);
    setCurrentShareFileId(null);
  };

  const fetchPublicShares = async (fileId) => {
    try {
      if (!fileId || fileId === 'undefined' || isNaN(fileId)) {
        console.error('無效的 fileId，跳過取得分享連結:', fileId);
        return;
      }

      const r = await authFetch(`/files/${fileId}/public-shares`);
      if (r.ok) {
        const shares = await r.json();
        setPublicShares(prev => ({ ...prev, [fileId]: shares }));
      }
    } catch (err) {
      console.error('取得分享連結失敗:', err);
    }
  };

  const generateShareLink = async () => {
    try {
      const r = await authFetch(`/files/${shareDialogFile.id}/public-share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shareForm),
      });

      if (r.ok) {
        const data = await r.json();
        setGeneratedLink(data.shareUrl);
        fetchPublicShares(shareDialogFile.id);
      } else {
        const error = await r.text();
        alert('生成失敗：' + error);
      }
    } catch (err) {
      alert('生成失敗：' + err.message);
    }
  };

  const createShareLink = async () => {
    if (!currentShareFileId) return;
    try {
      const r = await authFetch(`/files/${currentShareFileId}/public-share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expiresInHours: parseInt(shareExpiry),
          password: sharePassword || undefined,
        }),
      });

      if (r.ok) {
        const data = await r.json();
        setGeneratedLink(data.shareUrl);
        fetchPublicShares(currentShareFileId);
      } else {
        const error = await r.text();
        alert('生成失敗：' + error);
      }
    } catch (err) {
      alert('生成失敗：' + err.message);
    }
  };

  const deleteShareLink = async (shareId) => {
    if (!window.confirm('確定刪除此分享連結？')) return;

    try {
      const r = await authFetch(`/public-shares/${shareId}`, { method: 'DELETE' });
      if (r.ok) {
        fetchPublicShares(shareDialogFile.id);
      } else {
        alert('刪除失敗');
      }
    } catch (err) {
      alert('刪除失敗：' + err.message);
    }
  };

  const copyToClipboard = (text) => {
    const linkToCopy = text || generatedLink;
    if (!linkToCopy) {
      alert('❌ 沒有可複製的連結');
      return;
    }
    
    navigator.clipboard.writeText(linkToCopy).then(() => {
      alert('✅ 已複製到剪貼簿！');
    }).catch(() => {
      alert('❌ 複製失敗，請手動複製');
    });
  };

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    const iconMap = {
      pdf: '📄',
      doc: '📄',
      docx: '📄',
      txt: '📄',
      png: '🖼️',
      jpg: '🖼️',
      jpeg: '🖼️',
      gif: '🖼️',
      svg: '🖼️',
      xlsx: '📊',
      xls: '📊',
      csv: '📊',
      zip: '📦',
      rar: '📦',
      '7z': '📦',
    };
    return iconMap[ext] || '📁';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (dateString) => {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-TW');
  };

  // 新增縮圖組件
  const FileThumbnail = ({ fileId, filename, locked }) => {
  const [thumbnailUrl, setThumbnailUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadThumbnail = async () => {
      try {
        await keycloak.updateToken(10);
        const response = await fetch(`${API}/files/${fileId}/thumbnail`, {
          headers: { Authorization: 'Bearer ' + keycloak.token }
        });

        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          setThumbnailUrl(url);
        }
      } catch (err) {
        console.error('載入縮圖失敗:', err);
      } finally {
        setLoading(false);
      }
    };

    loadThumbnail();

    // 清理函數
    return () => {
      if (thumbnailUrl) {
        URL.revokeObjectURL(thumbnailUrl);
      }
    };
  }, [fileId]);

  return (
    <div style={customStyles.thumbnailContainer}>
      {loading ? (
        <div style={customStyles.thumbnailPlaceholder}>⏳</div>
      ) : thumbnailUrl ? (
        <>
          <img 
            src={thumbnailUrl} 
            alt={filename}
            style={customStyles.thumbnail}
          />
          {locked && (
            <div style={customStyles.lockedOverlay}>
              🔒
            </div>
          )}
        </>
      ) : (
        <div style={customStyles.thumbnailPlaceholder}>
          {getFileIcon(filename)}
        </div>
      )}
    </div>
  );
};

  // ============================================

  const disabledActionStyle = {
    opacity: 0.5,
    cursor: 'not-allowed',
  }

  const customStyles = {
    fileGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: '1.5rem',
      marginTop: '1.5rem',
    },
    fileCard: {
      background: 'var(--bg-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      padding: '1.5rem',
      transition: 'all 0.2s',
      boxShadow: 'var(--shadow-md)',
      cursor: 'pointer',
    },
    fileIcon: {
      fontSize: '3rem',
      marginBottom: '1rem',
      textAlign: 'center',
    },
    fileName: {
      fontSize: '1rem',
      fontWeight: '600',
      color: 'var(--text-primary)',
      marginBottom: '0.5rem',
      wordBreak: 'break-word',
    },
    fileInfo: {
      fontSize: '0.875rem',
      color: 'var(--text-secondary)',
      marginBottom: '1rem',
    },
    fileActions: {
      display: 'flex',
      gap: '0.5rem',
      flexWrap: 'wrap',
    },
    actionButton: {
      flex: 1,
      minWidth: '80px',
      padding: '0.5rem',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.85rem',
      fontWeight: '500',
      transition: 'all 0.2s',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
    },
    uploadSection: {
      ...styles.card,
      textAlign: 'center',
      padding: '2rem',
      marginBottom: '1.5rem',
    },
    uploadButton: {
      ...styles.button,
      ...styles.primaryButton,
      fontSize: '1rem',
      padding: '0.75rem 2rem',
      cursor: 'pointer',
    },
    modal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    },
    modalContent: {
      background: 'var(--bg-primary)',
      borderRadius: '12px',
      padding: '2rem',
      maxWidth: '500px',
      width: '90%',
      maxHeight: '90vh',
      overflow: 'auto',
      boxShadow: 'var(--shadow-xl)',
    },
    modalHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '1.5rem',
      paddingBottom: '1rem',
      borderBottom: '2px solid var(--border-color)',
    },
    modalTitle: {
      fontSize: '1.5rem',
      fontWeight: '600',
      color: 'var(--text-primary)',
      margin: 0,
    },
    closeButton: {
      background: 'none',
      border: 'none',
      fontSize: '1.5rem',
      cursor: 'pointer',
      color: 'var(--text-secondary)',
      padding: '0',
      width: '30px',
      height: '30px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '6px',
      transition: 'all 0.2s',
    },
    formGroup: {
      marginBottom: '1.5rem',
    },
    label: {
      display: 'block',
      marginBottom: '0.5rem',
      fontWeight: '600',
      color: 'var(--text-primary)',
      fontSize: '0.9rem',
    },
    input: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      fontSize: '0.9rem',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      transition: 'all 0.2s',
      boxSizing: 'border-box',
    },
    select: {
      width: '100%',
      padding: '0.75rem',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      fontSize: '0.9rem',
      background: 'var(--bg-secondary)',
      color: 'var(--text-primary)',
      cursor: 'pointer',
      boxSizing: 'border-box',
    },
    generatedLinkBox: {
      background: 'var(--bg-secondary)',
      border: '2px solid var(--accent-color)',
      borderRadius: '8px',
      padding: '1rem',
      marginTop: '1rem',
    },
    linkText: {
      wordBreak: 'break-all',
      color: 'var(--accent-color)',
      fontSize: '0.9rem',
      marginBottom: '1rem',
      fontFamily: 'monospace',
    },
    emptyState: {
      textAlign: 'center',
      padding: '3rem',
      color: 'var(--text-secondary)',
    },
    // ========== 新增：表格視圖樣式 ==========
    tableContainer: {
      background: 'var(--bg-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-lg)',
    },
    tableWrapper: {
      overflowX: 'auto',
    },
    table: {
      width: '100%',
      borderCollapse: 'collapse',
      minWidth: '600px',
    },
    thead: {
      background: 'var(--bg-tertiary)',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
    },
    th: {
      padding: '0.875rem',
      textAlign: 'left',
      fontWeight: '600',
      color: 'var(--text-primary)',
      borderBottom: '2px solid var(--border-color)',
      whiteSpace: 'nowrap',
      fontSize: '0.875rem',
    },
    td: {
      padding: '0.875rem',
      borderBottom: '1px solid var(--border-color)',
      color: 'var(--text-primary)',
      fontSize: '0.875rem',
    },
    tr: {
      transition: 'all 0.2s',
    },
    fileNameCell: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      fontWeight: '500',
    },
    fileTypeIcon: {
      width: '36px',
      height: '36px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg-secondary)',
      borderRadius: '6px',
      fontSize: '1.25rem',
      boxShadow: 'var(--shadow-sm)',
      flexShrink: 0,
    },
    status: {
      display: 'inline-block',
      padding: '0.25rem 0.75rem',
      borderRadius: '12px',
      fontSize: '0.75rem',
      fontWeight: '500',
      boxShadow: 'var(--shadow-sm)',
    },
    statusLocked: {
      background: '#fee2e2',
      color: '#991b1b',
    },
    statusShared: {
      background: '#dcfce7',
      color: '#166534',
    },
    btnGroup: {
      display: 'flex',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
    },
    btnGroupButton: {
      background: 'var(--bg-primary)',
      border: 'none',
      padding: '0.5rem 0.75rem',
      cursor: 'pointer',
      color: 'var(--text-primary)',
      borderRight: '1px solid var(--border-color)',
      transition: 'all 0.2s',
      fontSize: '0.9rem',
    },
    btnGroupButtonActive: {
      background: 'var(--accent-color)',
      color: 'white',
      boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',
    },
    tableActionButton: {
      padding: '0.4rem 0.8rem',
      border: '1px solid var(--border-color)',
      borderRadius: '6px',
      cursor: 'pointer',
      fontSize: '0.8rem',
      fontWeight: '500',
      transition: 'all 0.2s',
      background: 'var(--bg-primary)',
      color: 'var(--text-primary)',
      boxShadow: 'var(--shadow-sm)',
      marginRight: '0.5rem',
    },
    dangerButton: {
      color: 'var(--danger-color)',
      borderColor: 'var(--border-color)',
    },
    // 縮圖相關樣式
    thumbnailContainer: {
    width: '100%',
    height: '160px',
    marginBottom: '1rem',
    borderRadius: '8px',
    overflow: 'hidden',
    background: 'var(--bg-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  thumbnailPlaceholder: {
    fontSize: '4rem',
    color: 'var(--text-secondary)',
    opacity: 0.5,
  },
  lockedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2rem',
  },
};

  return (
    <div style={{...styles.root, ...styles.container}}>
      {/* 工具列 */}
      <div style={styles.toolbar}>
        <h1 style={styles.title}>📁 我的檔案</h1>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {/* 視圖切換按鈕 - 僅在桌面顯示 */}
          {!isMobile() && (
            <div style={customStyles.btnGroup}>
              <button
                style={{
                  ...customStyles.btnGroupButton,
                  ...(viewMode === 'table' ? customStyles.btnGroupButtonActive : {}),
                  borderRight: '1px solid var(--border-color)',
                }}
                onClick={() => setViewMode('table')}
              >
                📋 列表樣式
              </button>
              <button
                style={{
                  ...customStyles.btnGroupButton,
                  ...(viewMode === 'grid' ? customStyles.btnGroupButtonActive : {}),
                  borderRight: 'none',
                }}
                onClick={() => setViewMode('grid')}
              >
                🎴 表格樣式
              </button>
            </div>
          )}
          <button
            style={styles.themeToggle}
            onClick={toggleDarkMode}
          >
            {darkMode ? '☀️ 淺色模式' : '🌙 深色模式'}
          </button>
        </div>
      </div>

      <div style={styles.content}>
        {/* 上傳區域 */}
        <div style={customStyles.uploadSection}>
          <h2 style={{ marginTop: 0, marginBottom: '1rem', color: 'var(--text-primary)' }}>
            上傳新檔案
          </h2>
          <label style={customStyles.uploadButton}>
            {uploading ? '上傳中...' : '📤 選擇檔案上傳'}
            <input
              type="file"
              onChange={upload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        </div>

        {/* 檔案列表 - 根據 viewMode 切換 */}
        {myFiles.length === 0 ? (
          <div style={{...styles.card, ...customStyles.emptyState}}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📂</div>
            <div>尚無檔案，請上傳您的第一個檔案</div>
          </div>
        ) : viewMode === 'table' ? (
          // ========== 表格視圖 ==========
          <div style={customStyles.tableContainer}>
            <div style={customStyles.tableWrapper}>
              <table style={customStyles.table}>
                <thead style={customStyles.thead}>
                  <tr>
                    <th style={{...customStyles.th, width: '40%'}}>檔案名稱</th>
                    <th style={{...customStyles.th, width: '10%'}}>大小</th>
                    <th style={{...customStyles.th, width: '12%'}}>上傳日期</th>
                    <th style={{...customStyles.th, width: '10%'}}>狀態</th>
                    <th style={{...customStyles.th, width: '28%'}}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {myFiles.map(f => (
                    <tr 
                      key={f.id}
                      style={customStyles.tr}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--bg-secondary)';
                        e.currentTarget.style.boxShadow = 'inset 0 0 0 1px var(--accent-color)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.boxShadow = 'none';
                      }}
                    >
                      <td style={customStyles.td}>
                        <div style={customStyles.fileNameCell}>
                          <div style={customStyles.fileTypeIcon}>
                            {getFileIcon(f.filename)}
                          </div>
                          <span>{f.filename}</span>
                        </div>
                      </td>
                      <td style={customStyles.td}>{formatFileSize(f.size)}</td>
                      <td style={customStyles.td}>{formatDate(f.uploaded_at)}</td>
                      <td style={customStyles.td}>
                        {f.locked ? (
                          <span style={{...customStyles.status, ...customStyles.statusLocked}}>
                            🔒 已鎖定
                          </span>
                        ) : f.shared ? (
                          <span style={{...customStyles.status, ...customStyles.statusShared}}>
                            ✅ 已分享
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={customStyles.td}>
                        <button
                          style={customStyles.tableActionButton}
                          onClick={() => viewFile(f.id, f.filename)}
                          onMouseEnter={(e) => {
                            e.target.style.background = 'var(--bg-tertiary)';
                            e.target.style.borderColor = 'var(--text-secondary)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = 'var(--bg-primary)';
                            e.target.style.borderColor = 'var(--border-color)';
                          }}
                        >
                          👁️ 檢視
                        </button>
                        <button
                          style={{
                            ...customStyles.tableActionButton,
                            ...(f.locked ? disabledActionStyle : {}),
                          }}
                          disabled={f.locked}
                          onClick={() => download(f.id, f.filename)}
                          onMouseEnter={(e) => {
                            e.target.style.background = 'var(--bg-tertiary)';
                            e.target.style.borderColor = 'var(--text-secondary)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = 'var(--bg-primary)';
                            e.target.style.borderColor = 'var(--border-color)';
                          }}
                        >
                          ⬇️ 下載
                        </button>
                        <button
                          style={customStyles.tableActionButton}
                          onClick={() => toggleLock(f.id, f.locked)}
                          onMouseEnter={(e) => {
                            e.target.style.background = 'var(--bg-tertiary)';
                            e.target.style.borderColor = 'var(--text-secondary)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = 'var(--bg-primary)';
                            e.target.style.borderColor = 'var(--border-color)';
                          }}
                        >
                          {f.locked ? '🔓 解鎖' : '🔒 鎖定'}
                        </button>
                        <button
                          style={{
                            ...customStyles.tableActionButton,
                            ...(f.locked ? disabledActionStyle : {}),
                          }}
                          disabled={f.locked}
                          onClick={() => {
                            if (f.locked) return;
                            openShareModal(f.id);
                          }}
                          onMouseEnter={(e) => {
                            if (f.locked) return;
                            e.target.style.background = 'var(--bg-tertiary)';
                            e.target.style.borderColor = 'var(--text-secondary)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.background = 'var(--bg-primary)';
                            e.target.style.borderColor = 'var(--border-color)';
                          }}
                        >
                          🔗 分享
                        </button>
                        <button
                          style={{
                            ...customStyles.tableActionButton,
                            ...customStyles.dangerButton,
                            ...(f.locked ? disabledActionStyle : {}),
                          }}
                          disabled={f.locked}
                          onClick={() => {
                            if (f.locked) return;
                            del(f.id);
                          }}
                          onMouseEnter={(e) => {
                            if (f.locked) return;
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
                          🗑️ 刪除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          // ========== 卡片視圖 ==========
          <div style={customStyles.fileGrid}>
            {myFiles.map(f => (
              <div
                key={f.id}
                style={customStyles.fileCard}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-xl)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                }}
              >
                {/* 新增：顯示縮圖 */}
                <FileThumbnail 
                  fileId={f.id} 
                  filename={f.filename}
                  locked={f.locked}
                />
                
                <div style={customStyles.fileName}>{f.filename}</div>
                <div style={customStyles.fileInfo}>
                  {f.size && <div>大小: {formatFileSize(f.size)}</div>}
                  {f.uploaded_at && (
                    <div>上傳: {formatDate(f.uploaded_at)}</div>
                  )}
                </div>
                <div style={customStyles.fileActions}>
                  {/* 保留原有的按鈕 */}
                  <button
                    style={customStyles.actionButton}
                    onClick={() => viewFile(f.id, f.filename)}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'var(--info-color)';
                      e.target.style.color = 'white';
                      e.target.style.borderColor = 'var(--info-color)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'var(--bg-secondary)';
                      e.target.style.color = 'var(--text-primary)';
                      e.target.style.borderColor = 'var(--border-color)';
                    }}
                  >
                    👁️ 檢視
                  </button>
                  <button
                    style={{
                      ...customStyles.actionButton,
                      ...(f.locked ? disabledActionStyle : {}),
                    }}
                    disabled={f.locked}
                    onClick={() => {
                      if (f.locked) return;
                      download(f.id);
                    }}
                    onMouseEnter={(e) => {
                      if (f.locked) return;
                      e.target.style.background = 'var(--info-color)';
                      e.target.style.color = 'white';
                      e.target.style.borderColor = 'var(--info-color)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'var(--bg-secondary)';
                      e.target.style.color = 'var(--text-primary)';
                      e.target.style.borderColor = 'var(--border-color)';
                    }}
                  >
                    ⬇️ 下載
                  </button>
                  <button
                    style={{
                      ...customStyles.actionButton,
                      ...(f.locked ? disabledActionStyle : {}),
                    }}
                    disabled={f.locked}
                    onClick={() => {
                      if (f.locked) return;
                      openShareModal(f.id);
                    }}
                    onMouseEnter={(e) => {
                      if (f.locked) return;
                      e.target.style.background = 'var(--info-color)';
                      e.target.style.color = 'white';
                      e.target.style.borderColor = 'var(--info-color)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'var(--bg-secondary)';
                      e.target.style.color = 'var(--text-primary)';
                      e.target.style.borderColor = 'var(--border-color)';
                    }}
                  >
                    🔗 分享
                  </button>
                  <button
                    style={{
                      ...customStyles.actionButton,
                      ...(f.locked ? disabledActionStyle : {}),
                    }}
                    disabled={f.locked}
                    onClick={() => {
                      if (f.locked) return;
                      del(f.id);
                    }}
                    onMouseEnter={(e) => {
                      if (f.locked) return;
                      e.target.style.background = 'var(--danger-color)';
                      e.target.style.color = 'white';
                      e.target.style.borderColor = 'var(--danger-color)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'var(--bg-secondary)';
                      e.target.style.color = 'var(--text-primary)';
                      e.target.style.borderColor = 'var(--border-color)';
                    }}
                  >
                    🗑️ 刪除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 分享模態框 */}
      {shareModalOpen && (
        <div style={customStyles.modal} onClick={closeShareModal}>
          <div style={customStyles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={customStyles.modalHeader}>
              <h2 style={customStyles.modalTitle}>🔗 建立分享連結</h2>
              <button
                style={customStyles.closeButton}
                onClick={closeShareModal}
                onMouseEnter={(e) => {
                  e.target.style.background = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'none';
                }}
              >
                ✕
              </button>
            </div>

            <div style={customStyles.formGroup}>
              <label style={customStyles.label}>⏰ 有效期限</label>
              <select
                style={customStyles.select}
                value={shareExpiry}
                onChange={(e) => setShareExpiry(e.target.value)}
              >
                <option value="1">1 小時</option>
                <option value="6">6 小時</option>
                <option value="24">24 小時</option>
                <option value="72">3 天</option>
                <option value="168">7 天</option>
                <option value="720">30 天</option>
              </select>
            </div>

            <div style={customStyles.formGroup}>
              <label style={customStyles.label}>🔒 密碼保護（選填）</label>
              <input
                type="password"
                style={customStyles.input}
                placeholder="留空表示不設密碼"
                value={sharePassword}
                onChange={(e) => setSharePassword(e.target.value)}
              />
            </div>

            <button
              style={{...styles.button, ...styles.primaryButton, width: '100%'}}
              onClick={createShareLink}
              onMouseEnter={(e) => {
                e.target.style.background = 'var(--accent-hover)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'var(--accent-color)';
              }}
            >
              🎯 生成分享連結
            </button>

            {generatedLink && (
              <div style={customStyles.generatedLinkBox}>
                <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                  ✅ 分享連結已生成
                </div>
                <div style={customStyles.linkText}>{generatedLink}</div>
                <button
                  style={{...styles.button, width: '100%'}}
                  onClick={() => copyToClipboard(generatedLink)}
                  onMouseEnter={(e) => {
                    e.target.style.background = 'var(--bg-tertiary)';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.background = 'var(--bg-primary)';
                  }}
                >
                  📋 複製連結
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}