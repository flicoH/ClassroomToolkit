import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createEntityId } from '../common/id';
import {
  AddRewardStockDto,
  AdjustScoreDto,
  BindPetDto,
  CreateRewardDto,
  CreateRubricDto,
  EvaluatePetsDto,
  PetWriteDto,
  RedeemRewardDto,
  SyncPetClassDto,
  UpdateRubricDto,
  UpdatePetSettingsDto,
} from './pet-points.dto';
import { PetPointsDatabase } from './pet-points.database';
import type { StudentPet } from './pet-points.types';
import {
  applyPetScore,
  calibratePet,
  finishPetCycle,
  resetPetCycle,
} from './pet-cycle';
import { petThresholds, petRewards } from './pet-progression';

const categories = ['课堂表现', '作业情况', '品德修养', '纪律常规'];
const petIds = [
  'sprout-puff',
  'bud-deer',
  'vine-wing-bird',
  'pinecone-puff',
  'coal-tail-fox',
  'red-sand-tortoise',
  'amber-horn',
  'ash-lion',
  'bubble-otter',
  'cloud-bear',
  'coral-whale',
  'star-sprout-marten',
  'ink-dot-cat',
  'moon-bell-rabbit',
  'star-compass-fox',
];
function integer(value: number, min: number, max: number) {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new BadRequestException(`数值须为 ${min} 到 ${max} 的整数`);
}
function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new BadRequestException(`文字不能为空，最多 ${max} 个字符`);
  return value.trim();
}
function ids(values: string[], max: number) {
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.length > max ||
    values.some(
      (value) => typeof value !== 'string' || !value || value.length > 64,
    )
  )
    throw new BadRequestException('选择数量或ID不合法');
  return [...new Set(values)];
}
const defaultRubrics: Omit<CreateRubricDto, keyof PetWriteDto>[] = [
  { category: '课堂表现', label: '积极发言', score: 2 },
  { category: '课堂表现', label: '认真听讲', score: 1 },
  { category: '作业情况', label: '按时交作业', score: 3 },
  { category: '作业情况', label: '作业优秀', score: 2 },
  { category: '品德修养', label: '乐于助人', score: 5 },
  { category: '纪律常规', label: '扰乱课堂', score: -2 },
  { category: '纪律常规', label: '迟到早退', score: -1 },
];
const defaultRewards: Omit<CreateRewardDto, keyof PetWriteDto>[] = [
  { name: '星星贴纸', cost: 5, stock: 12 },
  { name: '作业免写卡', cost: 12, stock: 6 },
  { name: '座位优先选择', cost: 18, stock: 4 },
  { name: '惊喜盲盒', cost: 25, stock: 3 },
];

@Injectable()
export class PetPointsService {
  constructor(private readonly database: PetPointsDatabase) {}

  async overview() {
    // Default provisioning is serialized as well; concurrent initial reads cannot duplicate templates.
    await this.database.write(undefined, async (db) => {
      if (!(await db.findRubrics()).length)
        for (const rubric of defaultRubrics)
          await db.createRubric({
            id: createEntityId('rubric'),
            ...rubric,
            enabled: true,
          });
      if (!(await db.findRewards()).length)
        for (const reward of defaultRewards)
          await db.createReward({
            id: createEntityId('reward'),
            ...reward,
            enabled: true,
          });
      return { provisioned: true };
    });
    const settings = await this.database.getSettings();
    return {
      students: await this.database.findStudents(),
      settings: {
        ...settings,
        thresholds: petThresholds(settings.maxLevel, settings.finalEnergy),
        rewards: petRewards(settings.maxLevel),
      },
      rubrics: await this.database.findRubrics(),
      rewards: (await this.database.findRewards()).filter(
        (reward) => reward.enabled,
      ),
      records: await this.database.findRecords(),
      redemptions: await this.database.findRedemptions(),
      completed: await this.database.findCompleted(),
    };
  }

  private write<T>(
    kind: string,
    dto: PetWriteDto,
    work: (db: PetPointsDatabase) => Promise<T>,
  ) {
    if (
      !dto ||
      typeof dto.operationId !== 'string' ||
      !/^[\w-]{8,64}$/.test(dto.operationId) ||
      !dto.revisions ||
      typeof dto.revisions !== 'object' ||
      Array.isArray(dto.revisions)
    )
      throw new ConflictException('客户端版本不兼容，请刷新页面');
    return this.database.write(
      { operationId: dto.operationId, payload: { kind, ...dto } },
      work,
    );
  }

