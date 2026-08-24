import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createEntityId } from '../common/id';
import {
  AdjustScoreDto,
  BindPetDto,
  CreateRewardDto,
  CreateRubricDto,
  RedeemRewardDto,
  SyncPetClassDto,
} from './pet-points.dto';
import { PetPointsDatabase } from './pet-points.database';
import { PetStage, StudentPet } from './pet-points.types';

const stages: PetStage[] = ['初始形态', '成长形态', '进阶形态', '终极形态'];
const petEvolutionThresholds = [4, 10, 18, 26] as const;

@Injectable()
export class PetPointsService {
  constructor(private readonly database: PetPointsDatabase) {}

  async overview() {
    return {
      students: await this.database.findStudents(),
      rubrics: await this.database.findRubrics(),
      rewards: await this.database.findRewards(),
      records: await this.database.findRecords(),
      redemptions: await this.database.findRedemptions(),
    };
  }

  async adjustScore(dto: AdjustScoreDto) {
    const changed: StudentPet[] = [];
    for (const studentId of dto.studentIds) {
      const student = await this.getStudentOrThrow(studentId);
      const nextScore = Math.max(0, student.score + dto.delta);
      const nextProgress = Math.max(
        0,
        student.petProgress + Math.max(dto.delta, 0),
      );
      const nextStudent = await this.database.updateStudent(studentId, {
        score: nextScore,
        petProgress: nextProgress,
        petHatched: nextProgress >= petEvolutionThresholds[0],
        level: this.getLevel(nextProgress),
        stage: stages[this.getLevel(nextProgress) - 1] ?? '初始形态',
      });
      await this.database.createRecord({
        id: createEntityId('record'),
        studentId,
        category: dto.category ?? '手动调整',
        label: dto.label,
        delta: dto.delta,
        petDelta: Math.max(dto.delta, 0),
        note: dto.note ?? '',
        createdAt: new Date().toISOString(),
      });
      changed.push(nextStudent!);
    }
    return changed;
  }

  async syncClassStudents(dto: SyncPetClassDto) {
    const synced: StudentPet[] = [];
    for (const item of dto.students) {
      const current = await this.database.findStudentForSync(
        item.id,
        item.studentNo,
        dto.classId,
      );
      synced.push(
        await this.database.saveStudent({
          id: item.id,
          name: item.name,
          studentNo: item.studentNo,
          classId: dto.classId,
          className: dto.className,
          group: item.group || '未分组',
          score: current?.score ?? 0,
          maxScore: current?.maxScore ?? 30,
          trophies: current?.trophies ?? 0,
          level: current?.level ?? 1,
          stage: current?.stage ?? '初始形态',
          petId: current?.petId,
          petName: current?.petName,
          petProgress: current?.petProgress ?? 0,
          petHatched: current?.petHatched ?? false,
          absent: current?.absent ?? false,
          completedPets: current?.completedPets ?? 0,
        }),
      );
    }
    await this.database.deleteClassStudentsExcept(
      dto.classId,
      dto.students.map((student) => student.id),
    );
    return synced;
  }

  async deleteRecord(recordId: string) {
    const record = await this.database.findRecordById(recordId);
    if (!record) throw new NotFoundException('评价记录不存在');
    const student = await this.getStudentOrThrow(record.studentId);
    const nextScore = Math.max(0, student.score - record.delta);
    const nextProgress = Math.max(
      0,
      student.petProgress - (record.petDelta ?? 0),
    );
    await this.database.updateStudent(student.id, {
      score: nextScore,
      petProgress: nextProgress,
      petHatched: nextProgress >= petEvolutionThresholds[0],
      level: this.getLevel(nextProgress),
      stage: stages[this.getLevel(nextProgress) - 1] ?? '初始形态',
    });
    await this.database.deleteRecord(record.id);
    return { deleted: true };
  }

  async bindPet(studentId: string, dto: BindPetDto) {
    await this.getStudentOrThrow(studentId);
    return this.database.updateStudent(studentId, {
      petId: dto.petId,
      petName: dto.petName,
    });
  }

  createRubric(dto: CreateRubricDto) {
    return this.database.createRubric({
      id: createEntityId('rubric'),
      ...dto,
      enabled: true,
    });
  }

  createReward(dto: CreateRewardDto) {
    return this.database.createReward({
      id: createEntityId('reward'),
      ...dto,
      enabled: true,
    });
  }

  async redeem(dto: RedeemRewardDto) {
    const student = await this.getStudentOrThrow(dto.studentId);
    const reward = await this.database.findRewardById(dto.rewardId);
    if (!reward) throw new NotFoundException('奖品不存在');
    if (reward.stock <= 0) throw new BadRequestException('奖品库存不足');
    if (student.score < reward.cost)
      throw new BadRequestException('学生积分不足');
    await this.database.updateStudent(student.id, {
      score: student.score - reward.cost,
    });
    await this.database.updateReward(reward.id, { stock: reward.stock - 1 });
    return this.database.createRedemption({
      id: createEntityId('redemption'),
      studentId: student.id,
      rewardName: reward.name,
      cost: reward.cost,
      createdAt: new Date().toISOString(),
    });
  }

  private async getStudentOrThrow(studentId: string) {
    const student = await this.database.findStudentById(studentId);
    if (!student) throw new NotFoundException('积分学生不存在');
    return student;
  }

  /** 根据宠物成长值换算前端展示等级。 */
  private getLevel(progress: number) {
    if (progress >= petEvolutionThresholds[3]) return 4;
    if (progress >= petEvolutionThresholds[2]) return 3;
    if (progress >= petEvolutionThresholds[1]) return 2;
    return 1;
  }
}
