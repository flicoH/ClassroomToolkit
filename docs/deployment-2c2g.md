# 2 核 2GB：Docker 部署

部署入口为 `deploy/2c2g-deploy.sh` 和 `deploy/compose.2c2g.yml`。镜像在 CI 或开发电脑构建，服务器只拉取并运行。脚本不安装 Docker、不改域名证书、不更新 Git，也不删除数据卷。需先将当前版本的部署文件同步到服务器。

## 服务安排

| 容器         | 内存上限 | CPU 上限 |
| ------------ | -------- | -------- |
| MySQL        | 512 MiB  | 0.6      |
| Nest 后端    | 384 MiB  | 0.5      |
| Next 网站    | 384 MiB  | 0.7      |
| 管理端 nginx | 64 MiB   | 0.1      |
| 合计         | 1344 MiB | 1.9      |

采用模板生成报告，无需 AI 密钥。课程内容仍由 Docling 提取；本配置要求连接**独立 Docling 服务**，不会在这台 2GB 服务器加载 OCR 和布局模型。生成报告、登录和匿名家长链接均保留。

这是小规模使用的初始资源配置，内存上限不保证实际负载一定可用。上线后通过 `status` 和日志观察内存、OOM 和响应时间。数据库较大或并发较多时应升级内存。

## 服务器条件

- Linux amd64，2 核，Docker 可用内存至少 1800 MiB。
- Docker Engine、Docker Compose **2.20+**、Python 3、`flock`、`gzip`，当前账号能操作 Docker。
- 至少 1GiB swap，建议 2GiB；项目目录及 Docker 数据目录均至少 10GiB 空闲，另外按数据库/PDF/备份大小预留空间。
- 宿主机 nginx 提供 HTTPS，域名和证书已准备。3000、3001、8080 只绑定本机；MySQL 不向宿主机开放端口。

脚本会检查上述资源条件及旧容器占用。它不会自动配置 swap，避免覆盖现有系统设置。

## 1. 构建并发布镜像

提交本次代码后，在 GitHub Actions 手动运行 **Publish 2C2G Docker Images**，选择含本功能的分支。配置仓库变量 `PRODUCTION_SITE_URL` 为正式网站 HTTPS 地址。工作流只发布 backend/web/admin 三个镜像，不连接服务器。运行摘要列出镜像标签。

默认镜像命名空间是 `ghcr.io/flicoh/classroomtoolkit`，如果仓库不同，部署时设置 `IMAGE_NAMESPACE=ghcr.io/你的组织/仓库`（小写）。三个镜像使用 `sha-完整40位commit` 标签，并带 revision 标签，脚本会验证一致性。私有 GHCR 镜像需先在服务器执行 `docker login ghcr.io`，密码通过交互输入。

**切换原部署前**，在仓库 Actions Variables 设置 `DEPLOY_PROFILE=2c2g`，原 backend/frontend 工作流的 SSH 部署 job 将跳过，防止重新启动原来的高内存 Compose；它们仍可测试和发布镜像。独立 Docling 镜像由现有 backend 工作流的 publish job 构建，也可在开发电脑从 Dockerfile 的 `docling-parser` stage 构建并发布。

## 2. 配置环境

全新服务器，在仓库根目录执行：

```bash
bash deploy/2c2g-deploy.sh init
chmod 600 deploy/.env.2c2g
```

生成的文件包含随机数据库密码、管理员密码、PDF 解析密钥和报告加密密钥。再次运行不会覆盖。编辑文件，填入：

- `REPORT_PUBLIC_BASE_URL`：例如 `https://你的正式网站域名`，无需尾部路径；用于家长链接。
- `SEMESTER_REPORT_PARSER_URL`：独立 Docling 适配器的 `/parse` 地址；例如 `https://你的解析域名/parse`。支持 HTTPS 或私有 IP 的 HTTP 地址，不能填 backend 容器的 localhost。
- `SEMESTER_REPORT_PARSER_API_KEY`：与独立解析容器设置一致。
- `ADMIN_INITIAL_USERNAME`/`ADMIN_INITIAL_PASSWORD`：首次创建管理员；已有管理员可清空初始密码。

