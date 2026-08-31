import { IsDate, IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { TransactionType } from '@prisma/client';

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsEnum(TransactionType)
  type?: TransactionType;

  @IsOptional()
  @IsUUID('4')
  category_id?: string;

  @IsOptional()
  @IsUUID('4')
  donor_person_id?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  since?: Date;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  until?: Date;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit: number = 20;
}
