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

  it('chama purgeFinancialDonorsAfterContractEnd e loga o resultado', async () => {
    const personsService = {
      purgeFinancialDonorsAfterContractEnd: jest.fn().mockResolvedValue({ purged: 2 }),
    } as unknown as jest.Mocked<PersonsService>;

    const scheduler = new PersonsRetentionScheduler(personsService);
    await scheduler.cronPurgeFinancialDonorsAfterContractEnd();

    expect(personsService.purgeFinancialDonorsAfterContractEnd).toHaveBeenCalledWith();
  });

  it('chama purgeMinorsAfterContractEnd e loga o resultado', async () => {
    const personsService = {
      purgeMinorsAfterContractEnd: jest.fn().mockResolvedValue({ purged: 1 }),
    } as unknown as jest.Mocked<PersonsService>;

    const scheduler = new PersonsRetentionScheduler(personsService);
    await scheduler.cronPurgeMinorsAfterContractEnd();

    expect(personsService.purgeMinorsAfterContractEnd).toHaveBeenCalledWith();
  });
});
