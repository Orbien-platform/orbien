import { registerDecorator, type ValidationArguments, type ValidationOptions } from 'class-validator';

/**
 * `period_end` não pode ser anterior a `period_start`. Datas que nem parseiam
 * ficam a cargo do `@IsDateString()` do próprio campo — aqui só se compara
 * quando as duas existem.
 */
export function IsNotBeforePeriodStart(options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isNotBeforePeriodStart',
      target: object.constructor,
      propertyName,
      options: {
        message: 'period_end não pode ser anterior a period_start',
        ...options,
      },
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          const startRaw = (args.object as { period_start?: unknown }).period_start;
          if (typeof value !== 'string' || typeof startRaw !== 'string') return true;
          const end = Date.parse(value);
          const start = Date.parse(startRaw);
          if (Number.isNaN(end) || Number.isNaN(start)) return true;
          return end >= start;
        },
      },
    });
  };
}
