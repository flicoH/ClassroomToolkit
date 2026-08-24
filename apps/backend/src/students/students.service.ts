import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createEntityId } from '../common/id';
import {
  CreateClassroomDto,
  CreateGroupDto,
  CreateStudentDto,
  ImportStudentsDto,
  UpdateClassroomDto,
  UpdateStudentGroupDto,
  UpdateStudentDto,
} from './students.dto';
import { StudentsDatabase } from './students.database';
import { Classroom, Gender, Student } from './students.types';

interface ClassroomStudentQuery {
  group?: string;
  query?: string;
  sort?: string;
}

const defaultClassroomTemplates: Array<Omit<Classroom, 'id'>> = [
  {
    name: '一年级',
    groups: ['一组', '二组', '三组'],
    students: [],
  },
  {
    name: '二年级',
    groups: ['一组', '二组', '三组'],
    students: [],
  },
  {
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
    const studentNo =
      dto.studentNo?.trim() || this.createNextStudentNo(classroom.students);
    this.assertStudentNoAvailable(classroom.students, studentNo);
    const student: Student = {
      id: studentNo,
      name: dto.name.trim(),
      studentNo,
      gender: dto.gender ?? '',
      group: dto.group,
    };
    classroom.students.push(student);
    const savedClassroom = await this.database.saveClassroom(classroom);
    return (
      savedClassroom.students.find(
        (savedStudent) => savedStudent.studentNo === studentNo,
      ) ?? student
    );
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
    const studentNo =
      dto.studentNo === undefined
        ? currentStudent.studentNo
        : dto.studentNo.trim() ||
          this.createNextStudentNo(classroom.students, index);
    this.assertStudentNoAvailable(classroom.students, studentNo, index);
    classroom.students[index] = {
      ...currentStudent,
      ...dto,
      id: studentId,
      name: dto.name?.trim() || currentStudent.name,
      studentNo,
    };
    const savedClassroom = await this.database.saveClassroom(classroom);
    return (
      savedClassroom.students.find((student) => student.id === studentId) ??
      classroom.students[index]
    );
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
    const students = this.parseImportRows(dto.text, classroom.students);
    classroom.students.push(...students);
    const savedClassroom = await this.database.saveClassroom(classroom);
    const importedStudentNos = new Set(
      students.map((student) => student.studentNo),
    );
    return savedClassroom.students.filter((student) =>
      importedStudentNos.has(student.studentNo),
    );
  }

  async addGroup(classroomId: string, dto: CreateGroupDto) {
    const classroom = await this.getClassroomOrThrow(classroomId);
    const name = dto.name.trim();
    if (name && !classroom.groups.includes(name)) classroom.groups.push(name);
    await this.database.saveClassroom(classroom);
    return classroom.groups;
  }

  async updateStudentGroup(
    classroomId: string,
    studentId: string,
    dto: UpdateStudentGroupDto,
  ) {
    const classroom = await this.getClassroomOrThrow(classroomId);
    const student = classroom.students.find((item) => item.id === studentId);
    if (!student) throw new NotFoundException('学生不存在');

    const group = dto.group?.trim();
    if (group && !classroom.groups.includes(group)) {
      throw new NotFoundException('分组不存在');
    }

    student.group = group || undefined;
    const savedClassroom = await this.database.saveClassroom(classroom);
    return (
      savedClassroom.students.find((item) => item.id === studentId) ?? student
    );
  }

  async deleteGroup(classroomId: string, groupName: string) {
    const classroom = await this.getClassroomOrThrow(classroomId);
    const name = groupName.trim();
    if (!name) throw new BadRequestException('分组名称不能为空');

    classroom.groups = classroom.groups.filter((group) => group !== name);
    classroom.students = classroom.students.map((student) =>
      student.group === name ? { ...student, group: undefined } : student,
    );
    return this.database.saveClassroom(classroom);
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
    const classroom = await this.database.findClassroom(classroomId);
    if (!classroom) {
      const classrooms = await this.database.findClassrooms();
      if (!classrooms.length) await this.createDefaultClassrooms();
    }
    if (!classroom) throw new NotFoundException('班级不存在');
    return classroom;
  }

  private async createDefaultClassrooms() {
    const classrooms: Classroom[] = [];
    for (const classroom of defaultClassroomTemplates) {
      classrooms.push(
        await this.database.saveClassroom({
          ...classroom,
          id: createEntityId('class'),
        }),
      );
    }
    return classrooms;
  }

  /** 保持与前端导入框一致：每行 “姓名 学号 性别”，学号缺省则自动生成。 */
  private parseImportRows(
    text: string,
    existingStudents: Student[],
  ): Student[] {
    const usedStudentNos = new Set(
      existingStudents.map((student) => student.studentNo),
    );
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
          : this.createNextStudentNoFromSet(
              usedStudentNos,
              existingStudents.length + index,
            );
        if (usedStudentNos.has(studentNo)) {
          throw new BadRequestException(`学生学号 ${studentNo} 已存在`);
        }
        usedStudentNos.add(studentNo);
        return { id: studentNo, name, studentNo, gender };
      });
  }

  private createNextStudentNo(students: Student[], excludeIndex?: number) {
    const usedStudentNos = new Set(
      students
        .filter((_, index) => index !== excludeIndex)
        .map((student) => student.studentNo),
    );
    return this.createNextStudentNoFromSet(usedStudentNos, students.length);
  }

  private createNextStudentNoFromSet(
    usedStudentNos: Set<string>,
    offset: number,
  ) {
    let nextStudentNo = String(2026000 + offset + 1);
    while (usedStudentNos.has(nextStudentNo)) {
      nextStudentNo = String(Number(nextStudentNo) + 1);
    }
    return nextStudentNo;
  }

  private assertStudentNoAvailable(
    students: Student[],
    studentNo: string,
    excludeIndex?: number,
  ) {
    if (
      students.some(
        (student, index) =>
          index !== excludeIndex && student.studentNo === studentNo,
      )
    ) {
      throw new BadRequestException(`学生学号 ${studentNo} 已存在`);
    }
  }
}
