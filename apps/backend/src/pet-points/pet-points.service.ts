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
  UpdateRubricDto,
  UpdatePetSettingsDto,
} from './pet-points.dto';
import { PetPointsDatabase } from './pet-points.database';
import { StudentPet } from './pet-points.types';
import { petLevel, petStage } from './pet-progression';

const defaultRubrics: CreateRubricDto[] = [
  { category: '课堂表现', label: '积极发言', score: 2 },
  { category: '课堂表现', label: '认真听讲', score: 1 },
  { category: '作业情况', label: '按时交作业', score: 3 },
  { category: '作业情况', label: '作业优秀', score: 2 },
  { category: '品德修养', label: '乐于助人', score: 5 },
  { category: '纪律常规', label: '扰乱课堂', score: -2 },
  { category: '纪律常规', label: '迟到早退', score: -1 },
];
const defaultRewards: CreateRewardDto[] = [
  { name: '星星贴纸', cost: 5, stock: 12 },
  { name: '作业免写卡', cost: 12, stock: 6 },
  { name: '座位优先选择', cost: 18, stock: 4 },
  { name: '惊喜盲盒', cost: 25, stock: 3 },
];

@Injectable()
export class PetPointsService {
  constructor(private readonly database: PetPointsDatabase) {}

  /** 汇总宠物积分首页需要的所有数据。 */
  async overview() {
    let rubrics = await this.database.findRubrics();
    if (!rubrics.length) {
      rubrics = await Promise.all(
        defaultRubrics.map((rubric) => this.createRubric(rubric)),
      );
    }
    let rewards = await this.database.findRewards();
    if (!rewards.length) {
      rewards = await Promise.all(
        defaultRewards.map((reward) => this.createReward(reward)),
      );
    }
    return {
      students: await this.database.findStudents(),
      settings: await this.database.getSettings(),
      rubrics,
      rewards,
      records: await this.database.findRecords(),
      redemptions: await this.database.findRedemptions(),
    };
  }

  async updateSettings(dto: UpdatePetSettingsDto) {
    const current = await this.database.getSettings();
    const maxLevel = dto.maxLevel ?? current.maxLevel;
    const finalEnergy = dto.finalEnergy ?? current.finalEnergy;
    if (!Number.isInteger(maxLevel) || maxLevel < 2 || maxLevel > 10) {
      throw new BadRequestException('宠物最大等级须为 2 到 10 的整数');
    }
    if (
      !Number.isInteger(finalEnergy) ||
      finalEnergy < maxLevel - 1 ||
      finalEnergy > 100000
    ) {
      throw new BadRequestException(
        `最终能力值须为 ${maxLevel - 1} 到 100000 的整数`,
      );
    }
    await this.database.setSettings(maxLevel, finalEnergy);
    for (const student of await this.database.findStudents()) {
      const petProgress = Math.min(student.petProgress, finalEnergy);
      const level = petLevel(petProgress, maxLevel, finalEnergy);
      await this.database.updateStudent(student.id, {
        petProgress,
        level,
        stage: petStage(level, maxLevel),
        petHatched: level > 1,
      });
    }
    return { maxLevel, finalEnergy };
  }

  /** 批量调整学生积分，同时推进宠物成长并写入评价记录。 */
  async adjustScore(dto: AdjustScoreDto) {
    const changed: StudentPet[] = [];
    const { maxLevel, finalEnergy } = await this.database.getSettings();
    for (const studentId of dto.studentIds) {
      const student = await this.getStudentOrThrow(studentId);
      const nextScore = Math.max(0, student.score + dto.delta);
      const currentProgress = Math.min(student.petProgress, finalEnergy);
      const nextProgress = Math.min(
        finalEnergy,
        Math.max(
          0,
          currentProgress + (student.petId ? Math.max(dto.delta, 0) : 0),
        ),
      );
      const nextStudent = await this.database.updateStudent(studentId, {
        score: nextScore,
        petProgress: nextProgress,
        petHatched: petLevel(nextProgress, maxLevel, finalEnergy) > 1,
        level: petLevel(nextProgress, maxLevel, finalEnergy),
        stage: petStage(
          petLevel(nextProgress, maxLevel, finalEnergy),
          maxLevel,
        ),
      });
      await this.database.createRecord({
        id: createEntityId('record'),
        studentId,
        category: dto.category ?? '手动调整',
        label: dto.label,
        delta: dto.delta,
        petDelta: nextProgress - currentProgress,
        note: dto.note ?? '',
        createdAt: new Date().toISOString(),
      });
      changed.push(nextStudent!);
    }
    return changed;
  }

