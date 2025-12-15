import React from 'react';
import { useNavigate } from 'react-router-dom';
import keycloak from '../keycloak';

/**
 * 角色解析：
 * - realm_access.roles  可能包含  platform_super
 * - resource_access['file-service'].roles  可能包含  workspace_admin / user
 */
const getRoles = () => {
  const p = keycloak.tokenParsed || {};
  const realm  = p.realm_access?.roles ?? [];
  const client = p.resource_access?.['file-service']?.roles ?? [];
  return Array.from(new Set([...realm, ...client]));
};

const Navbar = () => {
  const navigate = useNavigate();
  const { preferred_username } = keycloak.tokenParsed || {};
  const roles = getRoles();

  /* 角色旗標 */
  const isSuper = roles.includes('platform_super');
  const isAdmin = isSuper || roles.includes('workspace_admin');

  return (
    <div style={{ background: '#333', padding: '10px', color: 'white' }}>
      <span style={{ marginRight: 20 }}>帳號：{preferred_username}</span>
      <span style={{ marginRight: 20 }}>角色：{roles.join(', ') || '—'}</span>

      {/* 共用 */}
      <button onClick={() => navigate('/profile')}>個人資訊</button>
      <button onClick={() => navigate('/filemanager')}>檔案管理</button>
      <button onClick={() => navigate('/shared-files')}>被分享的檔案</button>
      <button onClick={() => navigate('/application')}>應用程式</button>

      {/* 只有 workspace_admin / platform_super 才看得到 */}
      {isAdmin && (
        <>
          <button onClick={() => navigate('/logs')}>操作日誌</button>
        </>
      )}

      {/* 只有 platform_super,workspace_admin 才看得到 */}
      {(isSuper||isAdmin) && <button onClick={() => navigate('/all-files')}>所有檔案</button>}
    </div>
  );
};

export default Navbar;
