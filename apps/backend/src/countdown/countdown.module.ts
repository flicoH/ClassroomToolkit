import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountdownController } from './countdown.controller';
import { CountdownDatabase } from './countdown.database';
import { CountdownService } from './countdown.service';
import { CountdownStateEntity } from './entities/countdown-state.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CountdownStateEntity])],
  controllers: [CountdownController],
  providers: [CountdownDatabase, CountdownService],
})
export class CountdownModule {}
