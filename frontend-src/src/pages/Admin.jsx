// 檔案位置: src/pages/Admin.jsx
import React, { useState, useEffect } from 'react';
import UserManagement from '../components/UserManagement'; // ✅ 正確路徑
import keycloak from '../keycloak'; // ✅ 正確路徑

const Admin = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const token = keycloak.token;
      
      // 如果沒有 token，就不發請求 (避免報錯)
      if (!token) {
        console.warn('No token found');
        return;
      }

      // ✅ 使用 fetch 取代 axios
      const response = await fetch('/api/admin/users', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setUsers(data);

    } catch (error) {
      console.error('無法取得使用者列表', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (keycloak.token) {
        fetchUsers();
    }
  }, []);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">系統管理後台</h1>
      
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
        <p className="text-yellow-700">
          <strong>注意：</strong> 此處的刪除功能為「徹底刪除模式」，會一併移除使用者的 Keycloak 帳號、資料庫紀錄以及硬碟中的實體檔案。
        </p>
      </div>

      {loading ? (
        <p>載入中...</p>
      ) : (
        /* ✅ 這裡使用的 users 和 fetchUsers 必須在上面有定義 */
        <UserManagement users={users} refreshUsers={fetchUsers} />
      )}
    </div>
  );
};

export default Admin;