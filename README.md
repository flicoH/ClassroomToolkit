# 课堂小组件

给老师提供一个课堂小组件，方便老师管理课堂，跟踪学生上课情况。

## 运行

- 先安装依赖

```
pnpm install
```

- 运行

```
pnpm dev
```

## 端口说明

- 3000 为后端api端口
- 3001 为客户访问端口
- 3002 为管理端口

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

- 使用 nextjs+typescript 开发

## 管理端

- 使用 vue3+typescript 开发

## CI/CD 部署

仓库已配置 GitHub Actions，在 Pull Request 中执行测试和构建，合并到 `main` 后通过 SSH 自动部署到生产服务器。服务器初始化、GitHub Secrets、Nginx、PM2 和回滚步骤见 [GitHub CI/CD 部署文档](docs/deployment.md)。
