# ClassroomToolkit Backend

ClassroomToolkit 的 NestJS 业务 API，负责教师认证、教师数据隔离、班级与学生管理，以及课堂工具数据的持久化。

## 技术栈

- Node.js 22+
- pnpm 10+
- NestJS 11
- TypeORM 0.3
- MySQL 8（推荐）
- Jest 30

## 功能模块

| 模块       | 路由前缀            | 说明                                          |
| ---------- | ------------------- | --------------------------------------------- |
| 教师认证   | `/auth/teacher`     | 注册、登录、当前教师、退出登录                |
| 班级与学生 | `/classes`          | 班级、学生、分组与批量导入                    |
| 任务统计   | `/task-stats`       | 任务及学生完成状态                            |
| 座位表     | `/seating-charts`   | 座位表、座位分配与随机打乱                    |
| 随机点名   | `/random-picker`    | 班级数据、抽取与历史记录                      |
| 倒计时     | `/countdown`        | 教师独立的倒计时状态                          |
| 便签       | `/sticky-notes`     | 便签新增、编辑、置顶与删除                    |
| 宠物积分   | `/pet-points`       | 积分调整、宠物、规则、奖励与兑换              |
| 扭蛋奖励   | `/gacha-machine`    | 奖励 CRUD、抽奖与抽奖记录                     |
| 学期报告   | `/semester-reports` | 学期/学科、课程资料解析、报告流程、分享与历史 |
| 意见反馈   | `/feedback`         | 校验并保存当前教师的意见反馈                  |
| 功能统计   | `/analytics`        | 记录认证教师的功能打开事件                    |
| 管理后台   | `/admin`            | 平台统计、目录查询、教师详情与密码重置        |

教师业务接口经过全局教师鉴权，查询和写入按 `teacher_id` 限定当前教师。`/admin/*` 使用独立管理员身份域，可查询全平台数据，但教师令牌不能访问；`/analytics/events` 仍要求教师身份，仅接收功能打开事件。

新增模块：`src/admin` 为管理查询，`src/admin/auth` 为管理员认证，`src/analytics` 为公共统计采集。均遵循 Controller / Service / Database / Entity 分层，DTO 和业务类型独立定义。

## 本地启动

在仓库根目录执行：

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
```

编辑 `apps/backend/.env`，至少配置正确的 MySQL 连接信息。以下初始化仅用于全新数据库，已有数据库使用 `migration:run`：

```bash
pnpm --filter ClassRoomToolkitBackend db:init
```

启动后端开发服务：

```bash
pnpm --filter ClassRoomToolkitBackend dev
```

默认地址为 `http://127.0.0.1:3000`。访问根路径可进行健康检查：

```bash
curl http://127.0.0.1:3000/
```

也可以在仓库根目录执行 `pnpm dev`，同时启动 Backend、Web 和 Admin。

## 环境变量

| 变量                         | 默认值              | 说明                                         |
| ---------------------------- | ------------------- | -------------------------------------------- |
| `HOST`                       | `127.0.0.1`         | 监听地址；容器部署通常设为 `0.0.0.0`         |
| `PORT`                       | `3000`              | HTTP 服务端口                                |
| `MYSQL_HOST`                 | `127.0.0.1`         | MySQL 地址                                   |
| `MYSQL_PORT`                 | `3306`              | MySQL 端口                                   |
| `MYSQL_USER`                 | `root`              | MySQL 用户名                                 |
| `MYSQL_PASSWORD`             | 空                  | MySQL 密码                                   |
| `MYSQL_DATABASE`             | `classroom_toolkit` | 数据库名                                     |
| `TYPEORM_SYNCHRONIZE`        | `false`             | TypeORM 自动同步；生产环境必须保持关闭       |
| `TYPEORM_MIGRATIONS_RUN`     | `false`             | 服务启动时是否自动执行 Migration             |
| `LEGACY_DATA_OWNER_USERNAME` | 空                  | 旧库首次迁移时，历史业务数据归属的教师用户名 |

学期报告与课程解析配置：