  /** 将班级学生同步到宠物积分表，保留已有积分和宠物进度。 */
  async syncClassStudents(dto: SyncPetClassDto) {
    const synced: StudentPet[] = [];
    const { maxLevel, finalEnergy } = await this.database.getSettings();
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
          level: petLevel(current?.petProgress ?? 0, maxLevel, finalEnergy),
          stage: petStage(
            petLevel(current?.petProgress ?? 0, maxLevel, finalEnergy),
            maxLevel,
          ),
          petId: current?.petId,
          petName: current?.petName,
          petProgress: current?.petProgress ?? 0,
          petHatched:
            petLevel(current?.petProgress ?? 0, maxLevel, finalEnergy) > 1,
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

  /** 删除评价记录时按原记录回退积分和宠物成长值。 */
  async deleteRecord(recordId: string) {
    const record = await this.database.findRecordById(recordId);
    if (!record) throw new NotFoundException('评价记录不存在');
    const student = await this.getStudentOrThrow(record.studentId);
    const nextScore = Math.max(0, student.score - record.delta);
    const nextProgress = Math.max(
      0,
      student.petProgress - (record.petDelta ?? 0),
    );
    const { maxLevel, finalEnergy } = await this.database.getSettings();
    await this.database.updateStudent(student.id, {
      score: nextScore,
      petProgress: nextProgress,
      petHatched: petLevel(nextProgress, maxLevel, finalEnergy) > 1,
      level: petLevel(nextProgress, maxLevel, finalEnergy),
      stage: petStage(petLevel(nextProgress, maxLevel, finalEnergy), maxLevel),
    });
    await this.database.deleteRecord(record.id);
    return { deleted: true };
  }

  /** 给学生绑定宠物模板和展示昵称。 */
  async bindPet(studentId: string, dto: BindPetDto) {
    await this.getStudentOrThrow(studentId);
    return this.database.updateStudent(studentId, {
      petId: dto.petId,
      petName: dto.petName,
      petProgress: 0,
      petHatched: false,
      level: 1,
      stage: '初始形态',
    });
  }

  /** 创建启用状态的评价指标。 */
  createRubric(dto: CreateRubricDto) {
    return this.database.createRubric({
      id: createEntityId('rubric'),
      ...dto,
      enabled: true,
    });
  }

  /** 更新当前教师的评价指标，允许调整名称、分类、分值和启用状态。 */
  async updateRubric(rubricId: string, dto: UpdateRubricDto) {
    const current = await this.database.findRubricById(rubricId);
    if (!current) throw new NotFoundException('评价指标不存在');
    const label = dto.label?.trim();
    if (dto.label !== undefined && !label)
      throw new BadRequestException('指标名称不能为空');
    return this.database.updateRubric(rubricId, {
      category: dto.category,
      label,
      score:
        dto.score === undefined
          ? undefined
          : Math.max(-10, Math.min(10, Math.round(dto.score))),
      enabled: dto.enabled,
    });
  }

  /** 创建启用状态的兑换奖品。 */
  createReward(dto: CreateRewardDto) {
    return this.database.createReward({
      id: createEntityId('reward'),
      ...dto,
      enabled: true,
    });
  }

  /** 执行奖品兑换，校验库存和学生积分后扣减双方数据。 */
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

  /** 查询积分学生，不存在时抛出业务异常。 */
  private async getStudentOrThrow(studentId: string) {
    const student = await this.database.findStudentById(studentId);
    if (!student) throw new NotFoundException('积分学生不存在');
    return student;
  }
}
