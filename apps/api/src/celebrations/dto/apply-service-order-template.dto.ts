import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class ApplyServiceOrderTemplateDto {
  @IsUUID()
  service_order_id!: string;

  /** Apaga as etapas atuais (e as setlists delas) antes de aplicar. Sem isto,
   * as etapas do molde entram depois das que já existem. */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}
