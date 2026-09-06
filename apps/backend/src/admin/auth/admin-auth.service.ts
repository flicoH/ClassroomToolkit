import {
  BadRequestException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
  HttpException,
} from '@nestjs/common';
import { AdminAuthDatabase } from './admin-auth.database';
import { LoginAdminDto } from './admin-auth.dto';
import type { AdminLoginResult, AdminProfile } from './admin-auth.types';
import {
  randomBytes,
  randomUUID,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);

@Injectable()
export class AdminAuthService implements OnModuleInit {
  /** 单进程、直接连接 IP 限流；代理后的用户可能共享 IP，多副本需改用共享存储。 */
  private attempts = new Map<string, { count: number; until: number }>();
  /** 注入认证持久层，密码派生、限流和认证异常在本服务处理。 */
  constructor(private readonly database: AdminAuthDatabase) {}
  /** 仅在配置完整且管理员表为空时创建首个账号；重启不会覆盖已有密码。 */
  async onModuleInit() {
    const username = process.env.ADMIN_INITIAL_USERNAME;
    const password = process.env.ADMIN_INITIAL_PASSWORD;
    if (!username && !password) return;
    if (
      !username?.trim() ||
      !password ||
      username.length > 64 ||
      password.length < 12 ||
      password.length > 256
    ) {
      throw new Error('管理员初始化需要账号和至少 12 位密码');
    }
    if (await this.database.hasAccounts()) return;
    const salt = randomBytes(16).toString('hex');
    const hash = ((await scrypt(password, salt, 64)) as Buffer).toString('hex');
    await this.database.createAccount({
      id: randomUUID(),
      username: username.trim(),
      passwordHash: hash,
      salt,
    });
  }
  /** 会话令牌只保存 SHA-256 摘要；此方法不用于密码哈希。 */
  hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  /** 验证密码后创建独立的 8 小时管理会话，不接受教师登录凭据。 */
  async login(body: LoginAdminDto, ip: string): Promise<AdminLoginResult> {
    if (
      typeof body?.username !== 'string' ||
      typeof body?.password !== 'string' ||
      body.username.length > 64 ||
      body.password.length > 256
    ) {
      throw new BadRequestException('请输入有效的账号和密码');
    }
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (value.until < now) this.attempts.delete(key);
    if (this.attempts.size >= 10000 && !this.attempts.has(ip))
      throw new HttpException('请稍后再试', 429);
    const attempt = this.attempts.get(ip) ?? {
      count: 0,
      until: now + 15 * 60_000,
    };
    if (attempt.count >= 10)
      throw new HttpException('尝试过于频繁，请 15 分钟后重试', 429);
    attempt.count++;
    this.attempts.set(ip, attempt);
    const account = await this.database.findByUsername(body.username.trim());
    // 不存在的账号也执行密码派生，减少可用于识别账号是否存在的耗时差异。
    const actual = (await scrypt(
      body.password,
      account?.salt ?? 'invalid-account-salt',
      64,
    )) as Buffer;
    const expected = account
      ? Buffer.from(account.passwordHash, 'hex')
      : Buffer.alloc(64);
    if (
      !account ||
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    )
      throw new UnauthorizedException('账号或密码错误');
    this.attempts.delete(ip);
    const token = randomBytes(32).toString('hex');
    await this.database.deleteExpiredSessions();
    await this.database.createSession(this.hash(token), account.id);
    return { token, profile: { id: account.id, username: account.username } };
  }
  /** 同时检查令牌格式、管理员归属及服务端过期时间，Cookie 存在不代表登录有效。 */
  async authenticate(token: string): Promise<AdminProfile> {
    if (!/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('请先登录管理后台');
    const row = await this.database.findActiveProfile(this.hash(token));
    if (!row) throw new UnauthorizedException('管理会话已过期');
    return row;
  }
  /** 撤销服务端会话，确保旧 Cookie 即使被保留也无法继续访问。 */
  async logout(token: string) {
    await this.database.deleteSession(this.hash(token));
  }
}
