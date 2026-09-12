import { DonationReceiptsController } from './donation-receipts.controller';
import { DonationReceiptService } from './donation-receipts.service';
import { ListDonationReceiptsQueryDto } from './dto/list-donation-receipts-query.dto';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 't1',
  congregation_id: 'c1',
  roles: ['treasurer'],
  plan: 'premium',
};

function harness() {
  const donationReceiptService = {
    list: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getDownloadUrl: jest.fn().mockResolvedValue({ download_url: 'https://cdn.test/signed', expires_in: 3600 }),
  } as unknown as DonationReceiptService;

  return { controller: new DonationReceiptsController(donationReceiptService), donationReceiptService };
}

describe('DonationReceiptsController', () => {
  it('findAll usa página e tamanho padrão quando não informados', async () => {
    const { controller, donationReceiptService } = harness();
    const query = new ListDonationReceiptsQueryDto();

    await controller.findAll(query, user);

    expect(donationReceiptService.list).toHaveBeenCalledWith('t1', 1, 20);
  });

  it('findAll repassa página e tamanho informados', async () => {
    const { controller, donationReceiptService } = harness();
    const query = Object.assign(new ListDonationReceiptsQueryDto(), { page: 2, page_size: 10 });

    await controller.findAll(query, user);

    expect(donationReceiptService.list).toHaveBeenCalledWith('t1', 2, 10);
  });

  it('download delega ao service com o tenant do usuário logado', async () => {
    const { controller, donationReceiptService } = harness();

    const result = await controller.download('receipt-1', user);

    expect(donationReceiptService.getDownloadUrl).toHaveBeenCalledWith('t1', 'receipt-1');
    expect(result).toEqual({ download_url: 'https://cdn.test/signed', expires_in: 3600 });
  });
});
