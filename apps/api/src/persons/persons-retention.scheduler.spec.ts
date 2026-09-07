import { PersonsRetentionScheduler } from './persons-retention.scheduler';
import { PersonsService } from './persons.service';

describe('PersonsRetentionScheduler', () => {
  it('chama purgeExpiredSoftDeletes e loga o resultado', async () => {
    const personsService = {
      purgeExpiredSoftDeletes: jest.fn().mockResolvedValue({ purged: 3 }),
    } as unknown as jest.Mocked<PersonsService>;

    const scheduler = new PersonsRetentionScheduler(personsService);
    await scheduler.cronPurgeExpiredSoftDeletes();

    expect(personsService.purgeExpiredSoftDeletes).toHaveBeenCalledWith();
  });

  it('chama purgeInactivePersons e loga o resultado', async () => {
    const personsService = {
      purgeInactivePersons: jest.fn().mockResolvedValue({ purged: 5 }),
    } as unknown as jest.Mocked<PersonsService>;

    const scheduler = new PersonsRetentionScheduler(personsService);
    await scheduler.cronPurgeInactivePersons();

    expect(personsService.purgeInactivePersons).toHaveBeenCalledWith();
  });
});
