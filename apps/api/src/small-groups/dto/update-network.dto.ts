import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { CreateNetworkDto } from './create-network.dto';

// `OmitType` tira os dois campos de CreateNetworkDto antes do PartialType:
// redeclará-los abaixo como `string | null` sem isso violaria a regra do
// TypeScript de que um override precisa ser um subtipo do campo herdado
// (`string | undefined` não aceita `null`).
export class UpdateNetworkDto extends PartialType(
  OmitType(CreateNetworkDto, ['leader_person_id', 'health_goal_pct'] as const),
) {
  // Limpar o líder ou a meta de saúde (PROD-20, CEL20-07): `null` desvincula/
  // zera explicitamente, valor preenchido atualiza. IsOptional aceita ambos
  // os casos — mesmo padrão de UpdateSmallGroupDto.network_id.
  @IsOptional()
  @IsUUID()
  leader_person_id?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  health_goal_pct?: number | null;
}
