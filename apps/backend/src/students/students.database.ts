import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClassroomEntity } from './entities/classroom.entity';
import { StudentGroupEntity } from './entities/student-group.entity';
import { StudentEntity } from './entities/student.entity';
import { PetStudentEntity } from '../pet-points/entities/pet-student.entity';
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

  /** 班级聚合与照片更新共用行锁；重写学生明细前取锁内最新照片，避免旧表单覆盖并发上传。 */
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
            // 聚合输入不具备照片写权限；仅保留数据库中最新照片，新增学生默认无照片。
            photo: photos.get(id) ?? null,
          });
        }),
      );

      // 同步名册至宠物积分系统，确保学期报告与 AI 汇总任务能立即获取到新增或修改的学生
      try {
        const petStudents = manager.getRepository(PetStudentEntity);
        if (petStudents && typeof petStudents.find === 'function') {
          const existingPets = await petStudents.find({
            where: { teacherId, classId: classroom.id },
          });
          const existingById = new Map<string, PetStudentEntity>();
          for (const pet of existingPets) {
            existingById.set(pet.id, pet);
            if (pet.id.startsWith(`${teacherId}:`)) {
              existingById.set(pet.id.slice(teacherId.length + 1), pet);
            }
            if (pet.logicalId) {
              existingById.set(pet.logicalId, pet);
              if (pet.logicalId.startsWith(`${teacherId}:`)) {
                existingById.set(
                  pet.logicalId.slice(teacherId.length + 1),
                  pet,
                );
              }
            }
            if (pet.studentNo) {
              existingById.set(pet.studentNo, pet);
              existingById.set(`${classroom.id}:${pet.studentNo}`, pet);
            }
          }
          const activeIds = new Set<string>();

          for (const student of classroom.students) {
            const sid = this.studentStorageId(classroom.id, student.id);
            const storageId = `${teacherId}:${sid}`.slice(0, 64);
            activeIds.add(sid);
            activeIds.add(student.id);
            activeIds.add(storageId);
            const current =
              existingById.get(storageId) ??
              existingById.get(sid) ??
              existingById.get(student.id) ??
              (student.studentNo
                ? existingById.get(`${classroom.id}:${student.studentNo}`)
                : undefined) ??
              (student.studentNo
                ? existingById.get(student.studentNo)
                : undefined);

            if (current) {
              current.name = student.name;
              current.studentNo = student.studentNo;
              current.group = student.group ?? '';
              current.className = classroom.name;
              current.classId = classroom.id;
              current.logicalId = sid;
              current.rosterActive = true;
              await petStudents.save(current);
              // 登记已激活的实体 ID 与逻辑 ID，防止同班同学号更新时被后续清理逻辑误判为已离班
              activeIds.add(current.id);
              if (current.logicalId) activeIds.add(current.logicalId);
            } else {
              // 防御：在尝试新建 score 为 0 的档案前，先检查 DB 中是否已存在以 storageId 为主键的档案
              const existingInDb = await petStudents.findOne({
                where: { id: storageId },
              });
              if (existingInDb) {
                existingInDb.name = student.name;
                existingInDb.studentNo = student.studentNo;
                existingInDb.group = student.group ?? '';
                existingInDb.className = classroom.name;
                existingInDb.classId = classroom.id;
                existingInDb.logicalId = sid;
                existingInDb.rosterActive = true;
                await petStudents.save(existingInDb);
                activeIds.add(existingInDb.id);
                if (existingInDb.logicalId)
                  activeIds.add(existingInDb.logicalId);
                existingById.set(existingInDb.id, existingInDb);
                continue;
              }

              const newPet = petStudents.create({
                id: storageId,
                logicalId: sid,
                teacherId,
                classId: classroom.id,
                className: classroom.name,
                name: student.name,
                studentNo: student.studentNo,
                group: student.group ?? '',
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
                cycleId: randomUUID(),
                revision: 0,
                completionPending: false,
                cycleRulesVersion: 1,
                rosterActive: true,
              });
              await petStudents.save(newPet);
              existingById.set(newPet.id, newPet);
              existingById.set(sid, newPet);
              existingById.set(storageId, newPet);
              if (student.studentNo) {
                existingById.set(student.studentNo, newPet);
                existingById.set(
                  `${classroom.id}:${student.studentNo}`,
                  newPet,
                );
              }
              activeIds.add(newPet.id);
              activeIds.add(sid);
            }
          }

          for (const pet of existingPets) {
            const pid = pet.logicalId || pet.id;
            // 排除活跃名册中的实体 ID、逻辑 ID 及学号，仅注销真正已被移出班级的冗余档案
            if (
              !activeIds.has(pid) &&
              !activeIds.has(pet.studentNo) &&
              !activeIds.has(pet.id) &&
              !activeIds.has(`${classroom.id}:${pet.studentNo}`)
            ) {
              if (pet.rosterActive) {
                pet.rosterActive = false;
                await petStudents.save(pet);
              }
            }
          }
        }
      } catch {
        // 容错处理：不因宠物积分同步异常破坏班级花名册保存主流程
      }
    });
    return (await this.findClassroom(classroom.id))!;
  }

  /** 事务内再次校验教师、班级与学生归属，仅更新照片；请求前的权限检查不能替代锁内复查。 */
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

  /** 删除当前教师名下的班级及包含的分组与学生档案。 */
  async deleteClassroom(id: string) {
    const teacherId = this.teacherContext.teacherId;
    return this.classrooms.manager.transaction(async (manager) => {
      const classrooms = manager.getRepository(ClassroomEntity);
      const students = manager.getRepository(StudentEntity);
      const groups = manager.getRepository(StudentGroupEntity);
      const existing = await classrooms.findOne({
        where: { id, teacherId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!existing) return false;
      await groups.delete({ classroomId: id, teacherId });
      await students.delete({ classroomId: id, teacherId });
      const result = await classrooms.delete({ id, teacherId });
      return Boolean(result.affected);
    });
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
