import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PickHistoryStudentEntity } from './entities/pick-history-student.entity';
import { PickHistoryEntity } from './entities/pick-history.entity';
import { PickerClassEntity } from './entities/picker-class.entity';
import { PickerClass, PickHistory } from './random-picker.types';
import { TeacherContext } from '../auth/teacher-context';

@Injectable()
export class RandomPickerDatabase {
  constructor(
    @InjectRepository(PickerClassEntity)
    private readonly classes: Repository<PickerClassEntity>,
    @InjectRepository(PickHistoryEntity)
    private readonly histories: Repository<PickHistoryEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  /** 查询当前教师的点名班级快照。 */
  async findClasses() {
    const rows = await this.classes.find({
      where: { teacherId: this.teacherContext.teacherId },
      relations: { students: true },
      order: { id: 'ASC' },
    });
    return rows.map((row) => this.toClass(row));
  }

  /** 查询当前教师名下的单个点名班级。 */
  async findClass(classId: string) {
    const row = await this.classes.findOne({
      where: { id: classId, teacherId: this.teacherContext.teacherId },
      relations: { students: true },
    });
    return row ? this.toClass(row) : undefined;
  }

  /** 查询当前教师的点名历史记录。 */
  async findHistories() {
    const rows = await this.histories.find({
      where: { teacherId: this.teacherContext.teacherId },
      relations: { students: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toHistory(row));
  }

  /** 保存一次点名历史，并补齐历史关联的班级快照。 */
  async saveHistory(history: PickHistory) {
    await this.classes.upsert(
      {
        id: history.classId,
        teacherId: this.teacherContext.teacherId,
        name: history.className ?? history.classId,
      },
      ['id'],
    );
    await this.histories.save(
      this.histories.create({
        id: history.id,
        teacherId: this.teacherContext.teacherId,
        classId: history.classId,
        selectedCount: history.selectedCount,
        createdAt: new Date(history.createdAt),
        students: history.students.map((student) => {
          const entity = new PickHistoryStudentEntity();
          entity.historyId = history.id;
          entity.teacherId = this.teacherContext.teacherId;
          entity.studentId = student.id;
          entity.name = student.name;
          entity.studentNo = student.studentNo;
          return entity;
        }),
      }),
    );
    return history;
  }

  /** 将点名班级实体转换为接口模型。 */
  private toClass(entity: PickerClassEntity): PickerClass {
    return {
      id: entity.id,
      name: entity.name,
      students: [...(entity.students ?? [])]
        .filter((item) => item.teacherId === this.teacherContext.teacherId)
        .sort((a, b) => a.studentNo.localeCompare(b.studentNo))
        .map((student) => ({
          id: student.id,
          name: student.name,
          studentNo: student.studentNo,
        })),
    };
  }

  /** 将点名历史实体转换为接口模型。 */
  private toHistory(entity: PickHistoryEntity): PickHistory {
    return {
      id: entity.id,
      classId: entity.classId,
      selectedCount: entity.selectedCount,
      createdAt: entity.createdAt.toISOString(),
      students: [...(entity.students ?? [])]
        .filter((item) => item.teacherId === this.teacherContext.teacherId)
        .map((student) => ({
          id: student.studentId,
          name: student.name,
          studentNo: student.studentNo,
        })),
    };
  }
}
