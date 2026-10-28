# 课堂小组件

给老师提供一个课堂小组件，方便老师管理课堂，跟踪学生上课情况。

## 功能概览

教师端采用桌面多窗口界面，当前提供：

- 倒计时、随机点名、任务统计和座位表等课堂工具。
- 班级、分组、学生资料、学生照片和批量导入管理。
- 宠物积分、课堂评价、成长周期、奖励兑换、纪念卡与证书。
- 扭蛋奖励配置、库存和抽取记录。
- 便签快速窗口、便签列表与置顶管理。
- 学期报告原版与 v2：课程 PDF 解析或手填教学内容、报告生成与编辑、历史恢复、发布分享，以及单份或批量导出图片。
- 教师意见反馈与功能使用统计。

管理端提供平台概览、注册与登录趋势、功能使用分析、教师详情、密码重置、学生/班级目录和意见反馈查询。所有教师业务数据按教师账号隔离。

## 运行

- 先安装依赖

```
pnpm install
```

- 运行

```
pnpm dev
```

## 开发规范与验证

开发和评审遵守 [项目开发与验收规范](docs/development-standards.md)；课程 PDF 的识别规则另见 [课程 PDF 识别基准](docs/semester-reports-setup.md#课程-pdf-识别基准)。面向用户的弹窗统一使用站内组件，禁止浏览器原生 `alert/confirm/prompt`；行为改动需附对应测试与说明关键约束的代码注释。

提交前运行完整自动验证：

```bash
pnpm verify
```

该命令执行规范检查、Backend/Web/Admin 测试及三端构建；Pull Request 的 GitHub Actions 也执行同一命令。

## 端口说明

- 3000 为后端api端口
- 3001 为客户访问端口
- 8080 为管理端口

## 后端

- 使用 nestjs+typescript+typeOrm+mysql 开发。

### 数据库迁移

生产和已有数据库禁止开启 TypeORM 自动同步：

```env
TYPEORM_SYNCHRONIZE=false
TYPEORM_MIGRATIONS_RUN=false
```

首次初始化空库使用：

```bash
pnpm --filter ClassRoomToolkitBackend db:init
```

已有业务数据首次增加教师隔离字段前，应设置历史数据归属账号，再执行迁移：

```env
LEGACY_DATA_OWNER_USERNAME=xiaocong
```

```bash
pnpm --filter ClassRoomToolkitBackend migration:run
```

部署流水线应在启动新版本后端前执行 `migration:run`，迁移失败时停止发布。

## 客户端

- 使用 Next.js、React 和 TypeScript 开发，功能与使用说明见 [Web README](apps/web/README.md)。

## 管理端

- 使用 Vue 3、Vite 和 TypeScript 开发，页面与部署说明见 [Admin README](apps/admin/README.md)。

## CI/CD 部署

仓库已配置 GitHub Actions：Pull Request 执行完整测试和构建；合并到 `main` 后，Frontend 与 Backend 根据代码路径独立构建 Docker 镜像并部署到同一台服务器，互不重启。生产配置见 [2C2G 单服务器 Docker 部署方案](docs/single-server-docker-deployment.md)，不使用 Docker 时可参考 [PM2 备选方案](docs/deployment.md)。

## 管理后台

Vue 管理后台支持师生班级查询、注册与登录图表、热门功能分析。首次使用需迁移数据库并初始化管理员，详见 [管理后台部署与统计口径](docs/admin-dashboard.md)。
