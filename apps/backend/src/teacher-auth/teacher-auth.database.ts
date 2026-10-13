import { Injectable, UnauthorizedException } from '@nestjs/common';
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

  /** 按用户名查询教师账号。 */
  async findTeacherByUsername(username: string) {
    const teacher = await this.teachers.findOne({ where: { username } });
    return teacher ? this.toTeacher(teacher) : undefined;
  }

  /** 按教师 ID 查询教师账号。 */
  async findTeacherById(teacherId: string) {
    const teacher = await this.teachers.findOne({ where: { id: teacherId } });
    return teacher ? this.toTeacher(teacher) : undefined;
  }

  /** 保存教师账号并转换时间字段。 */
  async saveTeacher(teacher: Teacher) {
    const entity = this.teachers.create({
      ...teacher,
      createdAt: new Date(teacher.createdAt),
    });
    return this.toTeacher(await this.teachers.save(entity));
  }

  /** 保存教师会话，数据库只存令牌摘要。 */
  async saveSession(
    session: TeacherSession,
    expected?: { passwordHash: string; sessionVersion: number },
  ) {
    const entity = this.sessions.create({
      id: session.id,
      teacherId: session.teacherId,
      tokenHash: session.token,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
    });
    // 与主账号管理共用归属行锁，阻止密码校验后、锁定/重置期间才落库的旧登录。
    await this.teachers.manager.transaction(async (manager) => {
      const actor = await manager.findOne(TeacherEntity, {
        where: { id: session.teacherId },
      });
      if (!actor) throw new UnauthorizedException('账号不可用');
      const owner = await manager.findOne(TeacherEntity, {
        where: { id: actor.parentAccountId || actor.id },
        lock: { mode: 'pessimistic_write' },
      });
      const current = actor.parentAccountId
        ? await manager.findOne(TeacherEntity, {
            where: { id: actor.id },
            lock: { mode: 'pessimistic_write' },
          })
        : owner;
      if (
        !owner ||
        owner.parentAccountId ||
        owner.status !== 'active' ||
        !current ||
        current.status !== 'active' ||
        (expected &&
          (current.passwordHash !== expected.passwordHash ||
            current.sessionVersion !== expected.sessionVersion))
      )
        throw new UnauthorizedException('账号状态已变化，请重新登录');
      await manager.save(TeacherSessionEntity, entity);
    });
    return session;
  }

  /** 按令牌摘要查询教师会话。 */
  async findSessionByToken(token: string) {
    const session = await this.sessions.findOne({
      where: { tokenHash: token },
    });
    return session ? this.toSession(session) : undefined;
  }

  /** 删除教师会话。 */
  async deleteSession(sessionId: string) {
    const result = await this.sessions.delete(sessionId);
    return Boolean(result.affected);
  }

  /** 将教师实体转换为认证服务内部模型。 */
  private toTeacher(entity: TeacherEntity): Teacher {
    return {
      sessionVersion: entity.sessionVersion,
      parentAccountId: entity.parentAccountId,
      status: entity.status,
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

  /** 将会话实体转换为认证服务内部模型。 */
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
