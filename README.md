\## 0. 準備什麼（VM 上）



> Portainer 與 Nginx 是VM 上另外安裝與管理，不在本 repo 的 compose 內。



\- VirtualBox Ubuntu VM

\- Docker / Docker Compose

\- Portainer（GUI 部署 Stack）

\- Nginx（子路徑反向代理，/api /keycloak /kibana ...）



如沒有固定ip 浮動ip可以使用 no-ip，no-ip會將固定ip對應至浮動ip，下載no-ip支援的 DUC 設定的網域每隔一段時間會抓浮動ip



\## 1. 更改env

以下內容變數皆須自行修改 (需修改的變數前面有註解 \*# 自行修改\* 或 \*// 自行設定\* )
已移除所有敏感資訊（網域/帳密/secret），因此必須自行設定環境變數與設定檔後才能部署需自行修改檔案
elk\\kibana\\config\\kibana.yml
frontend-src\\keycloak.js



更改.envexample.env 檔案(相關檔案)

api\\index.js以及
api\\auth.js



更改 .envexample.env 檔案 (相關檔案)
docker-compose.yml

kong.yml



\## 2. 用 Portainer 部署（Stack）

確保 portainer 容器是開啟的 用內網連結至portainer(已經部署nginx 申請網域也可以使用設定的https網域)

Portainer → Stacks → Add stack

使用Repository部署 連結 GitHub repo



\## 3. Kong 初始化



Nginx 會把 /api/ 轉發到 Kong (:8000)，因此 Kong 必須先初始化 DB 並匯入 kong.yml。



\## 4.VM 上 Nginx 子路徑反向代理（路徑對照表）

Nginx proxy manager 容器
custom locations設定詳見nginx\_proxy\_manager\_conf檔案



