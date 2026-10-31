# ClassroomToolkit Admin

Vue 3 + Vite + TypeScript 管理后台，使用 ECharts 展示教师注册、登录及功能使用趋势。包含教师、学生和班级目录查询。

## 功能

| 页面     | 路径             | 能力                                                           |
| -------- | ---------------- | -------------------------------------------------------------- |
| 数据概览 | `/`              | 展示教师、学生、班级、登录和功能使用等平台汇总。               |
| 注册分析 | `/registrations` | 查看每日新增与累计注册教师趋势。                               |
| 登录分析 | `/logins`        | 查看主动登录、自动登录、失败登录、活跃教师趋势及登录明细。     |
| 功能分析 | `/features`      | 按使用次数或教师数查看功能排行，并查看单项功能趋势。           |
| 教师管理 | `/teachers`      | 搜索和分页查询教师，进入详情后查看登录、功能、学生和班级统计。 |
| 教师详情 | `/teachers/:id`  | 查看教师资料和统计，跳转到其学生/班级目录，并可重置教师密码。  |
| 学生档案 | `/students`      | 跨教师搜索和分页查询学生，可按指定教师过滤。                   |
| 班级管理 | `/classrooms`    | 跨教师搜索和分页查询班级，可按指定教师过滤。                   |
| 意见反馈 | `/feedback`      | 分页查看教师提交的意见及关联教师信息。                         |

管理端使用独立管理员账号和 `classroom_admin` HttpOnly Cookie，不接受教师 Bearer Token。写请求必须携带 `X-Admin-Request: 1`，登录、退出、缓存控制和会话过期均由 `/admin/*` 后端接口处理。

## 本地运行

在仓库根目录安装依赖，按 [后台部署说明](../../docs/admin-dashboard.md) 配置本地 MySQL、执行迁移并初始化管理员。没有默认管理员密码。

```bash
pnpm install --frozen-lockfile
pnpm --filter ClassRoomToolkitBackend migration:run
```

以上迁移用于已有数据库；全新空库改用 `db:init`。在两个终端分别启动：

```bash
pnpm --filter ClassRoomToolkitBackend dev
```

```bash
pnpm --filter ClassRoomToolkitAdmin dev
```

访问 `http://127.0.0.1:8080/login`。也可执行根目录 `pnpm dev` 一起启动教师端。开发代理默认将 `/admin` 转发至 `http://127.0.0.1:3000`，可在启动 Vite 前用 `BACKEND_URL` 调整。管理员账号密码配置在后端，不能写入 `VITE_*` 前端变量。

部署默认也使用 8080，访问 `http://服务器IP:8080/login`。已有部署需更新 `deploy/.env.frontend` 的端口并重新创建 Admin，HTTP 登录还需调整后端 Cookie 配置，详见 [IP 访问步骤](../../docs/single-server-docker-deployment.md#管理平台通过-ip8080-访问)。

## 构建与部署

```bash
pnpm --filter ClassRoomToolkitAdmin exec vitest run
pnpm --filter ClassRoomToolkitAdmin build
```

产物为 `apps/admin/dist`。正式部署需要同时托管静态文件和代理 `/admin/*` 接口；仅上传静态文件无法完成登录。页面路径 `/login`、`/features` 等需要 SPA 回退。

- [Docker 部署](../../docs/single-server-docker-deployment.md)：Admin 镜像内 Nginx 将管理 API 转发至 `backend:3000`。
- [PM2 备选部署](../../docs/deployment.md)：宿主机 Nginx 托管产物，并将 API 转发至后端 3000。
- [初始化、验收与故障排查](../../docs/admin-dashboard.md)：包含 Cookie、时区和统计口径说明。

涉及新接口时先完成数据库迁移和后端发布，再发布管理前端。生产使用 HTTPS；管理员会话保存在 HttpOnly Cookie 中。

### 登录 IP 与封禁

登录分析在账号后展示 IP 和所在地，旧记录显示 — / 未知。在同页“IP 登录限制”录入精确 IPv4 或 IPv6，删除即可解封。该限制覆盖 Web 新登录和注册自动登录；管理员登录不受影响，已有教师会话会被强制退出。共享公网 IP 的用户会一起受限。

侧边栏“IP 登录限制”（`/ip-restrictions`）提供独立管理页面，也可以从登录分析顶部管理封禁 IP。

IP 封禁也适用于已有 Web 会话：仅在发送请求时校验，命中时撤销当前令牌并清除 Cookie；空闲页面和切回标签页不主动校验。退出后只显示“禁止账号登录，请联系管理员解封”。管理员认证不受影响，网络故障不会误判为封禁。
