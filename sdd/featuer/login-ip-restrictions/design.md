# 登录 IP 分析与限制

登录分析在账号与时间之间显示登录 IP、所在地。成功、密码错误和注册后自动登录记录保存来源快照，历史记录不回填，显示 — / 未知。所在地仅供参考；通过 HTTPS ipwho.is 查询国家、省市，1.5 秒超时，成功缓存一天，失败缓存一分钟，查询失败不影响登录。服务商会收到查询 IP，不发送账号和密码。

管理员在登录分析添加 IPv4/IPv6，或删除并解封。精确地址匹配，不支持 CIDR。统一 IPv6 和 IPv4 映射地址。共用公网 IP 的教师均受影响。封禁拒绝新登录和注册自动登录，已登录用户下次请求会被拒绝并撤销当前会话。管理员认证独立，不受限制。

接口（均沿用 Admin 身份认证、CSRF 防护）：GET /admin/login-ip-blocks；POST /admin/login-ip-blocks，JSON {ip}；POST /admin/login-ip-blocks/remove，JSON {ip}。重复添加和删除幂等。非法 IP 返回 400；被封教师登录返回 403，提示“禁止账号登录，请联系管理员解封”。数据库不可用时不放行。

迁移增加 blocked_login_ips 主键表及 analytics_events.login_ip/ip_location 可空字段，保留现有数据。部署前执行 Backend migration:run。

Web 和 Backend 设置相同的高强度 LOGIN_PROXY_SECRET。入口 Nginx 必须覆盖 X-Real-IP 为 remote_addr，Web 服务端口只允许该入口访问，禁止公网绕过 Nginx。BFF 携带密钥转交来源；Backend 仅验证密钥成功时采用该来源，否则使用连接地址，忽略客户端转发头。未配置时记录连接地址，不应在代理部署中据此添加封禁。密钥不能使用 NEXT_PUBLIC_ 前缀。现有 Nginx 示例已经覆盖 X-Real-IP。Docker 部署需分别向两个容器注入该变量。

验收覆盖地址规范化、伪造来源头、封禁登录和注册、解封、非法输入、管理员权限及所在地失败。必须执行 pnpm verify。

管理端侧边栏增加“IP 登录限制”，路径 `/ip-restrictions`。独立管理页与登录分析共用封禁管理组件，避免操作能力不一致。

登录与注册的失败提示由表单统一展示后端 message；403 封禁只显示“禁止账号登录，请联系管理员解封”，请求拦截器不额外弹通用权限或 HTTP 状态码提示。

IP 封禁也适用于已有 Web 会话：仅在发送请求时校验，命中时撤销当前令牌并清除 Cookie；空闲页面和切回标签页不主动校验。退出后只显示“禁止账号登录，请联系管理员解封”。管理员认证不受影响，网络故障不会误判为封禁。
