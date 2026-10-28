import { PetCompletedEntity } from './entities/pet-completed.entity';
import { PetOperationEntity } from './entities/pet-operation.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetEvaluationRecordEntity } from './entities/pet-evaluation-record.entity';
import { PetRedemptionEntity } from './entities/pet-redemption.entity';
import { PetRewardEntity } from './entities/pet-reward.entity';
import { PetRubricEntity } from './entities/pet-rubric.entity';
import { PetSettingEntity } from './entities/pet-setting.entity';
import { PetStudentEntity } from './entities/pet-student.entity';
import { PetStateHistoryEntity } from './entities/pet-state-history.entity';
import { PetPointsController } from './pet-points.controller';
import { PetPointsDatabase } from './pet-points.database';
import { PetPointsService } from './pet-points.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PetStudentEntity,
      PetCompletedEntity,
      PetOperationEntity,
      PetStateHistoryEntity,
      PetSettingEntity,
      PetRubricEntity,
      PetRewardEntity,
      PetEvaluationRecordEntity,
      PetRedemptionEntity,
    ]),
  ],
  controllers: [PetPointsController],
  providers: [PetPointsDatabase, PetPointsService],
})
export class PetPointsModule {}
