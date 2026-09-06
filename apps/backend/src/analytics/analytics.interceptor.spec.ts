import { of, throwError, lastValueFrom } from 'rxjs';
import { AnalyticsInterceptor } from './analytics.interceptor';
function setup(mode?: string, headers: Record<string, string> = {}, body = {}) {
  const analytics = { record: jest.fn().mockResolvedValue(true) };
  const interceptor = new AnalyticsInterceptor(
    { get: () => ({ feature: 'test', action: 'save', mode }) } as never,
    analytics as never,
  );
  const context = {
    getHandler: () => null,
    switchToHttp: () => ({
      getRequest: () => ({
        teacher: { id: 'teacher' },
        headers,
        body,
        params: { noteId: 'note' },
      }),
    }),
  } as never;
  return { analytics, interceptor, context };
}
describe('AnalyticsInterceptor', () => {
  it('counts success, not failed operations', async () => {
    const { analytics, interceptor, context } = setup();
    await expect(
      lastValueFrom(
        interceptor.intercept(context, {
          handle: () => throwError(() => new Error('failed')),
        }),
      ),
    ).rejects.toThrow('failed');
    expect(analytics.record).not.toHaveBeenCalled();
    await lastValueFrom(
      interceptor.intercept(context, { handle: () => of({ saved: true }) }),
    );
    expect(analytics.record).toHaveBeenCalledTimes(1);
  });
  it('ignores countdown ticks and note position-only updates', async () => {
    for (const mode of ['countdown', 'note']) {
      const { analytics, interceptor, context } = setup(mode);
      await lastValueFrom(
        interceptor.intercept(context, { handle: () => of({}) }),
      );
      expect(analytics.record).not.toHaveBeenCalled();
    }
  });
});
