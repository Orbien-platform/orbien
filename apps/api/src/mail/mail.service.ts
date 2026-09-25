import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { Resend } from 'resend';
import { MailBrand, mailFrom } from './mail-brand';
import { MailContent, renderMail } from './mail-layout';

/**
 * Todo e-mail sai com uma `MailBrand` — do tenant, quando nasce no web ou no
 * app, e da Orbien, quando nasce no console. Quem chama resolve a marca
 * (ver `mail-brand.ts`); aqui só se monta e envia.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private resend: Resend | null = null;

  constructor() {
    if (process.env['RESEND_API_KEY']) {
      this.resend = new Resend(process.env['RESEND_API_KEY']);
    } else if (process.env['NODE_ENV'] === 'production') {
      this.logger.error('RESEND_API_KEY is not set — email sending will fail in production');
    }
  }

  async sendPasswordReset(to: string, resetUrl: string, userName: string, brand: MailBrand): Promise<void> {
    await this.send(to, brand, `Redefinição de senha — ${brand.name}`, `[DEV] Password reset URL for ${to}: ${resetUrl}`, {
      preheader: 'Use o link para criar uma nova senha. Ele expira em 30 minutos.',
      heading: 'Redefinição de senha',
      paragraphs: [
        `Olá${userName ? `, ${userName}` : ''},`,
        `Recebemos um pedido para redefinir a sua senha de acesso a ${brand.name}. Use o botão abaixo para criar uma nova.`,
      ],
      action: { label: 'Redefinir minha senha', url: resetUrl },
      note: 'Este link expira em 30 minutos. Se você não pediu a redefinição, ignore este e-mail: sua senha continua a mesma.',
    });
  }

  async sendInvite(to: string, inviteUrl: string, brand: MailBrand): Promise<void> {
    await this.send(to, brand, `Você foi convidado para ${brand.name}`, `[DEV] Invite URL for ${to}: ${inviteUrl}`, {
      preheader: `Crie sua senha para acessar ${brand.name}.`,
      heading: 'Crie sua senha',
      paragraphs: [`Você recebeu acesso a ${brand.name}. Use o botão abaixo para criar sua senha e entrar.`],
      action: { label: 'Criar minha senha', url: inviteUrl },
      note: 'Este link expira em 7 dias. Se você não esperava este convite, ignore este e-mail.',
    });
  }

  async sendDonationReceipt(
    to: string,
    donorName: string,
    amount: number,
    receiptUrl: string,
    brand: MailBrand,
  ): Promise<void> {
    const formattedAmount = `R$ ${amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    await this.send(to, brand, `Recibo de doação — ${brand.name}`, `[DEV] Donation receipt for ${to}: ${receiptUrl}`, {
      preheader: `Recibo da sua doação de ${formattedAmount}.`,
      heading: 'Recibo de doação',
      paragraphs: [`Olá, ${donorName},`, `Recebemos sua doação de ${formattedAmount}. Obrigado por contribuir.`],
      action: { label: 'Ver recibo em PDF', url: receiptUrl },
    });
  }

  private async send(
    to: string,
    brand: MailBrand,
    subject: string,
    devLog: string,
    content: MailContent,
  ): Promise<void> {
    if (!this.resend) {
      if (process.env['NODE_ENV'] === 'production') {
        throw new InternalServerErrorException('Email service not configured (missing RESEND_API_KEY)');
      }
      this.logger.log(devLog);
      return;
    }

    const { error } = await this.resend.emails.send({
      from: mailFrom(brand),
      to,
      subject,
      html: renderMail(brand, content),
    });

    if (error) {
      this.logger.error(`Resend error sending to ${to}: ${JSON.stringify(error)}`);
      throw new InternalServerErrorException(`Email delivery failed: ${error.message}`);
    }

    this.logger.log(`Email "${subject}" sent to ${to}`);
  }
}
