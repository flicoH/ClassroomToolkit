import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskStudentEntity } from './entities/task-student.entity';
import { TaskEntity } from './entities/task.entity';
import { TaskItem } from './task-stats.types';
import { TeacherContext } from '../auth/teacher-context';

@Injectable()
export class TaskStatsDatabase {
  constructor(
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    @InjectRepository(TaskStudentEntity)
    private readonly students: Repository<TaskStudentEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  async findAll() {
    const rows = await this.tasks.find({
      where: { teacherId: this.teacherContext.teacherId },
      relations: { students: true },
      order: { createdAt: 'DESC' },
    });
    return rows.map((row) => this.toTask(row));
  }

  async findById(id: string) {
    const row = await this.tasks.findOne({
      where: { id, teacherId: this.teacherContext.teacherId },
      relations: { students: true },
    });
    return row ? this.toTask(row) : undefined;
  }

  async save(task: TaskItem) {
    const teacherId = this.teacherContext.teacherId;
    await this.tasks.save(
      this.tasks.create({
        id: task.id,
        teacherId,
        title: task.title,
        className: task.className,
        type: task.type,
        statusCount: task.statusCount,
        createdAt: task.createdAt,
      }),
    );
    await this.students.delete({ taskId: task.id, teacherId });
    await this.students.save(
      task.students.map((student) =>
        this.students.create({
          id: `${task.id}-${student.id}`,
          teacherId,
          taskId: task.id,
          studentId: student.id,
          name: student.name,
          studentNo: student.studentNo,
          status: student.status,
          score: student.score === undefined ? null : String(student.score),
        }),
      ),
    );
    return (await this.findById(task.id))!;
  }

  async delete(id: string) {
    const result = await this.tasks.delete({
      id,
      teacherId: this.teacherContext.teacherId,
    });
    return Boolean(result.affected);
  }

  private toTask(entity: TaskEntity): TaskItem {
    return {
      id: entity.id,
      title: entity.title,
      className: entity.className,
      type: entity.type,
      statusCount: entity.statusCount,
      createdAt: entity.createdAt,
      students: [...(entity.students ?? [])]
        .filter(
          (student) => student.teacherId === this.teacherContext.teacherId,
        )
        .sort((a, b) => a.studentNo.localeCompare(b.studentNo))
        .map((student) => ({
          id: student.studentId,
          name: student.name,
          studentNo: student.studentNo,
          status: student.status,
          score: student.score === null ? undefined : Number(student.score),
        })),
    };
  }
}
