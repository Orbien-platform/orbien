import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';

export class CreatePixSubscriptionDto {
  @IsUUID('4')
  @IsNotEmpty()
  donor_person_id!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  description?: string;
}
