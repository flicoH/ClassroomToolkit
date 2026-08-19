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

| 模块       | 路由前缀          | 说明                             |
| ---------- | ----------------- | -------------------------------- |
| 教师认证   | `/auth/teacher`   | 注册、登录、当前教师、退出登录   |
| 班级与学生 | `/classes`        | 班级、学生、分组与批量导入       |
| 任务统计   | `/task-stats`     | 任务及学生完成状态               |
| 座位表     | `/seating-charts` | 座位表、座位分配与随机打乱       |
| 随机点名   | `/random-picker`  | 班级数据、抽取与历史记录         |
| 倒计时     | `/countdown`      | 教师独立的倒计时状态             |
| 便签       | `/sticky-notes`   | 便签新增、编辑、置顶与删除       |
| 宠物积分   | `/pet-points`     | 积分调整、宠物、规则、奖励与兑换 |
| 扭蛋奖励   | `/gacha-machine`  | 奖励 CRUD、抽奖与抽奖记录        |

除健康检查、注册和登录外，所有接口均经过全局教师鉴权。业务数据包含 `teacher_id`，查询和写入会自动限定为当前登录教师，不能跨教师访问。

## 本地启动

在仓库根目录执行：

```bash
pnpm install
cp apps/backend/.env.example apps/backend/.env
```

编辑 `apps/backend/.env`，至少配置正确的 MySQL 连接信息，然后初始化数据库：

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

教师密码使用带随机盐的 PBKDF2-SHA512 哈希保存，会话也以哈希形式持久化。注册密码至少 6 位。

## 常用接口

| 方法             | 路径                                        | 说明                 |
| ---------------- | ------------------------------------------- | -------------------- |
| `POST`           | `/auth/teacher/register`                    | 注册教师             |
| `POST`           | `/auth/teacher/login`                       | 登录并创建会话       |
| `GET`            | `/auth/teacher/me`                          | 获取当前教师         |
| `POST`           | `/auth/teacher/logout`                      | 注销当前会话         |
| `GET / POST`     | `/classes`                                  | 查询或创建班级       |
| `POST`           | `/classes/:classroomId/students`            | 新增学生             |
| `PATCH / DELETE` | `/classes/:classroomId/students/:studentId` | 编辑或删除学生       |
| `GET / POST`     | `/task-stats`                               | 查询或创建任务       |
| `GET / POST`     | `/seating-charts`                           | 查询或创建座位表     |
| `POST`           | `/random-picker/pick`                       | 执行随机点名         |
| `GET / PATCH`    | `/countdown`                                | 读取或更新倒计时     |
| `GET / POST`     | `/sticky-notes`                             | 查询或创建便签       |
| `GET`            | `/pet-points`                               | 获取宠物积分完整状态 |
| `POST`           | `/pet-points/scores/adjust`                 | 调整学生积分         |
| `GET`            | `/gacha-machine`                            | 获取扭蛋机奖励与记录 |
| `POST`           | `/gacha-machine/draw`                       | 执行抽奖             |
| `POST`           | `/gacha-machine/rewards`                    | 新增奖励             |
| `PATCH / DELETE` | `/gacha-machine/rewards/:rewardId`          | 编辑或删除奖励       |

具体请求体以对应模块的 `*.dto.ts` 为准。

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

典型 CI/CD 发布顺序：

```bash
pnpm install --frozen-lockfile
pnpm --filter ClassRoomToolkitBackend test
pnpm --filter ClassRoomToolkitBackend test:e2e
pnpm --filter ClassRoomToolkitBackend build
pnpm --filter ClassRoomToolkitBackend migration:run
pnpm --filter ClassRoomToolkitBackend start:prod
```

生产环境建议：

- 将 Backend 放在 Web BFF 或反向代理之后，不直接暴露 MySQL。
- 使用 HTTPS，并让浏览器只访问 Web 的同源 `/api/*` 接口。
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
│   ├── teacher-auth/         # 教师账号和会话
│   ├── database/             # TypeORM DataSource 与 Migration
│   ├── students/             # 班级、学生和分组
│   ├── task-stats/           # 任务统计
│   ├── seating-chart/        # 座位表
│   ├── random-picker/        # 随机点名
│   ├── countdown/            # 倒计时
│   ├── sticky-notes/         # 便签
│   ├── pet-points/           # 宠物积分
│   └── gacha-machine/        # 扭蛋奖励
└── test/                     # E2E 测试
```

## 故障排查

### `401 Unauthorized`

确认请求携带有效的 `Authorization: Bearer <session-token>`。通过 Web 调用时，确认浏览器已登录、请求走同源 `/api/*`，且没有绕过 Next.js BFF 直接访问 Backend。

### 无法连接 MySQL

检查 MySQL 服务状态及 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`。容器内的 `127.0.0.1` 指向容器自身，数据库在其他容器时应使用服务名。

### Migration 提示历史数据无归属

先创建或确认教师账号存在，再把 `LEGACY_DATA_OWNER_USERNAME` 设置为该账号用户名，重新执行 `migration:run`。

### 端口被占用

修改 `.env` 中的 `PORT`，并同步更新 Web 服务的 `BACKEND_URL`。
