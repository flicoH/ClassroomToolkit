import { Injectable, NotFoundException } from '@nestjs/common';
import { createEntityId } from '../common/id';
import {
  CreateClassroomDto,
  CreateGroupDto,
  CreateStudentDto,
  ImportStudentsDto,
  UpdateClassroomDto,
  UpdateStudentDto,
} from './students.dto';
import { StudentsDatabase } from './students.database';
import { Classroom, Gender, Student } from './students.types';

interface ClassroomStudentQuery {
  group?: string;
  query?: string;
  sort?: string;
}

const defaultClassrooms: Classroom[] = [
  {
    id: 'grade-1',
    name: '一年级',
    groups: ['一组', '二组', '三组'],
    students: [],
  },
  {
    id: 'grade-2',
    name: '二年级',
    groups: ['一组', '二组', '三组'],
    students: [],
  },
  {
    id: 'grade-3',
    name: '三年级',
    groups: ['一组', '二组', '三组'],
    students: [],
  },
];

@Injectable()
export class StudentsService {
  constructor(private readonly database: StudentsDatabase) {}

  async findClassrooms() {
    const classrooms = await this.database.findClassrooms();
    if (classrooms.length) return classrooms;
    return this.createDefaultClassrooms();
  }

  async findClassroom(
    classroomId: string,
    options: ClassroomStudentQuery = {},
  ) {
    const classroom = await this.getClassroomOrThrow(classroomId);
    return this.applyStudentQuery(classroom, options);
  }

  createClassroom(dto: CreateClassroomDto) {
    const classroom: Classroom = {
      id: createEntityId('class'),
      name: dto.name.trim(),
      groups: dto.groups ?? [],
      students: [],
    };
    return this.database.saveClassroom(classroom);
  }

  async updateClassroom(classroomId: string, dto: UpdateClassroomDto) {
    const classroom = await this.getClassroomOrThrow(classroomId);
    const name = dto.name?.trim();
    if (name) classroom.name = name;
    return this.database.saveClassroom(classroom);
  }

  async addStudent(classroomId: string, dto: CreateStudentDto) {
    const classroom = await this.getClassroomOrThrow(classroomId);
    const student: Student = {
      id: dto.studentNo || createEntityId('student'),
      name: dto.name.trim(),
      studentNo:
        dto.studentNo || String(2026000 + classroom.students.length + 1),
      gender: dto.gender ?? '',
      group: dto.group,
    };
    classroom.students.push(student);
    await this.database.saveClassroom(classroom);
    return student;
  }

  async updateStudent(
    classroomId: string,
    studentId: string,
    dto: UpdateStudentDto,
  ) {
    const classroom = await this.getClassroomOrThrow(classroomId);
    const index = classroom.students.findIndex(
      (student) => student.id === studentId,
    );
    if (index < 0) throw new NotFoundException('学生不存在');
    const currentStudent = classroom.students[index]!;
    classroom.students[index] = { ...currentStudent, ...dto, id: studentId };
    await this.database.saveClassroom(classroom);
    return classroom.students[index];
  }

  async deleteStudent(classroomId: string, studentId: string) {
    const classroom = await this.getClassroomOrThrow(classroomId);
    classroom.students = classroom.students.filter(
      (student) => student.id !== studentId,
    );
    await this.database.saveClassroom(classroom);
    return { deleted: true };
  }

  async importStudents(classroomId: string, dto: ImportStudentsDto) {
    const classroom = await this.getClassroomOrThrow(classroomId);
    const students = this.parseImportRows(dto.text, classroom.students.length);
    classroom.students.push(...students);
    await this.database.saveClassroom(classroom);
    return students;
  }

  async addGroup(classroomId: string, dto: CreateGroupDto) {
    const classroom = await this.getClassroomOrThrow(classroomId);
    const name = dto.name.trim();
    if (name && !classroom.groups.includes(name)) classroom.groups.push(name);
    await this.database.saveClassroom(classroom);
    return classroom.groups;
  }

  private applyStudentQuery(
    classroom: Classroom,
    options: ClassroomStudentQuery,
  ) {
    const normalizedQuery = options.query?.trim().toLowerCase() ?? '';
    const group = options.group?.trim();
    const sort = options.sort;
    const students = classroom.students
      .filter((student) => {
        const matchesQuery =
          !normalizedQuery ||
          student.name.toLowerCase().includes(normalizedQuery) ||
          student.studentNo.toLowerCase().includes(normalizedQuery);
        const matchesGroup =
          !group || group === '全部分组' || student.group === group;
        return matchesQuery && matchesGroup;
      })
      .sort((a, b) => {
        if (sort === '分数升序' || sort === '学号排序')
          return a.studentNo.localeCompare(b.studentNo);
        if (sort === '姓名排序') return a.name.localeCompare(b.name, 'zh-CN');
        return a.studentNo.localeCompare(b.studentNo);
      });
    return { ...classroom, students };
  }

  private async getClassroomOrThrow(classroomId: string) {
    let classroom = await this.database.findClassroom(classroomId);
    if (!classroom) {
      const classrooms = await this.database.findClassrooms();
      if (!classrooms.length) {
        const defaultClassroom = defaultClassrooms.find(
          (item) => item.id === classroomId,
        );
        if (defaultClassroom) {
          await this.createDefaultClassrooms();
          classroom = await this.database.findClassroom(classroomId);
        }
      }
    }
    if (!classroom) throw new NotFoundException('班级不存在');
    return classroom;
  }

  private async createDefaultClassrooms() {
    const classrooms: Classroom[] = [];
    for (const classroom of defaultClassrooms) {
      classrooms.push(await this.database.saveClassroom(classroom));
    }
    return classrooms;
  }

  /** 保持与前端导入框一致：每行 “姓名 学号 性别”，学号缺省则自动生成。 */
  private parseImportRows(text: string, offset: number): Student[] {
    return text
      .split('\n')
      .map((row) => row.trim())
      .filter(Boolean)
      .map((row, index) => {
        const [name = '未命名', maybeNo = '', maybeGender = ''] =
          row.split(/\s+/);
        const gender: Gender =
          maybeGender === '男' || maybeGender === '女' ? maybeGender : '';
        const studentNo = /^\d+$/.test(maybeNo)
          ? maybeNo
          : String(2026000 + offset + index + 1);
        return { id: studentNo, name, studentNo, gender };
      });
  }
}
