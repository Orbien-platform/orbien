import { AppController } from './app.controller';

describe('AppController', () => {
  it('health devolve status ok com timestamp ISO', () => {
    const controller = new AppController();
    const before = Date.now();
    const result = controller.health();
    const after = Date.now();

    expect(result.status).toBe('ok');
    const ts = new Date(result.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it('health expõe o commit do Render e nada além de status/timestamp/commit', () => {
    const antes = process.env.RENDER_GIT_COMMIT;
    try {
      process.env.RENDER_GIT_COMMIT = 'abc1234';
      const result = new AppController().health();
      expect(result.commit).toBe('abc1234');
      expect(Object.keys(result).sort()).toEqual(['commit', 'status', 'timestamp']);

      delete process.env.RENDER_GIT_COMMIT;
      expect(new AppController().health().commit).toBeNull();
    } finally {
      if (antes === undefined) delete process.env.RENDER_GIT_COMMIT;
      else process.env.RENDER_GIT_COMMIT = antes;
    }
  });
});
