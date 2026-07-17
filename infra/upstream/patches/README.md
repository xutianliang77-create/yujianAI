# LiveKit patch queue

当前 patch queue 为空，语见直接运行固定版本的官方组件。

任何 patch 必须先在 `livekit-patch-queue.json` 登记组件、上游 commit、许可证、原因、
补丁文件 SHA-256、回滚方式和兼容证据。媒体核心 patch 默认禁止；优先在语见控制面、
adapter 或独立服务中实现差异。不得直接修改 clean mirror。