  private async student(db: PetPointsDatabase, id: string, dto?: PetWriteDto) {
    const student = await db.findStudentById(id);
    if (!student) throw new NotFoundException('积分学生不存在');
    if (dto && dto.revisions[id] !== student.revision)
      throw new ConflictException('学生数据已更新，请刷新后重试');
    return student;
  }

  async syncClassStudents(dto: SyncPetClassDto) {
    text(dto.classId, 64);
    return this.database.write(undefined, async (db) => {
      const canonical = await db.canonicalClass(dto.classId);
      const rules = await db.getSettings();
      const synced: StudentPet[] = [];
      for (const item of canonical.students) {
        const current = await db.findStudentForSync(
          item.id,
          item.studentNo,
          dto.classId,
        );
        const student: StudentPet = current
          ? {
              ...current,
              ...item,
              id: current.id,
              classId: dto.classId,
              className: canonical.className,
            }
          : {
              ...item,
              classId: dto.classId,
              className: canonical.className,
              score: 0,
              maxScore: 30,
              trophies: 0,
              level: 1,
              stage: '初始形态',
              petProgress: 0,
              petExperience: 0,
              petHatched: false,
              absent: false,
              completedPets: 0,
              cycleId: createEntityId('cycle'),
              revision: 0,
              completionPending: false,
              cycleRulesVersion: rules.version,
              rewardGrants: [],
              rewardProtection: [],
            };
        calibratePet(student, rules);
        synced.push(await db.saveStudent(student));
      }
      await db.deleteClassStudentsExcept(
        dto.classId,
        synced.map((student) => student.id),
      );
      return synced;
    });
  }

  async adjustScore(dto: AdjustScoreDto) {
    integer(dto.delta, -200, 200);
    text(dto.label, 64);
    if (
      dto.category !== undefined &&
      dto.category !== '手动调整' &&
      !categories.includes(dto.category)
    )
      throw new BadRequestException('评价分类无效');
    return this.score(
      'adjust',
      dto,
      [
        {
          delta: dto.delta,
          label: dto.label,
          category: dto.category ?? '手动调整',
        },
      ],
      false,
    );
  }

  async evaluate(dto: EvaluatePetsDto, ordinary: boolean) {
    const rubricIds = ids(dto.rubricIds, 20);
    return this.score(
      ordinary ? 'batch' : 'advanced',
      dto,
      undefined,
      ordinary,
      rubricIds,
    );
  }

  private async score(
    kind: string,
    dto: AdjustScoreDto | EvaluatePetsDto,
    manual:
      | Array<{ delta: number; label: string; category: string }>
      | undefined,
    ordinary: boolean,
    rubricIds?: string[],
  ) {
    const studentIds = ids(dto.studentIds, 200);
    if (
      dto.note !== undefined &&
      (typeof dto.note !== 'string' || dto.note.length > 60)
    )
      throw new BadRequestException('备注最多60个字符');
    return this.write(kind, dto, async (db) => {
      const rules = await db.getSettings();
      const items =
        manual ??
        (await Promise.all(
          (rubricIds ?? []).map(async (id) => {
            const rubric = await db.findRubricById(id);
            if (!rubric || !rubric.enabled)
              throw new BadRequestException('评价指标不存在或已停用');
            return {
              delta: rubric.score,
              label: rubric.label,
              category: rubric.category,
            };
          }),
        ));
      const students: StudentPet[] = [];
      const skippedIds: string[] = [];
      for (const id of [...studentIds].sort()) {
        const student = await this.student(db, id);
        if (ordinary && student.absent) {
          skippedIds.push(id);
          continue;
        }
        if (dto.revisions[id] !== student.revision)
          throw new ConflictException('学生数据已更新，请刷新后重试');
        students.push(student);
      }
      if (!students.length) throw new BadRequestException('没有可评分的学生');
      for (const student of students) {
        for (const item of items) {
          const beforeValues = {
            score: student.score,
            experience: student.petExperience,
            energy: student.petProgress,
          };
          const changes = applyPetScore(student, item.delta, rules);
          integer(student.score, 0, 2147483647);
          integer(student.petExperience, 0, 2147483647);
          integer(student.trophies, 0, 2147483647);
          await db.createRecord({
            id: createEntityId('record'),
            studentId: student.id,
            category: item.category as AdjustScoreDto['category'] & string,
            label: item.label,
            delta: item.delta,
            ...changes,
            cycleId: student.cycleId,
            beforeValues,
            afterValues: {
              score: student.score,
              experience: student.petExperience,
              energy: student.petProgress,
            },
            note: dto.note ?? '',
            createdAt: new Date().toISOString(),
          });
          await db.updateStudent(student.id, student);
        }
      }
      return {
        students,
        processedIds: students.map((student) => student.id),
        skippedIds,
      };
    });
  }

