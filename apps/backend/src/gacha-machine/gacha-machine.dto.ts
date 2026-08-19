import { GachaRarity } from './gacha-machine.types';

export class CreateGachaRewardDto {
  name!: string;
  description?: string;
  rarity!: GachaRarity;
  weight!: number;
  stock!: number;
  enabled?: boolean;
}

export class UpdateGachaRewardDto {
  name?: string;
  description?: string;
  rarity?: GachaRarity;
  weight?: number;
  stock?: number;
  enabled?: boolean;
}
