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

  @Get()
  overview() {
    return this.gachaMachineService.overview();
  }

  @Post('rewards')
  createReward(@Body() dto: CreateGachaRewardDto) {
    return this.gachaMachineService.createReward(dto);
  }

  @Patch('rewards/:rewardId')
  updateReward(
    @Param('rewardId') rewardId: string,
    @Body() dto: UpdateGachaRewardDto,
  ) {
    return this.gachaMachineService.updateReward(rewardId, dto);
  }

  @Delete('rewards/:rewardId')
  deleteReward(@Param('rewardId') rewardId: string) {
    return this.gachaMachineService.deleteReward(rewardId);
  }

  @Post('draw')
  draw() {
    return this.gachaMachineService.draw();
  }
}
