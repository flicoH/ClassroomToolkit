# ClassroomToolkit 数据库脚本

后端通过 TypeORM 连接 MySQL 8.x，使用 `utf8mb4`。本目录提供基础建表和可选示例数据，增量结构由 [迁移目录](../src/database/migrations/) 管理。表结构按统一数据库实例、功能模块独立表设计：

- `teacher_auth_*`：教师登录注册
- `student_*`：班级、分组、学生管理
- `task_stats_*`：任务统计
- `seating_chart_*`：座位表
- `random_picker_*`：随机点名
- `countdown_*`：倒计时
- `sticky_notes_*`：便签
- `pet_points_*`：宠物积分
- `gacha_machine_*`：扭蛋奖励与抽取记录
- `teacher_feedback`：教师反馈
- `semester_report_*`、`semester_reports`：学期、学科、课程资料、报告、分享与流程记录
- `admin_accounts`、`admin_sessions`：独立管理员账号与会话
- `analytics_events`、`analytics_settings`：注册、登录和功能使用事件及统计设置

## 连接配置

在仓库根目录安装依赖，在 `apps/backend` 创建 `.env`，配置参考 [`.env.example`](../.env.example)：

| 配置                         | 默认值 / 用途                                              |
| ---------------------------- | ---------------------------------------------------------- |
| `MYSQL_HOST`                 | `127.0.0.1`                                                |
| `MYSQL_PORT`                 | `3306`                                                     |
| `MYSQL_USER`                 | `root`                                                     |
| `MYSQL_PASSWORD`             | 空；按实际数据库设置                                       |
| `MYSQL_DATABASE`             | `classroom_toolkit`                                        |
| `TYPEORM_SYNCHRONIZE`        | `false`；保持关闭，通过迁移更新结构                        |
| `TYPEORM_MIGRATIONS_RUN`     | `false`；默认显式执行迁移                                  |
| `LEGACY_DATA_OWNER_USERNAME` | 老库首次增加教师隔离字段时，指定历史数据所属的已有教师账号 |

`db:schema`、`db:seed` 需要 MySQL 客户端，并读取后端目录的 `.env`。**两个 SQL 文件写死了 `classroom_toolkit` 数据库名**；仅修改 `MYSQL_DATABASE` 不会改变其目标库。使用其他库名时，先调整 SQL 中的 `CREATE DATABASE` / `USE`，保证与 TypeORM 配置一致。

## 新数据库初始化

以下命令均在 `apps/backend` 目录执行：

```bash
pnpm run db:init
```

`db:init` 先导入 [schema.sql](schema.sql)，再构建后端并运行全部尚未应用的迁移，不自动导入示例数据。`CREATE TABLE IF NOT EXISTS` 不会更新已有表；只导入基础 SQL 不能保证学生照片等新增字段可用。

## 已有数据库升级

先备份目标数据库，确认连接配置及备份可恢复，再查看待执行迁移：

```bash
pnpm run build
pnpm exec typeorm migration:show -d dist/database/data-source.js
```

核对后执行：

```bash
pnpm run migration:run
```

命令会重新构建并执行全部待应用迁移，历史记录保存在 `typeorm_migrations`。完成后重启后端及报告 Worker，使进程加载新版本；涉及界面改动时同步更新 Web。保留现有学生和报告数据，不通过删库重建或导入示例数据升级。

历史教师隔离迁移优先使用 `LEGACY_DATA_OWNER_USERNAME` 指定的账号，找不到时回退到最早创建的教师。存在历史业务数据却没有可归属教师时会报错，需要先处理账号归属。

MySQL 部分 DDL 会隐式提交，迁移失败不能假定结构已完全回滚。根据日志检查实际结构，解决原因后再执行，不要手工伪造成功记录。

CLI 使用 `dist/database/data-source.js`；开发热更新输出位于 `.dev-dist/`，不能替代此入口。迁移文件采用 `14位时间戳-名称.ts`，CLI 只加载编译后的对应 `.js` 普通文件，排除测试、声明和辅助文件。完整结构以基础 SQL 与已执行迁移共同为准。

## 可选示例数据

仅在独立开发或演示数据库完成初始化、并注册至少一个教师后执行：

```bash
pnpm run db:seed
```

[seed.sql](seed.sql) 将示例数据归属给最早创建的教师，不使用 `LEGACY_DATA_OWNER_USERNAME`；没有教师账号时无法正确导入。脚本包含 `ON DUPLICATE KEY UPDATE`，重复导入可能更新同 ID 的已有记录，不要在实际业务数据库运行。

## 学生照片与学期报告 v2

- `20261013000000-add-student-photo` 为 `student_students` 增加 `photo MEDIUMTEXT NULL`，执行前检查列是否存在。未上传时为 `NULL`，学生管理沿用原头像逻辑。
- 照片以服务端校验并转换的 JPEG Data URL 保存：上传最大 256KB、最长边 512 像素，服务端解码并移除元数据。无需新增对象存储或环境变量，数据库备份包含照片。上传、删除检查教师、班级及学生归属；普通资料更新不能直接写照片。
- 原版与 v2 共用报告表，正文和生成快照分别存于 `semester_reports.content`、`semester_reports.snapshot` JSON。成长评价、分学科课堂表现、课堂照片使用既有 JSON，无独立 v2 表。
- v2 首次生成将学生头像保存为 `snapshot.studentPhoto`，正文头像由快照派生。学生换照片不会改写已有报告，重新生成与历史恢复沿用保存的版本。课堂照片与头像分别存储；无课堂照片时隐藏整个 v2“课堂表现”区块，评价数据仍保留。
- 学科课堂表现选项存于 `semester_report_subjects.performance_config`，旧库由 `20261012000000-add-subject-performance-config` 迁移补齐。

完整接口、权限与报告规则见 [学生照片与报告头像](../../../docs/student-photos.md)。

## 回退与故障排查

`pnpm run migration:revert` 回退最后一条已执行迁移，执行前检查其 `down` 和备份。学生照片迁移的 `down` 特意不删除照片列，回退应用时保留照片；其他迁移可能删除结构或数据，不能视为通用无损回退。

出现“学生数据加载失败，请确认后端服务和 MySQL 已启动”时：

1. 检查后端进程、MySQL 服务和 `.env`，查看后端实际错误日志。
2. 用 `migration:show` 检查待执行迁移，确认目标库与应用连接一致。
3. 日志包含 `Unknown column ... photo` / `ER_BAD_FIELD_ERROR` 时，备份后执行待应用迁移。可在目标库检查：

   ```sql
   SHOW COLUMNS FROM student_students LIKE 'photo';
   SELECT name, timestamp FROM typeorm_migrations ORDER BY timestamp;
   ```

4. 迁移成功后重启后端，检查学生列表、上传和报告生成。仍失败时按日志检查权限、连接及其他缺失结构，不通过开启自动同步或删库掩盖问题。
