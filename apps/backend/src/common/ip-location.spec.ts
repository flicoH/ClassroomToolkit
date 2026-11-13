import { ipLocation } from './ip-location';
describe('IP location failures', () => {
  afterEach(() => jest.restoreAllMocks());
  it('handles private addresses without a network request', async () => {
    const fetcher = jest.spyOn(globalThis, 'fetch');
    expect(await ipLocation('192.168.1.1')).toBe('本地 / 内网');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not fail login on provider errors', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    expect(await ipLocation('192.0.2.42')).toBe('未知');
  });
});
