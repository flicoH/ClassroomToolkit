import { BadRequestException, Injectable } from '@nestjs/common';
import { createEntityId } from '../common/id';
import { CreateFeedbackDto } from './feedback.dto';
import { FeedbackDatabase } from './feedback.database';

@Injectable()
export class FeedbackService {
  constructor(private readonly database: FeedbackDatabase) {}

  /** 校验并保存教师意见，空白内容不入库。 */
  create(dto: CreateFeedbackDto) {
    if (typeof dto?.content !== 'string') {
      throw new BadRequestException('请输入意见内容');
    }
    const content = dto.content.trim();
    if (!content) throw new BadRequestException('请输入意见内容');
    if (content.length > 2000) {
      throw new BadRequestException('意见内容不能超过 2000 字');
    }
    return this.database.save(createEntityId('feedback'), content);
  }
}
