import { TrackFeature } from '../analytics/track-feature';
import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { UpdateCountdownDto } from './countdown.dto';
import { CountdownService } from './countdown.service';

@Controller('countdown')
export class CountdownController {
  constructor(private readonly countdownService: CountdownService) {}

  /** 获取当前教师的倒计时状态。 */
  @Get()
  findState() {
    return this.countdownService.findState();
  }

  /** 更新倒计时状态，并记录倒计时使用行为。 */
  @Patch()
  @TrackFeature('countdown', 'start', 'countdown')
  update(@Body() dto: UpdateCountdownDto) {
    return this.countdownService.update(dto);
  }

  /** 重置倒计时为当前总时长。 */
  @Post('reset')
  reset() {
    return this.countdownService.reset();
  }
}
