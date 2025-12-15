import React, { useEffect, useState } from 'react';
import {
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import keycloak from './keycloak';

import Profile from './pages/Profile';
import FileManager from './pages/FileManager';
import SharedFiles from './pages/SharedFiles';
import Application from './pages/Application';
import Logs from './pages/Logs';
import AllFiles from './pages/AllFiles';

import Navbar from './components/Navbar';

import { ThemeProvider } from './contexts/ThemeContext';

function App() {
  const [authenticated, setAuthenticated] = useState(null);

  // 1. 初始化
  useEffect(() => {
    keycloak
      .init({
        onLoad: 'check-sso',
        checkLoginIframe: false, // 既然無效，關閉它
        pkceMethod: 'S256',
      })
      .then((auth) => setAuthenticated(auth))
      .catch(() => setAuthenticated(false));
  }, []);

  // 2. 強制輪詢機制 (Heartbeat)
  useEffect(() => {
    let intervalId;

    if (authenticated) {
      // 設定每 3 秒檢查一次 (您可以依需求調整時間，越短越即時，但伺服器負擔越大)
      intervalId = setInterval(() => {
        
        // --- 關鍵修改 ---
        // 使用 -1 強制每次都向伺服器確認
        // 這樣才能偵測到後端 Session 是否被砍掉
        keycloak.updateToken(-1) 
          .then(() => {
            // Token 更新成功，代表 Session 還活著
            // console.log("Heartbeat: Session valid");
          })
          .catch((err) => {
            console.warn("偵測到後端 Session 失效 (Token Refresh Failed)，強制登出");
            setAuthenticated(false);
            keycloak.logout(); 
          });
          
      }, 3000); // 3000ms = 3秒
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [authenticated]);

  if (authenticated === null) return <div>Loading...</div>;

  return (
    <ThemeProvider>
      <div>
        {authenticated && <Navbar />}
        <Routes>
          <Route
            path="/"
            element={
              authenticated ? (
                <Navigate to="/profile" replace />
              ) : (
                <LoginPage />
              )
            }
          />
          {/* 路由保護：未登入強制踢回首頁 */}
          <Route 
            path="/profile" 
            element={authenticated ? <Profile /> : <Navigate to="/" />} 
          />
          <Route 
            path="/filemanager" 
            element={authenticated ? <FileManager /> : <Navigate to="/" />} 
          />
          <Route 
            path="/shared-files" 
            element={authenticated ? <SharedFiles /> : <Navigate to="/" />} 
          />
          <Route 
            path="/application" 
            element={authenticated ? <Application /> : <Navigate to="/" />} 
          />
          <Route 
            path="/logs" 
            element={authenticated ? <Logs /> : <Navigate to="/" />} 
          />
          <Route 
            path="/all-files" 
            element={authenticated ? <AllFiles /> : <Navigate to="/" />} 
          />
        </Routes>
      </div>
    </ThemeProvider>
  );
}

function LoginPage() {
  const handleLogin = () => {
    keycloak.login({
      redirectUri: window.location.origin + '/frontend/profile',
    });
  };

  return (
    <div style={{ textAlign: 'center', marginTop: '100px' }}>
      <h1>尚未登入</h1>
      <button onClick={handleLogin}>登入</button>
    </div>
  );
}

export default App;