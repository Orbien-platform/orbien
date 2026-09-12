import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlanType, TransactionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MailService } from '../mail/mail.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfmakeLib = require('pdfmake') as {
  virtualfs: { writeFileSync: (name: string, content: Buffer) => void };
  fonts: Record<string, unknown>;
  setLocalAccessPolicy: (cb: () => boolean) => void;
  setUrlAccessPolicy: (cb: () => boolean) => void;
  createPdf: (def: object, opts: object) => { getBuffer: () => Promise<Buffer> };
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfsFonts = require('pdfmake/build/vfs_fonts') as Record<string, string>;
Object.entries(vfsFonts).forEach(([name, b64]) =>
  pdfmakeLib.virtualfs.writeFileSync(name, Buffer.from(b64, 'base64')),
);
pdfmakeLib.fonts = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf',
  },
};
pdfmakeLib.setLocalAccessPolicy(() => false);
pdfmakeLib.setUrlAccessPolicy(() => false);

const HEADER_COLOR = '#1E3A7B';

export type ReceiptSummary = {
  id: string;
  receipt_url: string;
  generated_at: Date;
  person_name: string;
  amount: string;
  occurred_at: Date;
};

@Injectable()
export class DonationReceiptService {
  private readonly logger = new Logger(DonationReceiptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly mail: MailService,
  ) {}

  /**
   * Chamado depois que `PixService.handleWebhook` confirma um pagamento —
   * nunca dentro da mesma transação. Um erro aqui (email fora do ar, PDF
   * falhando) não pode desfazer um pagamento já confirmado pela Asaas, e o
   * chamador engole a rejeição por isso; ver `PixService.handleWebhook`.
   *
   * `pricing-church-platform.md` marca recibo automático como Premium —
   * consultado no banco (`TenantPlan`), nunca na claim do token, mesmo
   * princípio do `MemberCapService`: é limite de negócio, não de sessão.
   */
  async generateForTransaction(transactionId: string): Promise<void> {
    const existing = await this.prisma.client.donationReceipt.findFirst({
      where: { transaction_id: transactionId },
      select: { id: true },
    });
    if (existing) return;

    const transaction = await this.prisma.client.financialTransaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        tenant_id: true,
        amount: true,
        occurred_at: true,
        donor_person_id: true,
        is_anonymous: true,
        type: true,
      },
    });

    if (!transaction || transaction.type !== TransactionType.income) return;
    if (transaction.is_anonymous || !transaction.donor_person_id) return;

    const [tenantPlan, person, tenant] = await Promise.all([
      this.prisma.client.tenantPlan.findUnique({
        where: { tenant_id: transaction.tenant_id },
        select: { plan: true },
      }),
      this.prisma.client.person.findUnique({
        where: { id: transaction.donor_person_id },
        select: { full_name: true, email: true },
      }),
      this.prisma.client.tenant.findUnique({
        where: { id: transaction.tenant_id },
        select: { name: true },
      }),
    ]);

    if (tenantPlan?.plan !== PlanType.premium) return;

    if (!person?.email) {
      this.logger.log(
        `Doador ${transaction.donor_person_id} sem email cadastrado — recibo não enviado (transaction=${transactionId})`,
      );
      return;
    }

    const amount = Number(transaction.amount);
    const buffer = await this.buildPdf(person.full_name, tenant?.name ?? 'Igreja', amount, transaction.occurred_at);
    const key = `donation-receipts/${transaction.tenant_id}/${transaction.id}.pdf`;
    const receiptUrl = await this.storage.upload(buffer, key, 'application/pdf');

    await this.prisma.client.donationReceipt.create({
      data: {
        tenant_id: transaction.tenant_id,
        transaction_id: transaction.id,
        person_id: transaction.donor_person_id,
        receipt_url: receiptUrl,
      },
    });

    await this.mail.sendDonationReceipt(person.email, person.full_name, amount, receiptUrl);
  }

  async list(tenantId: string, page: number, pageSize: number): Promise<{ data: ReceiptSummary[]; total: number }> {
    const [rows, total] = await Promise.all([
      this.prisma.client.donationReceipt.findMany({
        where: { tenant_id: tenantId },
        orderBy: { generated_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          receipt_url: true,
          generated_at: true,
          person: { select: { full_name: true } },
          transaction: { select: { amount: true, occurred_at: true } },
        },
      }),
      this.prisma.client.donationReceipt.count({ where: { tenant_id: tenantId } }),
    ]);

    return {
      data: rows.map((r) => ({
        id: r.id,
        receipt_url: r.receipt_url,
        generated_at: r.generated_at,
        person_name: r.person.full_name,
        amount: r.transaction.amount.toString(),
        occurred_at: r.transaction.occurred_at,
      })),
      total,
    };
  }

  async getDownloadUrl(tenantId: string, id: string): Promise<{ download_url: string; expires_in: number }> {
    const receipt = await this.prisma.client.donationReceipt.findFirst({
      where: { id, tenant_id: tenantId },
      select: { receipt_url: true },
    });
    if (!receipt) throw new NotFoundException('Recibo não encontrado');

    const key = this.storage.keyFromUrl(receipt.receipt_url);
    if (!key) return { download_url: receipt.receipt_url, expires_in: 0 };

    const expiresIn = 3600;
    const downloadUrl = await this.storage.getPresignedGetUrl(key, expiresIn);
    return { download_url: downloadUrl, expires_in: expiresIn };
  }

  private async buildPdf(donorName: string, churchName: string, amount: number, occurredAt: Date): Promise<Buffer> {
    const docDefinition = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60] as [number, number, number, number],
      content: [
        {
          margin: [0, 0, 0, 24] as [number, number, number, number],
          stack: [
            { text: churchName, style: 'churchName' },
            { text: 'Recibo de Doação', style: 'title' },
          ],
        },
        {
          text: `Recebemos de ${donorName} a quantia de ${this.fmtMoney(amount)}, referente a doação em ${this.fmtDate(occurredAt)}.`,
          style: 'body',
        },
        {
          margin: [0, 24, 0, 0] as [number, number, number, number],
          text: `Emitido em ${this.fmtDate(new Date())} por Orbien.`,
          style: 'meta',
        },
      ],
      styles: {
        churchName: { fontSize: 10, color: '#666666' },
        title: { fontSize: 18, bold: true, color: HEADER_COLOR, margin: [0, 2, 0, 4] },
        body: { fontSize: 11, lineHeight: 1.4 },
        meta: { fontSize: 9, color: '#999999' },
      },
      defaultStyle: { font: 'Roboto', fontSize: 10 },
    };

    return pdfmakeLib.createPdf(docDefinition, {}).getBuffer();
  }

  private fmtDate(d: Date): string {
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  private fmtMoney(n: number): string {
    return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
