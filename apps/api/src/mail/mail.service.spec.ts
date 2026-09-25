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
import { PLATFORM_MAIL_BRAND, tenantMailBrand } from './mail-brand';

const TENANT = tenantMailBrand({
  name: 'Igreja Teste 1',
  brandingConfig: {
    primary_color: '#7A1F2B',
    secondary_color: '#F2B705',
    logo_url: 'https://cdn.example.com/teste1/logo.png',
  },
});

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
        service.sendPasswordReset('user@x.com', 'https://x/reset', 'Ana', PLATFORM_MAIL_BRAND),
      ).resolves.toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('em produção sem Resend configurado, lança InternalServerErrorException', async () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'production';
      const service = new MailService();

      await expect(
        service.sendPasswordReset('user@x.com', 'https://x/reset', 'Ana', PLATFORM_MAIL_BRAND),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('envia o email com o nome do usuário quando o Resend está configurado', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      process.env['MAIL_FROM'] = 'Orbien <naoresponda@useorbien.com>';
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendPasswordReset('user@x.com', 'https://x/reset', 'Ana', PLATFORM_MAIL_BRAND);

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Orbien" <naoresponda@useorbien.com>',
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

      await service.sendPasswordReset('user@x.com', 'https://x/reset', '', PLATFORM_MAIL_BRAND);

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ html: expect.stringContaining('Olá,<') }),
      );
    });

    it('usa o remetente padrão quando MAIL_FROM não está configurado', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      delete process.env['MAIL_FROM'];
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendPasswordReset('user@x.com', 'https://x/reset', 'Ana', PLATFORM_MAIL_BRAND);

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: '"Orbien" <naoresponda@useorbien.com>' }),
      );
    });

    it('lança InternalServerErrorException quando o Resend retorna erro', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      sendMock.mockResolvedValue({ error: { message: 'limite excedido' } });
      const service = new MailService();

      await expect(
        service.sendPasswordReset('user@x.com', 'https://x/reset', 'Ana', PLATFORM_MAIL_BRAND),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('sendInvite', () => {
    it('em dev sem Resend configurado, apenas loga a URL e não lança', async () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'development';
      const service = new MailService();

      await expect(
        service.sendInvite('user@x.com', 'https://x/redefinir-senha?token=abc', PLATFORM_MAIL_BRAND),
      ).resolves.toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('em produção sem Resend configurado, lança InternalServerErrorException', async () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'production';
      const service = new MailService();

      await expect(
        service.sendInvite('user@x.com', 'https://x/redefinir-senha?token=abc', PLATFORM_MAIL_BRAND),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('envia o email do convite quando o Resend está configurado', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      process.env['MAIL_FROM'] = 'Orbien <naoresponda@useorbien.com>';
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendInvite('user@x.com', 'https://x/redefinir-senha?token=abc', PLATFORM_MAIL_BRAND);

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Orbien" <naoresponda@useorbien.com>',
          to: 'user@x.com',
          subject: 'Você foi convidado para Orbien',
          html: expect.stringContaining('https://x/redefinir-senha?token=abc'),
        }),
      );
    });

    it('usa o remetente padrão quando MAIL_FROM não está configurado', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      delete process.env['MAIL_FROM'];
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendInvite('user@x.com', 'https://x/redefinir-senha?token=abc', PLATFORM_MAIL_BRAND);

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: '"Orbien" <naoresponda@useorbien.com>' }),
      );
    });

    it('lança InternalServerErrorException quando o Resend retorna erro', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      sendMock.mockResolvedValue({ error: { message: 'limite excedido' } });
      const service = new MailService();

      await expect(
        service.sendInvite('user@x.com', 'https://x/redefinir-senha?token=abc', PLATFORM_MAIL_BRAND),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('sendDonationReceipt', () => {
    it('em dev sem Resend configurado, apenas loga a URL e não lança', async () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'development';
      const service = new MailService();

      await expect(
        service.sendDonationReceipt('user@x.com', 'Ana', 100, 'https://cdn/recibo.pdf', TENANT),
      ).resolves.toBeUndefined();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('em produção sem Resend configurado, lança InternalServerErrorException', async () => {
      delete process.env['RESEND_API_KEY'];
      process.env['NODE_ENV'] = 'production';
      const service = new MailService();

      await expect(
        service.sendDonationReceipt('user@x.com', 'Ana', 100, 'https://cdn/recibo.pdf', TENANT),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });

    it('envia o email com o valor formatado e o link do recibo quando o Resend está configurado', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      process.env['MAIL_FROM'] = 'Orbien <naoresponda@useorbien.com>';
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendDonationReceipt('user@x.com', 'Ana', 1234.5, 'https://cdn/recibo.pdf', TENANT);

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          from: '"Igreja Teste 1" <naoresponda@useorbien.com>',
          to: 'user@x.com',
          subject: 'Recibo de doação — Igreja Teste 1',
          html: expect.stringContaining('Olá, Ana'),
        }),
      );
      const html = sendMock.mock.calls[0][0].html as string;
      expect(html).toContain('R$ 1.234,50');
      expect(html).toContain('https://cdn/recibo.pdf');
    });

    it('usa o remetente padrão quando MAIL_FROM não está configurado', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      delete process.env['MAIL_FROM'];
      sendMock.mockResolvedValue({ error: null });
      const service = new MailService();

      await service.sendDonationReceipt('user@x.com', 'Ana', 100, 'https://cdn/recibo.pdf', TENANT);

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({ from: '"Igreja Teste 1" <naoresponda@useorbien.com>' }),
      );
    });

    it('lança InternalServerErrorException quando o Resend retorna erro', async () => {
      process.env['RESEND_API_KEY'] = 'key-123';
      sendMock.mockResolvedValue({ error: { message: 'limite excedido' } });
      const service = new MailService();

      await expect(
        service.sendDonationReceipt('user@x.com', 'Ana', 100, 'https://cdn/recibo.pdf', TENANT),
      ).rejects.toBeInstanceOf(InternalServerErrorException);
    });
  });

  describe('marca do tenant', () => {
    beforeEach(() => {
      process.env['RESEND_API_KEY'] = 'key-123';
      process.env['MAIL_FROM'] = 'Orbien <naoresponda@useorbien.com>';
      sendMock.mockResolvedValue({ error: null });
    });

    it('a redefinição de senha leva nome, cores e logo do tenant, sem citar a Orbien', async () => {
      await new MailService().sendPasswordReset('user@x.com', 'https://x/reset', 'Ana', TENANT);

      const call = sendMock.mock.calls[0][0];
      expect(call.from).toBe('"Igreja Teste 1" <naoresponda@useorbien.com>');
      expect(call.subject).toBe('Redefinição de senha — Igreja Teste 1');
      expect(call.html).toContain('src="https://cdn.example.com/teste1/logo.png"');
      expect(call.html).toContain('background: #7A1F2B');
      expect(call.html).toContain('background: #F2B705');
      expect(call.html).not.toMatch(/orbien/i);
    });

    it('a redefinição de senha no contexto da plataforma assina como Orbien', async () => {
      await new MailService().sendPasswordReset('user@x.com', 'https://x/reset', 'Ana', PLATFORM_MAIL_BRAND);

      const call = sendMock.mock.calls[0][0];
      expect(call.subject).toBe('Redefinição de senha — Orbien');
      expect(call.html).toContain('background: #1E3A7B');
      expect(call.html).toContain('Orbien — Gestão inteligente para igrejas');
    });

    it('escapa o nome do tenant no HTML e o limpa no remetente', async () => {
      const brand = tenantMailBrand({ name: 'Igreja <b>"X"</b>', brandingConfig: null });
      await new MailService().sendInvite('user@x.com', 'https://x/r?token=a&b=1', brand);

      const call = sendMock.mock.calls[0][0];
      expect(call.html).toContain('Igreja &lt;b&gt;&quot;X&quot;&lt;/b&gt;');
      expect(call.html).not.toContain('<b>');
      expect(call.html).toContain('href="https://x/r?token=a&amp;b=1"');
      expect(call.from).toBe('"Igreja bX/b" <naoresponda@useorbien.com>');
    });
  });
});
