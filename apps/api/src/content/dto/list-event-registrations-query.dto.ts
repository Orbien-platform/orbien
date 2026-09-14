import { IsIn, IsOptional } from 'class-validator';
import { EventRegistrationStatus } from '@prisma/client';

const STATUSES = ['confirmed', 'waitlisted', 'cancelled'] as const;

export class ListEventRegistrationsQueryDto {
  /**
   * Sem filtro, a listagem traz confirmadas e em espera, e **não** as
   * canceladas: a lista do organizador é quem vai ao evento, e o cancelamento
   * é histórico. Pedir `cancelled` explicitamente traz só elas.
   */
  @IsOptional()
  @IsIn(STATUSES)
  status?: EventRegistrationStatus;
}
