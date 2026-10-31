import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { TeacherAuthGuard } from './teacher-auth.guard';

function createContext(authorization?: string) {
  const request = {
    headers: { authorization },
    socket: { remoteAddress: '127.0.0.1' },
  };
  return {
    request,
    context: {
      getHandler: () => createContext,
      getClass: () => TeacherAuthGuard,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext,
  };
}

describe('TeacherAuthGuard', () => {
  const profile = {
    id: 'teacher-a',
    username: 'a',
    name: 'A老师',
    email: 'a@example.com',
    avatar: '',
  };

  it('allows explicitly public routes without a token', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const auth = { authenticate: jest.fn() };
    const guard = new TeacherAuthGuard(reflector as never, auth as never);

    await expect(guard.canActivate(createContext().context)).resolves.toBe(
      true,
    );
    expect(auth.authenticate).not.toHaveBeenCalled();
  });

  it('rejects protected routes without a bearer token', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const guard = new TeacherAuthGuard(
      reflector as never,
      { authenticate: jest.fn() } as never,
    );

    await expect(
      guard.canActivate(createContext().context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches the authenticated teacher to the request', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    const auth = { authenticate: jest.fn().mockResolvedValue(profile) };
    const { context, request } = createContext('Bearer session-token');
    const guard = new TeacherAuthGuard(reflector as never, auth as never);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(auth.authenticate).toHaveBeenCalledWith(
      'session-token',
      '127.0.0.1',
    );
    expect(request).toMatchObject({
      teacher: profile,
      authToken: 'session-token',
    });
  });
});

it('rejects a blocked existing session when a protected request arrives', async () => {
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const denied = new Error('禁止账号登录，请联系管理员解封');
  const auth = { authenticate: jest.fn().mockRejectedValue(denied) };
  const guard = new TeacherAuthGuard(reflector as never, auth as never);
  const { context, request } = createContext('Bearer existing-session');
  await expect(guard.canActivate(context)).rejects.toBe(denied);
  expect(auth.authenticate).toHaveBeenCalledWith(
    'existing-session',
    '127.0.0.1',
  );
  expect(request).not.toHaveProperty('teacher');
});
