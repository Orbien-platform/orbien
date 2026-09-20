import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AgeRangeDto {
  @IsInt() @Min(0) min!: number;
  @IsInt() @Min(0) max!: number;
}

/** Sem sinal de engajamento (visita, presença em célula, abertura de material) há N dias — inclui quem nunca teve nenhum. */
export class InactiveSinceDto {
  @IsInt() @Min(1) days!: number;
}

/** Sem `AttendanceRecord` (presença em `GroupMeeting`) há N dias — inclui quem nunca teve presença registrada. */
export class GroupAttendanceGapDto {
  @IsInt() @Min(1) days!: number;
}

/** `min_events` ou mais sinais de engajamento (visita + presença + abertura de material) nos últimos `days` dias. */
export class HighEngagementDto {
  @IsInt() @Min(1) days!: number;
  @IsInt() @Min(1) min_events!: number;
}

export class SegmentCriteriaDto {
  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  congregation_ids?: string[];

  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  group_ids?: string[];

  @IsOptional() @IsArray() @IsUUID('4', { each: true })
  ministry_ids?: string[];

  @IsOptional() @ValidateNested() @Type(() => AgeRangeDto)
  age_range?: AgeRangeDto;

  @IsOptional() @IsArray() @IsString({ each: true })
  roles?: string[];

  // ── Comportamento/engajamento/inatividade (PROD-17, Premium) ──────────────
  // Resolvidos por consulta direta (VisitRecord/AttendanceRecord/
  // MaterialOpenRecord), não por tag do OneSignal — ver o cabeçalho de
  // `NotificationsService.resolveExternalUserIds`. Não existe sinal
  // por-pessoa de abertura de notificação no schema (NotificationDispatch.
  // reached/opened é agregado por disparo, não por destinatário), por isso
  // não há um critério "abriu/não abriu notificação".

  @IsOptional() @ValidateNested() @Type(() => InactiveSinceDto)
  inactive_since?: InactiveSinceDto;

  @IsOptional() @ValidateNested() @Type(() => GroupAttendanceGapDto)
  group_attendance_gap?: GroupAttendanceGapDto;

  @IsOptional() @ValidateNested() @Type(() => HighEngagementDto)
  high_engagement?: HighEngagementDto;
}

/**
 * Verdadeiro quando `criteria` usa algum critério avançado (comportamento/
 * engajamento/inatividade) — os três que `SegmentsService` exige Premium
 * para gravar e que `NotificationsService` resolve por consulta direta em
 * vez de tag do OneSignal.
 */
export function hasBehaviorCriteria(criteria: {
  inactive_since?: unknown;
  group_attendance_gap?: unknown;
  high_engagement?: unknown;
}): boolean {
  return Boolean(
    criteria.inactive_since || criteria.group_attendance_gap || criteria.high_engagement,
  );
}