`REPORT_SHARE_ENCRYPTION_KEY` 必须是 32 字节随机值的 Base64。不要随发布更换，也不要提交环境文件。安全保存环境文件和备份，恢复时需同一报告密钥。

**已有服务器**：不要用 `init` 替换密码。复制 `deploy/.env.2c2g.example` 为 `deploy/.env.2c2g`，权限设为 600，手动沿用原 MySQL root/应用用户密码、`MYSQL_USER` 和报告加密密钥，并填写剩余配置。旧数据的 `LEGACY_DATA_OWNER_USERNAME`、`TEACHER_DATA_UTC_OFFSET` 也沿用原值。脚本检测到 `deploy/.env.backend` 时会拒绝自动生成新凭据。

## 3. HTTPS 与 PDF 上传

参考 `deploy/nginx.2c2g.conf.example`，将网站/管理端域名及证书路径换为实际值，放入宿主机 nginx 配置，检查后 reload：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

示例上传上限为 32MB，覆盖应用 30MB 的 PDF 限制。网站代理超时为 660 秒。若修改 `.env.2c2g` 的宿主机端口，需同步修改 nginx 的 upstream。HTTPS 才能正常使用生产环境 Secure 登录 Cookie。只暴露 HTTPS 网站与管理端，backend 无需独立公网入口。

## 4. 首次部署或升级

将下面的标签替换成已发布镜像的真实完整 commit：

```bash
export BACKEND_IMAGE_TAG=sha-完整40位commit
export FRONTEND_IMAGE_TAG=sha-完整40位commit
bash deploy/2c2g-deploy.sh check
bash deploy/2c2g-deploy.sh deploy
```

`check` 校验环境、内存、端口、主机和数据卷占用；旧容器若占用 3000、3001、8080 或共享数据卷，会在拉取镜像和迁移前拒绝执行。`check` 不拉镜像、不停服务。`deploy` 获取操作锁，串行拉镜像并核对 revision，停止新项目的网站/后台，启动 MySQL，初始化 PDF 卷权限，备份数据库/PDF，执行 TypeORM migration，再依次启动后端和前端并检查健康状态。迁移期间网站暂停，避免请求与迁移争用内存；迁移和常驻后端不会同时运行。

健康检查覆盖后端、教师报告代理、匿名家长报告接口和 Docling `/health`。**不自动产生或发布真实学生报告**。部署完成后手动验收登录、PDF 上传解析、生成报告、课堂表现、发布复制链接、家长匿名访问、删除与移动端显示。健康检查不会解析真实 PDF；还需一次实际上传确认模型与 Bearer 密钥可用。

部署成功后保存当前和上一版镜像标签。下一次可只设置要升级的标签；不设置则沿用当前标签。

## 从旧 Compose 迁移

先设置 `DEPLOY_PROFILE=2c2g`，在旧配置下备份 MySQL、课程 PDF 及原环境文件。确认凭据和报告密钥已复制，然后停止旧 backend/frontend 项目，包括原 Docling 容器：

```bash
docker compose --env-file deploy/.env.frontend -f deploy/compose.frontend.yml stop
docker compose --env-file deploy/.env.backend -f deploy/compose.backend.yml stop
```

新配置复用 `classroom_mysql_data` 和 `classroom_reports_data`，无需导入或复制卷。不要执行 `down -v`，不要让两台 MySQL 容器同时挂载同一个数据卷。原 MySQL 版本应为 8.0；其他版本的数据卷必须先验证数据库升级/降级兼容性。脚本会拒绝仍被其他运行项目占用的数据卷。旧容器停止后再执行新入口的 `check` 和 `deploy`。

## 独立 Docling（也是 Docker）

