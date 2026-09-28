import { mailFrom, PLATFORM_MAIL_BRAND, readableTextOn, tenantMailBrand } from './mail-brand';

describe('tenantMailBrand', () => {
  it('usa o nome, as cores e o logo do tenant', () => {
    expect(
      tenantMailBrand({
        name: 'Igreja Teste 2',
        brandingConfig: { primary_color: '#123456', secondary_color: '#abc', logo_url: 'https://cdn/x.png' },
      }),
    ).toEqual({
      kind: 'tenant',
      name: 'Igreja Teste 2',
      primaryColor: '#123456',
      accentColor: '#abc',
      logoUrl: 'https://cdn/x.png',
    });
  });

  it('descarta cor que não é hex e logo que não é http(s), caindo nas cores da Orbien', () => {
    const brand = tenantMailBrand({
      name: 'Igreja Teste 2',
      brandingConfig: {
        primary_color: 'red;" onload="x',
        secondary_color: null,
        logo_url: 'javascript:alert(1)',
      },
    });
    expect(brand.primaryColor).toBe(PLATFORM_MAIL_BRAND.primaryColor);
    expect(brand.accentColor).toBe(PLATFORM_MAIL_BRAND.accentColor);
    expect(brand.logoUrl).toBeNull();
    expect(brand.name).toBe('Igreja Teste 2');
  });

  it('descarta logo SVG, que os clientes de e-mail não mostram', () => {
    for (const logo_url of ['https://cdn/logo.svg', 'https://cdn/LOGO.SVG?v=2', 'https://cdn/logo.svgz']) {
      const brand = tenantMailBrand({
        name: 'Igreja Teste 2',
        brandingConfig: { primary_color: null, secondary_color: null, logo_url },
      });
      expect(brand.logoUrl).toBeNull();
    }
  });

  it('descarta logo que nem é URL', () => {
    const brand = tenantMailBrand({
      name: 'Igreja Teste 2',
      brandingConfig: { primary_color: null, secondary_color: null, logo_url: 'logo sem protocolo' },
    });
    expect(brand.logoUrl).toBeNull();
  });

  it('sem tenant, cai na marca da plataforma', () => {
    expect(tenantMailBrand(null)).toBe(PLATFORM_MAIL_BRAND);
  });

  it('tira quebras de linha do nome (vai para assunto e remetente)', () => {
    expect(tenantMailBrand({ name: 'Igreja\r\nBcc: x', brandingConfig: null }).name).toBe('Igreja Bcc: x');
  });
});

describe('readableTextOn', () => {
  it('branco sobre cor escura, escuro sobre cor clara', () => {
    expect(readableTextOn('#1E3A7B')).toBe('#FFFFFF');
    expect(readableTextOn('#F2B705')).toBe('#1A1A1A');
    expect(readableTextOn('#fff')).toBe('#1A1A1A');
  });
});

describe('mailFrom', () => {
  const original = process.env['MAIL_FROM'];

  afterEach(() => {
    if (original === undefined) delete process.env['MAIL_FROM'];
    else process.env['MAIL_FROM'] = original;
  });

  it('aceita MAIL_FROM só com o endereço, sem nome', () => {
    process.env['MAIL_FROM'] = ' naoresponda@useorbien.com ';
    expect(mailFrom(PLATFORM_MAIL_BRAND)).toBe('"Orbien" <naoresponda@useorbien.com>');
  });

  it('nome que some inteiro na limpeza cai em Orbien', () => {
    process.env['MAIL_FROM'] = 'Orbien <naoresponda@useorbien.com>';
    const brand = tenantMailBrand({ name: '<"">', brandingConfig: null });
    expect(mailFrom(brand)).toBe('"Orbien" <naoresponda@useorbien.com>');
  });
});
