const express = require('express');
const multer  = require('multer');
const { Pool } = require('pg');
const auth    = require('./auth');
const path    = require('path');
const fs      = require('fs');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const qrcode = require('qrcode');
const sharp = require('sharp');

const app  = express();
const port = 3001;

//自行設定
const PUBLIC_URL = process.env.PUBLIC_URL || (process.env.ZTA_DOMAIN ? `https://${process.env.ZTA_DOMAIN}/api` : 'http://localhost:8000/api');

// 自動執行 Migration
async function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  
  // 檢查資料夾是否存在
  if (!fs.existsSync(migrationsDir)) {
    console.log('  migrations 資料夾不存在，自動建立...');
    fs.mkdirSync(migrationsDir, { recursive: true });
    console.log('  請在 migrations/ 資料夾中放置 SQL 檔案');
    return;
  }
  
  try {
    // 建立 migrations 紀錄表
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // 讀取所有 migration 檔案
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log('  沒有待執行的 migration 檔案');
      return;
    }

    console.log(` 找到 ${files.length} 個 migration 檔案`);

    for (const file of files) {
      // 檢查是否已執行
      const { rows } = await pool.query(
        'SELECT id FROM schema_migrations WHERE filename = $1',
        [file]
      );

      if (rows.length === 0) {
        console.log(` 執行 Migration: ${file}`);
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        
        try {
          await pool.query(sql);
          await pool.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1)',
            [file]
          );
          console.log(` Migration 完成: ${file}`);
        } catch (err) {
          console.error(` Migration 失敗: ${file}`, err.message);
          throw err;
        }
      } else {
        console.log(`  跳過已執行: ${file}`);
      }
    }
  } catch (err) {
    console.error(' Migration 系統錯誤:', err);
    throw err;
  }
}

/* ─── DB ─────────────────────────────────────────────────────────── */
const pool = new Pool({
  user: process.env.DB_USER || 'keycloak',
  host: process.env.DB_HOST || 'db',
  database: process.env.DB_NAME || 'keycloak',
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
});

/* ─── 檔案上傳 (multer) ────────────────────────────────────────────── */
const uploadDir = path.join(__dirname, 'uploads'); 
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, 'uploads/'),
  filename   : (_, file, cb) => cb(null, Date.now() + '-' + file.originalname),
});
const upload = multer({ storage });

/* ─── 中介 ─────────────────────────────────────────────────────────── */
app.use(express.json());
app.use((req, _, next) => {        // Debug log
  console.log('→', req.method, req.originalUrl);
  next();
});

