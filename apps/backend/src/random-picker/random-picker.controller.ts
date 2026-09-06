import { TrackFeature } from '../analytics/track-feature';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { PickStudentsDto } from './random-picker.dto';
import { RandomPickerService } from './random-picker.service';

@Controller('random-picker')
export class RandomPickerController {
  constructor(private readonly randomPickerService: RandomPickerService) {}

  /** 获取随机点名可用班级。 */
  @Get('classes')
  findClasses() {
    return this.randomPickerService.findClasses();
  }

  /** 获取最近点名历史。 */
  @Get('histories')
  findHistories() {
    return this.randomPickerService.findHistories();
  }

  /** 执行随机点名并记录功能使用。 */
  @Post('pick')
  @TrackFeature('random-picker', 'pick')
  pick(@Body() dto: PickStudentsDto) {
    return this.randomPickerService.pick(dto);
  }
}