| 变量                              | 默认值 / 用途                                                             |
| --------------------------------- | ------------------------------------------------------------------------- |
| `SEMESTER_REPORT_PARSER_PROVIDER` | `kimi`；可设为 `docling`                                                  |
| `KIMI_API_KEY`                    | Kimi 文件解析密钥；使用默认解析器时必填                                   |
| `KIMI_BASE_URL`                   | `https://api.moonshot.cn/v1`；必须是无凭据和查询参数的 HTTPS `/v1` 地址   |
| `SEMESTER_REPORT_PARSER_URL`      | Docling 解析地址；仅 `SEMESTER_REPORT_PARSER_PROVIDER=docling` 时使用     |
| `SEMESTER_REPORT_PARSER_API_KEY`  | 可选的 Docling Bearer 密钥                                                |
| `SEMESTER_REPORT_STORAGE_DIR`     | 原始课程 PDF 临时存储目录；默认 `<后端工作目录>/data/semester-reports`    |
| `REPORT_GENERATION_MODE`          | `auto`；可设 `template` 或 `ai`                                           |
| `REPORT_AI_BASE_URL`              | AI 报告生成服务地址；AI 模式与 API Key、模型名同时配置                    |
| `REPORT_AI_API_KEY`               | AI 报告生成服务密钥                                                       |
| `REPORT_AI_MODEL`                 | AI 报告生成模型名                                                         |
| `REPORT_PUBLIC_BASE_URL`          | 家长可访问的 Web 根地址；生产环境不能使用 localhost 或示例域名            |
| `REPORT_SHARE_ENCRYPTION_KEY`     | 32 字节 Base64 密钥，用于加密公开分享快照中的敏感字段；发布报告前必须配置 |

`REPORT_GENERATION_MODE=auto` 在三项 AI 配置全部为空时使用本地模板，全部配置时使用 AI；只配置一部分会拒绝生成。课程解析和报告生成由后端 Worker 异步执行，部署时需保证存储目录可写，且不能在解析完成前删除课程文件。

管理员相关配置：

| 变量                      | 说明                                                        |
| ------------------------- | ----------------------------------------------------------- |
| `ADMIN_INITIAL_USERNAME`  | 首次创建管理员的账号；默认不创建                            |
| `ADMIN_INITIAL_PASSWORD`  | 首次创建密码，12–256 位；已有管理员时不会覆盖               |
| `ADMIN_COOKIE_SECURE`     | 生产环境默认启用 Secure；仅本机 HTTP 联调可设 `false`       |
| `TEACHER_DATA_UTC_OFFSET` | 历史教师时间偏移；空值沿用后端运行环境，例如显式设 `+08:00` |

初始化成功后同时移除两个 `ADMIN_INITIAL_*` 变量并重新加载后端配置。Docker 使用 `deploy/.env.backend` 注入，PM2/本地使用 `apps/backend/.env`。详见 [管理后台部署与验收](../../docs/admin-dashboard.md)。

不要提交 `.env`。生产环境应通过部署平台或密钥管理服务注入数据库密码等敏感配置。

## 数据库与 Migration

数据库脚本位于 `database/`，TypeORM Migration 位于 `src/database/migrations/`。

### 全新数据库

```bash
pnpm --filter ClassRoomToolkitBackend db:init
```

该命令依次执行 `database/schema.sql` 和尚未执行的 Migration。需要示例数据时再单独执行：

```bash
pnpm --filter ClassRoomToolkitBackend db:seed
```

`db:seed` 会将示例业务数据分配给数据库中创建时间最早的教师，因此应先注册教师账号，并且只在开发或演示环境使用。

### 已有数据库升级

首次引入教师数据隔离时，先指定历史数据应归属的已有教师账号：

```dotenv
LEGACY_DATA_OWNER_USERNAME=existing_teacher
```

确认该账号已存在后执行：

```bash
pnpm --filter ClassRoomToolkitBackend migration:run
```

如果未设置该变量，Migration 会尝试使用创建时间最早的教师。库中存在历史业务数据但没有任何教师账号时，Migration 会主动失败，避免产生无归属数据。

回滚最近一次 Migration：

```bash
pnpm --filter ClassRoomToolkitBackend migration:revert
```

生产发布前应先备份数据库。不要通过开启 `TYPEORM_SYNCHRONIZE` 替代 Migration。

## 接口鉴权

公开接口：

```text
GET  /
POST /auth/teacher/register
POST /auth/teacher/login
POST /admin/auth/login   # 不要求已有会话，但需要 X-Admin-Request: 1
```

登录请求示例：

```bash
curl -X POST http://127.0.0.1:3000/auth/teacher/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"teacher","password":"change-me"}'
```

登录成功后，直接调用后端的客户端需在后续请求中携带响应中的会话 Token：

```bash
curl http://127.0.0.1:3000/auth/teacher/me \
  -H 'Authorization: Bearer <session-token>'
```

Web 前端不应在浏览器 JavaScript 中保存 Token。`apps/web` 已通过同源 `/api/*` BFF 将会话保存在 `HttpOnly`、`SameSite=Lax` 的安全 Cookie 中，并由服务端代理附加 Bearer Token。

