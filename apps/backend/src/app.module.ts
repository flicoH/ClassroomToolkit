import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import './common/load-env';
import { CountdownModule } from './countdown/countdown.module';
import { GachaMachineModule } from './gacha-machine/gacha-machine.module';
import { PetPointsModule } from './pet-points/pet-points.module';
import { RandomPickerModule } from './random-picker/random-picker.module';
import { SeatingChartModule } from './seating-chart/seating-chart.module';
import { StickyNotesModule } from './sticky-notes/sticky-notes.module';
import { StudentsModule } from './students/students.module';
import { TaskStatsModule } from './task-stats/task-stats.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      username: process.env.MYSQL_USER ?? 'root',
      password: process.env.MYSQL_PASSWORD ?? '',
      database: process.env.MYSQL_DATABASE ?? 'classroom_toolkit',
      autoLoadEntities: true,
      synchronize: process.env.TYPEORM_SYNCHRONIZE === 'true',
      migrations: [join(__dirname, 'database/migrations/*{.js,.ts}')],
      migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN === 'true',
      charset: 'utf8mb4',
    }),
    AuthModule,
    StudentsModule,
    TaskStatsModule,
    SeatingChartModule,
    RandomPickerModule,
    CountdownModule,
    StickyNotesModule,
    PetPointsModule,
    GachaMachineModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
