import { TrackFeature } from '../analytics/track-feature';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreateGachaRewardDto,
  UpdateGachaRewardDto,
} from './gacha-machine.dto';
import { GachaMachineService } from './gacha-machine.service';

@Controller('gacha-machine')
export class GachaMachineController {
  constructor(private readonly gachaMachineService: GachaMachineService) {}

  /** 获取奖池和最近抽取记录。 */
  @Get()
  overview() {
    return this.gachaMachineService.overview();
  }

  /** 创建扭蛋奖励。 */
  @Post('rewards')
  createReward(@Body() dto: CreateGachaRewardDto) {
    return this.gachaMachineService.createReward(dto);
  }

  /** 更新扭蛋奖励配置。 */
  @Patch('rewards/:rewardId')
  updateReward(
    @Param('rewardId') rewardId: string,
    @Body() dto: UpdateGachaRewardDto,
  ) {
    return this.gachaMachineService.updateReward(rewardId, dto);
  }

  /** 删除扭蛋奖励。 */
  @Delete('rewards/:rewardId')
  deleteReward(@Param('rewardId') rewardId: string) {
    return this.gachaMachineService.deleteReward(rewardId);
  }

  /** 执行一次扭蛋抽取并记录功能使用。 */
  @Post('draw')
  @TrackFeature('gacha-machine', 'draw')
  draw() {
    return this.gachaMachineService.draw();
  }
}