/* ─── logs紀錄 ─────────────────────────────────────────────────────────── */
async function logAudit(req, { action, fileId = null, filename = null }) {
  try {
    const u = req.user || {};
    const userId   = u.sub || 'anonymous';
    const username = u.preferred_username || u.email || null;

    const rawIp = req.headers['x-forwarded-for'] || req.ip || '';

    await pool.query(
      `INSERT INTO audit_logs (user_id, username, action, file_id, filename)
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, username, action, fileId, filename]
    );
  } catch (err) {
    console.error('寫入 audit_log 失敗:', err.message);
  }
}

/* ─── 角色工具 ────────────────────────────────────────────────────── */
function hasRole(user, roles) {
  const realm  = user.realm_access?.roles ?? [];
  const client = user.resource_access?.['file-service']?.roles ?? [];
  const all    = new Set([...realm, ...client]);
  return roles.some(r => all.has(r));
}
function requireRoles(list) {
  return (req, res, next) =>
    hasRole(req.user, list) ? next() : res.status(403).json({ error: 'No permission' });
}

// 10/16 更動新增
function hasOtp(user) {
  const amr = user.amr || [];
  const acr = user.acr || user.aal || '';
  return amr.includes('otp') || /aal2|mfa/i.test(acr);
}
/****************************/

/* ─── 基本測試 ────────────────────────────────────────────────────── */
app.get('/', (_, res) => res.send('ZTA API server ✅'));

/* ─── 上傳 ─────────────────────────────────────────────────────────── */
app.post('/upload', auth, upload.single('file'), async (req, res) => {
  const { sub: uid, preferred_username } = req.user;
  const { filename, size } = req.file;

  const { rows } = await pool.query(
    'INSERT INTO files (filename, uploader, owner_id, size) VALUES ($1,$2,$3,$4) RETURNING id',
    [filename, preferred_username, uid, size]
  );

  // 紀錄log
  logAudit(req, {
    action:  'upload',
    fileId:  rows[0].id,
    filename
  });

  res.json({ message: 'Upload success' });
});

/* ─── 列全部檔案 (platform_super, workspace_admin需要OTP) ─── */
app.get('/files/all', auth, async (req, res) => {
  const u = req.user;
  const isSuper = hasRole(u, ['platform_super']);
  const isAdmin = hasRole(u, ['workspace_admin']);

  if (!isSuper && !isAdmin) {
    return res.status(403).json({ error: 'No permission' });
  }

  if (isAdmin && !isSuper && !hasOtp(u)) {
    return res.status(401).json({ error: 'OTP required' });
  }

  const { rows } = await pool.query(
    `SELECT id, filename, uploader, owner_id, locked
       FROM files
      ORDER BY uploaded_at DESC`
  );
  res.json(rows);
});

/* ─── 列自己檔案 ───────────────────────────────────────────────────── */
app.get('/files', auth, async (req, res) => {
  const uid = req.user.sub;
  const { rows } = await pool.query(`
    SELECT
      f.*,
      COALESCE(s.cnt, 0) AS shared_count,
      sr.status           AS share_request_status,
      sr.id               AS share_request_id
    FROM files f
    LEFT JOIN (
      SELECT file_id, COUNT(*) cnt
      FROM shares
      GROUP BY file_id
    ) s ON s.file_id = f.id
    LEFT JOIN LATERAL (
      SELECT id, status
      FROM share_requests
      WHERE file_id = f.id AND requester_id = $1
      ORDER BY id DESC LIMIT 1
    ) sr ON true
    WHERE owner_id = $1
    ORDER BY uploaded_at DESC
  `, [uid]);

  res.json(rows);
});

/* ─── 檢視檔案 ───────────────────────────────────────────────────── */
app.get('/files/:id/view', auth, async (req, res) => {
  const u = req.user;
  const uid = u.sub;
  const { id } = req.params;

  const isSuper = hasRole(u, ['platform_super']);
  const isAdmin = hasRole(u, ['workspace_admin']);

  let rows;

  if (isSuper || isAdmin) {
    // Allfiles 使用
    const result = await pool.query(
      'SELECT filename, locked FROM files WHERE id = $1 LIMIT 1',
      [id]
    );
    rows = result.rows;
  } else {
    // Filemanager 使用
    const result = await pool.query(`
      SELECT f.filename, f.locked
        FROM files f
        LEFT JOIN shares s ON s.file_id = f.id AND s.target_user_id = $1
       WHERE f.id = $2 AND (f.owner_id = $1 OR s.id IS NOT NULL)
       LIMIT 1
    `, [uid, id]);
    rows = result.rows;
  }

  if (!rows.length) return res.status(404).json({ error: 'Not Found' });

  const filePath = path.join(uploadDir, rows[0].filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });

  res.sendFile(filePath);
});

/* ─── 獲取檔案縮圖 ───────────────────────────────────────────────── */
app.get('/files/:id/thumbnail', auth, async (req, res) => {
  const uid = req.user.sub;
  const { id } = req.params;

  // 檢查權限（擁有者或被分享者）
  const { rows } = await pool.query(`
    SELECT f.filename, f.locked
      FROM files f
      LEFT JOIN shares s ON s.file_id = f.id AND s.target_user_id = $1
     WHERE f.id = $2 AND (f.owner_id = $1 OR s.id IS NOT NULL)
     LIMIT 1
  `, [uid, id]);

  if (!rows.length) {
    return res.status(404).json({ error: 'Not Found' });
  }

  const filePath = path.join(uploadDir, rows[0].filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File missing' });
  }

  // 判斷檔案類型
  const ext = path.extname(rows[0].filename).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];

  if (imageExts.includes(ext)) {
    try {
      // 生成縮圖（200x200）
      const thumbnail = await sharp(filePath)
        .resize(200, 200, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400'); // 快取 24 小時
      res.send(thumbnail);
    } catch (err) {
      console.error('縮圖生成失敗:', err);
      // 如果生成失敗，返回預設圖示
      res.status(500).json({ error: 'Thumbnail generation failed' });
    }
  } else {
    // 非圖片檔案返回 404，前端會顯示預設圖示
    res.status(404).json({ error: 'Not an image file' });
  }
});


/* ─── 刪除檔案 ───────────────────────────────────────────────── */
app.delete('/files/:id', auth, async (req, res) => {
  const u = req.user;
  const uid = u.sub;
  const { id } = req.params;

  // 先查檔案 & locked 狀態
  const info = await pool.query(
    'SELECT filename, locked FROM files WHERE id=$1 AND owner_id=$2',
    [id, uid]
  );
  if (info.rowCount === 0) {
    return res.status(404).json({ error: 'Not found' });
  }

  //  鎖定檔案禁止刪除
  if (info.rows[0].locked) {
    return res.status(403).json({ error: 'File is locked, cannot delete' });
  }

  // 是否有公開分享紀錄(有則不可刪除)
  const pub = await pool.query(
    `SELECT 1
       FROM public_shares
      WHERE file_id = $1
        AND owner_id = $2
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [id, uid]
  );
  if (pub.rowCount > 0) {
    return res.status(409).json({
      error: 'File has active public share, revoke it first'
    });
  }

  const isSuper = hasRole(u, ['platform_super']);
  if (!isSuper && !hasOtp(u)) {
    return res.status(401).json({ error: 'OTP required' });
  }

  // 刪除動作
  const filename = info.rows[0].filename;
  await pool.query('DELETE FROM files WHERE id=$1 AND owner_id=$2', [id, uid]);

  fs.unlinkSync(path.join(uploadDir, filename));

  await pool.query('DELETE FROM shares WHERE file_id=$1', [id]);
  await pool.query('DELETE FROM public_shares WHERE file_id=$1', [id]);

  // 紀錄log
  logAudit(req, {
    action:  'delete',
    fileId:  Number(id),
    filename: filename
  });

  res.json({ message: 'deleted' });
});

