專題建置說明（PublicZTAproject）

(a) 環境 Environment
1. 虛擬化環境：VirtualBox
2. 作業系統：Ubuntu (VM)
3. 網路：
   - 內網測試：使用 VM IP 直接存取 (例如 http://192.168.1.104:8080)
   - 若沒有固定 IP：可使用 No-IP（搭配 DUC 讓網域定期更新浮動 IP）
4. 反向代理：
   - Nginx（部署於 VM 上或以容器方式部署）
   - 本專案採「子路徑」方式整合服務，例如 /api、/keycloak、/kibana、/opa、/filebrowser

(b) 軟體 Software
必備：
1. Docker、Docker Compose
2. Portainer（用 GUI 部署 Docker Compose Stack）
3. Nginx（子路徑反向代理 / Nginx Proxy Manager）
4. Git（Portainer 從 GitHub 拉取 repo）

專案服務（由 docker-compose.yml 建置/啟動）：
1. Frontend（React 靜態頁面，對外 port: 8080）
2. API（Node.js/Express，透過 Kong 代理）
3. Keycloak（OIDC 身分驗證，對外 port: 8081，並掛 /keycloak）
4. Kong Gateway（API Gateway，對外 port: 8000/8001）
5. ELK（Kibana 對外 port: 5601，並掛 /kibana）
6. OPA（Open Policy Agent，對外 port: 8181，並掛 /opa）
7. Postgres（Keycloak/Kong DB）
（選用）Filebrowser：可能在另一台主機或另一個 Stack。

(c) Dataset：如何取得？
本專題非機器學習模型訓練專題，因此無固定 Dataset。

(d) 實作流程：如何從 0 建置到可執行

Step 0：VM 前置安裝
1. 安裝 Docker / Docker Compose
2. 安裝 Portainer（確保可用 http://<VM-IP>:9000 進入）
3. 安裝/設定 Nginx / Nginx Proxy Manager（用於子路徑反向代理）
4. （選用）No-IP + DUC：若公網 IP 浮動，設定網域自動更新

Step 1：取得專案
- git clone 專案 repo 到 VM

Step 2：設定環境變數
1. 將 .env.example.env 複製為 .env
2. 編輯 .env，填入自己的：
   - 網域（ZTA_DOMAIN）
   - Keycloak 管理員帳密、DB 密碼
   - Kong DB 帳密
   - JWT_SECRET（給 API 端驗證用）
   - ELK_PASSWORD
3. 注意：.env 不可上傳到 GitHub（避免敏感資訊外洩）

> 說明：
> - 目前本專案使用 Kong Community Edition（CE），未在 Kong 層做 OIDC 驗證。
> - 使用者登入 / Token 驗證由 API（Express /auth.js）處理。
> - 若未來改成支援 OIDC 的 Kong 版本/外掛，才需要額外填 OIDC client secret / session secret。

Step 3：設定檔（需要自行修改）
- elk/kibana/config/kibana.yml
- frontend-src/keycloak.js
- api/index.js、api/auth.js
- docker-compose.yml
- kong.yml

Step 4：使用 Portainer 部署 Stack（GUI）
1. Portainer → Stacks → Add stack
2. 使用 Repository 方式部署
3. 填入環境變數（.env 內容）
4. Deploy stack，確認容器狀態皆為 running

Step 5：Kong 初始化（第一次部署）
因 Nginx 會把 /api/ 轉發到 Kong (:8000)，Kong 必須先初始化 DB 並匯入 kong.yml。

(1) 初始化 DB
- docker exec -it kong kong migrations bootstrap

(2) 匯入 kong.yml（每次修改 kong.yml 後都需重新匯入）
- 匯入：
  docker cp kong.yml kong:/tmp/kong.yml
  docker exec -it kong kong config parse /tmp/kong.yml
  docker exec -it kong kong config db_import /tmp/kong.yml
  docker exec -it kong kong reload

(3) 驗證 Kong 路由是否存在
  curl -s http://127.0.0.1:8001/services | jq .
  curl -s http://127.0.0.1:8001/routes   | jq .
  curl -s http://127.0.0.1:8001/plugins  | jq .

Step 6：Nginx 子路徑反向代理設定（整合入口）
custom locations 配置，將各服務掛到同一網域下：
（設定內容請見 nginx_proxy_manager_conf.txt）

- /frontend/ → http://VMIP:8080
- /keycloak/ → http://VMIP:8081
- /kibana/ → http://VMIP:5601
- /opa/ → http://VMIP:8181
- /api/ → http://VMIP:8000（Kong proxy）

Step 7：驗證（確認可以正常執行）
1. /frontend/ 可開啟前端頁面
2. /keycloak/ 可進入 Keycloak 管理/登入頁
3. /api/ 可經 Kong 轉發 API
   - 未登入時：由 API（Express /auth.js）判斷並拒絕（例如 401/403）
   - 公開 share：/api/share/... 應允許匿名存取（例外放行）
4. /kibana/ 可查看日誌（若 ELK 已啟用）
