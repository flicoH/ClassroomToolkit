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
  AddRewardStockDto,
  AdjustScoreDto,
  EvaluatePetsDto,
  PetWriteDto,
  PetFlagDto,
  PetTrophyDto,
  BindPetDto,
  CreateRewardDto,
  CreateRubricDto,
  RedeemRewardDto,
  SyncPetClassDto,
  UpdateRubricDto,
  UpdatePetSettingsDto,
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

  @Patch('settings')
  updateSettings(@Body() dto: UpdatePetSettingsDto) {
    return this.petPointsService.updateSettings(dto);
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

  /** 更新评价指标。 */
  @Patch('rubrics/:rubricId')
  updateRubric(
    @Param('rubricId') rubricId: string,
    @Body() dto: UpdateRubricDto,
  ) {
    return this.petPointsService.updateRubric(rubricId, dto);
  }

  /** 创建积分兑换奖品。 */
  @Post('rewards')
  createReward(@Body() dto: CreateRewardDto) {
    return this.petPointsService.createReward(dto);
  }

  @Delete('rewards/:id')
  deleteReward(@Param('id') id: string, @Body() dto: PetWriteDto) {
    return this.petPointsService.deleteReward(id, dto);
  }

  @Post('rewards/:id/stock')
  addRewardStock(@Param('id') id: string, @Body() dto: AddRewardStockDto) {
    return this.petPointsService.addRewardStock(id, dto);
  }

  /** 兑换奖品并记录功能使用。 */
  @Post('rewards/redeem')
  @TrackFeature('pet-points', 'redeem')
  redeem(@Body() dto: RedeemRewardDto) {
    return this.petPointsService.redeem(dto);
  }

  /** 删除评价记录并回退对应积分。 */
  @Delete('records/:recordId')
  deleteRecord(@Param('recordId') recordId: string, @Body() dto: PetWriteDto) {
    return this.petPointsService.deleteRecord(recordId, dto);
  }

  @Post('scores/evaluate')
  @TrackFeature('pet-points', 'score')
  evaluate(@Body() dto: EvaluatePetsDto) {
    return this.petPointsService.evaluate(dto, false);
  }
  @Post('scores/batch-evaluate')
  @TrackFeature('pet-points', 'score')
  batchEvaluate(@Body() dto: EvaluatePetsDto) {
    return this.petPointsService.evaluate(dto, true);
  }
  @Post('students/:studentId/pet/complete')
  complete(@Param('studentId') id: string, @Body() dto: PetWriteDto) {
    return this.petPointsService.completePet(id, dto);
  }
  @Post('students/:studentId/pet/reset')
  reset(@Param('studentId') id: string, @Body() dto: PetWriteDto) {
    return this.petPointsService.resetPet(id, dto);
  }
  @Patch('students/:studentId/absence')
  absence(@Param('studentId') id: string, @Body() dto: PetFlagDto) {
    return this.petPointsService.setAbsence(id, dto);
  }
  @Patch('students/:studentId/trophies')
  trophies(@Param('studentId') id: string, @Body() dto: PetTrophyDto) {
    return this.petPointsService.adjustTrophies(id, dto);
  }
}