/* ─── lock自己的檔案 ───────────────────────────────────────────────── */

/* 10/16更動
app.post('/files/:id/lock', auth, async (req, res) => {
  const { id }  = req.params;
  const uid     = req.user.sub;
  await pool.query(
    'UPDATE files SET locked = true WHERE id = $1 AND (owner_id = $2 OR $3 = ANY($4))',
    [id, uid, uid, ['platform_super']]
  );
  res.json({ ok: true });
});
*/

app.get('/test-public', (_, res) => res.send('This is a public test route'));

// 10/16 更動新增
app.post('/files/:id/lock', auth, async (req, res) => {
  const { id }  = req.params;
  const u       = req.user;
  const uid     = u.sub;
  const isSuper = hasRole(u, ['platform_super']);
  const isAdmin = hasRole(u, ['workspace_admin']);

  // 先查 owner
  const q = await pool.query('SELECT owner_id, filename FROM files WHERE id=$1', [id]);
  if (q.rowCount === 0) return res.status(404).json({ error: 'file not found' });
  const isOwner = q.rows[0].owner_id === uid;

  // 基本授權：owner 或 管理者
  if (!(isOwner || isAdmin || isSuper)) return res.status(403).json({ error: 'no permission' });

  // 規則：自己鎖自己的檔，且角色是 user/admin 時，必須已通過 OTP
  const isUser = hasRole(u, ['user']);
  if (isOwner && (isUser || isAdmin) && !hasOtp(u)) {
    return res.status(401).json({ error: 'OTP required' });
  }

  const result = await pool.query(
    `UPDATE files
    SET locked = true
    WHERE id = $1
    AND (owner_id = $2 OR $3 = true OR $4 = true)`,
    [id, uid, isSuper, isAdmin]
  );
  if (result.rowCount === 0) return res.status(409).json({ error: 'not updated' });

  // 紀錄log
  logAudit(req, {
    action:  'lock',
    fileId:  Number(id),
    filename: q.rows[0].filename
  });
  res.json({ ok: true });
});
/**************************************************************/

