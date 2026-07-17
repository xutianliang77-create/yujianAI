# 公网入口安全边界

Platform API 不直接承担公网 TLS/WAF/DDoS；生产入口由客户/云网关提供。网关必须配置
TLS 1.2+、HSTS、payload/连接/请求速率上限、WebSocket upgrade、可信 proxy header、
证书轮换和审计日志。UDP/TCP/TLS TURN 入口单独限流，不能与控制面共享凭据。
