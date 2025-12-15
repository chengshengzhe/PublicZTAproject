ELK Stack (Elasticsearch, Logstash, Kibana) 設定檔存放區，主要用途是收集與分析系統的 API 日誌。

預計內容:
- Kong / 前端 / API 伺服器 的日誌會 POST 至 Logstash `http://<elk主機>:5045`
- 日誌會被存入 Elasticsearch 的 `apilogs-*` index 中

測試範例:
curl -XPOST http://127.0.0.1:5045 \
 -H 'Content-Type: application/json' \
 -d '{"message": {"source":"test","content":"Logstash working!"}}'