/* ─── unlock自己的檔案 ───────────────────────────────────────────────── */

/*10/16更動
app.post('/files/:id/unlock', auth, async (req, res) => {
  const { id }  = req.params;
  const uid     = req.user.sub;
  await pool.query(
    'UPDATE files SET locked = false WHERE id = $1 AND (owner_id = $2 OR $3 = ANY($4))',
    [id, uid, uid, ['platform_super']]
  );
  res.json({ ok: true });
});
*/
app.post('/files/:id/unlock', auth, async (req, res) => {
  const { id }  = req.params;
  const u       = req.user;
  const uid     = u.sub;
  const isSuper = hasRole(u, ['platform_super']);
  const isAdmin = hasRole(u, ['workspace_admin']);
  const isUser  = hasRole(u, ['user']);

  const q = await pool.query('SELECT owner_id, filename FROM files WHERE id=$1', [id]);
  if (q.rowCount === 0) return res.status(404).json({ error: 'file not found' });
  const isOwner = q.rows[0].owner_id === uid;

  if (!(isOwner || isAdmin || isSuper)) return res.status(403).json({ error: 'no permission' });
  if (isOwner && (isUser || isAdmin) && !hasOtp(u)) {
    return res.status(401).json({ error: 'OTP required' });
  }

  const result = await pool.query(
    `UPDATE files
        SET locked = false
      WHERE id = $1
        AND (owner_id = $2 OR $3 = true OR $4 = true)`,
    [id, uid, isSuper, isAdmin]
  );
  if (result.rowCount === 0) return res.status(409).json({ error: 'not updated' });

  //紀錄 log
  logAudit(req, {
    action:  'unlock',
    fileId:  Number(id),
    filename: q.rows[0].filename
  });
  res.json({ ok: true });
 });

