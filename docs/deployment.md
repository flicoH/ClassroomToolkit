# GitHub CI/CD 部署

> 当前推荐使用 [2C2G 单服务器 Docker 部署方案](single-server-docker-deployment.md)。本页保留原 PM2 方案，仅供不使用 Docker 时参考。

本方案使用 GitHub Actions 验证代码，通过 SSH 登录 Linux 服务器，并在服务器的专用部署目录中使用 Git 快进更新代码。Backend 和 Web 由 PM2 管理，Admin 构建产物由 Nginx 托管。

## 部署结构

```text
GitHub main
  -> GitHub Actions 单测、E2E、构建
  -> SSH 连接生产服务器
  -> git pull --ff-only
  -> pnpm install / build / migration
  -> PM2 reload Backend + Web
  -> Nginx 反代 Web，托管 Admin
```

生产端口：

- Backend：`127.0.0.1:3000`，只供 Web BFF 访问
- Web：`127.0.0.1:3001`，由 Nginx 对外反代
- Admin：静态目录 `apps/admin/dist`
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

## 4. 配置 Nginx 与 HTTPS

复制示例并替换域名及路径：

```bash
sudo cp /opt/classroom-toolkit/deploy/nginx.conf.example /etc/nginx/sites-available/classroom-toolkit
sudo ln -s /etc/nginx/sites-available/classroom-toolkit /etc/nginx/sites-enabled/classroom-toolkit
sudo nginx -t
sudo systemctl reload nginx
```

将 `classroom.example.com` 和 `admin.classroom.example.com` 的 DNS A/AAAA 记录指向服务器。随后使用 Certbot 或云厂商证书服务启用 HTTPS。生产环境不要保留纯 HTTP 登录入口。

## 5. 配置 GitHub Actions Secrets

先创建另一把 SSH 密钥，专门供 GitHub Actions 登录服务器：

```bash
ssh-keygen -t ed25519 -C 'github-actions-deploy' -f ./classroom_toolkit_ci -N ''
ssh-copy-id -i ./classroom_toolkit_ci.pub deploy@your-server
```

在 GitHub 仓库 `Settings -> Environments -> production` 中添加：

| Secret                   | 内容                                |
| ------------------------ | ----------------------------------- |
| `SERVER_HOST`            | 服务器公网 IP 或域名                |
| `SERVER_PORT`            | SSH 端口，通常为 `22`               |
| `SERVER_USER`            | `deploy`                            |
| `SERVER_APP_DIR`         | `/opt/classroom-toolkit`            |
| `SERVER_SSH_PRIVATE_KEY` | `classroom_toolkit_ci` 私钥完整内容 |
| `SERVER_KNOWN_HOSTS`     | 已核验的服务器 SSH 主机公钥         |

建议为 `production` Environment 配置审批人。GitHub Actions 登录服务器的密钥和服务器拉取 GitHub 的 Deploy Key 是两把不同的密钥。

在可信网络和设备上获取主机公钥，核对指纹后将完整输出保存为 `SERVER_KNOWN_HOSTS`：

```bash
ssh-keyscan -p 22 -H your-server
```

SSH 使用非默认端口时，将命令和 `SERVER_PORT` 一并改为实际端口。不要在未经核验时直接信任扫描结果。

## 6. 首次启动

在服务器执行：

```bash
cd /opt/classroom-toolkit
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

## 7. 自动发布

以下操作会触发 `.github/workflows/deploy.yml`：

- Pull Request 到 `main`：只执行测试和构建
- Push 或合并到 `main`：测试和构建通过后自动部署
- GitHub Actions 页面手动运行：验证后部署当前 `main`

可在 GitHub `Actions -> CI and Deploy` 查看日志。Migration、构建、服务重载或健康检查任一步失败，工作流都会失败并停止后续步骤。

## 回滚

优先通过 Git 创建回滚提交，让 GitHub Actions 重新部署：

```bash
git revert <bad-commit-sha>
git push origin main
```

数据库 Migration 与代码回滚是两件事。若错误版本执行了不可向后兼容的 Migration，应先备份并评估数据影响，再在服务器执行：

```bash
cd /opt/classroom-toolkit
pnpm --filter ClassRoomToolkitBackend migration:revert
```

不要在未确认数据影响时自动回滚数据库。

## 日常检查

```bash
pm2 status
pm2 logs classroom-toolkit-backend --lines 100
pm2 logs classroom-toolkit-web --lines 100
sudo nginx -t
sudo journalctl -u nginx --since '30 minutes ago'
```

同时建议启用服务器防火墙，仅开放 SSH、HTTP 和 HTTPS；限制 SSH 来源地址；配置 MySQL 自动备份、磁盘监控和应用错误告警。
