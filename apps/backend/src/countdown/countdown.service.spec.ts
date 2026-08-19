import { CountdownService } from './countdown.service';

describe('CountdownService', () => {
  it('creates the default backend state when no countdown exists', async () => {
    const database = {
      findDefault: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockImplementation(async (state) => state),
    };
    const service = new CountdownService(database as never);

    const state = await service.findState();

    expect(database.save).toHaveBeenCalledWith({
      id: 'default',
      totalSeconds: 300,
      remainingSeconds: 300,
      isRunning: false,
      updatedAt: expect.any(String),
    });
    expect(state.remainingSeconds).toBe(300);
  });
});
