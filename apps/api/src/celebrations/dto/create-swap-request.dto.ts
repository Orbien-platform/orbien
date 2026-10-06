import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * `POST /assignments/:id/swap-requests`. Sem `target_profile_id`, o pedido
 * vai para qualquer voluntário do mesmo ministério ("pedir para qualquer um").
 */
export class CreateSwapRequestDto {
  @IsOptional()
  @IsUUID('4')
  target_profile_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  message?: string;
}
