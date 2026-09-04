import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MyAssignmentsQueryDto } from './my-assignments-query.dto';

describe('MyAssignmentsQueryDto', () => {
  it('aceita objeto vazio (includePast é opcional)', async () => {
    const dto = plainToInstance(MyAssignmentsQueryDto, {});
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.includePast).toBeUndefined();
  });

  it('transforma includePast "true" (string) em booleano true', async () => {
    const dto = plainToInstance(MyAssignmentsQueryDto, { includePast: 'true' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.includePast).toBe(true);
  });

  it('transforma includePast boolean true em true', async () => {
    const dto = plainToInstance(MyAssignmentsQueryDto, { includePast: true });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.includePast).toBe(true);
  });

  it('transforma includePast "false" (string) em booleano false', async () => {
    const dto = plainToInstance(MyAssignmentsQueryDto, { includePast: 'false' });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.includePast).toBe(false);
  });
});
