export class PetWriteDto {
  operationId!: string;
  revisions!: Record<string, number>;
}
export class EvaluatePetsDto extends PetWriteDto {
  studentIds!: string[];
  rubricIds!: string[];
  note?: string;
}
export class PetFlagDto extends PetWriteDto {
  absent!: boolean;
}
export class PetTrophyDto extends PetWriteDto {
  delta!: number;
}

import { EvaluationCategory } from './pet-points.types';

export class SyncPetStudentDto {
  id!: string;
  name!: string;
  studentNo!: string;
  group?: string;
}

export class SyncPetClassDto {
  classId!: string;
  className?: string;
  students?: SyncPetStudentDto[];
}

export class AdjustScoreDto extends PetWriteDto {
  studentIds!: string[];
  delta!: number;
  label!: string;
  category?: EvaluationCategory | '手动调整';
  note?: string;
}

export class BindPetDto extends PetWriteDto {
  petId!: string;
  petName?: string;
}

export class CreateRubricDto extends PetWriteDto {
  category!: EvaluationCategory;
  label!: string;
  score!: number;
}

export class UpdateRubricDto extends PetWriteDto {
  category?: EvaluationCategory;
  label?: string;
  score?: number;
  enabled?: boolean;
}

export class CreateRewardDto extends PetWriteDto {
  name!: string;
  cost!: number;
  stock!: number;
}

export class AddRewardStockDto extends PetWriteDto {
  quantity!: number;
}

export class RedeemRewardDto extends PetWriteDto {
  studentId!: string;
  rewardId!: string;
}

export class UpdatePetSettingsDto extends PetWriteDto {
  maxLevel?: number;
  finalEnergy?: number;
  expectedVersion!: number;
}
