import { AdminService } from './admin.service';
describe('IP management', () => {
  it('validates and normalizes add and remove', async () => {
    const database = {
      updateBlockedIp: jest.fn().mockResolvedValue({ updated: true }),
    };
    const service = new AdminService(database as never);
    expect(() => service.updateBlockedIp({ ip: 'bad' })).toThrow();
    await service.updateBlockedIp({ ip: '::ffff:192.0.2.1' });
    await service.updateBlockedIp({ ip: '192.0.2.1' }, true);
    expect(database.updateBlockedIp.mock.calls).toEqual([
      ['192.0.2.1', false],
      ['192.0.2.1', true],
    ]);
  });
});
