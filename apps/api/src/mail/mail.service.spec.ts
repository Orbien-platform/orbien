import { InternalServerErrorException } from '@nestjs/common';

const sendMock = jest.fn();

jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: sendMock },
  })),
}));

// Importado depois do mock para garantir que MailService receba o construtor mockado.
import { Resend } from 'resend';
import { MailService } from './mail.service';

const ORIGINAL_ENV = process.env;

describe('MailService', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    sendMock.mockReset();
    (Resend as unknown as jest.Mock).mockClear();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('constructor', () => {
    it('instancia o cliente Resend quando RESEND_API_KEY está configurada', () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      new MailService();

      expect(Resend).toHaveBeenCalledWith('key-123');
    });

    it('não instancia o cliente e não lança em desenvolvimento sem a chave', () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'development';

      expect(() => new MailService()).not.toThrow();
      expect(Resend).not.toHaveBeenCalled();
    });

    it('loga erro (mas não lança) em produção sem a chave', () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'production';

      expect(() => new MailService()).not.toThrow();
      expect(Resend).not.toHaveBeenCalled();
    });
  });

  describe('sendPasswordReset', () => {
    it('em dev sem Resend configurado, apenas loga a URL e não lança', async () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'development';
      const service = new MailService();

      await expect(
        service.sendPasswordReset('user@x.com', 'https://x/reset', 'Ana'),
      ).resolves.toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('em produção sem Resend configurado, lança InternalServerErrorException', async () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'production';
      const service = new MailService();

      await expect(
        service.sendPasswordReset('user@x.com', 'https://x/reset', 'Ana'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('envia o email com o nome do usuário quando o Resend está configurado', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      process.env['MAIL_FROM'] = 'Orbien <naoresponda@useorbien.com>';
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendPasswordReset('user@x.com', 'https://x/reset', 'Ana');

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Orbien <naoresponda@useorbien.com>',
          to: 'user@x.com',
          subject: 'Redefinição de senha — Orbien',
          html: expect.stringContaining('Olá, Ana'),
        }),
      );
    });

    it('usa saudação sem nome quando userName está vazio', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendPasswordReset('user@x.com', 'https://x/reset', '');

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining('Olá,<') }),
      );
    });

    it('usa o remetente padrão quando MAIL_FROM não está configurado', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      delete process.env['MAIL_FROM'];
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendPasswordReset('user@x.com', 'https://x/reset', 'Ana');

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'Orbien <naoresponda@useorbien.com>' }),
      );
    });

    it('lança InternalServerErrorException quando o Resend retorna erro', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      sendMock.mockResolvedValue({ error: { message: 'limite excedido' } });
      const service = new MailService();

      await expect(
        service.sendPasswordReset('user@x.com', 'https://x/reset', 'Ana'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('sendInvite', () => {
    it('em dev sem Resend configurado, apenas loga a URL e não lança', async () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'development';
      const service = new MailService();

      await expect(
        service.sendInvite('user@x.com', 'https://x/redefinir-senha?token=abc'),
      ).resolves.toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('em produção sem Resend configurado, lança InternalServerErrorException', async () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'production';
      const service = new MailService();

      await expect(
        service.sendInvite('user@x.com', 'https://x/redefinir-senha?token=abc'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('envia o email do convite quando o Resend está configurado', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      process.env['MAIL_FROM'] = 'Orbien <naoresponda@useorbien.com>';
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendInvite('user@x.com', 'https://x/redefinir-senha?token=abc');

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'Orbien <naoresponda@useorbien.com>',
          to: 'user@x.com',
          subject: 'Você foi convidado para o Orbien',
          html: expect.stringContaining('https://x/redefinir-senha?token=abc'),
        }),
      );
    });

    it('usa o remetente padrão quando MAIL_FROM não está configurado', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      delete process.env['MAIL_FROM'];
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendInvite('user@x.com', 'https://x/redefinir-senha?token=abc');

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: 'Orbien <naoresponda@useorbien.com>' }),
      );
    });

    it('lança InternalServerErrorException quando o Resend retorna erro', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      sendMock.mockResolvedValue({ error: { message: 'limite excedido' } });
      const service = new MailService();

      await expect(
        service.sendInvite('user@x.com', 'https://x/redefinir-senha?token=abc'),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });
});