/*─── 下載 ─────────────────────────────────────────────────*/
app.get('/files/:id/download', auth, async (req, res) => {
  const u = req.user;
  const uid = u.sub;
  const { id } = req.params;

  const isSuper = hasRole(u, ['platform_super']);
  const isAdmin = hasRole(u, ['workspace_admin']);

  let rows;

  if (isSuper || isAdmin) {
    // Allfiles 使用 (檢查Lcoked)
    const result = await pool.query(
      'SELECT filename, locked FROM files WHERE id = $1 LIMIT 1',
      [id]
    );
    rows = result.rows;
  } else {
    // FileManager 使用
    const result = await pool.query(`
      SELECT f.filename, f.locked
        FROM files f
        LEFT JOIN shares s ON s.file_id = f.id AND s.target_user_id = $1
       WHERE f.id = $2 AND (f.owner_id = $1 OR s.id IS NOT NULL)
       LIMIT 1
    `, [uid, id]);
    rows = result.rows;
  }

  if (!rows.length) return res.status(404).json({ error: 'Not Found' });

  // 檔案鎖定時禁止下載
  if (rows[0].locked) return res.status(403).json({ error: 'File is locked' });

  const filePath = path.join(uploadDir, rows[0].filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File missing' });

  res.download(filePath, rows[0].filename);
});

/* ─── 生成公開分享連結 ──────────────────────────────────────────── */
app.post('/files/:id/public-share', auth, async (req, res) => {
  const { id } = req.params;
  const uid = req.user.sub;
  const { expiresInHours, password } = req.body; // 期限(小時) + 密碼

  // 驗證檔案擁有者
  const fileCheck = await pool.query(
    'SELECT id, locked FROM files WHERE id=$1 AND owner_id=$2',
    [id, uid]
  );
  if (fileCheck.rowCount === 0) {
    return res.status(404).json({ error: 'File not found or no permission' });
  }

  const fileRow = fileCheck.rows[0];

  if (fileCheck.rows[0].locked) {
    return res.status(403).json({ error: 'Cannot share locked file' });
  }

  // 計算過期時間
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
  
  // 生成唯一 token
  const shareToken = uuidv4().replace(/-/g, ''); // 32字元

  // 密碼加密（選填）
  let passwordHash = null;
  if (password && password.trim()) {
    passwordHash = await bcrypt.hash(password, 10);
  }

  // 寫入資料庫
  await pool.query(
    `INSERT INTO public_shares (file_id, owner_id, share_token, password_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, uid, shareToken, passwordHash, expiresAt]
  );

  // 紀錄 logs (選擇性)
  //logAudit(req, {
    //action:  'share',
    //fileId:  Number(fileRow.id),
    //filename: fileRow.filename
  //});

  // 返回分享連結
  const shareUrl = `${PUBLIC_URL}/share/${shareToken}`;  
  res.json({ 
    shareUrl, 
    expiresAt,
    hasPassword: !!passwordHash 
  });
});

/* ─── 取得檔案的所有公開分享連結 ────────────────────────────────── */
app.get('/files/:id/public-shares', auth, async (req, res) => {
  const { id } = req.params;
  const uid = req.user.sub;

  // 輸入驗證 防止undefind
  if (!id || id === 'undefined' || isNaN(parseInt(id))) {
    return res.status(400).json({ error: '無效的檔案 ID，請提供一個有效的數字' });
  }


  const { rows } = await pool.query(
    `SELECT id, share_token, expires_at, download_count, created_at,
            (password_hash IS NOT NULL) as has_password
     FROM public_shares
     WHERE file_id=$1 AND owner_id=$2
     ORDER BY created_at DESC`,
    [id, uid]
  );

  res.json(rows.map(r => ({
    ...r,
    shareUrl: `${PUBLIC_URL}/share/${r.share_token}`
  })));
});

/* ─── 刪除公開分享連結 ──────────────────────────────────────────── */
app.delete('/public-shares/:shareId', auth, async (req, res) => {
  const { shareId } = req.params;
  const uid = req.user.sub;

  const result = await pool.query(
    'DELETE FROM public_shares WHERE id=$1 AND owner_id=$2',
    [shareId, uid]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Share link not found' });
  }

  res.json({ message: 'Share link deleted' });
});

/* ─── 公開下載頁面（無需登入）────────────────────────────────────── */
app.get('/share/:token', async (req, res) => {
  const { token } = req.params;

  const { rows } = await pool.query(
    `SELECT ps.id, ps.password_hash, ps.expires_at, 
            f.filename, f.id as file_id, f.size, f.uploaded_at
     FROM public_shares ps
     JOIN files f ON f.id = ps.file_id
     WHERE ps.share_token = $1`,
    [token]
  );

  // 如果找不到分享連結
  if (rows.length === 0) {
    try {
      // 組合 invalid.html 的絕對路徑
      const templatePath = path.join(__dirname, 'templates', 'invalid.html');
      // 讀取 HTML 檔案內容
      const htmlContent = fs.readFileSync(templatePath, 'utf8');
      // 回傳 404 (Not Found) 狀態碼以及 HTML 頁面
      return res.status(404).send(htmlContent);
    } catch (error) {
      console.error('❌ 讀取 invalid.html 失敗:', error);
      // 如果讀取檔案失敗，則退回純文字錯誤
      return res.status(500).send('伺服器內部錯誤：無法載入錯誤頁面');
    }
  }

  const share = rows[0];

  // 檢查是否過期
  if (new Date() > new Date(share.expires_at)) {
    try {
      const templatePath = path.join(__dirname, 'templates', 'expired.html');
      const htmlContent = fs.readFileSync(templatePath, 'utf8');
      // 使用 410 (Gone) 狀態碼，表示資源已永久失效
      return res.status(410).send(htmlContent);
    } catch (error) {
      console.error('❌ 讀取 expired.html 失敗:', error);
      // 如果讀取檔案失敗，退回舊的純文字錯誤
      return res.status(500).send('伺服器內部錯誤：無法載入過期頁面');
    }
  }


  // 如果有密碼，顯示密碼輸入頁面
  if (share.password_hash) {
    try {
      const templatePath = path.join(__dirname, 'templates', 'password.html');
      let htmlContent = fs.readFileSync(templatePath, 'utf8');

      // 使用正規表示式進行全域取代
      htmlContent = htmlContent.replace(/{{FILENAME}}/g, share.filename);
      htmlContent = htmlContent.replace(/{{TOKEN}}/g, token);
      
      return res.send(htmlContent);
    } catch (error) {
      console.error('❌ 讀取 password.html 失敗:', error);
      return res.status(500).send('伺服器內部錯誤');
    }
  }

  //無密碼，使用新的 public_download.html
  try {
    const templatePath = path.join(__dirname, 'templates', 'public_download.html');
    let htmlContent = fs.readFileSync(templatePath, 'utf8');

    const downloadUrl = `${PUBLIC_URL}/share/${token}/download`;
    
    // 生成 QR Code 的 Data URL
    const qrCodeDataUrl = await qrcode.toDataURL(downloadUrl);

    // 格式化檔案大小和日期
    const fileSizeMB = (share.size / (1024 * 1024)).toFixed(2);
    const uploadDate = new Date(share.uploaded_at).toLocaleDateString('zh-TW');

    // 替換所有佔位符
    htmlContent = htmlContent
      .replace(/{{FILENAME}}/g, share.filename)
      .replace(/{{FILESIZE}}/g, `${fileSizeMB} MB`)
      .replace(/{{UPLOAD_DATE}}/g, uploadDate)
      .replace(/{{DOWNLOAD_URL}}/g, downloadUrl)
      .replace(/{{QR_CODE_URL}}/g, qrCodeDataUrl);
      
    return res.send(htmlContent);

  } catch (error) {
    console.error('❌ 讀取或處理 public_download.html 失敗:', error);
    return res.status(500).send('伺服器內部錯誤');
  }
});

/* ─── 公開下載檔案（驗證密碼）────────────────────────────────────── */
async function processPublicDownload(req, res) {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const { rows } = await pool.query(
      `SELECT ps.*, f.filename
       FROM public_shares ps
       JOIN files f ON f.id = ps.file_id
       WHERE ps.share_token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).send('Invalid or expired token.');
    }

    const share = rows[0];

    // 檢查過期
    if (new Date() > new Date(share.expires_at)) {
      return res.status(410).send('Link has expired.');
    }

    // 驗證密碼
    if (share.password_hash) {
      const valid = await bcrypt.compare(password || '', share.password_hash);
      if (!valid) {
        return res.status(401).send('Wrong password.');
      }
    }

    // 增加下載次數
    await pool.query(
      'UPDATE public_shares SET download_count = download_count + 1 WHERE id = $1',
      [share.id]
    );

    // 下載檔案
    const filePath = path.join(uploadDir, share.filename);
    if (fs.existsSync(filePath)) {
      res.download(filePath, share.filename);
    } else {
      console.error(`❌ Public download file not found on server: ${filePath}`);
      res.status(404).send('File not found on server.');
    }
  } catch (err) {
    console.error('❌ Error during public download process:', err);
    res.status(500).send('Internal Server Error.');
  }
}

