import { tenantMailBrand } from './mail-brand';
import { renderMail } from './mail-layout';

const content = {
  preheader: 'p',
  heading: 'Título',
  paragraphs: ['Texto'],
  action: { label: 'Abrir', url: 'https://x/y' },
};

describe('renderMail', () => {
  it('primária clara: botão com texto escuro e título em ink, não na primária', () => {
    const brand = tenantMailBrand({
      name: 'Igreja Teste 1',
      brandingConfig: { primary_color: '#F2B705', secondary_color: null, logo_url: null },
    });
    const html = renderMail(brand, content);

    expect(html).toContain('background: #F2B705');
    expect(html).toMatch(/color: #1A1A1A; text-decoration: none; border-radius: 8px;">Abrir</);
    expect(html).toMatch(/color: #1A1A1A;">Título</);
    expect(html).not.toMatch(/color: #F2B705;">Título</);
  });

  it('primária escura: título na primária e texto branco no botão', () => {
    const brand = tenantMailBrand({
      name: 'Igreja Teste 1',
      brandingConfig: { primary_color: '#7A1F2B', secondary_color: null, logo_url: null },
    });
    const html = renderMail(brand, content);

    expect(html).toMatch(/color: #FFFFFF; text-decoration: none; border-radius: 8px;">Abrir</);
    expect(html).toMatch(/color: #7A1F2B;">Título</);
  });
});
