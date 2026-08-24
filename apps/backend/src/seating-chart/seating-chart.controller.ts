import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  AssignSeatDto,
  CreateSeatingChartDto,
  ResizeSeatingChartDto,
  SyncSeatingChartClassroomDto,
} from './seating-chart.dto';
import { SeatingChartService } from './seating-chart.service';

@Controller('seating-charts')
export class SeatingChartController {
  constructor(private readonly seatingChartService: SeatingChartService) {}

  @Get()
  findAll() {
    return this.seatingChartService.findAll();
  }

  @Get(':chartId')
  findById(@Param('chartId') chartId: string) {
    return this.seatingChartService.findById(chartId);
  }

  @Post()
  create(@Body() dto: CreateSeatingChartDto) {
    return this.seatingChartService.create(dto);
  }

  @Patch(':chartId/resize')
  resize(
    @Param('chartId') chartId: string,
    @Body() dto: ResizeSeatingChartDto,
  ) {
    return this.seatingChartService.resize(chartId, dto);
  }

  @Patch(':chartId/classroom')
  syncClassroom(
    @Param('chartId') chartId: string,
    @Body() dto: SyncSeatingChartClassroomDto,
  ) {
    return this.seatingChartService.syncClassroom(chartId, dto);
  }

  @Patch(':chartId/seats/:seatId')
  assign(
    @Param('chartId') chartId: string,
    @Param('seatId') seatId: string,
    @Body() dto: AssignSeatDto,
  ) {
    return this.seatingChartService.assign(chartId, seatId, dto);
  }

  @Post(':chartId/seats/:seatId/clear')
  clear(@Param('chartId') chartId: string, @Param('seatId') seatId: string) {
    return this.seatingChartService.clear(chartId, seatId);
  }

  @Post(':chartId/shuffle')
  shuffle(@Param('chartId') chartId: string) {
    return this.seatingChartService.shuffle(chartId);
  }
}
