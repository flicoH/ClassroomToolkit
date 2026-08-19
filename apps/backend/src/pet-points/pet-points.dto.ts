import { EvaluationCategory } from './pet-points.types';

export class SyncPetStudentDto {
  id!: string;
  name!: string;
  studentNo!: string;
  group?: string;
}

export class SyncPetClassDto {
  classId!: string;
  className!: string;
  students!: SyncPetStudentDto[];
}

export class AdjustScoreDto {
  studentIds!: string[];
  delta!: number;
  label!: string;
  category?: EvaluationCategory | '手动调整';
  note?: string;
}

export class BindPetDto {
  petId!: string;
  petName?: string;
}

export class CreateRubricDto {
  category!: EvaluationCategory;
  label!: string;
  score!: number;
}

export class CreateRewardDto {
  name!: string;
  cost!: number;
  stock!: number;
}

export class RedeemRewardDto {
  studentId!: string;
  rewardId!: string;
}
