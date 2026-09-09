import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { IsOptional, IsString } from 'class-validator';

import {
  AA_CONTRAST,
  contrastRatio,
  isHexColor,
  IsAccessibleBrandColor,
  IsBrandColor,
  relativeLuminance,
} from './brand-color.validator';

class Subject {
  @IsOptional() @IsString() @IsAccessibleBrandColor() primary_color?: string;
  @IsOptional() @IsString() @IsBrandColor() accent_color?: string;
}

async function errorsFor(payload: Record<string, unknown>) {
  const instance = plainToInstance(Subject, payload);
  const errors = await validate(instance);
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

describe('conta de contraste', () => {
  it('luminância vai de 0 (preto) a 1 (branco)', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('preto no branco é 21:1, e a razão não depende da ordem', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
  });

  it('forma curta e longa do mesmo hex dão o mesmo valor', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 10);
  });

  it('bate com a mesma conta do app mobile para o navy da marca', () => {
    // apps/mobile/src/lib/theme/color.test.ts afirma o mesmo par: as duas
    // implementações são duplicadas de propósito (a API não importa código
    // dos fronts) e têm de concordar.
    expect(contrastRatio('#ffffff', '#1E3A7B')).toBeGreaterThanOrEqual(AA_CONTRAST);
    expect(contrastRatio('#ffffff', '#00B8A2')).toBeLessThan(AA_CONTRAST);
  });
});

describe('isHexColor', () => {
  it.each(['#fff', '#FFF', '#1E3A7B', '#1e3a7b', '  #1e3a7b  '])('aceita %s', (value) => {
    expect(isHexColor(value)).toBe(true);
  });

  it.each(['1e3a7b', '#12345', 'navy', 'rgb(30,58,123)', '#1e3a7bff'])(
    'rejeita %s',
    (value) => {
      expect(isHexColor(value)).toBe(false);
    },
  );
});

describe('primary_color — AA contra branco (§6 do STYLE-GUIDE.md)', () => {
  it('aceita o navy da plataforma', async () => {
    await expect(errorsFor({ primary_color: '#1E3A7B' })).resolves.toEqual([]);
  });

  it('aceita outros tons escuros de marca', async () => {
    await expect(errorsFor({ primary_color: '#7C2D12' })).resolves.toEqual([]);
    await expect(errorsFor({ primary_color: '#0F766E' })).resolves.toEqual([]);
  });

  it('barra cor clara demais, dizendo o contraste medido e o mínimo', async () => {
    // Amarelo pastel: o caso que o §8 do guia cita como o que mais falha,
    // e que sairia ilegível no PDF (pdf-export usa primary_color como cor
    // de texto sobre papel branco).
    const errors = await errorsFor({ primary_color: '#FDE68A' });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('primary_color');
    expect(errors[0]).toContain('4.5:1');
    expect(errors[0]).toContain('WCAG AA');
    expect(errors[0]).toContain('tom mais escuro');
  });

  it('barra o teal da plataforma como primária — não passa AA sobre branco', async () => {
    const errors = await errorsFor({ primary_color: '#00B8A2' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('abaixo do mínimo');
  });

  it('formato inválido tem mensagem de formato, não de contraste', async () => {
    const errors = await errorsFor({ primary_color: 'azul' });
    expect(errors.join(' ')).toContain('cor hexadecimal');
    expect(errors.join(' ')).not.toContain('WCAG');
  });

  it('ausente ou vazio passa — limpar a cor tem de continuar possível', async () => {
    await expect(errorsFor({})).resolves.toEqual([]);
    await expect(errorsFor({ primary_color: '' })).resolves.toEqual([]);
  });
});

describe('accent_color — só formato', () => {
  it('aceita o teal da plataforma, que NÃO passa AA sobre branco', async () => {
    // É o ponto do desenho: exigir AA aqui rejeitaria o accent da própria
    // plataforma. Quem degrada em runtime é o `accentReadable` do app.
    expect(contrastRatio('#ffffff', '#00B8A2')).toBeLessThan(AA_CONTRAST);
    await expect(errorsFor({ accent_color: '#00B8A2' })).resolves.toEqual([]);
  });

  it('aceita accent claro (âmbar), que a regra da primária barraria', async () => {
    await expect(errorsFor({ accent_color: '#F59E0B' })).resolves.toEqual([]);
  });

  it('barra formato inválido', async () => {
    const errors = await errorsFor({ accent_color: 'dourado' });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('cor hexadecimal');
  });

  it('ausente ou vazio passa', async () => {
    await expect(errorsFor({ accent_color: '' })).resolves.toEqual([]);
  });
});
