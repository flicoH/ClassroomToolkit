import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GachaDrawRecordEntity } from './entities/gacha-draw-record.entity';
import { GachaRewardEntity } from './entities/gacha-reward.entity';
import { GachaMachineController } from './gacha-machine.controller';
import { GachaMachineDatabase } from './gacha-machine.database';
import { GachaMachineService } from './gacha-machine.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([GachaRewardEntity, GachaDrawRecordEntity]),
  ],
  controllers: [GachaMachineController],
  providers: [GachaMachineDatabase, GachaMachineService],
})
export class GachaMachineModule {}
