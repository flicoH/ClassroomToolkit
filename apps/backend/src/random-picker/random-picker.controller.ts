import { Body, Controller, Get, Post } from '@nestjs/common';
import { PickStudentsDto } from './random-picker.dto';
import { RandomPickerService } from './random-picker.service';

@Controller('random-picker')
export class RandomPickerController {
  constructor(private readonly randomPickerService: RandomPickerService) {}

  @Get('classes')
  findClasses() {
    return this.randomPickerService.findClasses();
  }

  @Get('histories')
  findHistories() {
    return this.randomPickerService.findHistories();
  }

  @Post('pick')
  pick(@Body() dto: PickStudentsDto) {
    return this.randomPickerService.pick(dto);
  }
}