教师密码使用带随机盐的 PBKDF2-SHA512 哈希保存，并通过异步密码派生避免阻塞 Node.js 事件循环；会话也以哈希形式持久化。注册密码为 6–256 位，用户名最长 64 个字符。

公开认证接口在单进程内按“来源地址 + 用户名”限流：登录 15 分钟最多连续失败 10 次，成功后清除登录计数；注册每小时最多尝试 5 次。不存在的用户名仍执行固定成本密码派生，避免通过响应耗时枚举账号。多副本部署时应将限流状态迁移到 Redis 等共享存储。

教师认证及班级、学生、分组接口会在写入数据库前校验必填字段、数据类型和数据库字段长度。非法输入返回 `400 Bad Request`，认证尝试超限返回 `429 Too Many Requests`。主要边界如下：

| 字段               | 限制                                      |
| ------------------ | ----------------------------------------- |
| 教师用户名、姓名   | 最长 64 个字符                            |
| 教师密码           | 6–256 位                                  |
| 教师邮箱           | 最长 128 个字符                           |
| 班级、学生、分组名 | 最长 64 个字符                            |
| 单个班级初始分组   | 最多 50 个，重复名称会合并                |
| 学生性别           | `男`、`女` 或空值                         |
| 学生批量导入文本   | 最长 100,000 个字符，格式仍为每行一名学生 |

## 常用接口

| 方法             | 路径                                        | 说明                                                       |
| ---------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `POST`           | `/auth/teacher/register`                    | 注册教师                                                   |
| `POST`           | `/auth/teacher/login`                       | 登录并创建会话                                             |
| `GET`            | `/auth/teacher/me`                          | 获取当前教师                                               |
| `POST`           | `/auth/teacher/logout`                      | 注销当前会话                                               |
| `GET / POST`     | `/classes`                                  | 查询或创建班级                                             |
| `POST`           | `/classes/:classroomId/students`            | 新增学生                                                   |
| `PATCH / DELETE` | `/classes/:classroomId/students/:studentId` | 编辑或删除学生                                             |
| `GET / POST`     | `/task-stats`                               | 查询或创建任务                                             |
| `GET / POST`     | `/seating-charts`                           | 查询或创建座位表                                           |
| `POST`           | `/random-picker/pick`                       | 执行随机点名                                               |
| `GET / PATCH`    | `/countdown`                                | 读取或更新倒计时                                           |
| `GET / POST`     | `/sticky-notes`                             | 查询或创建便签                                             |
| `GET`            | `/pet-points`                               | 获取宠物积分完整状态（含学生、规则、四系共 27 只宠物模板） |
| `POST`           | `/pet-points/scores/adjust`                 | 调整学生积分                                               |
| `GET`            | `/gacha-machine`                            | 获取扭蛋机奖励与记录                                       |
| `POST`           | `/gacha-machine/draw`                       | 执行抽奖                                                   |
| `POST`           | `/gacha-machine/rewards`                    | 新增奖励                                                   |
| `PATCH / DELETE` | `/gacha-machine/rewards/:rewardId`          | 编辑或删除奖励                                             |
| `POST`           | `/feedback`                                 | 提交教师意见反馈                                           |
| `GET / POST`     | `/semester-reports/report-terms`            | 查询或创建报告学期                                         |
| `GET / POST`     | `/semester-reports/report-subjects`         | 查询或创建报告学科                                         |
| `GET / POST`     | `/semester-reports/course-documents`        | 查询或上传课程资料                                         |
| `POST`           | `/semester-reports/reports/generate`        | 生成学生报告                                               |
| `GET`            | `/semester-reports/reports`                 | 筛选和分页查询报告                                         |
| `PATCH`          | `/semester-reports/reports/:id/draft`       | 编辑报告草稿                                               |
| `POST`           | `/semester-reports/reports/:id/publish`     | 发布报告并创建分享                                         |
| `GET`            | `/semester-reports/public/reports/:token`   | 获取公开报告快照                                           |

具体请求体以对应模块的 `*.dto.ts` 和服务层校验为准。学期报告还支持报告事件查询/恢复、课程学科增删、课堂照片、重新生成、失败重试、撤销发布、独立分享链接和软删除；公开报告仅通过高熵分享 Token 访问。

## 测试与质量检查

```bash
# 单元测试
pnpm --filter ClassRoomToolkitBackend test

# E2E 测试
pnpm --filter ClassRoomToolkitBackend test:e2e

# 覆盖率
pnpm --filter ClassRoomToolkitBackend test:cov

# TypeScript 编译
pnpm --filter ClassRoomToolkitBackend build

# ESLint（当前脚本会自动修复可修复问题）
pnpm --filter ClassRoomToolkitBackend lint

# Prettier
pnpm --filter ClassRoomToolkitBackend format
```

