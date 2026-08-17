# 课堂小工具 Web

`apps/web` 是一个基于 Next.js 16、React 19 和 Zustand 的桌面式课堂工具箱。当前包含倒计时、随机点名、学生管理、任务统计、座位表、宠物积分和便签七个应用。

## 本地运行

在仓库根目录安装依赖后执行：

```bash
pnpm --filter ClassRoomToolkitWeb dev
```

开发服务默认监听 `http://127.0.0.1:3001`。启动脚本会记录 Next.js 子进程，并在退出时清理服务和 `.next/dev/lock`。

如不希望自动打开浏览器：

```bash
OPEN_BROWSER=0 pnpm --filter ClassRoomToolkitWeb dev
```

## 代码检查

```bash
./node_modules/.bin/tsc -p apps/web/tsconfig.json --noEmit
./node_modules/.bin/eslint apps/web/app apps/web/components apps/web/lib apps/web/store apps/web/types
```

桌面入口和应用路由位于 `app/page.tsx`，窗口状态由 `store/windowStore.ts` 统一管理，业务组件位于 `components/apps/`。
