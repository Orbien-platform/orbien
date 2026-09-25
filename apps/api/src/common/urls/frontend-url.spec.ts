import { adminUrl, frontendUrl, PRODUCTION_ADMIN_URL, PRODUCTION_WEB_URL } from './frontend-url';

describe('frontendUrl', () => {
  const original = { url: process.env['FRONTEND_URL'], env: process.env['NODE_ENV'] };

  afterEach(() => {
    if (original.url === undefined) delete process.env['FRONTEND_URL'];
    else process.env['FRONTEND_URL'] = original.url;
    if (original.env === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = original.env;
  });

  describe('fora de produção', () => {
    beforeEach(() => {
      process.env['NODE_ENV'] = 'test';
    });

    it('cai no web local quando FRONTEND_URL não está definida', () => {
      delete process.env['FRONTEND_URL'];
      expect(frontendUrl()).toBe('http://localhost:3001');
    });

    it('usa o valor como veio, sem barra no fim', () => {
      process.env['FRONTEND_URL'] = 'http://localhost:4000/';
      expect(frontendUrl()).toBe('http://localhost:4000');
    });
  });

  describe('em produção', () => {
    beforeEach(() => {
      process.env['NODE_ENV'] = 'production';
    });

    it('aceita subdomínio de useorbien.com e tira a barra do fim', () => {
      process.env['FRONTEND_URL'] = ' https://web.useorbien.com/ ';
      expect(frontendUrl()).toBe('https://web.useorbien.com');
    });

    it('troca domínio da Vercel pelo de produção', () => {
      process.env['FRONTEND_URL'] = 'https://orbien-web.vercel.app/';
      expect(frontendUrl()).toBe(PRODUCTION_WEB_URL);
    });

    it('não se deixa enganar por host que só termina com o texto do domínio', () => {
      process.env['FRONTEND_URL'] = 'https://fakeuseorbien.com';
      expect(frontendUrl()).toBe(PRODUCTION_WEB_URL);
    });

    it('usa o domínio de produção quando a variável falta ou é inválida', () => {
      delete process.env['FRONTEND_URL'];
      expect(frontendUrl()).toBe(PRODUCTION_WEB_URL);
      process.env['FRONTEND_URL'] = 'web.useorbien.com';
      expect(frontendUrl()).toBe(PRODUCTION_WEB_URL);
    });
  });
});

describe('adminUrl', () => {
  const original = { url: process.env['ADMIN_URL'], env: process.env['NODE_ENV'] };

  afterEach(() => {
    if (original.url === undefined) delete process.env['ADMIN_URL'];
    else process.env['ADMIN_URL'] = original.url;
    if (original.env === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = original.env;
  });

  it('fora de produção, cai no admin local quando ADMIN_URL não está definida', () => {
    process.env['NODE_ENV'] = 'test';
    delete process.env['ADMIN_URL'];
    expect(adminUrl()).toBe('http://localhost:3003');
  });

  it('em produção, aceita subdomínio de useorbien.com e tira a barra do fim', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['ADMIN_URL'] = 'https://admin.useorbien.com/';
    expect(adminUrl()).toBe('https://admin.useorbien.com');
  });

  it('em produção, troca domínio fora de useorbien.com (ou ausente) pelo do console', () => {
    process.env['NODE_ENV'] = 'production';
    process.env['ADMIN_URL'] = 'https://orbien-admin.vercel.app';
    expect(adminUrl()).toBe(PRODUCTION_ADMIN_URL);
    delete process.env['ADMIN_URL'];
    expect(adminUrl()).toBe(PRODUCTION_ADMIN_URL);
  });
});