E2E 测试会连接数据库；执行前请确保 MySQL 已启动且 `.env` 指向测试可用的数据库。不要让自动化测试连接生产数据库。

## 生产部署

先在隔离测试库执行测试；生产发布只执行构建、迁移与启动，不在生产业务库运行 E2E。完整 Docker 流程见 [部署说明](../../docs/single-server-docker-deployment.md)。手动发布后端的核心命令：

```bash
pnpm install --frozen-lockfile
pnpm --filter ClassRoomToolkitBackend build
pnpm --filter ClassRoomToolkitBackend migration:run
pnpm --filter ClassRoomToolkitBackend start:prod
```

生产环境建议：

- 将 Backend 放在 Web BFF 或反向代理之后，不直接暴露 MySQL。
- 使用 HTTPS；教师端通过同源 `/api/*` BFF，管理端通过同源 `/admin/*` Nginx 代理访问后端。
- 保持 `TYPEORM_SYNCHRONIZE=false`，发布时显式执行 Migration。
- 在迁移前备份数据库，并确保同一时间只有一个发布实例执行 Migration。
- 为应用配置专用、最小权限的 MySQL 用户，不使用 `root`。
- 对 `.env`、日志和 CI 输出中的密码、Cookie 与 Token 做脱敏处理。
- 配置健康检查、进程自动重启、数据库备份和错误监控。

## 目录结构

```text
apps/backend/
├── database/                 # MySQL 建库与示例数据脚本
├── src/
│   ├── auth/                 # 全局鉴权 Guard 与教师上下文
│   ├── admin/                # 管理员认证与全平台只读查询
│   ├── analytics/            # 登录及功能事件采集
│   ├── teacher-auth/         # 教师账号和会话
│   ├── database/             # TypeORM DataSource 与 Migration
│   ├── students/             # 班级、学生和分组
│   ├── task-stats/           # 任务统计
│   ├── seating-chart/        # 座位表
│   ├── random-picker/        # 随机点名
│   ├── countdown/            # 倒计时
│   ├── sticky-notes/         # 便签
│   ├── pet-points/           # 宠物积分
│   ├── gacha-machine/        # 扭蛋奖励
│   ├── feedback/             # 教师意见反馈
│   └── semester-reports/     # 课程解析、报告、分享和后台 Worker
└── test/                     # E2E 测试
```

## 故障排查

### `401 Unauthorized`

教师接口确认请求携带有效的 `Authorization: Bearer <session-token>`。管理接口则检查独立的 `classroom_admin` Cookie，不使用教师 Bearer Token。通过 Web 调用时，确认浏览器已登录、请求走同源 `/api/*`，且没有绕过 Next.js BFF 直接访问 Backend。

### `429 Too Many Requests`

同一来源对同一用户名连续登录失败 10 次后，需要等待 15 分钟再试；注册尝试达到每小时 5 次后，需要等待当前窗口结束。登录成功会立即清除该账号的失败登录计数。单进程开发环境重启后计数会清空，多副本生产环境应使用共享限流存储。

### 无法连接 MySQL

检查 MySQL 服务状态及 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`。容器内的 `127.0.0.1` 指向容器自身，数据库在其他容器时应使用服务名。

### Migration 提示历史数据无归属

先创建或确认教师账号存在，再把 `LEGACY_DATA_OWNER_USERNAME` 设置为该账号用户名，重新执行 `migration:run`。

### 端口被占用

修改 `.env` 中的 `PORT`，并同步更新 Web 服务的 `BACKEND_URL`。

### 登录 IP 限制

先执行 `pnpm --filter ClassRoomToolkitBackend migration:run`，新增封禁表与登录来源字段。管理接口为 `GET/POST /admin/login-ip-blocks` 和 `POST /admin/login-ip-blocks/remove`（写入 JSON `{ "ip": "192.0.2.1" }`），沿用管理员认证与 CSRF 防护。封禁教师新登录返回 403。

代理部署时，Backend 与 Web 配置相同的高强度 `LOGIN_PROXY_SECRET`，入口 Nginx 覆盖 `X-Real-IP`，Web 端口仅允许可信入口访问。未配置密钥时只使用连接地址。所在地通过 HTTPS ipwho.is 查询，服务商会收到 IP，查询超时或失败显示未知，不阻断登录。历史数据不回填。

IP 封禁也适用于已有 Web 会话：仅在发送请求时校验，命中时撤销当前令牌并清除 Cookie；空闲页面和切回标签页不主动校验。退出后只显示“禁止账号登录，请联系管理员解封”。管理员认证不受影响，网络故障不会误判为封禁。
