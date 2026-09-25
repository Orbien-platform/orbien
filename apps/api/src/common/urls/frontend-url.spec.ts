import { frontendUrl, PRODUCTION_WEB_URL } from './frontend-url';

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
