import { StreamableFile } from '@nestjs/common';
import { DonationReceiptsController } from './donation-receipts.controller';
import { DonationReceiptService } from './donation-receipts.service';
import { AnnualDonationReportService } from './annual-donation-report.service';
import { ListDonationReceiptsQueryDto } from './dto/list-donation-receipts-query.dto';
import { AnnualDonationReportQueryDto } from './dto/annual-donation-report-query.dto';
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

  const annualDonationReportService = {
    listDonorsForYear: jest.fn().mockResolvedValue([{ person_id: 'pessoa-1', person_name: 'Maria', total: 300, count: 3 }]),
    generatePdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4 fake')),
  } as unknown as AnnualDonationReportService;

  const res = { set: jest.fn() };

  return {
    controller: new DonationReceiptsController(donationReceiptService, annualDonationReportService),
    donationReceiptService,
    annualDonationReportService,
    res,
  };
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

  it('annualSummary delega ao service com o tenant do usuário e o ano da query', async () => {
    const { controller, annualDonationReportService } = harness();
    const query = Object.assign(new AnnualDonationReportQueryDto(), { year: 2026 });

    const result = await controller.annualSummary(query, user);

    expect(annualDonationReportService.listDonorsForYear).toHaveBeenCalledWith('t1', 2026);
    expect(result).toEqual([{ person_id: 'pessoa-1', person_name: 'Maria', total: 300, count: 3 }]);
  });

  it('annualReport gera o PDF, seta os headers de download e devolve um StreamableFile', async () => {
    const { controller, annualDonationReportService, res } = harness();
    const query = Object.assign(new AnnualDonationReportQueryDto(), { year: 2026 });

    const result = await controller.annualReport('pessoa-1', query, user, res as never);

    expect(annualDonationReportService.generatePdf).toHaveBeenCalledWith('t1', 'pessoa-1', 2026);
    expect(res.set).toHaveBeenCalledWith({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="carne-dizimista-2026.pdf"',
    });
    expect(result).toBeInstanceOf(StreamableFile);
  });
});
