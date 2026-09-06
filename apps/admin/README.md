# ClassroomToolkit Admin

Vue 3 + Vite + TypeScript 管理后台，使用 ECharts 展示教师注册、登录及功能使用趋势。包含教师、学生和班级目录查询。

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

访问 `http://127.0.0.1:3002/login`。也可执行根目录 `pnpm dev` 一起启动教师端。开发代理默认将 `/admin` 转发至 `http://127.0.0.1:3000`，可在启动 Vite 前用 `BACKEND_URL` 调整。管理员账号密码配置在后端，不能写入 `VITE_*` 前端变量。

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
