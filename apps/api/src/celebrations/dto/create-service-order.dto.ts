import { IsString, IsUUID } from 'class-validator';

export class CreateServiceOrderDto {
  @IsUUID()
  celebration_instance_id!: string;

  @IsString()
  title!: string;
}
