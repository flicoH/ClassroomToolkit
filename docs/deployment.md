# PM2 部署（备选）

> 当前推荐使用 [2C2G 单服务器 Docker 部署方案](single-server-docker-deployment.md)。本页保留原 PM2 方案，仅供不使用 Docker 时参考。

当前 GitHub Actions 部署工作流使用 Docker。本页介绍手动通过 SSH 调用 `deploy/deploy.sh` 的 PM2 备选流程，在服务器的专用部署目录中使用 Git 快进更新代码。Backend 和 Web 由 PM2 管理，Admin 构建产物由 Nginx 托管。

## 部署结构

```text
GitHub main
  -> GitHub Actions 单测、E2E、构建
  -> 手动 SSH 连接生产服务器
  -> git pull --ff-only
  -> pnpm install / build / migration
  -> PM2 reload Backend + Web
  -> Nginx 反代 Web，托管 Admin
```

生产端口：

- Backend：`127.0.0.1:3000`，供 Web BFF 和管理端 Nginx 代理访问
- Web：`127.0.0.1:3001`，由 Nginx 对外反代
- Admin：静态目录 `apps/admin/dist`，Nginx 同时提供管理域名和 IP 的 `8080` 入口
- MySQL：只允许应用服务器或私有网络访问

## 1. 准备服务器

示例基于 Ubuntu 24.04。安装 Git、Nginx、Node.js 22、pnpm 和 PM2：

```bash
sudo apt update
sudo apt install -y curl git nginx mysql-client

# 使用你信任的 Node.js 安装方式安装 Node.js 22 后执行
corepack enable
corepack prepare pnpm@10.32.1 --activate
sudo npm install -g pm2
```

创建独立部署用户和目录，不要用 `root` 运行应用：

```bash
sudo adduser --disabled-password --gecos '' deploy
sudo mkdir -p /opt/classroom-toolkit
sudo chown -R deploy:deploy /opt/classroom-toolkit
```

## 2. 配置服务器访问 GitHub

切换到部署用户，为服务器创建只读 GitHub Deploy Key：

```bash
sudo -iu deploy
ssh-keygen -t ed25519 -C 'classroom-toolkit-production' -f ~/.ssh/github_deploy -N ''
cat ~/.ssh/github_deploy.pub
```

在 GitHub 仓库的 `Settings -> Deploy keys -> Add deploy key` 添加公钥，不需要勾选写权限。配置 SSH：

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config
ssh-keyscan -H github.com >> ~/.ssh/known_hosts
git clone git@github.com:flicoH/ClassroomToolkit.git /opt/classroom-toolkit
```

部署目录必须只由 CI/CD 更新，不要在其中手工修改已跟踪文件，否则 `git merge --ff-only` 会停止发布。

## 3. 配置生产环境变量

创建 `/opt/classroom-toolkit/apps/backend/.env`：

```dotenv
NODE_ENV=production
HOST=127.0.0.1
PORT=3000

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=classroom_app
MYSQL_PASSWORD=replace-with-a-strong-password
MYSQL_DATABASE=classroom_toolkit
TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=false
LEGACY_DATA_OWNER_USERNAME=
# 首次启动创建管理员，替换示例密码；已有管理员时不会重置账号
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_PASSWORD=replace-with-your-own-admin-password
ADMIN_COOKIE_SECURE=true
# 留空沿用后端时区；迁移过服务器时应填历史教师数据的原始偏移
TEACHER_DATA_UTC_OFFSET=
```

创建 `/opt/classroom-toolkit/apps/web/.env.production`：

```dotenv
BACKEND_URL=http://127.0.0.1:3000
NEXT_PUBLIC_SITE_URL=https://classroom.example.com
GOOGLE_SITE_VERIFICATION=
```

限制配置文件权限：

```bash
chmod 600 /opt/classroom-toolkit/apps/backend/.env
chmod 600 /opt/classroom-toolkit/apps/web/.env.production
```

生产 MySQL 用户应只拥有 `classroom_toolkit` 所需权限。首次使用空库时执行一次：

```bash
cd /opt/classroom-toolkit
pnpm install --frozen-lockfile
pnpm --filter ClassRoomToolkitBackend db:init
```

已有数据的数据库不要重新执行 `db:init`，应按 Backend README 的说明设置 `LEGACY_DATA_OWNER_USERNAME` 后运行 Migration。

管理员初始化密码为 12–256 位，仅在尚无管理员时创建账号；教师账号不能登录管理端。首次创建并验证登录后，同时清空两个 `ADMIN_INITIAL_*` 变量，重启后端。

## 4. 配置 Nginx 与 HTTPS

复制示例并替换域名及路径：

```bash
sudo cp /opt/classroom-toolkit/deploy/nginx.conf.example /etc/nginx/sites-available/classroom-toolkit
sudo ln -s /etc/nginx/sites-available/classroom-toolkit /etc/nginx/sites-enabled/classroom-toolkit
sudo nginx -t
sudo systemctl reload nginx
```

将 `classroom.example.com` 和 `admin.classroom.example.com` 的 DNS A/AAAA 记录指向服务器。随后使用 Certbot 或云厂商证书服务启用 HTTPS。生产环境不要保留纯 HTTP 登录入口。

## 5. CI 与部署入口

`.github/workflows/deploy.yml` 当前仅执行 CI 测试和构建。`deploy-backend.yml`、`deploy-frontend.yml` 发布 Docker 镜像并部署容器，不会调用本页的 PM2 脚本。采用 PM2 时不要把 Docker 部署工作流当作 PM2 发布入口；如需自动化，应另行配置调用 `deploy/deploy.sh` 的工作流。

## 6. 首次启动

确保迁移完成，先构建三个应用，再启动 PM2：

```bash
cd /opt/classroom-toolkit
pnpm --filter ClassRoomToolkitBackend build
pnpm --filter ClassRoomToolkitWeb build
pnpm --filter ClassRoomToolkitAdmin build
APP_DIR=/opt/classroom-toolkit pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

