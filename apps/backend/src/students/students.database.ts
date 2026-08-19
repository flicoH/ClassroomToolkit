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

  async findClassrooms() {
    const rows = await this.classrooms.find({
      where: { teacherId: this.teacherContext.teacherId },
      relations: { groups: true, students: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((row) => this.toClassroom(row));
  }

  async findClassroom(id: string) {
    const row = await this.classrooms.findOne({
      where: { id, teacherId: this.teacherContext.teacherId },
      relations: { groups: true, students: true },
    });
    return row ? this.toClassroom(row) : undefined;
  }

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

  async deleteClassroom(id: string) {
    const result = await this.classrooms.delete({
      id,
      teacherId: this.teacherContext.teacherId,
    });
    return Boolean(result.affected);
  }

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

  private toStudent(entity: StudentEntity): Student {
    return {
      id: entity.studentNo,
      name: entity.name,
      studentNo: entity.studentNo,
      gender: entity.gender,
      group: entity.groupName ?? undefined,
    };
  }

  private studentStorageId(classroomId: string, studentId: string) {
    return `${classroomId}:${studentId}`.slice(0, 64);
  }
}
