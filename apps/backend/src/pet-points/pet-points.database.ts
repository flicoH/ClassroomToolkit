import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { PetEvaluationRecordEntity } from './entities/pet-evaluation-record.entity';
import { PetRedemptionEntity } from './entities/pet-redemption.entity';
import { PetRewardEntity } from './entities/pet-reward.entity';
import { PetRubricEntity } from './entities/pet-rubric.entity';
import { PetStudentEntity } from './entities/pet-student.entity';
import {
  EvaluationRecord,
  RedemptionRecord,
  RewardItem,
  RubricItem,
  StudentPet,
} from './pet-points.types';
import { TeacherContext } from '../auth/teacher-context';

@Injectable()
export class PetPointsDatabase {
  constructor(
    @InjectRepository(PetStudentEntity)
    private readonly students: Repository<PetStudentEntity>,
    @InjectRepository(PetRubricEntity)
    private readonly rubrics: Repository<PetRubricEntity>,
    @InjectRepository(PetRewardEntity)
    private readonly rewards: Repository<PetRewardEntity>,
    @InjectRepository(PetEvaluationRecordEntity)
    private readonly records: Repository<PetEvaluationRecordEntity>,
    @InjectRepository(PetRedemptionEntity)
    private readonly redemptions: Repository<PetRedemptionEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  /** 查询当前教师的宠物积分学生列表。 */
  async findStudents() {
    const rows = await this.students.find({
      where: { teacherId: this.teacherContext.teacherId },
      order: { score: 'DESC', studentNo: 'ASC' },
    });
    return rows.map((row) => this.toStudent(row));
  }

  /** 保存或更新宠物积分学生，兼容旧主键和教师隔离主键。 */
  async saveStudent(student: StudentPet) {
    const teacherId = this.teacherContext.teacherId;
    const current = await this.students.findOne({
      where: this.studentWhere(student.id),
    });
    return this.toStudent(
      await this.students.save(
        this.students.create({
          ...student,
          id: current?.id ?? this.studentStorageId(student.id),
          teacherId,
        }),
      ),
    );
  }

  /** 按逻辑学生 ID 查询宠物积分学生。 */
  async findStudentById(studentId: string) {
    const row = await this.students.findOne({
      where: this.studentWhere(studentId),
    });
    return row ? this.toStudent(row) : undefined;
  }

  /** 同步班级时按逻辑 ID、学号和班级兜底查找已有学生。 */
  async findStudentForSync(
    studentId: string,
    studentNo: string,
    classId: string,
  ) {
    const row = await this.students.findOne({
      where: [
        ...this.studentWhere(studentId),
        {
          teacherId: this.teacherContext.teacherId,
          classId,
          studentNo,
        },
      ],
    });
    return row ? this.toStudent(row) : undefined;
  }

  /** 删除某班级中已不在最新名单里的宠物积分学生。 */
  async deleteClassStudentsExcept(classId: string, studentIds: string[]) {
    if (studentIds.length) {
      await this.students.delete({
        teacherId: this.teacherContext.teacherId,
        classId,
        id: Not(
          In(studentIds.flatMap((id) => [id, this.studentStorageId(id)])),
        ),
      });
    } else {
      await this.students.delete({
        teacherId: this.teacherContext.teacherId,
        classId,
      });
    }
  }

  /** 局部更新学生积分、宠物或班级信息。 */
  async updateStudent(studentId: string, patch: Partial<StudentPet>) {
    const current = await this.students.findOne({
      where: this.studentWhere(studentId),
    });
    if (!current) return undefined;
    const next = this.students.merge(current, {
      name: patch.name,
      studentNo: patch.studentNo,
      classId: patch.classId,
      className: patch.className,
      group: patch.group,
      score: patch.score,
      maxScore: patch.maxScore,
      trophies: patch.trophies,
      level: patch.level,
      stage: patch.stage,
      petId: patch.petId ?? current.petId,
      petName: patch.petName ?? current.petName,
      petProgress: patch.petProgress,
      petHatched: patch.petHatched,
      absent: patch.absent,
      completedPets: patch.completedPets,
    });
    return this.toStudent(await this.students.save(next));
  }

  /** 查询评价指标列表。 */
  async findRubrics() {
    return (
      await this.rubrics.find({
        where: { teacherId: this.teacherContext.teacherId },
        order: { id: 'ASC' },
      })
    ).map((row) => this.toRubric(row));
  }

  /** 创建评价指标并绑定当前教师。 */
  async createRubric(rubric: RubricItem) {
    return this.toRubric(
      await this.rubrics.save(
        this.rubrics.create({
          ...rubric,
          teacherId: this.teacherContext.teacherId,
        }),
      ),
    );
  }

  /** 查询兑换奖品列表。 */
  async findRewards() {
    return (
      await this.rewards.find({
        where: { teacherId: this.teacherContext.teacherId },
        order: { cost: 'ASC' },
      })
    ).map((row) => this.toReward(row));
  }

  /** 查询单个兑换奖品。 */
  async findRewardById(rewardId: string) {
    const row = await this.rewards.findOne({
      where: { id: rewardId, teacherId: this.teacherContext.teacherId },
    });
    return row ? this.toReward(row) : undefined;
  }

  /** 创建兑换奖品并绑定当前教师。 */
  async createReward(reward: RewardItem) {
    return this.toReward(
      await this.rewards.save(
        this.rewards.create({
          ...reward,
          teacherId: this.teacherContext.teacherId,
        }),
      ),
    );
  }

  /** 局部更新兑换奖品。 */
  async updateReward(rewardId: string, patch: Partial<RewardItem>) {
    const current = await this.rewards.findOne({
      where: { id: rewardId, teacherId: this.teacherContext.teacherId },
    });
    if (!current) return undefined;
    return this.toReward(
      await this.rewards.save(this.rewards.merge(current, patch)),
    );
  }

  /** 查询评价记录，最新记录排在前面。 */
  async findRecords() {
    return (
      await this.records.find({
        where: { teacherId: this.teacherContext.teacherId },
        order: { createdAt: 'DESC' },
      })
    ).map((row) => this.toRecord(row));
  }

  /** 查询单条评价记录。 */
  async findRecordById(recordId: string) {
    const row = await this.records.findOne({
      where: { id: recordId, teacherId: this.teacherContext.teacherId },
    });
    return row ? this.toRecord(row) : undefined;
  }

  /** 创建评价记录，并把逻辑学生 ID 映射为存储 ID。 */
  async createRecord(record: EvaluationRecord) {
    const student = await this.students.findOne({
      where: this.studentWhere(record.studentId),
    });
    const entity = this.records.create({
      id: record.id,
      teacherId: this.teacherContext.teacherId,
      studentId: student?.id ?? this.studentStorageId(record.studentId),
      category: record.category,
      label: record.label,
      delta: record.delta,
      petDelta: record.petDelta ?? null,
      note: record.note,
      createdAt: new Date(record.createdAt),
    });
    return this.toRecord(await this.records.save(entity));
  }

  /** 删除当前教师名下的评价记录。 */
  async deleteRecord(recordId: string) {
    const result = await this.records.delete({
      id: recordId,
      teacherId: this.teacherContext.teacherId,
    });
    return Boolean(result.affected);
  }

  /** 查询兑换记录，最新记录排在前面。 */
  async findRedemptions() {
    return (
      await this.redemptions.find({
        where: { teacherId: this.teacherContext.teacherId },
        order: { createdAt: 'DESC' },
      })
    ).map((row) => this.toRedemption(row));
  }

  /** 创建兑换记录，并把逻辑学生 ID 映射为存储 ID。 */
  async createRedemption(redemption: RedemptionRecord) {
    const student = await this.students.findOne({
      where: this.studentWhere(redemption.studentId),
    });
    const entity = this.redemptions.create({
      id: redemption.id,
      teacherId: this.teacherContext.teacherId,
      studentId: student?.id ?? this.studentStorageId(redemption.studentId),
      rewardName: redemption.rewardName,
      cost: redemption.cost,
      createdAt: new Date(redemption.createdAt),
    });
    return this.toRedemption(await this.redemptions.save(entity));
  }

  /** 将宠物学生实体转换为接口模型。 */
  private toStudent(entity: PetStudentEntity): StudentPet {
    return {
      id: this.logicalStudentId(entity.id),
      name: entity.name,
      studentNo: entity.studentNo,
      classId: entity.classId,
      className: entity.className,
      group: entity.group,
      score: entity.score,
      maxScore: entity.maxScore,
      trophies: entity.trophies,
      level: entity.level,
      stage: entity.stage,
      petId: entity.petId ?? undefined,
      petName: entity.petName ?? undefined,
      petProgress: entity.petProgress,
      petHatched: entity.petHatched,
      absent: entity.absent,
      completedPets: entity.completedPets,
    };
  }

  /** 将评价指标实体转换为接口模型。 */
  private toRubric(entity: PetRubricEntity): RubricItem {
    return {
      id: entity.id,
      category: entity.category,
      label: entity.label,
      score: entity.score,
      enabled: entity.enabled,
    };
  }

  /** 将兑换奖品实体转换为接口模型。 */
  private toReward(entity: PetRewardEntity): RewardItem {
    return {
      id: entity.id,
      name: entity.name,
      cost: entity.cost,
      stock: entity.stock,
      enabled: entity.enabled,
    };
  }

  /** 将评价记录实体转换为接口模型。 */
  private toRecord(entity: PetEvaluationRecordEntity): EvaluationRecord {
    return {
      id: entity.id,
      studentId: this.logicalStudentId(entity.studentId),
      category: entity.category as EvaluationRecord['category'],
      label: entity.label,
      delta: entity.delta,
      petDelta: entity.petDelta ?? undefined,
      note: entity.note,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  /** 将兑换记录实体转换为接口模型。 */
  private toRedemption(entity: PetRedemptionEntity): RedemptionRecord {
    return {
      id: entity.id,
      studentId: this.logicalStudentId(entity.studentId),
      rewardName: entity.rewardName,
      cost: entity.cost,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  /** 为宠物积分学生生成按教师隔离的存储主键。 */
  private studentStorageId(studentId: string) {
    return `${this.teacherContext.teacherId}:${studentId}`.slice(0, 64);
  }

  /** 同时兼容新旧两种学生主键查询条件。 */
  private studentWhere(studentId: string) {
    const teacherId = this.teacherContext.teacherId;
    return [
      { id: this.studentStorageId(studentId), teacherId },
      { id: studentId, teacherId },
    ];
  }

  /** 把带教师前缀的存储 ID 转回前端使用的逻辑学生 ID。 */
  private logicalStudentId(studentId: string) {
    const prefix = `${this.teacherContext.teacherId}:`;
    return studentId.startsWith(prefix)
      ? studentId.slice(prefix.length)
      : studentId;
  }
}
