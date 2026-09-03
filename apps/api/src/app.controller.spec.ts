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
});
