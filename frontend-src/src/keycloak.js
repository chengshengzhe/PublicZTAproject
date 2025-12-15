import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
    url : 'https://server67324.ddnsking.com/keycloak/',
    realm: 'myrealm',
    clientId: 'frontend'
});

export default keycloak;