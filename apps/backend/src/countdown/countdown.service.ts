import { Injectable } from '@nestjs/common';
import { UpdateCountdownDto } from './countdown.dto';
import { CountdownDatabase } from './countdown.database';
import { CountdownState } from './countdown.types';

@Injectable()
export class CountdownService {
  constructor(private readonly database: CountdownDatabase) {}

  findState() {
    return this.getStateOrCreate();
  }

  async update(dto: UpdateCountdownDto) {
    const current = await this.getStateOrCreate();
    return this.database.save({
      ...current,
      ...dto,
      id: 'default',
      updatedAt: new Date().toISOString(),
    });
  }

  async reset() {
    const current = await this.getStateOrCreate();
    return this.database.save({
      ...current,
      remainingSeconds: current.totalSeconds,
      isRunning: false,
      updatedAt: new Date().toISOString(),
    });
  }

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
