# Vue 管理后台与统计

`apps/web` 为 Next.js 教师端；`apps/admin` 为 Vue 3 管理端；`apps/backend/src/admin` 提供管理员专用查询，`src/analytics` 提供教师业务的事件采集。

## 后端代码约定

管理端沿用现有业务模块的 `Controller → Service → Database → Entity` 分层：Controller 只处理 HTTP 参数和响应，Service 负责业务校验、统计口径及结果组装，Database 使用注入的 TypeORM Repository / QueryBuilder 访问数据，Entity 映射数据库表。请求类放在 `*.dto.ts`，业务类型放在 `*.types.ts`。

`admin.module.ts` 注册管理查询及其实体，`auth/admin-auth.module.ts` 单独注册管理员认证；公共统计采集也使用相同分层。跨表聚合和日期函数封装在持久层，不在 Service 内执行 SQL。新增表继续通过数据库迁移创建，不开启自动同步。管理接口仍需要独立管理员权限，教师端的数据隔离规则继续保留。

## 启动

1. 在 `apps/backend/.env` 配置现有 MySQL 连接；已有数据库执行 `pnpm --filter ClassRoomToolkitBackend migration:run`。空库仍使用 `db:init`。禁止开启自动同步。
2. 首次启动前设置 `ADMIN_INITIAL_USERNAME` 与 `ADMIN_INITIAL_PASSWORD`（12–256 位），启动后端时自动创建第一个管理员。已有管理员时不覆盖；创建成功后同时清空或移除 `ADMIN_INITIAL_USERNAME`、`ADMIN_INITIAL_PASSWORD`，并重启后端使配置生效。只删除其中一个会导致启动校验失败。没有默认账号密码，也不开放管理员注册。
3. 运行 `pnpm dev`，或分别启动 Backend 和 Admin。管理后台开发地址为 `http://localhost:3002`，教师端为 3001，后端为 3000。
4. 管理前端通过 Vite 的 `/admin` 代理访问后端。后端不在默认地址时，启动管理前端前设置 `BACKEND_URL`。

生产环境继续沿用仓库 Docker / Nginx 部署。先发布数据库迁移和后端，再发布前端。`deploy/docker/admin.nginx.conf` 已包含管理 API 代理；PM2 的 Nginx 示例也已补齐。Compose 已传入管理员初始化配置。管理端与教师端分别使用域名。

管理员 Cookie 为 HttpOnly、SameSite=Strict，8 小时有效，只作用于 `/admin`。生产默认要求 HTTPS；仅本机 HTTP 联调可设置 `ADMIN_COOKIE_SECURE=false`。管理写请求要求 `X-Admin-Request: 1`，后端不开放跨域凭据访问。管理员登录按直接连接 IP 在单进程内限制为每 15 分钟 10 次尝试；当前部署为单实例，经过代理时多个用户可能共享限制。多副本部署前应改为共享限流存储与明确的受信代理配置。

## 部署配置位置

| 运行方式 | 后端配置位置                           | 管理页面与 API                                                          |
| -------- | -------------------------------------- | ----------------------------------------------------------------------- |
| 本地开发 | `apps/backend/.env`                    | `http://127.0.0.1:3002/login`；Vite 将 `/admin/*` 代理到后端            |
| Docker   | `deploy/.env.backend`，由 Compose 注入 | 管理域名 → 宿主机 Nginx → Admin 容器 → `/admin/*` 转发到 `backend:3000` |
| PM2      | `apps/backend/.env`                    | Nginx 托管 `apps/admin/dist`，并将 `/admin/*` 转发到 `127.0.0.1:3000`   |

管理员初始化变量放在后端配置中，不能放进 Vue 的 `VITE_*` 变量或提交到仓库。无默认管理员密码，教师账号不能登录管理端。使用以下模板时必须换成自己的密码：

