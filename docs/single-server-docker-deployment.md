# 2C2G 单服务器 Docker 部署

本方案面向一台 2 核 2GB Linux 服务器。GitHub Actions 在云端完成测试和镜像构建，服务器只负责拉取镜像与运行容器。

## CentOS 7.8 重要说明

CentOS Linux 7 已于 2024-06-30 结束生命周期，不再获得官方安全更新。Docker 当前官方安装要求也只列出仍在维护的 CentOS Stream 9/10，不包含 CentOS 7。

正式上线推荐先备份数据并重装 Rocky Linux 9、AlmaLinux 9 或 Ubuntu Server 24.04 LTS。本仓库的镜像与 Compose 文件不依赖宿主机发行版，但不能消除 CentOS 7 内核、Docker Engine 与未修复漏洞带来的风险。

如果短期无法重装，只能把 CentOS 7.8 当临时过渡环境，并满足以下全部条件：

- 云厂商仍提供安全扩展维护，或主机位于严格受控网络。
- 已有 Docker Engine 20.10+，不要在生产机运行 `get.docker.com` 强行安装最新版。
- 已有 Docker Compose v2.20+。
- Node 22、MySQL 8.4、Nginx 镜像能在当前内核与存储驱动上启动。
- 至少 10GB Docker 可用磁盘、2GB 内存和 1GB Swap。

克隆仓库后执行预检。脚本会拉取三个运行镜像测试兼容性：

```bash
cd /opt/classroom-toolkit
sudo -u deploy bash deploy/centos7-preflight.sh
```

任何检查失败都应停止部署并更换操作系统。检查通过只代表技术兼容，不代表 CentOS 7 已恢复安全支持。

## 部署结构

```text
Internet
  -> Host Nginx :80/:443
       -> Web container   127.0.0.1:3001
       -> Admin container 127.0.0.1:3002

Web container
  -> classroom_internal Docker network
       -> Backend container :3000
            -> MySQL container :3306
```

应用分为两个独立 Compose Project：

- `classroom-frontend`：Next.js Web、Vue Admin。
- `classroom-backend`：NestJS Backend、MySQL、一次性 Migration。

更新前端不会重启 Backend/MySQL，更新后端不会重启 Web/Admin。两个 Project 只共享外部网络 `classroom_internal`。

## 资源预算

| 服务    | 内存上限 | CPU 上限 |
| ------- | -------: | -------: |
| Web     |    512MB |     0.70 |
| Admin   |     64MB |     0.10 |
| Backend |    384MB |     0.45 |
| MySQL   |    640MB |     0.55 |

容器理论上限共 1.6GB，剩余内存供系统、Docker 与宿主机 Nginx 使用。服务器还应配置 2GB Swap，防止发布和数据库瞬时内存峰值触发 OOM。

## 1. 配置 Swap

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-classroom-toolkit.conf
sudo sysctl --system
free -h
```

已有 Swap 时不要重复创建，通过 `swapon --show` 检查。

## 2. 准备服务器软件

在受支持的新系统上，按照 [Docker Engine 官方文档](https://docs.docker.com/engine/install/) 安装 Docker Engine 与 Compose Plugin，并通过系统软件源安装 Git、Nginx 和 Certbot。

如果服务器执行以下命令都提示 `未找到命令`，说明系统还没有部署基础软件：

```bash
cat /etc/centos-release
uname -r
docker version
docker compose version
nginx -v
git --version
```

### CentOS 7.8 临时安装路径

CentOS 7.8 不再具有受支持的 Docker 官方安装路径。下面命令只用于短期过渡；如果 Docker 依赖解析失败或镜像无法启动，应停止部署并重装 Rocky Linux 9、AlmaLinux 9 或 Ubuntu Server 24.04 LTS。

先安装 Git、Nginx、yum 仓库工具和防火墙工具：

```bash
yum clean all
yum makecache fast
yum install -y yum-utils device-mapper-persistent-data lvm2 git firewalld
yum install -y epel-release
yum install -y nginx
systemctl enable --now firewalld
systemctl enable --now nginx
git --version
nginx -v
```

再尝试安装 Docker Engine 与 Compose Plugin：

```bash
yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
yum makecache fast
yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker version
docker compose version
docker run --rm hello-world
```

如果添加 Docker 官方源时出现 `curl#35 - "TCP connection reset by peer"`，通常是服务器访问 `download.docker.com` 被网络重置。阿里云 ECS 可改用阿里云 Docker CE 镜像源：

```bash
rm -f /etc/yum.repos.d/docker-ce.repo
wget -O /etc/yum.repos.d/docker-ce.repo http://mirrors.cloud.aliyuncs.com/docker-ce/linux/centos/docker-ce.repo
sed -i 's|https://mirrors.aliyun.com|http://mirrors.cloud.aliyuncs.com|g' /etc/yum.repos.d/docker-ce.repo
yum makecache fast
yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker version
docker compose version
docker run --rm hello-world
```

非阿里云服务器使用公网镜像地址：

