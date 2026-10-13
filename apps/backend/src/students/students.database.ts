import { Injectable, NotFoundException } from '@nestjs/common';
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

  /** Class writes and photo writes share a lock; stale class forms must retain the latest photos. */
  async saveClassroom(classroom: Classroom) {
    const teacherId = this.teacherContext.teacherId;
    await this.classrooms.manager.transaction(async (manager) => {
      const classrooms = manager.getRepository(ClassroomEntity);
      const students = manager.getRepository(StudentEntity);
      const groups = manager.getRepository(StudentGroupEntity);
      const existing = await classrooms.findOne({
        where: { id: classroom.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (existing && existing.teacherId !== teacherId)
        throw new NotFoundException('班级不存在');
      await classrooms.save(
        classrooms.create({
          id: classroom.id,
          teacherId,
          name: classroom.name,
        }),
      );
      const current = await students.find({
        where: { classroomId: classroom.id, teacherId },
        select: { id: true, photo: true },
      });
      const photos = new Map(
        current.map((student) => [student.id, student.photo]),
      );
      await groups.delete({ classroomId: classroom.id, teacherId });
      await students.delete({ classroomId: classroom.id, teacherId });
      await groups.save(
        classroom.groups.map((name) =>
          groups.create({
            id: `${classroom.id}-${name}`,
            teacherId,
            classroomId: classroom.id,
            name,
          }),
        ),
      );
      await students.save(
        classroom.students.map((student) => {
          const id = this.studentStorageId(classroom.id, student.id);
          return students.create({
            id,
            teacherId,
            classroomId: classroom.id,
            name: student.name,
            studentNo: student.studentNo,
            gender: student.gender,
            groupName: student.group ?? null,
            // Photos are exclusively authored by setStudentPhoto, never by aggregate input.
            photo: photos.get(id) ?? null,
          });
        }),
      );
    });
    return (await this.findClassroom(classroom.id))!;
  }

  /** Update only the photo after locking and checking both ownership boundaries inside the transaction. */
  async setStudentPhoto(
    classroomId: string,
    studentId: string,
    photo: string | null,
  ) {
    const teacherId = this.teacherContext.teacherId;
    return this.classrooms.manager.transaction(async (manager) => {
      const classroom = await manager.getRepository(ClassroomEntity).findOne({
        where: { id: classroomId, teacherId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!classroom) throw new NotFoundException('班级不存在');
      const students = manager.getRepository(StudentEntity);
      const where = {
        id: this.studentStorageId(classroomId, studentId),
        classroomId,
        teacherId,
      };
      const student = await students.findOne({ where });
      if (!student) throw new NotFoundException('学生不存在');
      await students.update(where, { photo });
      return this.toStudent({ ...student, photo });
    });
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
      photo: entity.photo ?? null,
    };
  }

  /** 组合班级和学生 ID，避免不同班级学生学号相同时存储主键冲突。 */
  private studentStorageId(classroomId: string, studentId: string) {
    if (studentId.startsWith(`${classroomId}:`)) return studentId.slice(0, 64);
    return `${classroomId}:${studentId}`.slice(0, 64);
  }
}