```dotenv
# 首次启动创建管理员，替换示例密码；已有管理员时不会重置账号
ADMIN_INITIAL_USERNAME=admin
ADMIN_INITIAL_PASSWORD=replace-with-your-own-admin-password
ADMIN_COOKIE_SECURE=true
# 留空沿用后端时区；迁移过服务器时应填历史教师数据的原始偏移
TEACHER_DATA_UTC_OFFSET=
```

`ADMIN_INITIAL_PASSWORD` 仅用于创建第一个管理员，不能用它修改已有密码。Docker 的 `.env` 修改后需要重新创建 Backend 容器；单纯 `docker restart` 不会加载新的容器环境变量。具体命令见 [Docker 部署说明](single-server-docker-deployment.md)；PM2 操作见 [PM2 部署说明](deployment.md)。

## 上线验收

1. 先备份已有数据库，再执行 `AddAdminAnalytics20260906000000` 及尚未执行的迁移，之后启动新后端和前端。不要对已有业务库重新执行 `db:init`。
2. 确认 `admin_accounts`、`admin_sessions`、`analytics_events`、`analytics_settings` 已创建。采集起点是迁移时间，登录及使用事件从新后端启动后才开始写入。
3. 访问管理域名 `/login`，用配置的管理员登录。检查数据概览、教师列表及教师详情可以加载，刷新 `/features` 不出现 404。
4. 未登录请求 `/admin/auth/me` 应返回 401；管理员登录响应应设置 HttpOnly、SameSite=Strict、Path=/admin 的 Cookie，正式 HTTPS 环境还应有 Secure。
5. 在教师端注册一个测试教师，退出后再主动登录，完成一次随机点名等有效操作；在后台选择今天并刷新，确认新增注册、主动登录和功能使用分别出现。仅打开功能不会计入有效使用。
6. 退出管理员登录，再访问受保护接口应返回 401。初始化成功后同时清空两个初始化变量并让后端重新加载配置。

历史登录和功能数据不会自动补齐；未采集日期显示空白，迁移与新后端启动之间也可能存在采集空档。

## 管理后台常见问题

| 现象                                   | 检查项                                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 登录页能打开，接口返回 HTML 或解析失败 | 检查 `/admin/*` 是否被误交给 SPA 的 `index.html` 回退；需要独立 API 代理                                          |
| 管理 API 返回 502                      | 确认 Backend 已启动；Docker Admin 应使用 `backend:3000`，不能使用容器自己的 `127.0.0.1`                           |
| 登录后仍返回 401                       | 确认使用管理员账号及同一域名；生产 Secure Cookie 需要 HTTPS；仅本机 HTTP 联调可临时设 `ADMIN_COOKIE_SECURE=false` |
| 登录返回 403                           | 自行调用接口时需附带 `X-Admin-Request: 1`；管理前端已自动添加                                                     |
| 登录返回 429                           | 当前按直接连接 IP 限流，15 分钟内最多 10 次尝试；代理后的访问可能共享限制                                         |
| 管理表不存在或统计接口返回 500         | 检查迁移是否执行在应用实际连接的数据库，查看 Backend 日志                                                         |
| 初始化配置修改后账号密码没变           | 已有管理员时不会覆盖；两个初始化变量均清空才表示停止初始化                                                        |
| 注册趋势整体偏移 8 小时                | 核对 `TEACHER_DATA_UTC_OFFSET` 与历史教师数据原始存储时区                                                         |
| 图表没有历史数据                       | 先核对日期范围和采集起点，再确认教师端发生了有效操作；不能用历史会话表恢复完整登录记录                            |

## 页面与接口

- 数据概览：`GET /admin/dashboard/overview`
- 教师列表及详情：`GET /admin/teachers`、`GET /admin/teachers/:id`
- 学生和班级列表：`GET /admin/students`、`GET /admin/classrooms`
- 注册趋势：`GET /admin/analytics/registrations`
- 登录趋势、记录：`GET /admin/analytics/logins`、`GET /admin/analytics/login-records`
- 功能排行与趋势：`GET /admin/analytics/features/ranking`、`GET /admin/analytics/features/:key/trend`

