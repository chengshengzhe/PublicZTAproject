// 檔案位置: src/components/UserManagement.jsx
import React, { useState } from 'react';
import keycloak from '../keycloak'; // ✅ 正確路徑

// ❌ 絕對不要有 import axios from 'axios';

const UserManagement = ({ users, refreshUsers }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (userId, username) => {
    const confirmMsg = `警告：您確定要刪除 ${username} 嗎？\n\n此操作將會：\n1. 刪除 Keycloak 帳號\n2. 刪除所有資料庫紀錄\n3. 永久刪除硬碟中的上傳檔案\n\n此動作無法復原！`;
    
    if (!window.confirm(confirmMsg)) return;

    setIsDeleting(true);
    try {
      const token = keycloak.token;
      if (!token) throw new Error('無法取得 Token');

      // ✅ 使用 fetch 取代 axios
      const response = await fetch(`/api/admin/users/${userId}/cleanup`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('刪除失敗');
      }
      
      alert('刪除成功！');
      refreshUsers(); 
    } catch (error) {
      console.error(error);
      alert('刪除失敗，請檢查後端 Log');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full bg-white border border-gray-300">
        <thead className="bg-gray-100">
          <tr>
            <th className="py-2 px-4 border-b">Username</th>
            <th className="py-2 px-4 border-b">ID</th>
            <th className="py-2 px-4 border-b">Action</th>
          </tr>
        </thead>
        <tbody>
          {users && users.map(user => (
            <tr key={user.id} className="text-center">
              <td className="py-2 px-4 border-b">{user.username}</td>
              <td className="py-2 px-4 border-b text-xs">{user.id}</td>
              <td className="py-2 px-4 border-b">
                <button 
                  onClick={() => handleDelete(user.id, user.username)}
                  disabled={isDeleting}
                  className="bg-red-500 text-white px-3 py-1 rounded"
                >
                  {isDeleting ? '...' : '徹底刪除'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default UserManagement;