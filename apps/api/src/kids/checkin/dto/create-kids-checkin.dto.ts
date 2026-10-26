import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CreateKidsCheckinDto {
  @IsUUID()
  child_id!: string;

  // Quem ENTREGA a criança: um KidsGuardian dela. Obrigatório (AC 1b).
  @IsUUID()
  guardian_person_id!: string;

  @IsOptional()
  @IsBoolean()
  confirm_out_of_range?: boolean;
}
