import { Logger } from '@nestjs/common';
import { PublicDonationExpiryScheduler } from './public-donation-expiry.scheduler';
import { PixService } from './pix.service';

function setup(impl: () => Promise<{ cancelled: number; kept: number }>) {
  const pixService = {
    expireAbandonedPublicDonations: jest.fn(impl),
  } as unknown as jest.Mocked<PixService>;
  return { scheduler: new PublicDonationExpiryScheduler(pixService), pixService };
}

describe('PublicDonationExpiryScheduler', () => {
  afterEach(() => jest.restoreAllMocks());

  it('delega a limpeza ao PixService e registra o resultado', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const { scheduler, pixService } = setup(() => Promise.resolve({ cancelled: 3, kept: 1 }));

    await scheduler.run();

    expect(pixService.expireAbandonedPublicDonations).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Doações públicas abandonadas: 3 canceladas, 1 mantidas');
  });

  it('falha da limpeza é registrada como erro e NÃO derruba o processo (cron não propaga)', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { scheduler } = setup(() => Promise.reject(new Error('banco fora do ar')));

    await expect(scheduler.run()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalledWith(expect.stringContaining('banco fora do ar'));
  });

  it('roda todo dia às 4h', () => {
    const cron = Reflect.getMetadata('SCHEDULE_CRON_OPTIONS', PublicDonationExpiryScheduler.prototype.run) as {
      cronTime: string;
    };

    expect(cron.cronTime).toBe('0 4 * * *');
  });
});
