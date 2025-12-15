import { useState, useEffect } from 'react';
import keycloak from '../keycloak';

export default function useRoles() {
  const [roles, setRoles] = useState([]);

  useEffect(() => {
    const parse = () => {
      const p = keycloak.tokenParsed || {};
      const realm  = p.realm_access?.roles ?? [];
      const client = p.resource_access?.['file-service']?.roles ?? [];
      setRoles([...new Set([...realm, ...client])]);
    };
    parse();
    keycloak.onTokenExpired = () =>
      keycloak.updateToken(30).then(parse);
  }, []);

  return roles;
}