在另外一台主机准备 `deploy/compose.docling.remote.yml` 和权限 600 的环境文件，例如 `deploy/.env.docling.remote`：

```dotenv
IMAGE_NAMESPACE=ghcr.io/flicoh/classroomtoolkit
DOCLING_IMAGE_TAG=sha-完整40位commit
SEMESTER_REPORT_PARSER_API_KEY=与网站后台相同的解析密钥
DOCLING_BIND_IP=127.0.0.1
DOCLING_PORT=18000
```

```bash
docker compose --env-file deploy/.env.docling.remote -f deploy/compose.docling.remote.yml up -d --wait
```

默认只监听 localhost，由解析主机的 HTTPS nginx 代理到 `127.0.0.1:18000`，保留 `/parse` 和 `/health` 路径，并传递 Authorization。设置 `client_max_body_size 32m`、`proxy_read_timeout 660s`，建议关闭该解析虚拟主机的访问日志，减少课程信息留存。若走两台服务器的私网，将 `DOCLING_BIND_IP` 改为解析主机私网地址，限制来源为网站服务器私网 IP；后端填写该私网 IP 的 `/parse` 地址。

这里使用仓库的 FastAPI Docling 适配器，接收 multipart 的 `file` 字段，支持 Bearer 验证；其他 Docling 服务的 API 不能直接替换。镜像已含中文 OCR 模型，单进程、串行解析。远端配置分配 1536MiB 内存；复杂 PDF 仍可能需要调大解析主机内存。不要将这个配置和网站的 2GB 配置同时运行在同一主机。

## 日常操作与恢复

```bash
bash deploy/2c2g-deploy.sh status
bash deploy/2c2g-deploy.sh logs
bash deploy/2c2g-deploy.sh backup
bash deploy/2c2g-deploy.sh rollback
```

备份默认位于 `deploy/backups/UTC时间-进程号/`，包含 `mysql.sql.gz`、`reports.tar.gz` 及当前镜像标签（已有版本时）。备份命令暂停应用写入、完成后启动原先运行的应用；可用绝对路径 `BACKUP_DIR` 指定备份目录。环境文件/加密密钥需要另外安全备份。保留上一版镜像与备份，不要在发布后立即 prune。按容量定期将备份转移到独立存储；脚本不自动删备份。

`rollback` 严格使用上一版应用镜像，忽略 shell 中残留的版本变量，备份后启动并验收；**不会回退数据库结构**。需要先确认旧应用兼容已执行的 migration。第一次部署没有上一版，无法执行镜像回退。失败时脚本显示停止阶段和备份目录，不自动覆盖数据库或假定 migration 可逆。

若必须恢复数据库和 PDF，先停止 app 容器，用当前或确认兼容的 MySQL，检查备份，再执行（以下命令会覆盖目标数据库内容，恢复前另外备份现状）：

```bash
# 将 /绝对路径/备份 换成真实目录；恢复时应用保持停止。
docker compose --env-file deploy/.env.2c2g --env-file deploy/.2c2g-release.env -f deploy/compose.2c2g.yml stop web admin backend
gzip -t /绝对路径/备份/mysql.sql.gz
gzip -dc /绝对路径/备份/mysql.sql.gz | docker compose --env-file deploy/.env.2c2g --env-file deploy/.2c2g-release.env -f deploy/compose.2c2g.yml exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot classroom_toolkit'
```

首次部署失败尚无 `.2c2g-release.env` 时，使用显式 `BACKEND_IMAGE_TAG`/`FRONTEND_IMAGE_TAG`，省略第二个 `--env-file`。恢复 PDF 时挂载 `classroom_reports_data`，先清理旧文件再解压 `reports.tar.gz`，恢复 uid/gid 1000 和目录权限；这是人工恢复操作，不由部署脚本自动执行。最后恢复原加密密钥、选择兼容的镜像并执行部署验收。环境或数据库密码变更应采用单独维护流程，不能仅改文件假定已有 MySQL 卷自动改密码。