  async bindPet(id: string, dto: BindPetDto) {
    if (!petIds.includes(dto.petId))
      throw new BadRequestException('请选择现有宠物');
    if (dto.petName !== undefined) text(dto.petName, 64);
    return this.write(`bind:${id}`, dto, async (db) => {
      const student = await this.student(db, id, dto);
      if (student.completionPending)
        throw new ConflictException('请先完成满级宠物归档');
      student.petId = dto.petId;
      student.petName = dto.petName ?? dto.petId;
      student.revision++;
      // Binding does not trigger rewards or completion even when overflow is high.
      calibratePet(student, await db.getSettings());
      return db.updateStudent(id, student);
    });
  }

  async completePet(id: string, dto: PetWriteDto) {
    return this.write(`complete:${id}`, dto, async (db) => {
      const student = await this.student(db, id, dto);
      const snapshot = finishPetCycle(
        student,
        await db.getSettings(),
        db.teacherId,
      );
      await db.saveCompleted(snapshot);
      await db.updateStudent(id, student);
      return { student, completedSnapshotId: snapshot.id, snapshot };
    });
  }

  async resetPet(id: string, dto: PetWriteDto) {
    return this.write(`reset:${id}`, dto, async (db) => {
      const student = await this.student(db, id, dto);
      if (student.completionPending)
        throw new ConflictException('满级宠物请使用完成本轮');
      resetPetCycle(student);
      return db.updateStudent(id, student);
    });
  }

  async setAbsence(id: string, dto: PetWriteDto & { absent: boolean }) {
    if (typeof dto.absent !== 'boolean')
      throw new BadRequestException('请假标记无效');
    return this.write(`absence:${id}`, dto, async (db) => {
      const student = await this.student(db, id, dto);
      student.absent = dto.absent;
      student.revision++;
      return db.updateStudent(id, student);
    });
  }

  async adjustTrophies(id: string, dto: PetWriteDto & { delta: number }) {
    if (dto.delta !== 1 && dto.delta !== -1)
      throw new BadRequestException('徽章每次调整1枚');
    return this.write(`trophies:${id}`, dto, async (db) => {
      const student = await this.student(db, id, dto);
      integer(student.trophies + dto.delta, 0, 2147483647);
      student.trophies += dto.delta;
      student.revision++;
      return db.updateStudent(id, student);
    });
  }

  async updateSettings(dto: UpdatePetSettingsDto) {
    return this.write('settings', dto, async (db) => {
      const current = await db.getSettings();
      if (dto.expectedVersion !== current.version)
        throw new ConflictException('等级规则已更新，请刷新');
      const maxLevel = dto.maxLevel ?? current.maxLevel,
        finalEnergy = dto.finalEnergy ?? current.finalEnergy;
      integer(maxLevel, 2, 10);
      integer(finalEnergy, maxLevel - 1, 100000);
      const rules = await db.setSettings(
        maxLevel,
        finalEnergy,
        current.version + 1,
      );
      for (const student of await db.findStudents()) {
        calibratePet(student, rules);
        // Settings must not create a later score-triggered retroactive reward for newly reached tiers.
        student.rewardProtection = [
          ...new Set([
            ...student.rewardProtection,
            ...Array.from({ length: student.level - 1 }, (_, i) => i + 2),
          ]),
        ];
        student.revision++;
        await db.updateStudent(student.id, student);
      }
      return rules;
    });
  }

