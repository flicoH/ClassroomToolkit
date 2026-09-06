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
  AdjustScoreDto,
  BindPetDto,
  CreateRewardDto,
  CreateRubricDto,
  RedeemRewardDto,
  SyncPetClassDto,
} from './pet-points.dto';
import { PetPointsService } from './pet-points.service';

@Controller('pet-points')
export class PetPointsController {
  constructor(private readonly petPointsService: PetPointsService) {}

  /** 获取宠物积分总览数据。 */
  @Get()
  overview() {
    return this.petPointsService.overview();
  }

  /** 调整学生积分并记录评价。 */
  @Post('scores/adjust')
  @TrackFeature('pet-points', 'score')
  adjustScore(@Body() dto: AdjustScoreDto) {
    return this.petPointsService.adjustScore(dto);
  }

  /** 同步班级学生到宠物积分系统。 */
  @Post('students/sync')
  syncClassStudents(@Body() dto: SyncPetClassDto) {
    return this.petPointsService.syncClassStudents(dto);
  }

  /** 给学生绑定宠物和昵称。 */
  @Patch('students/:studentId/pet')
  bindPet(@Param('studentId') studentId: string, @Body() dto: BindPetDto) {
    return this.petPointsService.bindPet(studentId, dto);
  }

  /** 创建评价指标。 */
  @Post('rubrics')
  createRubric(@Body() dto: CreateRubricDto) {
    return this.petPointsService.createRubric(dto);
  }

  /** 创建积分兑换奖品。 */
  @Post('rewards')
  createReward(@Body() dto: CreateRewardDto) {
    return this.petPointsService.createReward(dto);
  }

  /** 兑换奖品并记录功能使用。 */
  @Post('rewards/redeem')
  @TrackFeature('pet-points', 'redeem')
  redeem(@Body() dto: RedeemRewardDto) {
    return this.petPointsService.redeem(dto);
  }

  /** 删除评价记录并回退对应积分。 */
  @Delete('records/:recordId')
  deleteRecord(@Param('recordId') recordId: string) {
    return this.petPointsService.deleteRecord(recordId);
  }
}
