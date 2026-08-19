import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PetEvaluationRecordEntity } from './entities/pet-evaluation-record.entity';
import { PetRedemptionEntity } from './entities/pet-redemption.entity';
import { PetRewardEntity } from './entities/pet-reward.entity';
import { PetRubricEntity } from './entities/pet-rubric.entity';
import { PetStudentEntity } from './entities/pet-student.entity';
import { PetPointsController } from './pet-points.controller';
import { PetPointsDatabase } from './pet-points.database';
import { PetPointsService } from './pet-points.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PetStudentEntity,
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
