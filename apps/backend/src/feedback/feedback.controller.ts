import { Body, Controller, Post } from '@nestjs/common';
import { TrackFeature } from '../analytics/track-feature';
import { CreateFeedbackDto } from './feedback.dto';
import { FeedbackService } from './feedback.service';

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  /** 接收当前登录教师提交的系统意见。 */
  @Post()
  @TrackFeature('feedback', 'submit')
  create(@Body() dto: CreateFeedbackDto) {
    return this.service.create(dto);
  }
}
