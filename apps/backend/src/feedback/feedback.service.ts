import { BadRequestException, Injectable } from '@nestjs/common';
import { createEntityId } from '../common/id';
import { CreateFeedbackDto } from './feedback.dto';
import { FeedbackDatabase } from './feedback.database';

// 拒绝可执行语句的常见结构；仅出现“SQL”“JavaScript”等词的普通意见不受影响。
const sqlStatement =
  /\b(?:select\b[\s\S]{0,200}?\bfrom|insert\s+into|update\s+[`\w.]+\s+set|delete\s+from|(?:drop|alter|create|truncate)\s+table|union\s+(?:all\s+)?select)\b/i;
const scriptStatement =
  /<\s*\/?\s*(?:script|iframe|object|embed|svg)\b|\bon\w+\s*=|\bjavascript\s*:|\bdata\s*:\s*text\/html|\b(?:eval|alert|Function)\s*\(|\b(?:document|window)\s*\.|\b(?:const|let|var)\s+[\w$]+\s*=|\bfunction\s+[\w$]*\s*\(|=>\s*(?:\{|[\w$]|\()/i;

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
    if (sqlStatement.test(content) || scriptStatement.test(content)) {
      throw new BadRequestException('意见内容不能包含 SQL 或 JavaScript 语句');
    }
    return this.database.save(createEntityId('feedback'), content);
  }
}
