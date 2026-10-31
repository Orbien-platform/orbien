import { IsDateString, IsOptional } from 'class-validator';

export class ApplyKidsTemplateDto {
  // Janela das instâncias. Sem `date_from`, vale a partir de hoje; sem
  // `date_to`, até a última instância já gerada.
  @IsOptional() @IsDateString() date_from?: string;
  @IsOptional() @IsDateString() date_to?: string;
}
