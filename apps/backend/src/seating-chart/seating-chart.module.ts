import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeatingChartSeatEntity } from './entities/seating-chart-seat.entity';
import { SeatingChartStudentEntity } from './entities/seating-chart-student.entity';
import { SeatingChartEntity } from './entities/seating-chart.entity';
import { SeatingChartController } from './seating-chart.controller';
import { SeatingChartDatabase } from './seating-chart.database';
import { SeatingChartService } from './seating-chart.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SeatingChartEntity,
      SeatingChartStudentEntity,
      SeatingChartSeatEntity,
    ]),
  ],
  controllers: [SeatingChartController],
  providers: [SeatingChartDatabase, SeatingChartService],
})
export class SeatingChartModule {}