```bash
rm -f /etc/yum.repos.d/docker-ce.repo
wget -O /etc/yum.repos.d/docker-ce.repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
yum makecache fast
yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker version
docker compose version
docker run --rm hello-world
```

如果 `yum install` 提示找不到 `docker-compose-plugin`，或者 Docker 版本低于 20.10，不要继续部署；这台 CentOS 7.8 已经不适合承载当前容器方案。若必须临时运行，也至少需要先确认 `docker compose version` 能输出 v2.20 以上。

创建部署用户：

```bash
sudo useradd --create-home --shell /bin/bash deploy
sudo passwd --lock deploy
sudo usermod -aG docker deploy
sudo mkdir -p /opt/classroom-toolkit
sudo chown -R deploy:deploy /opt/classroom-toolkit
```

重新登录 `deploy` 用户，让 Docker 用户组生效。生产部署不要使用 `root`。

## 3. 克隆私有仓库

切换到部署用户并创建只读 Deploy Key：

```bash
sudo -iu deploy
ssh-keygen -t ed25519 -C 'classroom-toolkit-production' -f ~/.ssh/github_deploy -N ''
cat ~/.ssh/github_deploy.pub
```

在 GitHub 仓库 `Settings -> Deploy keys` 添加公钥，不勾选写权限。随后配置 SSH 并克隆：

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

不要在部署目录手工修改已跟踪文件，发布脚本只接受 Git 快进更新。

## 4. 登录 GHCR

GitHub Actions 使用仓库 `GITHUB_TOKEN` 发布镜像。服务器拉取私有镜像需要 classic PAT 的 `read:packages` 权限：

```bash
sudo -iu deploy
read -rsp 'GHCR token: ' GHCR_TOKEN
echo
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
unset GHCR_TOKEN
```

公开镜像可以匿名拉取。Token 不要写入仓库或 `.env`。

## 5. 创建生产环境文件

```bash
cd /opt/classroom-toolkit
cp deploy/.env.frontend.example deploy/.env.frontend
cp deploy/.env.backend.example deploy/.env.backend
chmod 600 deploy/.env.frontend deploy/.env.backend
```

编辑 `deploy/.env.backend`，替换两个密码：

```dotenv
BACKEND_PORT=3000
MYSQL_ROOT_PASSWORD=long-random-root-password
MYSQL_USER=classroom_app
MYSQL_PASSWORD=long-random-app-password
LEGACY_DATA_OWNER_USERNAME=
```

首次初始化 MySQL 后不要只修改这里的密码，因为 MySQL 数据卷中的账号密码不会自动同步变化。

## 6. 配置 Nginx 与 HTTPS

CentOS/RHEL 系 Nginx 使用 `/etc/nginx/conf.d/`。替换示例中的两个域名后安装配置：

```bash
sudo cp /opt/classroom-toolkit/deploy/nginx.single-server.conf.example /etc/nginx/conf.d/classroom-toolkit.conf
sudo nginx -t
sudo systemctl reload nginx
```

DNS 生效后，先安装 Certbot，再签发 HTTPS 证书。`classroom.example.com` 和 `admin.classroom.example.com` 必须替换成你的真实域名：

```bash
sudo yum install -y certbot python2-certbot-nginx || sudo yum install -y certbot-nginx
certbot --version
```

然后签发证书：

```bash
sudo certbot --nginx -d classroom.example.com -d admin.classroom.example.com
```

如果 CentOS 7.8 的 EPEL 源已经无法安装 Certbot，先跳过 HTTPS，保持 80 端口把业务跑通；证书可在迁移到 Rocky Linux 9、AlmaLinux 9 或 Ubuntu Server 24.04 LTS 后再配置。

防火墙只开放 SSH、HTTP 和 HTTPS。Backend 和 MySQL 不应直接暴露公网。

CentOS 默认启用 SELinux。保持 Enforcing，不要关闭 SELinux；允许宿主机 Nginx 连接回环地址上的 Web/Admin 容器：

```bash
sudo setsebool -P httpd_can_network_connect 1
```

Backend Compose 中的 MySQL 文件挂载已经使用 `:Z` 标签，Docker 会为这些只读文件设置正确的 SELinux 容器上下文。

## 7. 配置 GitHub Actions

在 `Settings -> Secrets and variables -> Actions -> Variables` 添加仓库变量：

```text
PRODUCTION_SITE_URL=https://classroom.example.com
```

在 `Settings -> Environments -> production` 添加：

| Secret                   | 示例                         |
| ------------------------ | ---------------------------- |
| `SERVER_HOST`            | 服务器 IP 或域名             |
| `SERVER_PORT`            | `22`                         |
| `SERVER_USER`            | `deploy`                     |
| `SERVER_APP_DIR`         | `/opt/classroom-toolkit`     |
| `SERVER_SSH_PRIVATE_KEY` | Actions 登录服务器的完整私钥 |
| `SERVER_KNOWN_HOSTS`     | 已核验的服务器 SSH 主机公钥  |

Workflow 分工：

