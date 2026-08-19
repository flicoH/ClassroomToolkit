import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TeacherSessionEntity } from './entities/teacher-session.entity';
import { TeacherEntity } from './entities/teacher.entity';
import { Teacher, TeacherSession } from './teacher-auth.types';

@Injectable()
export class TeacherAuthDatabase {
  constructor(
    @InjectRepository(TeacherEntity)
    private readonly teachers: Repository<TeacherEntity>,
    @InjectRepository(TeacherSessionEntity)
    private readonly sessions: Repository<TeacherSessionEntity>,
  ) {}

  async findTeacherByUsername(username: string) {
    const teacher = await this.teachers.findOne({ where: { username } });
    return teacher ? this.toTeacher(teacher) : undefined;
  }

  async findTeacherById(teacherId: string) {
    const teacher = await this.teachers.findOne({ where: { id: teacherId } });
    return teacher ? this.toTeacher(teacher) : undefined;
  }

  async saveTeacher(teacher: Teacher) {
    const entity = this.teachers.create({
      ...teacher,
      createdAt: new Date(teacher.createdAt),
    });
    return this.toTeacher(await this.teachers.save(entity));
  }

  async saveSession(session: TeacherSession) {
    const entity = this.sessions.create({
      id: session.id,
      teacherId: session.teacherId,
      tokenHash: session.token,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
    });
    await this.sessions.save(entity);
    return session;
  }

  async findSessionByToken(token: string) {
    const session = await this.sessions.findOne({
      where: { tokenHash: token },
    });
    return session ? this.toSession(session) : undefined;
  }

  async deleteSession(sessionId: string) {
    const result = await this.sessions.delete(sessionId);
    return Boolean(result.affected);
  }

  private toTeacher(entity: TeacherEntity): Teacher {
    return {
      id: entity.id,
      username: entity.username,
      name: entity.name,
      email: entity.email,
      avatar: entity.avatar,
      passwordHash: entity.passwordHash,
      passwordSalt: entity.passwordSalt,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private toSession(entity: TeacherSessionEntity): TeacherSession {
    return {
      id: entity.id,
      teacherId: entity.teacherId,
      token: entity.tokenHash,
      createdAt: entity.createdAt.toISOString(),
      expiresAt: entity.expiresAt.toISOString(),
    };
  }
}
