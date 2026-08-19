import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GachaDrawRecordEntity } from './entities/gacha-draw-record.entity';
import { GachaRewardEntity } from './entities/gacha-reward.entity';
import { GachaDrawRecord, GachaReward } from './gacha-machine.types';
import { TeacherContext } from '../auth/teacher-context';

@Injectable()
export class GachaMachineDatabase {
  constructor(
    @InjectRepository(GachaRewardEntity)
    private readonly rewards: Repository<GachaRewardEntity>,
    @InjectRepository(GachaDrawRecordEntity)
    private readonly records: Repository<GachaDrawRecordEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  async findRewards() {
    const rows = await this.rewards.find({
      where: { teacherId: this.teacherContext.teacherId },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toReward(row));
  }

  async findRewardById(rewardId: string) {
    const row = await this.rewards.findOne({
      where: { id: rewardId, teacherId: this.teacherContext.teacherId },
    });
    return row ? this.toReward(row) : undefined;
  }

  async saveReward(reward: GachaReward) {
    const entity = this.rewards.create({
      ...reward,
      teacherId: this.teacherContext.teacherId,
      createdAt: new Date(reward.createdAt),
    });
    return this.toReward(await this.rewards.save(entity));
  }

  async deleteReward(rewardId: string) {
    const result = await this.rewards.delete({
      id: rewardId,
      teacherId: this.teacherContext.teacherId,
    });
    return Boolean(result.affected);
  }

  async findDrawRecords() {
    const rows = await this.records.find({
      where: { teacherId: this.teacherContext.teacherId },
      order: { createdAt: 'DESC' },
      take: 30,
    });
    return rows.map((row) => this.toRecord(row));
  }

  async createDrawRecord(record: GachaDrawRecord) {
    return this.toRecord(
      await this.records.save(
        this.records.create({
          ...record,
          teacherId: this.teacherContext.teacherId,
          createdAt: new Date(record.createdAt),
        }),
      ),
    );
  }

  private toReward(entity: GachaRewardEntity): GachaReward {
    return {
      id: entity.id,
      name: entity.name,
      description: entity.description,
      rarity: entity.rarity,
      weight: entity.weight,
      stock: entity.stock,
      enabled: entity.enabled,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private toRecord(entity: GachaDrawRecordEntity): GachaDrawRecord {
    return {
      id: entity.id,
      rewardId: entity.rewardId,
      rewardName: entity.rewardName,
      rarity: entity.rarity,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
