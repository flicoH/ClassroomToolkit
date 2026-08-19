import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { UpdateCountdownDto } from './countdown.dto';
import { CountdownService } from './countdown.service';

@Controller('countdown')
export class CountdownController {
  constructor(private readonly countdownService: CountdownService) {}

  @Get()
  findState() {
    return this.countdownService.findState();
  }

  @Patch()
  update(@Body() dto: UpdateCountdownDto) {
    return this.countdownService.update(dto);
  }

  @Post('reset')
  reset() {
    return this.countdownService.reset();
  }
}
