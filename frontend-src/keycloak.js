import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  // 自行設定 url 以及 realm 名稱
  url: '${ZTA_DOMAIN}/keycloak/',
  realm: 'your-keycloak-realm-name',
  clientId: 'file-service'
});

export default keycloak;
