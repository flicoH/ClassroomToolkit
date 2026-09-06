import { TrackFeature } from '../analytics/track-feature';
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

  /** 获取所有座位表。 */
  @Get()
  findAll() {
    return this.seatingChartService.findAll();
  }

  /** 获取单个座位表详情。 */
  @Get(':chartId')
  findById(@Param('chartId') chartId: string) {
    return this.seatingChartService.findById(chartId);
  }

  /** 创建座位表并记录使用行为。 */
  @Post()
  @TrackFeature('seating-chart', 'create')
  create(@Body() dto: CreateSeatingChartDto) {
    return this.seatingChartService.create(dto);
  }

  /** 调整座位表行列。 */
  @Patch(':chartId/resize')
  resize(
    @Param('chartId') chartId: string,
    @Body() dto: ResizeSeatingChartDto,
  ) {
    return this.seatingChartService.resize(chartId, dto);
  }

  /** 同步座位表关联班级和学生名单。 */
  @Patch(':chartId/classroom')
  syncClassroom(
    @Param('chartId') chartId: string,
    @Body() dto: SyncSeatingChartClassroomDto,
  ) {
    return this.seatingChartService.syncClassroom(chartId, dto);
  }

  /** 分配、移动或交换座位上的学生。 */
  @Patch(':chartId/seats/:seatId')
  @TrackFeature('seating-chart', 'assign')
  assign(
    @Param('chartId') chartId: string,
    @Param('seatId') seatId: string,
    @Body() dto: AssignSeatDto,
  ) {
    return this.seatingChartService.assign(chartId, seatId, dto);
  }

  /** 清空指定座位。 */
  @Post(':chartId/seats/:seatId/clear')
  clear(@Param('chartId') chartId: string, @Param('seatId') seatId: string) {
    return this.seatingChartService.clear(chartId, seatId);
  }

  /** 随机打乱当前座位表。 */
  @Post(':chartId/shuffle')
  @TrackFeature('seating-chart', 'shuffle')
  shuffle(@Param('chartId') chartId: string) {
    return this.seatingChartService.shuffle(chartId);
  }
}
