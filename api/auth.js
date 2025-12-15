const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

// 自行設定
//  用環境變數控制 realm / issuer / jwks
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'myrealm';

// JWKS 建議用容器內部網址抓 Keycloak 公鑰
const KEYCLOAK_JWKS_URI =
  process.env.KEYCLOAK_JWKS_URI ||
  `http://keycloak:8080/keycloak/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`;

// Issuer 必須跟 Token 裡的 iss 一樣
const KEYCLOAK_ISSUER =
  process.env.KEYCLOAK_ISSUER ||
  `https://${process.env.ZTA_DOMAIN}/keycloak/realms/${KEYCLOAK_REALM}`;

const client = jwksClient({ jwksUri: KEYCLOAK_JWKS_URI });

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error('❌ 取得 Keycloak 公鑰失敗:', err);
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(
    token,
    getKey,
    {
      issuer: KEYCLOAK_ISSUER,
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err) {
        console.error(' JWT 驗證失敗:', err.message);
        return res.status(403).json({ error: 'Token invalid or expired' });
      }

      console.log(' JWT 驗證成功:', decoded.preferred_username);
      req.user = decoded;
      next();
    }
  );
};
