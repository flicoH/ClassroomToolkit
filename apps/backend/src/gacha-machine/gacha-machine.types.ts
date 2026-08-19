export type GachaRarity = '普通' | '稀有' | '史诗' | '传说';

export interface GachaReward {
  id: string;
  name: string;
  description: string;
  rarity: GachaRarity;
  weight: number;
  stock: number;
  enabled: boolean;
  createdAt: string;
}

export interface GachaDrawRecord {
  id: string;
  rewardId: string;
  rewardName: string;
  rarity: GachaRarity;
  createdAt: string;
}
