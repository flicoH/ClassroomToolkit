import { Optional } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  BadRequestException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { createEntityId } from '../common/id';
import {
  LoginTeacherDto,
  LogoutTeacherDto,
  RegisterTeacherDto,
} from './teacher-auth.dto';
import { TeacherAuthDatabase } from './teacher-auth.database';
import { Teacher, TeacherProfile } from './teacher-auth.types';

const sessionDays = 7;
const loginWindowMs = 15 * 60_000;
const registerWindowMs = 60 * 60_000;

@Injectable()
export class TeacherAuthService {
  /** 单进程按来源限流；多副本部署时应迁移到共享存储。 */
  private readonly attempts = new Map<
    string,
    { count: number; expiresAt: number }
  >();
  constructor(
    private readonly database: TeacherAuthDatabase,
    @Optional() private readonly analytics?: AnalyticsService,
  ) {}

  /** 注册教师账号，创建会话并记录注册与自动登录事件。 */
  async register(dto: RegisterTeacherDto, clientKey = 'unknown') {
    const { username, password, name, email, avatar } =
      this.validateRegisterInput(dto);
    this.consumeAttempt(
      `register:${clientKey}:${username}`,
      5,
      registerWindowMs,
    );
    if (await this.database.findTeacherByUsername(username))
      throw new BadRequestException('用户名已存在');

    const salt = randomBytes(16).toString('hex');
    const teacher: Teacher = {
      id: createEntityId('teacher'),
      username,
      name: name || username,
      email: email || `${username}@example.com`,
      avatar,
      passwordHash: await this.hashPassword(password, salt),
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    };

    await this.database.saveTeacher(teacher);
    const result = await this.createAuthResult(teacher);
    await this.analytics?.record(teacher.id, 'register');
    await this.analytics?.record(teacher.id, 'auto_login');
    return result;
  }

  /** 校验教师账号密码，登录成功后创建会话。 */
  async login(dto: LoginTeacherDto, clientKey = 'unknown') {
    const { username, password } = this.validateLoginInput(dto);
    // BFF 部署下多个教师可能共享代理地址，账号维度避免一人失败锁住全部用户。
    const attemptKey = `login:${clientKey}:${username}`;
    this.consumeAttempt(attemptKey, 10, loginWindowMs);
    const teacher = await this.database.findTeacherByUsername(username);
    // 不存在的账号也执行同成本派生，避免用户名枚举并保持限流成本一致。
    const valid = teacher
      ? await this.verifyPassword(password, teacher)
      : await this.verifyUnknownPassword(password);
    if (!teacher || !valid) {
      await this.analytics?.record(teacher?.id ?? null, 'login_failed');
      throw new UnauthorizedException('用户名或密码错误');
    }
    this.attempts.delete(attemptKey);
    const result = await this.createAuthResult(teacher);
    await this.analytics?.record(teacher.id, 'login');
    return result;
  }

  /** 复用认证逻辑返回当前教师资料。 */
  async me(token: string) {
    return this.authenticate(token);
  }

  /** 通过会话令牌认证教师身份。 */
  async authenticate(token: string) {
    const teacher = await this.getTeacherByToken(token);
    return this.toProfile(teacher);
  }

  /** 删除指定教师会话，允许重复调用保持幂等。 */
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

  /** 通过令牌摘要查找有效会话和教师账号。 */
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
  private hashPassword(password: string, salt: string): Promise<string> {
    return new Promise((resolve, reject) => {
      pbkdf2(password, salt, 120_000, 64, 'sha512', (error, result) => {
        if (error) reject(error);
        else resolve(result.toString('hex'));
      });
    });
  }

  /** 使用恒定时间比较校验教师密码。 */
  private async verifyPassword(password: string, teacher: Teacher) {
    const actual = Buffer.from(
      await this.hashPassword(password, teacher.passwordSalt),
      'hex',
    );
    const expected = Buffer.from(teacher.passwordHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }

  /** 对未知账号执行固定成本校验，返回值始终为 false。 */
  private async verifyUnknownPassword(password: string) {
    const actual = Buffer.from(
      await this.hashPassword(password, 'invalid-account-salt'),
      'hex',
    );
    const expected = Buffer.alloc(64);
    return timingSafeEqual(actual, expected) && false;
  }

  private validateRegisterInput(dto: RegisterTeacherDto) {
    const input = dto as unknown as Record<string, unknown>;
    const username = this.requiredString(input.username, '用户名', 64);
    const password = this.requiredString(input.password, '密码', 256, false);
    if (password.length < 6) throw new BadRequestException('密码至少需要 6 位');
    return {
      username,
      password,
      name: this.optionalString(input.name, '姓名', 64),
      email: this.optionalString(input.email, '邮箱', 128),
      avatar: this.optionalString(input.avatar, '头像', 512),
    };
  }

  private validateLoginInput(dto: LoginTeacherDto) {
    const input = dto as unknown as Record<string, unknown>;
    return {
      username: this.requiredString(input.username, '用户名', 64),
      password: this.requiredString(input.password, '密码', 256, false),
    };
  }

  private requiredString(
    value: unknown,
    label: string,
    maxLength: number,
    trim = true,
  ) {
    if (typeof value !== 'string')
      throw new BadRequestException(`${label}格式无效`);
    const normalized = trim ? value.trim() : value;
    if (!normalized) throw new BadRequestException(`${label}不能为空`);
    if (normalized.length > maxLength)
      throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符`);
    return normalized;
  }

  private optionalString(value: unknown, label: string, maxLength: number) {
    if (value === undefined || value === null) return '';
    if (typeof value !== 'string')
      throw new BadRequestException(`${label}格式无效`);
    const normalized = value.trim();
    if (normalized.length > maxLength)
      throw new BadRequestException(`${label}不能超过 ${maxLength} 个字符`);
    return normalized;
  }

  private consumeAttempt(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    for (const [storedKey, value] of this.attempts)
      if (value.expiresAt <= now) this.attempts.delete(storedKey);
    const attempt = this.attempts.get(key);
    if (attempt && attempt.count >= limit)
      throw new HttpException('尝试过于频繁，请稍后再试', 429);
    this.attempts.set(key, {
      count: (attempt?.count ?? 0) + 1,
      expiresAt: attempt?.expiresAt ?? now + windowMs,
    });
  }

  /** 对会话令牌做 SHA-256 摘要后再入库或查询。 */
  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  /** 将教师账号转换为可返回给前端的公开资料。 */
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
