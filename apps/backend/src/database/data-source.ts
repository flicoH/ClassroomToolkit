import { join } from 'node:path';
import { DataSource } from 'typeorm';
import '../common/load-env';

export default new DataSource({
  type: 'mysql',
  host: process.env.MYSQL_HOST ?? '127.0.0.1',
  port: Number(process.env.MYSQL_PORT ?? 3306),
  username: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? 'classroom_toolkit',
  charset: 'utf8mb4',
  synchronize: false,
  entities: [join(__dirname, '../**/*.entity.js')],
  migrations: [join(__dirname, 'migrations/*.js')],
  migrationsTableName: 'typeorm_migrations',
});
