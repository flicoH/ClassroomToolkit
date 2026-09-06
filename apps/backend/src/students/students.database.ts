import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomEntity } from './entities/classroom.entity';
import { StudentGroupEntity } from './entities/student-group.entity';
import { StudentEntity } from './entities/student.entity';
import { Classroom, Student } from './students.types';
import { TeacherContext } from '../auth/teacher-context';

@Injectable()
export class StudentsDatabase {
  constructor(
    @InjectRepository(ClassroomEntity)
    private readonly classrooms: Repository<ClassroomEntity>,
    @InjectRepository(StudentGroupEntity)
    private readonly groups: Repository<StudentGroupEntity>,
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
    private readonly teacherContext: TeacherContext,
  ) {}

  /** 查询当前教师的全部班级，并带出分组和学生。 */
  async findClassrooms() {
    const rows = await this.classrooms.find({
      where: { teacherId: this.teacherContext.teacherId },
      relations: { groups: true, students: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.toClassroom(row));
  }

  /** 查询当前教师名下的单个班级。 */
  async findClassroom(id: string) {
    const row = await this.classrooms.findOne({
      where: { id, teacherId: this.teacherContext.teacherId },
      relations: { groups: true, students: true },
    });
    return row ? this.toClassroom(row) : undefined;
  }

  /** 保存班级聚合数据，重写其分组和学生明细。 */
  async saveClassroom(classroom: Classroom) {
    const teacherId = this.teacherContext.teacherId;
    await this.classrooms.save(
      this.classrooms.create({
        id: classroom.id,
        teacherId,
        name: classroom.name,
      }),
    );
    await Promise.all([
      this.groups.delete({ classroomId: classroom.id, teacherId }),
      this.students.delete({ classroomId: classroom.id, teacherId }),
    ]);

    await this.groups.save(
      classroom.groups.map((group) =>
        this.groups.create({
          id: `${classroom.id}-${group}`,
          teacherId,
          classroomId: classroom.id,
          name: group,
        }),
      ),
    );
    await this.students.save(
      classroom.students.map((student) =>
        this.students.create({
          id: this.studentStorageId(classroom.id, student.id),
          teacherId,
          classroomId: classroom.id,
          name: student.name,
          studentNo: student.studentNo,
          gender: student.gender,
          groupName: student.group ?? null,
        }),
      ),
    );

    return (await this.findClassroom(classroom.id))!;
  }

  /** 删除当前教师名下的班级。 */
  async deleteClassroom(id: string) {
    const result = await this.classrooms.delete({
      id,
      teacherId: this.teacherContext.teacherId,
    });
    return Boolean(result.affected);
  }

  /** 将 TypeORM 班级实体转换为前端使用的班级结构。 */
  private toClassroom(entity: ClassroomEntity): Classroom {
    return {
      id: entity.id,
      name: entity.name,
      groups: [...(entity.groups ?? [])]
        .filter((group) => group.teacherId === this.teacherContext.teacherId)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((group) => group.name),
      students: [...(entity.students ?? [])]
        .filter(
          (student) => student.teacherId === this.teacherContext.teacherId,
        )
        .sort((a, b) => a.studentNo.localeCompare(b.studentNo))
        .map((student) => this.toStudent(student)),
    };
  }

  /** 将学生实体转换为接口返回的学生结构。 */
  private toStudent(entity: StudentEntity): Student {
    return {
      id: entity.id,
      name: entity.name,
      studentNo: entity.studentNo,
      gender: entity.gender,
      group: entity.groupName ?? undefined,
    };
  }

  /** 组合班级和学生 ID，避免不同班级学生学号相同时存储主键冲突。 */
  private studentStorageId(classroomId: string, studentId: string) {
    if (studentId.startsWith(`${classroomId}:`)) return studentId.slice(0, 64);
    return `${classroomId}:${studentId}`.slice(0, 64);
  }
}
