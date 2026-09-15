import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateNetworkDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsUUID()
  leader_person_id?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  health_goal_pct?: number;
}
