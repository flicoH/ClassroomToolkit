import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherContext } from '../auth/teacher-context';
import { FeedbackEntity } from './entities/feedback.entity';

@Injectable()
export class FeedbackDatabase {
  constructor(
    @InjectRepository(FeedbackEntity)
    private readonly feedback: Repository<FeedbackEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  /** 保存意见时只从认证上下文读取教师身份，避免客户端冒充其他教师。 */
  save(id: string, content: string) {
    return this.feedback.save(
      this.feedback.create({
        id,
        teacherId: this.teacherContext.teacherId,
        content,
      }),
    );
  }
}