日期参数为 `start`、`end`（YYYY-MM-DD），默认近 30 天，最多 366 天。列表支持 `page`、`pageSize`（上限 100），师生班级列表支持 `search`。学生和班级可按 `teacherId` / `teacherSearch` 筛选，学生还可按 `classroomId` / `classroomSearch` 筛选。登录记录支持 `teacherId`、`kind`；功能排行支持 `sort=teachers|uses`。

## 统计口径

- 教师数来自教师账号表，管理员不计入。学生数仅统计 `student_students` 的档案，不合并其他工具中的学生副本，不代表现实中去重人数。
- 注册趋势以现存教师账号创建时间计算。原教师 DATETIME 由后端按本机时区写入，`TEACHER_DATA_UTC_OFFSET` 可指定历史偏移（例如 `+08:00` 或 `+00:00`），默认沿用后端运行环境。若迁移了服务器时区，应明确设置历史数据库的偏移。混合时区导入的历史数据需单独校正，不能用一个偏移自动恢复。
- 新统计事件统一以数据库 UTC 时间写入，所有图表按北京时间分日，范围使用包含起始、排除次日零点的边界。
- `register`、`auto_login`、`login`、`login_failed` 分开记录。登录校验与页面刷新不计入登录；退出不会删除统计历史。登录人数按所选完整周期去重，不累加每日人数。
- 活跃教师为发生有效功能操作的教师；功能使用率分母为同期活跃教师。排行默认按使用教师数，可切换使用次数；较上期按使用教师数比较等长周期。上期为零时显示“新增使用”；对比周期早于采集开始时不计算增长。
- 迁移时保存采集开始时间。此前登录和功能趋势为空白，首日可能不完整。历史登录不能从会话表完整恢复，也不伪造历史使用记录。

## 功能事件

| 功能     | 计入有效使用的动作                                           |
| -------- | ------------------------------------------------------------ |
| 随机点名 | 点名成功                                                     |
| 倒计时   | 从停止切换至运行后保存成功；每秒更新不计数                   |
| 学生管理 | 创建班级、新增学生、导入、修改、调整分组；批量导入按一次操作 |
| 任务统计 | 创建任务、更新或切换学生任务状态                             |
| 座位表   | 创建、分配座位、随机排座                                     |
| 便签     | 创建、保存标题或内容；同一便签 30 秒时间桶内自动保存合并     |
| 宠物积分 | 评价积分、兑换成功                                           |
| 扭蛋机   | 抽奖成功                                                     |

功能打开在教师端窗口入口上报，实际使用由标记过的业务接口在成功后记录；未标记的读取、同步和配置请求不计数。前端开放上报仅允许 `open` 白名单事件，教师身份来自服务端会话。事件 ID 在数据库中按教师、类型、功能、动作去重，同一业务请求的重试需复用同一 ID。失败操作不产生使用事件。统计失败记录服务端错误，不返回课堂操作错误；事件不包含密码、令牌、便签内容或学生数据。

首期采用 MySQL 索引与实时聚合，不增加 Redis 或消息队列。事件目前不自动清理，后续根据量级制定保留周期和汇总策略；周期去重不可直接累加每日去重人数。

## 验证

```bash
pnpm --filter ClassRoomToolkitBackend exec jest --runInBand --no-watchman
pnpm --filter ClassRoomToolkitBackend exec jest --config ./test/jest-e2e.json --runInBand --no-watchman
pnpm --filter ClassRoomToolkitAdmin exec vitest run
pnpm --filter ClassRoomToolkitAdmin build
pnpm --filter ClassRoomToolkitWeb build
```

E2E 必须指向已执行迁移的隔离测试数据库。测试创建并清理带随机后缀的账号和事件，覆盖凭据隔离、CSRF、登录口径、事件去重、北京时间边界、跨日去重、分页和参数校验。
