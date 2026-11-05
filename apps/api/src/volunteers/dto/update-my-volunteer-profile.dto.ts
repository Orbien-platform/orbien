import { IsNotEmpty, IsObject, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DayAvailabilityDto, DayKey, Slot } from './create-volunteer-profile.dto';

/**
 * `PATCH /volunteers/me/profile` — o que o voluntário edita do próprio perfil:
 * só a disponibilidade semanal. Habilidade e restrições seguem da liderança
 * (decisão do dono, PROD-36). Com `forbidNonWhitelisted` (main.ts), mandar
 * `skills`, `restrictions` ou `person_id` é 400 — não é ignorado em silêncio.
 */
export class UpdateMyVolunteerProfileDto {
  @IsObject()
  @ValidateNested()
  @Type(() => DayAvailabilityDto)
  availability!: Partial<Record<DayKey, Slot[]>>;
}

export class AcceptVolunteerTermDto {
  /** Versão que o app mostrou; tem de ser a vigente (409 se o termo mudou). */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  term_version!: string;
}