`pm2 startup` 会输出一条需要 `sudo` 执行的命令，执行它以启用开机自启动。检查服务：

```bash
pm2 status
pm2 logs --lines 100
curl http://127.0.0.1:3000/
curl -I http://127.0.0.1:3001/login
```

## 7. 后续手动发布

确认 CI 通过、生产配置就绪并完成数据库备份后，在服务器执行：

```bash
cd /opt/classroom-toolkit
APP_DIR=/opt/classroom-toolkit bash deploy/deploy.sh
```

脚本依次快进代码、安装锁定依赖、构建三个应用、执行迁移、重载 Backend/Web 并进行健康检查。Admin 的 `dist` 由 Nginx 直接托管，脚本不会自动复制或重载 Nginx 配置；代理配置有变化时需要另外更新并运行 `nginx -t`。

## IP:8080 访问

PM2 使用的 `deploy/nginx.conf.example` 已让管理端同时监听 8080，更新配置并通过 `nginx -t` 后重载 Nginx，在安全组和防火墙放行 TCP 8080，即可访问 `http://服务器IP:8080/login`。HTTP 登录还需在 `apps/backend/.env` 设置 `ADMIN_COOKIE_SECURE=false` 并重启 Backend；启用 HTTPS 后恢复为 true。

此配置只用于 PM2 静态托管。Docker 模式由 Admin 容器直接发布宿主机 8080，不能再让宿主机 Nginx 监听同一个端口。

## 管理后台验收

访问 `https://admin.classroom.example.com/login`，使用后端 `.env` 中首次配置的管理员账号。Nginx 示例已包含两条路径：`/admin/*` 代理到后端 3000，其余路径读取 `apps/admin/dist` 并回退到 `index.html`。刷新 `/features` 应正常加载；未登录访问 `/admin/auth/me` 应返回 401 JSON。

教师端注册、主动登录并使用课堂工具后，在管理后台刷新当天图表。详细口径与故障排查见 [管理后台说明](admin-dashboard.md)。初始化成功后同时清空两个初始化变量，并执行：

```bash
cd /opt/classroom-toolkit
APP_DIR=/opt/classroom-toolkit pm2 restart deploy/ecosystem.config.cjs --only classroom-toolkit-backend --update-env
```

## 回滚

优先通过 Git 创建回滚提交，在 CI 通过后执行上述手动发布脚本：

```bash
git revert <bad-commit-sha>
git push origin main
```

数据库 Migration 与代码回滚是两件事。若错误版本执行了不可向后兼容的 Migration，应先备份并评估数据影响，再在服务器执行：

```bash
cd /opt/classroom-toolkit
pnpm --filter ClassRoomToolkitBackend migration:revert
```

不要在未确认数据影响时自动回滚数据库。管理后台迁移回滚会删除管理员账号、会话及全部统计历史；回退代码不等于必须回退此迁移。

## 日常检查

```bash
pm2 status
pm2 logs classroom-toolkit-backend --lines 100
pm2 logs classroom-toolkit-web --lines 100
sudo nginx -t
sudo journalctl -u nginx --since '30 minutes ago'
```

同时建议启用服务器防火墙，仅开放 SSH、HTTP 和 HTTPS；限制 SSH 来源地址；配置 MySQL 自动备份、磁盘监控和应用错误告警。
