# Status page 事件模板

每个事件公开：开始时间、受影响能力/区域、当前影响、下一次更新时间、恢复时间和脱敏
复盘链接。不要公开 tenant、Room、participant、号码、token、内部 endpoint 或用户正文。

事件级别：P0（控制面/RTC 大面积不可用或数据安全风险）、P1（核心租户流程受阻）、
P2（局部降级）。P0/P1 必须关联 incident ID、SLO/error budget、on-call 和 rollback。