/* ─── 公開下載檔案（處理有密碼和無密碼情況）────────────────── */
app.post('/share/:token/download', async (req, res, next) => {
  await processPublicDownload(req, res).catch(next);
});

/* ─── 無密碼直接下載 (GET請求) ────────────────────────────────── */
app.get('/share/:token/download', async (req, res, next) => {
  req.body = req.body || {};
  req.body.password = ''; // 確保無密碼情況下 password 為空字串
  await processPublicDownload(req, res).catch(next);
});

/* ─── logs 頁面 ────────────────────────────────── */
app.get('/logs',
  auth,
  requireRoles(['workspace_admin', 'platform_super']),
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT 
         id,
         user_id,
         action,
         filename,
         created_at AS timestamp
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT 500`
    );
    res.json(rows);
  }
);

/* ─── fallback ────────────────────────────────────────────────────── */
app.use((req,res)=> res.status(404).json({ error:'Not Found' }));

(async () => {
  try {
    console.log(' 執行資料庫遷移...');
    await runMigrations();
    console.log(' 資料庫遷移完成');
    
    // 確保 uploads 資料夾存在
    const uploadsDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log(' 已建立 uploads 資料夾');
    }
    
    app.listen(port, () => {
      console.log(` API @ http://localhost:${port}`);
    });
  } catch (err) {
    console.error(' 啟動失敗:', err);
    process.exit(1);
  }
})();
