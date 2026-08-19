import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHash,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { createEntityId } from '../common/id';
import {
  LoginTeacherDto,
  LogoutTeacherDto,
  RegisterTeacherDto,
} from './teacher-auth.dto';
import { TeacherAuthDatabase } from './teacher-auth.database';
import { Teacher, TeacherProfile } from './teacher-auth.types';

const sessionDays = 7;

@Injectable()
export class TeacherAuthService {
  constructor(private readonly database: TeacherAuthDatabase) {}

  async register(dto: RegisterTeacherDto) {
    const username = dto.username.trim();
    const password = dto.password;
    if (!username || !password)
      throw new BadRequestException('用户名和密码不能为空');
    if (password.length < 6) throw new BadRequestException('密码至少需要 6 位');
    if (await this.database.findTeacherByUsername(username))
      throw new BadRequestException('用户名已存在');

    const salt = randomBytes(16).toString('hex');
    const teacher: Teacher = {
      id: createEntityId('teacher'),
      username,
      name: dto.name?.trim() || username,
      email: dto.email?.trim() || `${username}@example.com`,
      avatar: dto.avatar ?? '',
      passwordHash: this.hashPassword(password, salt),
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    };

    await this.database.saveTeacher(teacher);
    return this.createAuthResult(teacher);
  }

  async login(dto: LoginTeacherDto) {
    const teacher = await this.database.findTeacherByUsername(
      dto.username.trim(),
    );
    if (!teacher || !this.verifyPassword(dto.password, teacher)) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    return this.createAuthResult(teacher);
  }

  async me(token: string) {
    return this.authenticate(token);
  }

  async authenticate(token: string) {
    const teacher = await this.getTeacherByToken(token);
    return this.toProfile(teacher);
  }

  async logout(dto: LogoutTeacherDto) {
    const session = await this.database.findSessionByToken(
      this.hashToken(dto.token),
    );
    if (session) await this.database.deleteSession(session.id);
    return { loggedOut: true };
  }

  /**
   * 登录成功后返回前端可直接使用的用户信息，并额外带 token。
   * token 明文只在响应中出现一次，数据库中保存的是摘要。
   */
  private async createAuthResult(teacher: Teacher) {
    const token = randomBytes(32).toString('hex');
    const session = {
      id: createEntityId('session'),
      teacherId: teacher.id,
      token: this.hashToken(token),
      createdAt: new Date().toISOString(),
      expiresAt: new Date(
        Date.now() + sessionDays * 24 * 60 * 60 * 1000,
      ).toISOString(),
    };
    await this.database.saveSession(session);
    return { ...this.toProfile(teacher), token };
  }

  private async getTeacherByToken(token: string) {
    if (!token) throw new UnauthorizedException('未登录');
    const session = await this.database.findSessionByToken(
      this.hashToken(token),
    );
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
      throw new UnauthorizedException('登录已过期');
    }
    const teacher = await this.database.findTeacherById(session.teacherId);
    if (!teacher) throw new UnauthorizedException('教师账号不存在');
    return teacher;
  }

  /** 使用 PBKDF2 对密码加盐哈希，避免以明文保存教师密码。 */
  private hashPassword(password: string, salt: string) {
    return pbkdf2Sync(password, salt, 120_000, 64, 'sha512').toString('hex');
  }

  private verifyPassword(password: string, teacher: Teacher) {
    const actual = Buffer.from(
      this.hashPassword(password, teacher.passwordSalt),
      'hex',
    );
    const expected = Buffer.from(teacher.passwordHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private toProfile(teacher: Teacher): TeacherProfile {
    return {
      id: teacher.id,
      username: teacher.username,
      name: teacher.name,
      email: teacher.email,
      avatar: teacher.avatar,
    };
  }
}
