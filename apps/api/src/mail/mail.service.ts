import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { Resend } from 'resend';

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

  async sendPasswordReset(to: string, resetUrl: string, userName: string): Promise<void> {
    if (!this.resend) {
      if (process.env['NODE_ENV'] === 'production') {
        throw new InternalServerErrorException('Email service not configured (missing RESEND_API_KEY)');
      }
      this.logger.log(`[DEV] Password reset URL for ${to}: ${resetUrl}`);
      return;
    }

    const { error } = await this.resend.emails.send({
      from: process.env['MAIL_FROM'] ?? 'Orbien <naoresponda@useorbien.com>',
      to,
      subject: 'Redefinição de senha — Orbien',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #1E3A7B;">Redefinição de senha</h2>
          <p>Olá${userName ? `, ${userName}` : ''},</p>
          <p>Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo:</p>
          <a href="${resetUrl}"
             style="display: inline-block; background: #1E3A7B; color: white;
                    padding: 12px 24px; border-radius: 6px; text-decoration: none;
                    margin: 16px 0;">
            Redefinir minha senha
          </a>
          <p style="color: #5C5A56; font-size: 14px;">
            Este link expira em 30 minutos. Se você não solicitou, ignore este email.
          </p>
          <hr style="border: none; border-top: 1px solid #E0DDD9; margin: 24px 0;" />
          <p style="color: #9B9893; font-size: 12px;">Orbien — Gestão inteligente para igrejas</p>
        </div>
      `,
    });

    if (error) {
      this.logger.error(`Resend error sending to ${to}: ${JSON.stringify(error)}`);
      throw new InternalServerErrorException(`Email delivery failed: ${error.message}`);
    }

    this.logger.log(`Password reset email sent to ${to}`);
  }
}
