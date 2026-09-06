import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountdownState } from './countdown.types';
import { CountdownStateEntity } from './entities/countdown-state.entity';
import { TeacherContext } from '../auth/teacher-context';

@Injectable()
export class CountdownDatabase {
  constructor(
    @InjectRepository(CountdownStateEntity)
    private readonly states: Repository<CountdownStateEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  /** 查询当前教师的默认倒计时状态。 */
  async findDefault() {
    const row = await this.states.findOne({
      where: {
        id: this.teacherContext.teacherId,
        teacherId: this.teacherContext.teacherId,
      },
    });
    return row ? this.toState(row) : undefined;
  }

  /** 保存当前教师的默认倒计时状态。 */
  async save(state: CountdownState) {
    await this.states.save(
      this.states.create({
        ...state,
        id: this.teacherContext.teacherId,
        teacherId: this.teacherContext.teacherId,
      }),
    );
    return (await this.findDefault())!;
  }

  /** 将倒计时实体转换为接口模型，屏蔽按教师存储的真实主键。 */
  private toState(entity: CountdownStateEntity): CountdownState {
    return {
      id: 'default',
      totalSeconds: entity.totalSeconds,
      remainingSeconds: entity.remainingSeconds,
      isRunning: entity.isRunning,
      updatedAt: entity.updatedAt.toISOString(),
    };
  }
}
