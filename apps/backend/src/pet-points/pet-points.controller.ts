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

  @Get()
  overview() {
    return this.petPointsService.overview();
  }

  @Post('scores/adjust')
  adjustScore(@Body() dto: AdjustScoreDto) {
    return this.petPointsService.adjustScore(dto);
  }

  @Post('students/sync')
  syncClassStudents(@Body() dto: SyncPetClassDto) {
    return this.petPointsService.syncClassStudents(dto);
  }

  @Patch('students/:studentId/pet')
  bindPet(@Param('studentId') studentId: string, @Body() dto: BindPetDto) {
    return this.petPointsService.bindPet(studentId, dto);
  }

  @Post('rubrics')
  createRubric(@Body() dto: CreateRubricDto) {
    return this.petPointsService.createRubric(dto);
  }

  @Post('rewards')
  createReward(@Body() dto: CreateRewardDto) {
    return this.petPointsService.createReward(dto);
  }

  @Post('rewards/redeem')
  redeem(@Body() dto: RedeemRewardDto) {
    return this.petPointsService.redeem(dto);
  }

  @Delete('records/:recordId')
  deleteRecord(@Param('recordId') recordId: string) {
    return this.petPointsService.deleteRecord(recordId);
  }
}