- `CI`：所有 Push/PR 执行完整测试和构建，不部署。
- `Deploy Backend`：Backend 变化时测试、构建镜像、Migration、更新 Backend。
- `Deploy Frontend`：Web/Admin 变化时测试、构建镜像、更新前端。

两个部署 Job 使用同一个 `classroom-production-server` 并发锁，不会同时占用服务器资源。

## 8. 首次部署

提交配置到 `main` 后，先在 Actions 页面手动运行 `Deploy Backend`，成功后再运行 `Deploy Frontend`。后续根据代码路径自动独立部署。

手动部署命令也必须先后端、后前端：

```bash
cd /opt/classroom-toolkit

APP_DIR=/opt/classroom-toolkit \
IMAGE_NAMESPACE=ghcr.io/flicoh/classroomtoolkit \
BACKEND_IMAGE_TAG=latest \
bash deploy/backend-deploy.sh

APP_DIR=/opt/classroom-toolkit \
IMAGE_NAMESPACE=ghcr.io/flicoh/classroomtoolkit \
FRONTEND_IMAGE_TAG=latest \
bash deploy/frontend-deploy.sh
```

检查状态：

```bash
docker compose -p classroom-backend \
  --env-file deploy/.env.backend \
  --env-file deploy/.backend-release.env \
  -f deploy/compose.backend.yml ps

docker compose -p classroom-frontend \
  --env-file deploy/.env.frontend \
  --env-file deploy/.frontend-release.env \
  -f deploy/compose.frontend.yml ps

curl http://127.0.0.1:3000/
curl -I http://127.0.0.1:3001/login
curl -I http://127.0.0.1:3002/
```

检查 Web 登录 Cookie 与业务接口代理：

```bash
# HTTP 临时部署时，Set-Cookie 不应包含 Secure；HTTPS 正式部署时应包含 Secure。
curl -i http://127.0.0.1:3001/api/login \
  -H 'content-type: application/json' \
  --data '{"username":"你的账号","password":"你的密码"}'

# 业务接口必须由 Web 容器代理到 backend:3000，不能连接 127.0.0.1:3000。
docker compose -p classroom-frontend \
  --env-file deploy/.env.frontend \
  --env-file deploy/.frontend-release.env \
  -f deploy/compose.frontend.yml \
  exec web node -e "console.log(process.env.BACKEND_URL, process.env.AUTH_COOKIE_SECURE)"
```

确认每次 GitHub Actions 部署后的服务器镜像版本：

```bash
cd /opt/classroom-toolkit

cat deploy/.backend-release.env
cat deploy/.frontend-release.env

docker compose -p classroom-backend \
  --env-file deploy/.env.backend \
  --env-file deploy/.backend-release.env \
  -f deploy/compose.backend.yml \
  images

docker compose -p classroom-frontend \
  --env-file deploy/.env.frontend \
  --env-file deploy/.frontend-release.env \
  -f deploy/compose.frontend.yml \
  images

docker inspect classroom-backend-backend-1 \
  --format 'backend image={{.Config.Image}} imageID={{.Image}} created={{.Created}}'
docker inspect classroom-frontend-web-1 \
  --format 'web image={{.Config.Image}} imageID={{.Image}} created={{.Created}}'
docker inspect classroom-frontend-admin-1 \
  --format 'admin image={{.Config.Image}} imageID={{.Image}} created={{.Created}}'
```

`*.release.env` 里的 `sha-...` 必须等于本次 Actions 页面显示的 commit SHA。`docker inspect` 的 `image=` 也应显示同一个 `sha-...` 标签；如果还是旧 sha，说明部署脚本没有跑成功或服务器没有拉到新镜像。

## 数据库备份

```bash
cd /opt/classroom-toolkit

docker compose -p classroom-backend \
  --env-file deploy/.env.backend \
  --env-file deploy/.backend-release.env \
  -f deploy/compose.backend.yml \
  exec -T mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers classroom_toolkit' \
  > "backup-$(date +%Y%m%d-%H%M%S).sql"
```

备份文件包含敏感业务数据，应设置权限并同步到服务器之外。建议每天备份，定期验证恢复流程。

## 独立回滚

镜像带有 `sha-<commit>` 标签，可以只回滚一侧：

```bash
cd /opt/classroom-toolkit

# 只回滚前端
FRONTEND_IMAGE_TAG=sha-OLD_COMMIT APP_DIR=/opt/classroom-toolkit bash deploy/frontend-deploy.sh

# 只回滚后端
BACKEND_IMAGE_TAG=sha-OLD_COMMIT APP_DIR=/opt/classroom-toolkit bash deploy/backend-deploy.sh
```

后端脚本会执行当前代码中的 Migration。数据库变更不能仅靠切换镜像回滚，必须先评估数据影响。

## 日常运维

```bash
docker stats --no-stream
docker system df
df -h
free -h
journalctl -u nginx --since '30 minutes ago'
```

不要执行 `docker compose down -v`，`-v` 会删除 MySQL 数据卷。可以定期执行 `docker image prune -f` 清理无引用旧层，但应保留近期用于回滚的镜像。
