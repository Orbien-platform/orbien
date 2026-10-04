import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePublicDonationDto,
  PUBLIC_DONATION_MAX_AMOUNT,
  PUBLIC_DONATION_MIN_AMOUNT,
} from './create-public-donation.dto';

describe('CreatePublicDonationDto', () => {
  const BASE = { tenant_slug: 'igreja-x', amount: 50 };

  async function errorsFor(payload: Record<string, unknown>) {
    return validate(plainToInstance(CreatePublicDonationDto, { ...BASE, ...payload }));
  }

  const failsOn = async (payload: Record<string, unknown>, property: string) =>
    (await errorsFor(payload)).some((e) => e.property === property);

  it('os limites são os da Asaas por cobrança: R$ 5,00 a R$ 50.000,00', () => {
    expect(PUBLIC_DONATION_MIN_AMOUNT).toBe(5);
    expect(PUBLIC_DONATION_MAX_AMOUNT).toBe(50_000);
  });

  it('aceita só tenant_slug e amount', async () => {
    expect(await errorsFor({})).toHaveLength(0);
  });

  describe('amount (DPUB-11)', () => {
    it.each([
      ['o mínimo exato', 5],
      ['o máximo exato', 50_000],
      ['2 casas decimais', 12.34],
      ['1 casa decimal', 5.5],
    ])('aceita %s', async (_nome, amount) => {
      expect(await errorsFor({ amount })).toHaveLength(0);
    });

    it.each([
      ['abaixo do mínimo', 4.99],
      ['acima do máximo', 50_000.01],
      ['zero', 0],
      ['negativo', -10],
      ['10^10, que estourava o Decimal(12,2) em 500', 10_000_000_000],
      ['3 casas decimais, que o banco arredondava em silêncio', 10.123],
      ['Infinity', Infinity],
      ['NaN', NaN],
      ['texto', 'dez'],
      ['ausente', undefined],
    ])('rejeita %s', async (_nome, amount) => {
      expect(await failsOn({ amount }, 'amount')).toBe(true);
    });

    it('mensagem do mínimo diz o valor em reais', async () => {
      const errors = await errorsFor({ amount: 1 });
      const mensagens = errors.flatMap((e) => Object.values(e.constraints ?? {}));

      expect(mensagens).toContain('O valor mínimo da doação é R$ 5,00');
    });

    it('mensagem do máximo diz o valor em reais', async () => {
      const errors = await errorsFor({ amount: 60_000 });
      const mensagens = errors.flatMap((e) => Object.values(e.constraints ?? {}));

      expect(mensagens).toContain('O valor máximo da doação é R$ 50.000,00');
    });
  });

  describe('tenant_slug', () => {
    it('rejeita vazio', async () => {
      expect(await failsOn({ tenant_slug: '' }, 'tenant_slug')).toBe(true);
    });

    it('rejeita acima de 64 caracteres', async () => {
      expect(await failsOn({ tenant_slug: 'a'.repeat(65) }, 'tenant_slug')).toBe(true);
    });

    it('aceita 64 caracteres', async () => {
      expect(await errorsFor({ tenant_slug: 'a'.repeat(64) })).toHaveLength(0);
    });
  });

  describe('dados opcionais', () => {
    it('aceita nome, e-mail, categoria e honeypot', async () => {
      expect(
        await errorsFor({
          donor_name: 'Ana',
          donor_email: 'ana@teste.com',
          donor_consent: true,
          category_slug: 'oferta',
          website: '',
        }),
      ).toHaveLength(0);
    });

    it('rejeita nome acima de 120 caracteres', async () => {
      expect(await failsOn({ donor_name: 'a'.repeat(121) }, 'donor_name')).toBe(true);
    });

    it('rejeita e-mail inválido', async () => {
      expect(await failsOn({ donor_email: 'nao-e-email' }, 'donor_email')).toBe(true);
    });

    it('rejeita e-mail acima de 254 caracteres', async () => {
      expect(await failsOn({ donor_email: `${'a'.repeat(250)}@x.com` }, 'donor_email')).toBe(true);
    });

    describe('consentimento do e-mail (DPUB-23)', () => {
      it('e-mail com aceite passa', async () => {
        expect(await errorsFor({ donor_email: 'ana@teste.com', donor_consent: true })).toHaveLength(0);
      });

      it.each([
        ['sem o campo', undefined],
        ['false', false],
        ['texto "true"', 'true'],
        ['número 1', 1],
      ])('e-mail %s é rejeitado, com a mensagem do aceite', async (_nome, donor_consent) => {
        const errors = await errorsFor({ donor_email: 'ana@teste.com', donor_consent });
        const mensagens = errors.flatMap((e) => Object.values(e.constraints ?? {}));

        expect(errors.some((e) => e.property === 'donor_consent')).toBe(true);
        expect(mensagens).toContain('Aceite o uso do e-mail para receber o recibo');
      });

      it('sem e-mail, o aceite não é cobrado — nem com nome', async () => {
        expect(await errorsFor({ donor_name: 'Ana' })).toHaveLength(0);
        expect(await errorsFor({ donor_name: 'Ana', donor_consent: false })).toHaveLength(0);
      });
    });

    it('rejeita categoria acima de 40 caracteres', async () => {
      expect(await failsOn({ category_slug: 'a'.repeat(41) }, 'category_slug')).toBe(true);
    });

    it('rejeita honeypot acima de 200 caracteres', async () => {
      expect(await failsOn({ website: 'a'.repeat(201) }, 'website')).toBe(true);
    });
  });
});
