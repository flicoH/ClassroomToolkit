import { Injectable } from '@nestjs/common';
import { UpdateCountdownDto } from './countdown.dto';
import { CountdownDatabase } from './countdown.database';
import { CountdownState } from './countdown.types';

@Injectable()
export class CountdownService {
  constructor(private readonly database: CountdownDatabase) {}

  /** 获取倒计时状态；不存在时创建默认状态。 */
  findState() {
    return this.getStateOrCreate();
  }

  /** 更新倒计时总时长、剩余时间或运行状态。 */
  async update(dto: UpdateCountdownDto) {
    const current = await this.getStateOrCreate();
    return this.database.save({
      ...current,
      ...dto,
      id: 'default',
      updatedAt: new Date().toISOString(),
    });
  }

  /** 停止倒计时并把剩余时间恢复到总时长。 */
  async reset() {
    const current = await this.getStateOrCreate();
    return this.database.save({
      ...current,
      remainingSeconds: current.totalSeconds,
      isRunning: false,
      updatedAt: new Date().toISOString(),
    });
  }

  /** 查询当前默认倒计时状态，首次使用时初始化为 5 分钟。 */
  private async getStateOrCreate(): Promise<CountdownState> {
    const current = await this.database.findDefault();
    if (current) return current;
    return this.database.save({
      id: 'default',
      totalSeconds: 300,
      remainingSeconds: 300,
      isRunning: false,
      updatedAt: new Date().toISOString(),
    });
  }
}
