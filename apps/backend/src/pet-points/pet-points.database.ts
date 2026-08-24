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

  async findStudents() {
    const rows = await this.students.find({
      where: { teacherId: this.teacherContext.teacherId },
      order: { score: 'DESC', studentNo: 'ASC' },
    });
    return rows.map((row) => this.toStudent(row));
  }

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

  async findStudentById(studentId: string) {
    const row = await this.students.findOne({
      where: this.studentWhere(studentId),
    });
    return row ? this.toStudent(row) : undefined;
  }

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

  async findRubrics() {
    return (
      await this.rubrics.find({
        where: { teacherId: this.teacherContext.teacherId },
        order: { id: 'ASC' },
      })
    ).map((row) => this.toRubric(row));
  }

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

  async findRewards() {
    return (
      await this.rewards.find({
        where: { teacherId: this.teacherContext.teacherId },
        order: { cost: 'ASC' },
      })
    ).map((row) => this.toReward(row));
  }

  async findRewardById(rewardId: string) {
    const row = await this.rewards.findOne({
      where: { id: rewardId, teacherId: this.teacherContext.teacherId },
    });
    return row ? this.toReward(row) : undefined;
  }

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

  async updateReward(rewardId: string, patch: Partial<RewardItem>) {
    const current = await this.rewards.findOne({
      where: { id: rewardId, teacherId: this.teacherContext.teacherId },
    });
    if (!current) return undefined;
    return this.toReward(
      await this.rewards.save(this.rewards.merge(current, patch)),
    );
  }

  async findRecords() {
    return (
      await this.records.find({
        where: { teacherId: this.teacherContext.teacherId },
        order: { createdAt: 'DESC' },
      })
    ).map((row) => this.toRecord(row));
  }

  async findRecordById(recordId: string) {
    const row = await this.records.findOne({
      where: { id: recordId, teacherId: this.teacherContext.teacherId },
    });
    return row ? this.toRecord(row) : undefined;
  }

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

  async deleteRecord(recordId: string) {
    const result = await this.records.delete({
      id: recordId,
      teacherId: this.teacherContext.teacherId,
    });
    return Boolean(result.affected);
  }

  async findRedemptions() {
    return (
      await this.redemptions.find({
        where: { teacherId: this.teacherContext.teacherId },
        order: { createdAt: 'DESC' },
      })
    ).map((row) => this.toRedemption(row));
  }

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

  private toRubric(entity: PetRubricEntity): RubricItem {
    return {
      id: entity.id,
      category: entity.category,
      label: entity.label,
      score: entity.score,
      enabled: entity.enabled,
    };
  }

  private toReward(entity: PetRewardEntity): RewardItem {
    return {
      id: entity.id,
      name: entity.name,
      cost: entity.cost,
      stock: entity.stock,
      enabled: entity.enabled,
    };
  }

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

  private toRedemption(entity: PetRedemptionEntity): RedemptionRecord {
    return {
      id: entity.id,
      studentId: this.logicalStudentId(entity.studentId),
      rewardName: entity.rewardName,
      cost: entity.cost,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private studentStorageId(studentId: string) {
    return `${this.teacherContext.teacherId}:${studentId}`.slice(0, 64);
  }

  private studentWhere(studentId: string) {
    const teacherId = this.teacherContext.teacherId;
    return [
      { id: this.studentStorageId(studentId), teacherId },
      { id: studentId, teacherId },
    ];
  }

  private logicalStudentId(studentId: string) {
    const prefix = `${this.teacherContext.teacherId}:`;
    return studentId.startsWith(prefix)
      ? studentId.slice(prefix.length)
      : studentId;
  }
}