  async deleteRecord(id: string, dto: PetWriteDto) {
    return this.write(`delete:${id}`, dto, async (db) => {
      const record = await db.findRecordById(id);
      if (!record) throw new NotFoundException('评价记录不存在');
      if (
        record.scoreDelta === undefined ||
        record.petExperienceDelta === undefined ||
        !record.cycleId
      )
        throw new ConflictException('旧记录缺少实际变化证据，不能安全回退');
      const student = await this.student(db, record.studentId, dto);
      student.score = Math.max(0, student.score - record.scoreDelta);
      const sameCycle = student.cycleId === record.cycleId;
      if (sameCycle) {
        student.petExperience = Math.max(
          0,
          student.petExperience - record.petExperienceDelta,
        );
        student.petProgress = Math.max(
          0,
          student.petProgress - (record.petDelta ?? 0),
        );
      }
      integer(student.score, 0, 2147483647);
      integer(student.petExperience, 0, 2147483647);
      student.revision++;
      calibratePet(student, await db.getSettings());
      await db.updateStudent(student.id, student);
      await db.deleteRecord(id);
      return {
        deleted: true,
        scope: sameCycle ? 'balance-and-current-cycle' : 'balance-only',
      };
    });
  }

  async createRubric(dto: CreateRubricDto) {
    if (!categories.includes(dto.category))
      throw new BadRequestException('评价分类无效');
    const label = text(dto.label, 64);
    integer(dto.score, -10, 10);
    return this.write('create-rubric', dto, (db) =>
      db.createRubric({
        id: createEntityId('rubric'),
        category: dto.category,
        label,
        score: dto.score,
        enabled: true,
      }),
    );
  }

  async updateRubric(id: string, dto: UpdateRubricDto) {
    if (dto.category !== undefined && !categories.includes(dto.category))
      throw new BadRequestException('评价分类无效');
    if (dto.score !== undefined) integer(dto.score, -10, 10);
    if (dto.enabled !== undefined && typeof dto.enabled !== 'boolean')
      throw new BadRequestException('启用状态无效');
    const label = dto.label === undefined ? undefined : text(dto.label, 64);
    return this.write(`rubric:${id}`, dto, async (db) => {
      if (!(await db.findRubricById(id)))
        throw new NotFoundException('评价指标不存在');
      return db.updateRubric(id, {
        label,
        category: dto.category,
        score: dto.score,
        enabled: dto.enabled,
      });
    });
  }

  async createReward(dto: CreateRewardDto) {
    const name = text(dto.name, 64);
    integer(dto.cost, 1, 2147483647);
    integer(dto.stock, 0, 2147483647);
    return this.write('create-reward', dto, (db) =>
      db.createReward({
        id: createEntityId('reward'),
        name,
        cost: dto.cost,
        stock: dto.stock,
        enabled: true,
      }),
    );
  }

  /** 保留奖品行和兑换快照，避免删除后总览重新生成默认奖品。 */
  async deleteReward(rewardId: string, dto: PetWriteDto) {
    const operation = { ...dto, rewardId };
    return this.write('delete-reward', operation, async (db) => {
      const reward = await db.findRewardById(rewardId);
      if (!reward || !reward.enabled) throw new NotFoundException('奖品不存在');
      await db.updateReward(rewardId, { enabled: false });
      return { deleted: true };
    });
  }

  /** 增量补货与兑换共用教师事务锁，幂等重试不会重复增加库存。 */
  async addRewardStock(rewardId: string, dto: AddRewardStockDto) {
    integer(dto.quantity, 1, 2147483647);
    const operation = { ...dto, rewardId };
    return this.write('restock-reward', operation, async (db) => {
      const reward = await db.findRewardById(rewardId);
      if (!reward || !reward.enabled) throw new NotFoundException('奖品不存在');
      integer(reward.stock + dto.quantity, 0, 2147483647);
      return db.updateReward(rewardId, { stock: reward.stock + dto.quantity });
    });
  }

  async redeem(dto: RedeemRewardDto) {
    return this.write('redeem', dto, async (db) => {
      const student = await this.student(db, dto.studentId, dto);
      const reward = await db.findRewardById(dto.rewardId);
      if (!reward || !reward.enabled) throw new NotFoundException('奖品不存在');
      if (!reward.enabled || reward.stock <= 0)
        throw new BadRequestException('奖品停用或库存不足');
      if (student.score < reward.cost)
        throw new BadRequestException('学生积分不足');
      student.score -= reward.cost;
      student.revision++;
      await db.updateStudent(student.id, student);
      await db.updateReward(reward.id, { stock: reward.stock - 1 });
      return db.createRedemption({
        id: createEntityId('redemption'),
        studentId: student.id,
        rewardName: reward.name,
        cost: reward.cost,
        createdAt: new Date().toISOString(),
      });
    });
  }
}
