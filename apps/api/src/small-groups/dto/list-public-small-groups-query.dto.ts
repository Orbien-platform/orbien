import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ListPublicSmallGroupsQueryDto {
  // Único parâmetro da rota pública: a igreja. Nada de filtro vem do cliente
  // aqui — quem filtra (busca por texto, tipo de célula, proximidade) é a
  // página, sobre a lista que esta rota devolve. A alternativa (filtro no
  // servidor) só valeria com volume que uma igreja não tem, e cada filtro
  // novo seria mais superfície pública para validar.
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  tenant_slug!: string;
}
