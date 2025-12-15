-- ============================================
-- 檔案管理系統 - 資料庫初始化
-- ============================================

-- 1. 檔案表
CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  uploader VARCHAR(255),
  owner_id VARCHAR(255) NOT NULL,
  size BIGINT,
  locked BOOLEAN DEFAULT false,
  uploaded_at TIMESTAMP DEFAULT NOW()
);

-- 2. 分享記錄表
CREATE TABLE IF NOT EXISTS shares (
  id SERIAL PRIMARY KEY,
  file_id INT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  target_user_id VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. 分享申請表
CREATE TABLE IF NOT EXISTS share_requests (
  id SERIAL PRIMARY KEY,
  file_id INT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  requester_id VARCHAR(255) NOT NULL,
  target_user_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  status_before VARCHAR(50),
  reviewer_id VARCHAR(255),
  reviewed_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. 公開分享表
CREATE TABLE IF NOT EXISTS public_shares (
  id SERIAL PRIMARY KEY,
  file_id INT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  owner_id VARCHAR(255) NOT NULL,
  share_token VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  expires_at TIMESTAMP NOT NULL,
  download_count INT DEFAULT 0,
  max_downloads INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================
-- 索引優化
-- ============================================

-- 檔案表索引
CREATE INDEX IF NOT EXISTS idx_files_owner ON files(owner_id);
CREATE INDEX IF NOT EXISTS idx_files_locked ON files(locked);
CREATE INDEX IF NOT EXISTS idx_files_uploaded ON files(uploaded_at DESC);

-- 分享記錄索引
CREATE INDEX IF NOT EXISTS idx_shares_target ON shares(target_user_id);
CREATE INDEX IF NOT EXISTS idx_shares_file ON shares(file_id);
CREATE INDEX IF NOT EXISTS idx_shares_expires ON shares(expires_at);

-- 分享申請索引
CREATE INDEX IF NOT EXISTS idx_share_requests_status ON share_requests(status);
CREATE INDEX IF NOT EXISTS idx_share_requests_requester ON share_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_share_requests_target ON share_requests(target_user_id);

-- 公開分享索引
CREATE INDEX IF NOT EXISTS idx_public_shares_token ON public_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_public_shares_expires ON public_shares(expires_at);
CREATE INDEX IF NOT EXISTS idx_public_shares_file_owner ON public_shares(file_id, owner_id);

-- ============================================
-- 註解說明
-- ============================================

COMMENT ON TABLE files IS '檔案主表';
COMMENT ON TABLE shares IS '使用者間分享記錄';
COMMENT ON TABLE share_requests IS '分享申請審核表';
COMMENT ON TABLE public_shares IS '公開分享連結表';

COMMENT ON COLUMN files.locked IS '檔案鎖定狀態（鎖定時無法下載）';
COMMENT ON COLUMN public_shares.share_token IS '唯一分享識別碼（UUID）';
COMMENT ON COLUMN public_shares.password_hash IS 'bcrypt 加密的密碼（選填）';
COMMENT ON COLUMN public_shares.max_downloads IS '最大下載次數限制（NULL=無限制）';
