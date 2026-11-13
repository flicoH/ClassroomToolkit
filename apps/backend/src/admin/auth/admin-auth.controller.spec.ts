import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from './admin-auth.service';
import type { AdminRequest } from './admin-auth.guard';
import type { Response } from 'express';

describe('AdminAuthController cookie options', () => {
  let controller: AdminAuthController;
  let authService: { login: jest.Mock; logout: jest.Mock };
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    authService = {
      login: jest.fn().mockResolvedValue({
        token: 'a'.repeat(64),
        profile: { id: 'admin-1', username: 'admin' },
      }),
      logout: jest.fn().mockResolvedValue(undefined),
    };
    controller = new AdminAuthController(
      authService as unknown as AdminAuthService,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('sets secure to false for HTTP requests in production when not explicitly forced', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_COOKIE_SECURE;

    const req = {
      ip: '127.0.0.1',
      secure: false,
      headers: {},
    } as unknown as AdminRequest;

    const cookieMock = jest.fn();
    const setHeaderMock = jest.fn();
    const res = {
      cookie: cookieMock,
      setHeader: setHeaderMock,
    } as unknown as Response;

    await controller.login(
      { username: 'admin', password: 'password123456' },
      req,
      res,
    );

    expect(cookieMock).toHaveBeenCalledWith(
      'classroom_admin',
      'a'.repeat(64),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        secure: false,
        path: '/admin',
      }),
    );
  });

  it('sets secure to true for HTTPS requests in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_COOKIE_SECURE;

    const req = {
      ip: '127.0.0.1',
      secure: true,
      headers: { 'x-forwarded-proto': 'https' },
    } as unknown as AdminRequest;

    const cookieMock = jest.fn();
    const setHeaderMock = jest.fn();
    const res = {
      cookie: cookieMock,
      setHeader: setHeaderMock,
    } as unknown as Response;

    await controller.login(
      { username: 'admin', password: 'password123456' },
      req,
      res,
    );

    expect(cookieMock).toHaveBeenCalledWith(
      'classroom_admin',
      'a'.repeat(64),
      expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        secure: true,
        path: '/admin',
      }),
    );
  });

  it('respects explicit ADMIN_COOKIE_SECURE=false even on HTTPS', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_COOKIE_SECURE = 'false';

    const req = {
      ip: '127.0.0.1',
      secure: true,
      headers: { 'x-forwarded-proto': 'https' },
    } as unknown as AdminRequest;

    const cookieMock = jest.fn();
    const res = {
      cookie: cookieMock,
      setHeader: jest.fn(),
    } as unknown as Response;

    await controller.login(
      { username: 'admin', password: 'password123456' },
      req,
      res,
    );

    expect(cookieMock).toHaveBeenCalledWith(
      'classroom_admin',
      'a'.repeat(64),
      expect.objectContaining({
        secure: false,
      }),
    );
  });
});
