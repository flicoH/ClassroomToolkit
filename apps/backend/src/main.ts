import './common/load-env';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { NestExpressApplication } from '@nestjs/platform-express';

/** 创建 Nest 应用，设置管理端禁缓存中间件并启动 HTTP 服务。 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Batch reports can contain mastery ratings for 30 students and 500 goals.
  app.useBodyParser('json', { limit: '2mb' });
  app.use(
    '/admin',
    (
      _req: unknown,
      res: { setHeader: (name: string, value: string) => void },
      next: () => void,
    ) => {
      res.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  // 默认只监听本机回环地址，避免开发环境误暴露服务；需要外部访问时可设置 HOST=0.0.0.0。
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '127.0.0.1');
}
bootstrap();
