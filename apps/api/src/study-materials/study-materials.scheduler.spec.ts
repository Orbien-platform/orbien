import { StudyMaterialsScheduler } from './study-materials.scheduler';
import { StudyMaterialsService } from './study-materials.service';

describe('StudyMaterialsScheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('publishPending delega para o service', async () => {
    const service = {
      publishPending: jest.fn().mockResolvedValue(undefined),
    } as unknown as StudyMaterialsService;
    const scheduler = new StudyMaterialsScheduler(service);

    await scheduler.publishPending();

    expect(service.publishPending).toHaveBeenCalled();
  });
});
