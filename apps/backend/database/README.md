# ClassroomToolkit 数据库脚本

当前后端通过 TypeORM 连接 MySQL。本目录脚本用于初始化数据库结构和示例数据，表结构按统一数据库实例、功能模块独立表设计：

- `teacher_auth_*`：教师登录注册
- `student_*`：班级、分组、学生管理
- `task_stats_*`：任务统计
- `seating_chart_*`：座位表
- `random_picker_*`：随机点名
- `countdown_*`：倒计时
- `sticky_notes_*`：便签
- `pet_points_*`：宠物积分

执行顺序：

```bash
mysql -u root -p < schema.sql
mysql -u root -p < seed.sql
```

也可以在 `apps/backend` 内使用脚本：

```bash
MYSQL_USER=root MYSQL_PASSWORD=你的密码 pnpm run db:init
```

说明：

- `schema.sql` 会创建 `classroom_toolkit` 数据库和全部业务表。
- `seed.sql` 会写入与前端示例数据一致的初始化数据。
- Nest 后端已通过 `@nestjs/typeorm` + `typeorm` 连接真实 MySQL，连接参数见 `apps/backend/.env.example`。
- `TYPEORM_SYNCHRONIZE` 默认关闭，建议使用 `schema.sql` 管理建表，避免运行时自动改表。
