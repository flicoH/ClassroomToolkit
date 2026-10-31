import {
  BadRequestException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import { TeacherAuthService } from './teacher-auth.service';
import { Teacher, TeacherSession } from './teacher-auth.types';

describe('TeacherAuthService', () => {
  it('registers a teacher and creates a session token', async () => {
    const teachers = new Map<string, Teacher>();
    const sessions: TeacherSession[] = [];
    const database = {
      isIpBlocked: jest.fn().mockResolvedValue(false),
      findTeacherByUsername: jest
        .fn()
        .mockImplementation(async (username) => teachers.get(username)),
      saveTeacher: jest.fn().mockImplementation(async (teacher) => {
        teachers.set(teacher.username, teacher);
        return teacher;
      }),
      saveSession: jest.fn().mockImplementation(async (session) => {
        sessions.push(session);
        return session;
      }),
    };
    const service = new TeacherAuthService(database as never);

    const result = await service.register({
      username: 'teacher1',
      password: 'secret1',
      name: '王老师',
      email: 'teacher1@example.com',
    });

    expect(result).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^teacher-/),
        username: 'teacher1',
        name: '王老师',
        email: 'teacher1@example.com',
        token: expect.any(String),
      }),
    );
    expect(database.saveTeacher).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'teacher1',
        passwordHash: expect.any(String),
        passwordSalt: expect.any(String),
      }),
    );
    expect(sessions).toHaveLength(1);
  });

  it('rejects duplicated teacher usernames', async () => {
    const database = {
      isIpBlocked: jest.fn().mockResolvedValue(false),
      findTeacherByUsername: jest
        .fn()
        .mockResolvedValue({ id: 'teacher-1', username: 'teacher1' }),
    };
    const service = new TeacherAuthService(database as never);

    await expect(
      service.register({ username: 'teacher1', password: 'secret1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects malformed and oversized public authentication input as bad requests', async () => {
    const database = {
      isIpBlocked: jest.fn().mockResolvedValue(false),
      findTeacherByUsername: jest.fn(),
    };
    const service = new TeacherAuthService(database as never);

    await expect(
      service.login({ username: 1, password: 'secret1' } as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.register({ username: 'x'.repeat(65), password: 'secret1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.findTeacherByUsername).not.toHaveBeenCalled();
  });

  it('rate limits repeated failed logins from the same client', async () => {
    const database = {
      isIpBlocked: jest.fn().mockResolvedValue(false),
      findTeacherByUsername: jest.fn().mockResolvedValue(undefined),
    };
    const service = new TeacherAuthService(database as never);
    (
      service as unknown as {
        hashPassword: jest.Mock<Promise<string>, [string, string]>;
      }
    ).hashPassword = jest.fn().mockResolvedValue('00'.repeat(64));

    for (let attempt = 0; attempt < 10; attempt++) {
      await expect(
        service.login(
          { username: 'missing', password: 'secret1' },
          '192.0.2.1',
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(
      service.login(
        { username: 'another-user', password: 'secret1' },
        '192.0.2.1',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.login({ username: 'missing', password: 'secret1' }, '192.0.2.1'),
    ).rejects.toMatchObject<HttpException>({ status: 429 });
  });
});

describe('IP login restrictions', () => {
  it('rejects login and registration before touching accounts or sessions', async () => {
    const database = {
      isIpBlocked: jest.fn().mockResolvedValue(true),
      findTeacherByUsername: jest.fn(),
      saveSession: jest.fn(),
    };
    const service = new TeacherAuthService(database as never);
    await expect(
      service.login({ username: 'teacher', password: 'secret1' }, '192.0.2.1'),
    ).rejects.toThrow('禁止账号登录，请联系管理员解封');
    await expect(
      service.register(
        { username: 'teacher', password: 'secret1' },
        '192.0.2.1',
      ),
    ).rejects.toThrow('禁止账号登录，请联系管理员解封');
    expect(database.findTeacherByUsername).not.toHaveBeenCalled();
    expect(database.saveSession).not.toHaveBeenCalled();
  });
});

describe('blocked active sessions', () => {
  it('revokes the current session before denying an authenticated request', async () => {
    const database = {
      isIpBlocked: jest.fn().mockResolvedValue(true),
      findSessionByToken: jest.fn().mockResolvedValue({ id: 'session-1' }),
      deleteSession: jest.fn(),
      findTeacherById: jest.fn(),
    };
    const service = new TeacherAuthService(database as never);
    await expect(
      service.authenticate('active-token', '192.0.2.1'),
    ).rejects.toMatchObject({
      response: {
        code: 'IP_LOGIN_BLOCKED',
        message: '禁止账号登录，请联系管理员解封',
      },
    });
    expect(database.deleteSession).toHaveBeenCalledWith('session-1');
    expect(database.findTeacherById).not.toHaveBeenCalled();
  });
});
