import { BadRequestException } from '@nestjs/common';
import { GachaMachineService } from './gacha-machine.service';
import { GachaReward } from './gacha-machine.types';

describe('GachaMachineService', () => {
  it('creates, updates, and deletes rewards through the backend store', async () => {
    const rewards = new Map<string, GachaReward>();
    const database = {
      saveReward: jest.fn().mockImplementation(async (reward: GachaReward) => {
        rewards.set(reward.id, reward);
        return reward;
      }),
      findRewardById: jest
        .fn()
        .mockImplementation(async (rewardId: string) => rewards.get(rewardId)),
      deleteReward: jest
        .fn()
        .mockImplementation(async (rewardId: string) =>
          rewards.delete(rewardId),
        ),
    };
    const service = new GachaMachineService(database as never);

    const created = await service.createReward({
      name: '免作业卡',
      description: '一次课堂奖励',
      rarity: '史诗',
      weight: 3,
      stock: 2,
    });
    const updated = await service.updateReward(created.id, {
      name: '免作业卡 Plus',
      stock: 5,
      enabled: false,
    });
    const deleted = await service.deleteReward(created.id);

    expect(created.id).toMatch(/^gacha-/);
    expect(updated).toEqual(
      expect.objectContaining({
        name: '免作业卡 Plus',
        stock: 5,
        enabled: false,
      }),
    );
    expect(deleted).toEqual({ deleted: true });
  });

  it('draws one enabled in-stock reward, decreases stock, and writes a draw record', async () => {
    const reward: GachaReward = {
      id: 'reward-1',
      name: '星星贴纸',
      description: '贴纸一张',
      rarity: '普通',
      weight: 10,
      stock: 2,
      enabled: true,
      createdAt: new Date().toISOString(),
    };
    const database = {
      findRewards: jest.fn().mockResolvedValue([reward]),
      saveReward: jest
        .fn()
        .mockImplementation(async (nextReward: GachaReward) => nextReward),
      createDrawRecord: jest.fn().mockImplementation(async (record) => record),
    };
    const service = new GachaMachineService(database as never);

    const result = await service.draw();

    expect(database.saveReward).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'reward-1', stock: 1 }),
    );
    expect(database.createDrawRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^draw-/),
        rewardId: 'reward-1',
        rewardName: '星星贴纸',
      }),
    );
    expect(result.reward.stock).toBe(1);
  });

  it('rejects drawing when the reward pool is empty', async () => {
    const service = new GachaMachineService({
      findRewards: jest.fn().mockResolvedValue([]),
    } as never);
    await expect(service.draw()).rejects.toBeInstanceOf(BadRequestException);
  });
});
