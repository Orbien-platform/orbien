import { registerDecorator, type ValidationArguments, type ValidationOptions } from 'class-validator';

/**
 * Validação da cor de marca de um tenant (§6 de `apps/mobile/STYLE-GUIDE.md`).
 *
 * Por que no cadastro, e não só no front: o app já escolhe o par de texto
 * legível sobre a cor que receber (`readableOn`, em
 * `apps/mobile/src/lib/theme/color.ts`), mas isso *mitiga*, não resolve —
 * há consumidor da mesma cor que não tem essa escolha. O
 * `pdf-export.service.ts` usa `primary_color` como **cor de texto sobre
 * papel branco**; uma cor clara demais sai ilegível no PDF e ninguém
 * descobre até alguém imprimir a escala. O guia é explícito: "validar
 * contraste AA contra branco no cadastro da cor (bloquear salvar se
 * falhar) — não deixar pra descobrir em produção".
 *
 * Fórmula de luminância relativa e razão de contraste: WCAG 2.1. É a mesma
 * conta de `apps/mobile/src/lib/theme/color.ts`; duplicada de propósito,
 * porque o CLAUDE.md da raiz proíbe a API importar código dos fronts.
 */

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** AA para texto normal. */
export const AA_CONTRAST = 4.5;

const WHITE = '#ffffff';

export function isHexColor(value: string): boolean {
  return HEX_PATTERN.test(value.trim());
}

function toChannels(hex: string): [number, number, number] {
  const raw = hex.trim().slice(1);
  const full =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

export function relativeLuminance(hex: string): number {
  const linear = toChannels(hex).map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Arredonda para uma decimal, só para a mensagem de erro. */
function ratioLabel(value: number): string {
  return `${Math.round(value * 10) / 10}:1`;
}

/**
 * Aceita `#RGB`/`#RRGGBB`, sem exigir contraste.
 *
 * Para cor cujo uso não é fixo o bastante para se saber contra o que medir
 * — o accent, que é ícone/label sobre superfície clara **e** escura.
 * Exigir AA nas duas rejeitaria o próprio teal da plataforma; quem resolve
 * isso em runtime é o `accentReadable` do app.
 *
 * Vazio/ausente passa, pela mesma razão de `IsAccessibleBrandColor`.
 */
export function IsBrandColor(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isBrandColor',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') return true;
          return typeof value === 'string' && isHexColor(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} deve ser uma cor hexadecimal (ex.: #00B8A2).`;
        },
      },
    });
  };
}

/**
 * Aceita `#RGB`/`#RRGGBB` que mantenha AA (4.5:1) contra branco.
 *
 * A mesma razão cobre os dois usos da cor primária: como **fundo** de CTA
 * com texto branco (web e app) e como **cor de texto** sobre branco (PDF).
 * `contrastRatio(branco, cor)` é simétrico, então é uma checagem só.
 *
 * Campo opcional continua opcional: `undefined`/`null` passa, e quem
 * decide isso é o `@IsOptional()` ao lado. String vazia também passa —
 * é como o front manda "sem cor customizada" (`|| undefined` no payload de
 * `apps/web/src/app/(admin)/configuracoes/page.tsx`), e limpar a cor tem
 * de continuar possível.
 */
export function IsAccessibleBrandColor(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAccessibleBrandColor',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') return true;
          if (typeof value !== 'string' || !isHexColor(value)) return false;
          return contrastRatio(WHITE, value) >= AA_CONTRAST;
        },
        defaultMessage(args: ValidationArguments) {
          const value = args.value;
          if (typeof value !== 'string' || !isHexColor(value)) {
            return `${args.property} deve ser uma cor hexadecimal (ex.: #1E3A7B).`;
          }
          return (
            `${args.property} tem contraste ${ratioLabel(contrastRatio(WHITE, value))} ` +
            `contra branco, abaixo do mínimo de ${ratioLabel(AA_CONTRAST)} (WCAG AA). ` +
            `Escolha um tom mais escuro.`
          );
        },
      },
    });
  };
}
