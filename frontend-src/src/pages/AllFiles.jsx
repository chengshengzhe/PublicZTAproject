import React, { useEffect, useState, useRef } from 'react';
import keycloak from '../keycloak';
import { useTheme } from '../contexts/ThemeContext';

export default function AllFiles() {
  const { darkMode, toggleDarkMode, getStyles } = useTheme();
  const styles = getStyles();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const STEPUP_ALL = 'allfiles_stepup';
  const hasFetched = useRef(false);

  const hasMfaClaim = (t) =>
    !!(
      t &&
      (
        (t.amr && t.amr.includes('otp')) ||
        /aal2|mfa/i.test(t.acr || t.aal || '')
      )
    );

  // 等 Keycloak 拿到新 token
  const waitForFreshToken = async (maxTries = 15, gapMs = 200) => {
    for (let i = 0; i < maxTries; i++) {
      try {
        await keycloak.updateToken(0);
      } catch (e) {
      }
      if (keycloak.token && keycloak.tokenParsed) return true;
      await new Promise((r) => setTimeout(r, gapMs));
    }
    return false;
  };
  
  // OTP 檢查
  const ensureAllFilesOtp = async () => {
    const t = keycloak.tokenParsed;
    const roles = t?.realm_access?.roles || [];
    const isAdmin = roles.includes('workspace_admin');
    const isSuper = roles.includes('platform_super');

    if (!isAdmin || isSuper) return true;

    if (hasMfaClaim(t)) return true;

    const stepFlag = sessionStorage.getItem(STEPUP_ALL);

    // 沒有 OTP，清 flag，重導到登入
    if (stepFlag === '1') {
      alert('OTP 驗證狀態異常，重新導向登入頁面');
      sessionStorage.removeItem(STEPUP_ALL);

      await keycloak.login({
        acr: 'aal2',
        prompt: 'login',
        redirectUri: window.location.href,
      });
      return false;
    }

    // OTP 登入流程
    const url = new URL(window.location.href);
    url.searchParams.set('postAll', '1');
    sessionStorage.setItem(STEPUP_ALL, '1');

    await keycloak.login({
      acr: 'aal2',
      prompt: 'login',
      redirectUri: url.toString(),
    });
    return false;
  };

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    (async () => {
      // 檢查是否完成OTP
      const url = new URL(window.location.href);
      const postAll = url.searchParams.get('postAll');

      if (postAll === '1') {
        // 等新 token
        await waitForFreshToken();
        // 清掉 flag & query
        sessionStorage.removeItem(STEPUP_ALL);
        url.searchParams.delete('postAll');
        window.history.replaceState({}, '', url.toString());
      }

      // 確認 OTP
      const ok = await ensureAllFilesOtp();
      if (!ok) return;

      await fetchAll();
    })();
  }, []);



  const fetchAll = async () => {
    const roles = keycloak.tokenParsed?.realm_access?.roles || [];
    const clientRoles = keycloak.tokenParsed?.resource_access?.['file-service']?.roles || [];
    const allRoles = [...roles, ...clientRoles];
    const isSuper = allRoles.includes('platform_super');
    const isAdmin = allRoles.includes('workspace_admin');

    //token 是否過期
    try {
      await keycloak.updateToken(10);
    } catch (err) {
      console.error('Token 過期或刷新失敗：', err);
      alert('登入已逾時，請重新登入。');
      keycloak.login();
      return;
    }

    const res = await fetch('/api/files/all', {
      headers: { Authorization: 'Bearer ' + keycloak.token },
    });

    if (!res.ok) {
      alert('載入所有檔案失敗（狀態碼：' + res.status + '）');
      setLoading(false);
      return;
    }

    const data = await res.json();
    setList(data);
    setLoading(false);
  };

  const del = (id) => {
    if (!window.confirm('確定刪除?')) return;
    keycloak.updateToken(10).then(() => {
      fetch(`/api/files/${id}`, { 
        method: 'DELETE', 
        headers: { Authorization: 'Bearer ' + keycloak.token } 
      }).then(fetchAll);
    });
  };
  // 檢視
  const viewFile = async (id) => {
    try {
      await keycloak.updateToken(10);
      const res = await fetch(`/api/files/${id}/view`, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + keycloak.token }
      });

      if (!res.ok) {
        if (res.status === 404) alert('檔案不存在');
        else alert('讀取檔案發生錯誤');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      console.error('檢視失敗：', err);
    }
  };

  // 下載
  const downloadFile = async (id, filename) => {
    try {
      await keycloak.updateToken(10);
      const res = await fetch(`/api/files/${id}/download`, {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + keycloak.token }
      });

      if (!res.ok) {
        alert('下載失敗');
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('下載失敗：', err);
    }
  };

  // 分享
  const shareFile = async (id) => {
    const hours = prompt('輸入分享有效時間（小時）');
    if (!hours) return;

    try {
      await keycloak.updateToken(10);
      const res = await fetch(`/api/files/${id}/public-share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + keycloak.token,
        },
        body: JSON.stringify({ expiresInHours: Number(hours) }),
      });

      if (!res.ok) {
        alert('建立分享連結失敗');
        return;
      }

      const data = await res.json();
      alert(`分享連結：${data.shareUrl}`);
    } catch (err) {
      console.error('分享失敗：', err);
    }
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

  return (
    <div style={{...styles.root, ...styles.container}}>
      {/* 工具列 */}
      <div style={styles.toolbar}>
        <h1 style={styles.title}>📋 所有檔案 (管理員)</h1>
        <button
          style={styles.themeToggle}
          onClick={toggleDarkMode}
        >
          {darkMode ? '☀️ 淺色模式' : '🌙 深色模式'}
        </button>
      </div>

      <div style={styles.content}>
        <div style={styles.card}>
          <div style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            共 {list.length} 個檔案
          </div>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>ID</th>
                  <th style={styles.th}>檔名</th>
                  <th style={styles.th}>擁有者</th>
                  <th style={styles.th}>狀態</th>
                  <th style={styles.th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map(f => (
                  <tr 
                    key={f.id}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--bg-secondary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <td style={styles.td}>{f.id}</td>
                    <td style={styles.td}>{f.filename}</td>
                    <td style={styles.td}>{f.uploader ? `${f.uploader} (${f.owner_id})` : f.owner_id}</td>
                    <td style={styles.td}>
                      {f.locked ? '🔒 已鎖定' : '✅ 未鎖定'}
                    </td>
                    <td style={styles.td}>
                    <button
                      style={styles.button}
                      onClick={() => viewFile(f.id)}
                    >
                      👁️ 檢視
                    </button>

                    <button
                      style={{
                        ...styles.button,
                        opacity: f.locked ? 0.5 : 1,
                        cursor: f.locked ? 'not-allowed' : 'pointer',
                      }}
                      disabled={f.locked}
                      onClick={() => {
                        if (f.locked) return;
                        downloadFile(f.id, f.filename);
                      }}
                    >
                      ⬇️ 下載
                    </button>
                    <button
                      style={{
                        ...styles.button,
                        opacity: f.locked ? 0.5 : 1,
                        cursor: f.locked ? 'not-allowed' : 'pointer',
                      }}
                      disabled={f.locked}
                      onClick={() => {
                        if (f.locked) return;
                        shareFile(f.id);
                      }}
                    >
                      🔗 分享
                    </button>

                    <button
                      style={{
                        ...styles.button,
                        opacity: f.locked ? 0.5 : 1,
                        cursor: f.locked ? 'not-allowed' : 'pointer',
                        color: 'var(--danger-color)',
                        borderColor: 'var(--danger-color)',
                      }}
                      disabled={f.locked}
                      onClick={() => {
                        if (f.locked) return;
                        del(f.id);
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
      </div>
    </div>
  );
}