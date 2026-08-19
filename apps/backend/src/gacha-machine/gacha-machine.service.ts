import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createEntityId } from '../common/id';
import {
  CreateGachaRewardDto,
  UpdateGachaRewardDto,
} from './gacha-machine.dto';
import { GachaMachineDatabase } from './gacha-machine.database';
import { GachaReward, GachaRarity } from './gacha-machine.types';

const rarities: GachaRarity[] = ['普通', '稀有', '史诗', '传说'];

@Injectable()
export class GachaMachineService {
  constructor(private readonly database: GachaMachineDatabase) {}

  async overview() {
    return {
      rewards: await this.database.findRewards(),
      records: await this.database.findDrawRecords(),
    };
  }

  async createReward(dto: CreateGachaRewardDto) {
    const reward: GachaReward = {
      id: createEntityId('gacha'),
      name: this.normalizeName(dto.name),
      description: dto.description?.trim() ?? '',
      rarity: this.normalizeRarity(dto.rarity),
      weight: this.normalizeWeight(dto.weight),
      stock: this.normalizeStock(dto.stock),
      enabled: dto.enabled ?? true,
      createdAt: new Date().toISOString(),
    };
    return this.database.saveReward(reward);
  }

  async updateReward(rewardId: string, dto: UpdateGachaRewardDto) {
    const reward = await this.getRewardOrThrow(rewardId);
    return this.database.saveReward({
      ...reward,
      name: dto.name === undefined ? reward.name : this.normalizeName(dto.name),
      description:
        dto.description === undefined
          ? reward.description
          : dto.description.trim(),
      rarity:
        dto.rarity === undefined
          ? reward.rarity
          : this.normalizeRarity(dto.rarity),
      weight:
        dto.weight === undefined
          ? reward.weight
          : this.normalizeWeight(dto.weight),
      stock:
        dto.stock === undefined ? reward.stock : this.normalizeStock(dto.stock),
      enabled: dto.enabled ?? reward.enabled,
    });
  }

  async deleteReward(rewardId: string) {
    await this.getRewardOrThrow(rewardId);
    await this.database.deleteReward(rewardId);
    return { deleted: true };
  }

  async draw() {
    const rewards = (await this.database.findRewards()).filter(
      (reward) => reward.enabled && reward.stock > 0 && reward.weight > 0,
    );
    if (!rewards.length) throw new BadRequestException('奖池暂无可抽取奖励');
    const reward = this.pickReward(rewards);
    const updatedReward = await this.database.saveReward({
      ...reward,
      stock: reward.stock - 1,
    });
    const record = await this.database.createDrawRecord({
      id: createEntityId('draw'),
      rewardId: reward.id,
      rewardName: reward.name,
      rarity: reward.rarity,
      createdAt: new Date().toISOString(),
    });
    return { reward: updatedReward, record };
  }

  private async getRewardOrThrow(rewardId: string) {
    const reward = await this.database.findRewardById(rewardId);
    if (!reward) throw new NotFoundException('扭蛋奖励不存在');
    return reward;
  }

  private pickReward(rewards: GachaReward[]) {
    const total = rewards.reduce((sum, reward) => sum + reward.weight, 0);
    let cursor = Math.random() * total;
    for (const reward of rewards) {
      cursor -= reward.weight;
      if (cursor <= 0) return reward;
    }
    return rewards[rewards.length - 1]!;
  }

  private normalizeName(name: string) {
    const value = name.trim();
    if (!value) throw new BadRequestException('奖励名称不能为空');
    return value;
  }

  private normalizeRarity(rarity: GachaRarity) {
    if (!rarities.includes(rarity))
      throw new BadRequestException('奖励稀有度不正确');
    return rarity;
  }

  private normalizeWeight(weight: number) {
    const value = Math.round(Number(weight));
    if (!Number.isFinite(value) || value < 1)
      throw new BadRequestException('抽取权重至少为 1');
    return value;
  }

  private normalizeStock(stock: number) {
    const value = Math.round(Number(stock));
    if (!Number.isFinite(value) || value < 0)
      throw new BadRequestException('库存不能小于 0');
    return value;
  }
}
