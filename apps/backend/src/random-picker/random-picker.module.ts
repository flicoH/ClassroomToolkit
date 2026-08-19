import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PickHistoryStudentEntity } from './entities/pick-history-student.entity';
import { PickHistoryEntity } from './entities/pick-history.entity';
import { PickerClassEntity } from './entities/picker-class.entity';
import { PickerStudentEntity } from './entities/picker-student.entity';
import { RandomPickerController } from './random-picker.controller';
import { RandomPickerDatabase } from './random-picker.database';
import { RandomPickerService } from './random-picker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PickerClassEntity,
      PickerStudentEntity,
      PickHistoryEntity,
      PickHistoryStudentEntity,
    ]),
  ],
  controllers: [RandomPickerController],
  providers: [RandomPickerDatabase, RandomPickerService],
})
export class RandomPickerModule {}
