import { createHash } from 'node:crypto';
import { PetCompletedEntity } from './entities/pet-completed.entity';
import { PetOperationEntity } from './entities/pet-operation.entity';
import { ClassroomEntity } from '../students/entities/classroom.entity';
import { StudentEntity } from '../students/entities/student.entity';
import type { CompletedPet } from './pet-points.types';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PetEvaluationRecordEntity } from './entities/pet-evaluation-record.entity';
import { PetRedemptionEntity } from './entities/pet-redemption.entity';
import { PetRewardEntity } from './entities/pet-reward.entity';
import { PetRubricEntity } from './entities/pet-rubric.entity';
import { PetSettingEntity } from './entities/pet-setting.entity';
import { PetStudentEntity } from './entities/pet-student.entity';
import {
  EvaluationRecord,
  RedemptionRecord,
  RewardItem,
  RubricItem,
  StudentPet,
} from './pet-points.types';
import { TeacherContext } from '../auth/teacher-context';
import { petAppearance, recordPetAppearance } from './pet-state-history';

/** Object key order is transport detail; indicator/student array order remains part of the request. */
function stablePayload(value: unknown): string {
  if (Array.isArray(value))
    return '[' + value.map(stablePayload).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => JSON.stringify(key) + ':' + stablePayload(item))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}

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
    @InjectRepository(PetSettingEntity)
    private readonly settings: Repository<PetSettingEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  private transactionManager?: EntityManager;

  private run<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.transactionManager
      ? work(this.transactionManager)
      : this.students.manager.transaction(work);
  }

  /** A teacher rule lock serializes growth writes; every repository below shares this transaction. */
  async write<T>(
    operation: { operationId: string; payload: unknown } | undefined,
    work: (database: PetPointsDatabase) => Promise<T>,
  ) {
    const teacherId = this.teacherContext.teacherId;
    await this.settings
      .createQueryBuilder()
      .insert()
      .values({ teacherId, maxLevel: 10, finalEnergy: 200, version: 1 })
      .orIgnore()
      .execute();
    return this.students.manager.transaction(async (manager) => {
      const settings = manager.getRepository(PetSettingEntity);
      await settings.findOne({
        where: { teacherId },
        lock: { mode: 'pessimistic_write' },
      });
      const operations = manager.getRepository(PetOperationEntity);
      const payloadHash = createHash('sha256')
        .update(stablePayload(operation?.payload ?? null))
        .digest('hex');
      if (operation) {
        const previous = await operations.findOneBy({
          teacherId,
          operationId: operation.operationId,
        });
        if (previous) {
          if (previous.payloadHash !== payloadHash)
            throw new ConflictException('操作编号已用于其他请求');
          return previous.result as T;
        }
      }
      const database = new PetPointsDatabase(
        manager.getRepository(PetStudentEntity),
        manager.getRepository(PetRubricEntity),
        manager.getRepository(PetRewardEntity),
        manager.getRepository(PetEvaluationRecordEntity),
        manager.getRepository(PetRedemptionEntity),
        settings,
        this.teacherContext,
      );
      database.transactionManager = manager;
      const result = await work(database);
      if (operation)
        await operations.save({
          teacherId,
          operationId: operation.operationId,
          payloadHash,
          result,
        });
      return result;
    });
  }

  async canonicalClass(classId: string) {
    if (!this.transactionManager) throw new Error('名册同步须在事务中执行');
    const teacherId = this.teacherContext.teacherId;
    const classroom = await this.transactionManager
      .getRepository(ClassroomEntity)
      .findOne({
        where: { id: classId, teacherId },
        lock: { mode: 'pessimistic_write' },
      });
    if (!classroom) throw new NotFoundException('班级不存在');
    const students = await this.transactionManager
      .getRepository(StudentEntity)
      .find({
        where: { classroomId: classId, teacherId },
        order: { id: 'ASC' },
      });
    return {
      classId,
      className: classroom.name,
      students: students.map((student) => ({
        id: student.id,
        name: student.name,
        studentNo: student.studentNo,
        group: student.groupName ?? '未分组',
      })),
    };
  }

  async findCompleted() {
    const aliases = await this.studentAliases();
    return (
      await this.students.manager
        .getRepository(PetCompletedEntity)
        .find({ where: { teacherId: this.teacherContext.teacherId } })
    ).map((row) => ({
      ...row.snapshot,
      studentId: aliases.get(row.snapshot.studentId) ?? row.snapshot.studentId,
    }));
  }

  async saveCompleted(snapshot: CompletedPet) {
    if (!this.transactionManager) throw new Error('完成档案须在事务中执行');
    await this.transactionManager.getRepository(PetCompletedEntity).save({
      id: snapshot.id,
      teacherId: this.teacherContext.teacherId,
      studentId: snapshot.studentId,
      cycleId: snapshot.cycleId,
      snapshot,
    });
  }

  get teacherId() {
    return this.teacherContext.teacherId;
  }

  async getSettings() {
    const setting = await this.settings.findOneBy({
      teacherId: this.teacherContext.teacherId,
    });
    return {
      maxLevel: setting?.maxLevel ?? 10,
      finalEnergy: setting?.finalEnergy ?? 200,
      version: setting?.version ?? 1,
      completionBadges: setting?.completionBadges ?? 1,
    };
  }

  async setSettings(
    maxLevel: number,
    finalEnergy: number,
    version: number,
    completionBadges = 1,
  ) {
    await this.settings.save({
      teacherId: this.teacherContext.teacherId,
      maxLevel,
      finalEnergy,
      version,
      completionBadges,
    });
    return { maxLevel, finalEnergy, version, completionBadges };
  }

  /** 查询当前教师的宠物积分学生列表。 */
  async findStudents() {
    const rows = await this.students.find({
      where: { teacherId: this.teacherContext.teacherId, rosterActive: true },
      order: { score: 'DESC', studentNo: 'ASC' },
    });
    return rows.map((row) => this.toStudent(row));
  }

  /** 保存或更新宠物积分学生，兼容旧主键和教师隔离主键。 */
  async saveStudent(student: StudentPet) {
    const teacherId = this.teacherContext.teacherId;
    return this.run(async (manager) => {
      const students = manager.getRepository(PetStudentEntity);
      const current = await students.findOne({
        where: this.studentWhere(student.id),
        lock: { mode: 'pessimistic_write' },
      });
      const saved = await students.save(
        students.create({
          ...student,
          rosterActive: true,
          logicalId: student.id,
          id: current?.id ?? this.studentStorageId(student.id),
          teacherId,
        }),
      );
      await recordPetAppearance(manager, saved, petAppearance(saved));
      return this.toStudent(saved);
    });
  }

  /** 按逻辑学生 ID 查询宠物积分学生。 */
  async findStudentById(studentId: string) {
    const row = await this.students.findOne({
      where: this.studentWhere(studentId),
      ...(this.transactionManager
        ? { lock: { mode: 'pessimistic_write' as const } }
        : {}),
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

  /** 隐藏不在规范名册中的学生，保留积分、兑换和历史，避免外键级联删数据。 */
  async deleteClassStudentsExcept(classId: string, studentIds: string[]) {
    const retained = new Set(studentIds);
    const where = { teacherId: this.teacherContext.teacherId, classId };
    await this.run(async (manager) => {
      const students = manager.getRepository(PetStudentEntity);
      const removed = await students.find({ where });
      for (const candidate of removed) {
        // A migrated long identity may retain its old truncated PK; compare the logical roster identity.
        if (
          retained.has(
            candidate.logicalId ?? this.logicalStudentId(candidate.id),
          )
        )
          continue;
        const current = await students.findOne({
          where: {
            id: candidate.id,
            teacherId: this.teacherContext.teacherId,
            classId,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!current) continue;
        await recordPetAppearance(manager, current, null);
        await students.update(
          { id: current.id, teacherId: this.teacherContext.teacherId },
          { rosterActive: false },
        );
      }
    });
  }

  /** 局部更新学生积分、宠物或班级信息。 */
  async updateStudent(studentId: string, patch: Partial<StudentPet>) {
    return this.run(async (manager) => {
      const students = manager.getRepository(PetStudentEntity);
      const current = await students.findOne({
        where: this.studentWhere(studentId),
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) return undefined;
      const next = students.merge(current, {
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
        petId: patch.petId === undefined ? current.petId : patch.petId,
        petName: patch.petName === undefined ? current.petName : patch.petName,
        petProgress: patch.petProgress,
        petHatched: patch.petHatched,
        absent: patch.absent,
        completedPets: patch.completedPets,
        petExperience: patch.petExperience,
        cycleId: patch.cycleId,
        revision: patch.revision,
        completionPending: patch.completionPending,
        cycleRulesVersion: patch.cycleRulesVersion,
        rewardGrants: patch.rewardGrants,
        rewardProtection: patch.rewardProtection,
      });
      const saved = await students.save(next);
      await recordPetAppearance(manager, saved, petAppearance(saved));
      return this.toStudent(saved);
    });
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

  /** 查询当前教师名下的单个评价指标。 */
  async findRubricById(rubricId: string) {
    const row = await this.rubrics.findOne({
      where: { id: rubricId, teacherId: this.teacherContext.teacherId },
    });
    return row ? this.toRubric(row) : undefined;
  }

  /** 局部更新当前教师名下的评价指标。 */
  async updateRubric(rubricId: string, patch: Partial<RubricItem>) {
    const current = await this.rubrics.findOne({
      where: { id: rubricId, teacherId: this.teacherContext.teacherId },
    });
    if (!current) return undefined;
    return this.toRubric(
      await this.rubrics.save(this.rubrics.merge(current, patch)),
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
    const aliases = await this.studentAliases();
    return (
      await this.records.find({
        where: { teacherId: this.teacherContext.teacherId },
        order: { createdAt: 'DESC' },
      })
    ).map((row) => this.toRecord(row, aliases));
  }

  /** 查询单条评价记录。 */
  async findRecordById(recordId: string) {
    const row = await this.records.findOne({
      where: { id: recordId, teacherId: this.teacherContext.teacherId },
    });
    return row ? this.toRecord(row, await this.studentAliases()) : undefined;
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
      subjectId: null,
      petDelta: record.petDelta ?? null,
      scoreDelta: record.scoreDelta ?? null,
      petExperienceDelta: record.petExperienceDelta ?? null,
      cycleId: record.cycleId ?? null,
      beforeValues: record.beforeValues ?? null,
      afterValues: record.afterValues ?? null,
      note: record.note,
      createdAt: new Date(record.createdAt),
    });
    return this.toRecord(
      await this.records.save(entity),
      new Map([[entity.studentId, student?.logicalId ?? record.studentId]]),
    );
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
    const aliases = await this.studentAliases();
    return (
      await this.redemptions.find({
        where: { teacherId: this.teacherContext.teacherId },
        order: { createdAt: 'DESC' },
      })
    ).map((row) => this.toRedemption(row, aliases));
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
    return this.toRedemption(
      await this.redemptions.save(entity),
      new Map([[entity.studentId, student?.logicalId ?? redemption.studentId]]),
    );
  }

  /** 将宠物学生实体转换为接口模型。 */
  private toStudent(entity: PetStudentEntity): StudentPet {
    return {
      id: entity.logicalId ?? this.logicalStudentId(entity.id),
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
      petExperience: entity.petExperience,
      cycleId: entity.cycleId,
      revision: entity.revision,
      completionPending: entity.completionPending,
      cycleRulesVersion: entity.cycleRulesVersion,
      rewardGrants: entity.rewardGrants,
      rewardProtection: entity.rewardProtection,
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

  private async studentAliases() {
    const students = await this.students.find({
      where: { teacherId: this.teacherContext.teacherId },
      select: { id: true, logicalId: true },
    });
    const aliases = new Map<string, string>();
    for (const student of students) {
      const logical = student.logicalId ?? this.logicalStudentId(student.id);
      aliases.set(student.id, logical);
      aliases.set(this.logicalStudentId(student.id), logical);
      aliases.set(logical, logical);
    }
    return aliases;
  }

  /** 将评价记录实体转换为接口模型。 */
  private toRecord(
    entity: PetEvaluationRecordEntity,
    aliases: Map<string, string>,
  ): EvaluationRecord {
    return {
      id: entity.id,
      studentId:
        aliases.get(entity.studentId) ??
        this.logicalStudentId(entity.studentId),
      category: entity.category as EvaluationRecord['category'],
      label: entity.label,
      delta: entity.delta,
      petDelta: entity.petDelta ?? undefined,
      scoreDelta: entity.scoreDelta ?? undefined,
      petExperienceDelta: entity.petExperienceDelta ?? undefined,
      cycleId: entity.cycleId ?? undefined,
      beforeValues: entity.beforeValues ?? undefined,
      afterValues: entity.afterValues ?? undefined,
      note: entity.note,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  /** 将兑换记录实体转换为接口模型。 */
  private toRedemption(
    entity: PetRedemptionEntity,
    aliases: Map<string, string>,
  ): RedemptionRecord {
    return {
      id: entity.id,
      studentId:
        aliases.get(entity.studentId) ??
        this.logicalStudentId(entity.studentId),
      rewardName: entity.rewardName,
      cost: entity.cost,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  /** 为宠物积分学生生成按教师隔离的存储主键。 */
  private studentStorageId(studentId: string) {
    const qualified = `${this.teacherContext.teacherId}:${studentId}`;
    // Truncating this key merges long student numbers; the full logical ID remains separately stored.
    return qualified.length <= 64
      ? qualified
      : `pet-${createHash('sha256').update(qualified).digest('hex').slice(0, 60)}`;
  }

  /** 同时兼容新旧两种学生主键查询条件。 */
  private studentWhere(studentId: string) {
    const teacherId = this.teacherContext.teacherId;
    return [
      { id: this.studentStorageId(studentId), teacherId },
      { id: studentId, teacherId },
      { logicalId: studentId, teacherId },
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
