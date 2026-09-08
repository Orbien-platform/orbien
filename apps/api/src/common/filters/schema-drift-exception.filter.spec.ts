import { ArgumentsHost, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SchemaDriftExceptionFilter } from './schema-drift-exception.filter';

function hostWith(): {
  host: ArgumentsHost;
  status: jest.Mock;
  json: jest.Mock;
} {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ method: 'GET', url: '/api/songs' }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

function prismaError(
  code: string,
  meta?: Record<string, unknown>,
): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('boom', {
    code,
    clientVersion: '6.0.0',
    meta,
  });
}

describe('SchemaDriftExceptionFilter', () => {
  let filter: SchemaDriftExceptionFilter;
  let logged: string[];

  beforeEach(() => {
    filter = new SchemaDriftExceptionFilter();
    logged = [];
    jest.spyOn(Logger.prototype, 'error').mockImplementation((msg: unknown) => {
      logged.push(String(msg));
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('responde 503 quando a tabela não existe (P2021)', () => {
    const { host, status, json } = hostWith();

    filter.catch(prismaError('P2021', { table: 'public.songs' }), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.SERVICE_UNAVAILABLE,
        message: expect.stringContaining('migration pendente'),
      }),
    );
    // Nome da tabela vai para o log, não para o corpo da resposta.
    expect(logged[0]).toContain('tabela public.songs');
    expect(logged[0]).toContain('GET /api/songs');
    expect(JSON.stringify(json.mock.calls[0])).not.toContain('songs');
  });

  it('responde 503 quando a coluna não existe (P2022)', () => {
    const { host, status, json } = hostWith();

    filter.catch(prismaError('P2022', { column: 'songs.key_alt' }), host);

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(json).toHaveBeenCalled();
    expect(logged[0]).toContain('coluna songs.key_alt');
  });

  it('nomeia o alvo como desconhecido quando o Prisma não manda meta', () => {
    const { host } = hostWith();

    filter.catch(prismaError('P2021'), host);
    filter.catch(prismaError('P2022'), host);

    expect(logged[0]).toContain('tabela desconhecida');
    expect(logged[1]).toContain('coluna desconhecida');
  });

  it('delega ao tratamento padrão qualquer outro código do Prisma', () => {
    const { host, status } = hostWith();
    const base = jest
      .spyOn(
        Object.getPrototypeOf(SchemaDriftExceptionFilter.prototype) as {
          catch: (e: unknown, h: ArgumentsHost) => void;
        },
        'catch',
      )
      .mockImplementation(() => undefined);

    const err = prismaError('P2002');
    filter.catch(err, host);

    expect(base).toHaveBeenCalledWith(err, host);
    expect(status).not.toHaveBeenCalled();
    expect(logged).toHaveLength(0);
  });
});
