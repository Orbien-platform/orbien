import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobStatus, Prisma } from '@prisma/client';
import * as XLSX from 'xlsx';
import { ImportResult, PersonsImportService } from './persons-import.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { MailService } from '../../mail/mail.service';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { ImportConfirmDto } from '../dto/import-confirm.dto';

const user: JwtPayload = {
  sub: 'user-1',
  tenant_id: 'tenant-1',
  congregation_id: 'cong-1',
  roles: ['secretary'],
  plan: 'starter',
};

function fileOf(content: string, name = 'pessoas.csv'): Express.Multer.File {
  return {
    originalname: name,
    buffer: Buffer.from(content, 'utf-8'),
    size: Buffer.byteLength(content, 'utf-8'),
    mimetype: 'text/csv',
  } as Express.Multer.File;
}

function serviceWith() {
  const personClient = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: { data: { full_name: string } }) => ({
      id: `person-${data.full_name}`,
    })),
  };
  const consentRecordClient = { create: jest.fn().mockResolvedValue({}) };
  // A auditoria vai por `audit_insert()` no client BASE — `audit_logs` não
  // tem policy de INSERT para `app_user`. Ver
  // `src/common/audit/write-audit-log.ts`.
  const auditRaw = jest.fn().mockResolvedValue(1);
  const importJobClient = {
    create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };
  // Escritas de conta de acesso (grant de acesso no import) só passam por
  // `prisma.system`, igual `UsersService.create` — ver comentário no service.
  const userAccountClient = {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn(async ({ data }: { data: { email: string } }) => ({
      id: `account-${data.email}`,
      email: data.email,
    })),
  };
  const roleAssignmentClient = { create: jest.fn().mockResolvedValue({}) };
  const passwordResetTokenClient = { create: jest.fn().mockResolvedValue({}) };

  // Marca do tenant para o convite — lida pelo `db` da importação.
  const tenantClient = {
    findUnique: jest.fn().mockResolvedValue({ name: 'Igreja Teste 1', brandingConfig: null }),
  };

  const client = {
    tenant: tenantClient,
    person: personClient,
    consentRecord: consentRecordClient,
    importJob: importJobClient,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const system: any = {
    tenant: tenantClient,
    person: personClient,
    consentRecord: consentRecordClient,
    importJob: { ...importJobClient, update: jest.fn().mockResolvedValue({}) },
    userAccount: userAccountClient,
    roleAssignment: roleAssignmentClient,
    passwordResetToken: passwordResetTokenClient,
  };
  // `sysTx` recebe o mesmo objeto mockado — os testes chamam os métodos
  // diretamente em `system.*`, tanto dentro quanto fora da transação.
  system['$transaction'] = jest.fn((cb: (tx: unknown) => unknown) => cb(system));

  const prisma = { client, system, $executeRaw: auditRaw } as unknown as PrismaService;
  const storage = {
    upload: jest.fn().mockResolvedValue('https://cdn.test/file'),
    downloadBuffer: jest.fn(),
  } as unknown as jest.Mocked<StorageService>;
  const mail = {
    sendInvite: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<MailService>;

  return {
    service: new PersonsImportService(prisma, storage, mail),
    storage,
    client,
    system,
    auditRaw,
    mail,
    userAccountClient,
    roleAssignmentClient,
    passwordResetTokenClient,
  };
}

const VALID_CSV = [
  'nome,telefone,email,sexo,nascimento,classificação',
  'Ana Silva,(11) 98765-4321,ana@test.com,F,15/01/1990,membro',
].join('\n');

const MAPPING: ImportConfirmDto['mapping'] = {
  nome: 'nome',
  telefone: 'telefone',
  email: 'email',
  sexo: 'sexo',
  birth_date: 'nascimento',
  classificação: 'classificação',
};

describe('PersonsImportService', () => {
  describe('preview', () => {
    it('rejeita extensão não suportada', async () => {
      const { service } = serviceWith();
      await expect(service.preview(fileOf(VALID_CSV, 'pessoas.pdf'), 'tenant-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejeita arquivo maior que 10 MB', async () => {
      const { service } = serviceWith();
      const file = fileOf(VALID_CSV);
      Object.assign(file, { size: 11 * 1024 * 1024 });
      await expect(service.preview(file, 'tenant-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita arquivo vazio (só cabeçalho, sem linhas)', async () => {
      const { service } = serviceWith();
      const emptyCsv = 'nome,telefone,email,sexo,nascimento,classificação\n';
      await expect(service.preview(fileOf(emptyCsv), 'tenant-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejeita arquivo com mais de 5.000 linhas (DT-06)', async () => {
      const { service } = serviceWith();
      const header = 'nome,telefone,email,sexo,nascimento,classificação';
      const linhas = Array.from({ length: 5001 }, (_, i) => `Pessoa ${i},,,,,`);
      const csv = [header, ...linhas].join('\n');

      await expect(service.preview(fileOf(csv), 'tenant-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lê colunas, sugere mapeamento e sobe o arquivo temporário', async () => {
      const { service, storage } = serviceWith();

      const result = await service.preview(fileOf(VALID_CSV), 'tenant-1');

      expect(result.total_rows).toBe(1);
      expect(result.detected_columns).toEqual([
        'nome',
        'telefone',
        'email',
        'sexo',
        'nascimento',
        'classificação',
      ]);
      expect(result.suggested_mapping).toEqual({
        nome: 'nome',
        telefone: 'telefone',
        email: 'email',
        sexo: 'sexo',
        birth_date: 'nascimento',
        classificação: 'classificação',
      });
      expect(result.preview_rows).toHaveLength(1);
      expect(result.file_id).toMatch(/\.csv$/);
      expect(storage.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.stringContaining('imports/temp/tenant-1/'),
        'text/csv',
      );
    });

    it('normaliza cabeçalho com acentuação/encoding (Classificação → classificação)', async () => {
      const { service } = serviceWith();
      const csv = ['Nome,Telefone,E-mail,Gênero,Data Nascimento,Classificação', 'Bia,11999998888,,F,,'].join(
        '\n',
      );

      const result = await service.preview(fileOf(csv), 'tenant-1');

      expect(result.suggested_mapping).toEqual(
        expect.objectContaining({
          nome: 'Nome',
          telefone: 'Telefone',
          email: 'E-mail',
          sexo: 'Gênero',
          classificação: 'Classificação',
        }),
      );
    });

    it('duas colunas que apontam para o mesmo campo canônico: mantém a primeira detectada', async () => {
      const { service } = serviceWith();
      // "nome" e "nome completo" normalizam para o mesmo canônico (`nome`) —
      // o mapeamento sugerido não deve sobrescrever a primeira coluna já
      // resolvida pela segunda.
      const csv = ['nome,nome completo,telefone', 'Ana,Ana Completa,11999998888'].join('\n');

      const result = await service.preview(fileOf(csv), 'tenant-1');

      expect(result.suggested_mapping.nome).toBe('nome');
    });
  });

  describe('confirm', () => {
    it('rejeita file_id com extensão inválida', async () => {
      const { service } = serviceWith();
      await expect(
        service.confirm({ file_id: 'arquivo.exe', mapping: MAPPING }, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lança NotFoundException quando o arquivo temporário não existe/expirou', async () => {
      const { service, storage } = serviceWith();
      storage.downloadBuffer.mockRejectedValue(new Error('not found'));

      await expect(
        service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejeita arquivo sem linhas de dados', async () => {
      const { service, storage } = serviceWith();
      storage.downloadBuffer.mockResolvedValue(
        Buffer.from('nome,telefone,email,sexo,nascimento,classificação\n', 'utf-8'),
      );

      await expect(
        service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('importa pessoa válida de forma síncrona (≤500 linhas) e grava consentimento', async () => {
      const { service, storage, client } = serviceWith();
      storage.downloadBuffer.mockResolvedValue(Buffer.from(VALID_CSV, 'utf-8'));

      const result = await service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user);

      expect(result).toEqual({ imported: 1, skipped: 0, errors: [] });
      expect(client.person.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          full_name: 'Ana Silva',
          phone: '+5511987654321',
          email: 'ana@test.com',
          gender: 'female',
          classification: 'member',
        }),
        select: { id: true },
      });
      expect(client.consentRecord.create).toHaveBeenCalled();
    });

    it('linha com e-mail válido e ainda não usado ganha acesso ao app (conta + papel member + convite)', async () => {
      const { service, storage, system, mail, userAccountClient, roleAssignmentClient, passwordResetTokenClient } =
        serviceWith();
      storage.downloadBuffer.mockResolvedValue(Buffer.from(VALID_CSV, 'utf-8'));

      const result = await service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user);

      expect(result).toEqual({ imported: 1, skipped: 0, errors: [] });
      expect(system.$transaction).toHaveBeenCalled();
      expect(userAccountClient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          email: 'ana@test.com',
        }),
      });
      expect(roleAssignmentClient.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ role_code: 'member' }),
      });
      expect(passwordResetTokenClient.create).toHaveBeenCalled();
      expect(mail.sendInvite).toHaveBeenCalledWith(
        'ana@test.com',
        expect.stringContaining('/redefinir-senha?token='),
        expect.objectContaining({ kind: 'tenant', name: 'Igreja Teste 1' }),
      );
    });

    it('não serializa o loop atrás do envio do convite — a linha seguinte não espera o e-mail da anterior', async () => {
      const { service, storage, mail, userAccountClient } = serviceWith();
      let resolveFirstInvite: () => void = () => {};
      (mail.sendInvite as jest.Mock)
        .mockImplementationOnce(
          () =>
            new Promise<void>((resolve) => {
              resolveFirstInvite = resolve;
            }),
        )
        .mockResolvedValue(undefined);
      const csv = [
        'nome,telefone,email',
        'Primeira,11988880001,primeira@test.com',
        'Segunda,11988880002,segunda@test.com',
      ].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const confirmPromise = service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
        user,
      );

      // O convite da primeira linha ainda está pendente (nunca resolvido),
      // mas a segunda linha já deve ter sido processada — sem isso, o loop
      // estaria serializado atrás do `await` do envio de e-mail. Espera em
      // pequenos passos até a condição bater, sem depender de um número
      // fixo de voltas da fila de eventos.
      for (let i = 0; i < 300 && userAccountClient.create.mock.calls.length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      expect(userAccountClient.create).toHaveBeenCalledTimes(2);

      resolveFirstInvite();
      const result = await confirmPromise;
      expect(result).toEqual({ imported: 2, skipped: 0, errors: [] });
    }, 15000);

    it('linha sem e-mail não ganha conta', async () => {
      const { service, storage, client, userAccountClient } = serviceWith();
      const csv = ['nome,telefone', 'Sem Email,11988887777'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect((result as ImportResult).imported).toBe(1);
      expect(client.person.create).toHaveBeenCalled();
      expect(userAccountClient.create).not.toHaveBeenCalled();
    });

    it('linha com e-mail em formato inválido não ganha conta, mas a pessoa é importada', async () => {
      const { service, storage, client, userAccountClient, mail } = serviceWith();
      const csv = ['nome,telefone,email', 'Email Ruim,11988887777,não-é-email'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
        user,
      );

      expect((result as ImportResult).imported).toBe(1);
      expect(client.person.create).toHaveBeenCalled();
      expect(userAccountClient.create).not.toHaveBeenCalled();
      expect(mail.sendInvite).not.toHaveBeenCalled();
    });

    it('e-mail já usado por outra conta pula a criação de conta e segue o import só com o cadastro', async () => {
      const { service, storage, client, userAccountClient, mail } = serviceWith();
      userAccountClient.findFirst.mockResolvedValue({ id: 'existing-account' });
      const csv = ['nome,telefone,email', 'Ja Tem Conta,11988887777,ja@existe.com'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
        user,
      );

      expect((result as ImportResult).imported).toBe(1);
      expect(client.person.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'ja@existe.com' }) }),
      );
      expect(userAccountClient.create).not.toHaveBeenCalled();
      expect(mail.sendInvite).not.toHaveBeenCalled();
    });

    it('duas linhas do mesmo arquivo com o mesmo e-mail: só a primeira ganha conta', async () => {
      const { service, storage, userAccountClient } = serviceWith();
      const csv = [
        'nome,telefone,email',
        'Primeira,11988880001,repetido@test.com',
        'Segunda,11988880002,repetido@test.com',
      ].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
        user,
      );

      expect((result as ImportResult).imported).toBe(2);
      expect(userAccountClient.create).toHaveBeenCalledTimes(1);
    });

    it('corrida no e-mail (P2002 na escrita da conta) segue o import só com o cadastro, sem contar como erro', async () => {
      const { service, storage, userAccountClient, client } = serviceWith();
      userAccountClient.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('e-mail duplicado', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const csv = ['nome,telefone,email', 'Corrida,11988887777,corrida@test.com'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
        user,
      );

      expect(result).toEqual({ imported: 1, skipped: 0, errors: [] });
      expect(client.person.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'corrida@test.com' }) }),
      );
    });

    it('erro não-P2002 na transação de conta é erro da linha (não vira "sem conta, segue o import")', async () => {
      const { service, storage, userAccountClient, system } = serviceWith();
      userAccountClient.create.mockRejectedValueOnce(new Error('conexão caiu no meio da transação'));
      const csv = ['nome,telefone,email', 'Falha Real,11988887777,falha@test.com'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
        user,
      );

      expect(result).toEqual({
        imported: 0,
        skipped: 0,
        errors: [{ row: 2, reason: 'conexão caiu no meio da transação' }],
      });
      // Nem o fallback de "só cadastro" roda — o erro não é de e-mail
      // duplicado, então a linha inteira falha.
      expect(system.roleAssignment.create).not.toHaveBeenCalled();
    });

    it('erro não-P2002 e que não é instância de Error ainda vira mensagem de texto', async () => {
      const { service, storage, userAccountClient } = serviceWith();
      userAccountClient.create.mockRejectedValueOnce('motivo em string, não Error');
      const csv = ['nome,telefone,email', 'Falha String,11988887777,falhastring@test.com'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
        user,
      );

      expect(result).toEqual({
        imported: 0,
        skipped: 0,
        errors: [{ row: 2, reason: 'motivo em string, não Error' }],
      });
    });

    it('falha no envio do convite é logada e não impede a linha de contar como importada', async () => {
      const { service, storage, mail } = serviceWith();
      mail.sendInvite.mockRejectedValueOnce(new Error('Resend fora do ar'));
      const loggerErrorSpy = jest.spyOn(
        (service as unknown as { logger: { error: (msg: string) => void } }).logger,
        'error',
      );
      const csv = ['nome,telefone,email', 'Convite Falho,11988887777,convitefalho@test.com'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
        user,
      );

      expect(result).toEqual({ imported: 1, skipped: 0, errors: [] });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Falha ao enviar convite de acesso para convitefalho@test.com'),
      );
    });

    it('falha no envio do convite que não é instância de Error ainda é logada como texto', async () => {
      const { service, storage, mail } = serviceWith();
      mail.sendInvite.mockRejectedValueOnce('motivo em string, não Error');
      const loggerErrorSpy = jest.spyOn(
        (service as unknown as { logger: { error: (msg: string) => void } }).logger,
        'error',
      );
      const csv = ['nome,telefone,email', 'Convite String,11988887777,convitestring@test.com'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
        user,
      );

      expect(result).toEqual({ imported: 1, skipped: 0, errors: [] });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Falha ao enviar convite de acesso para convitestring@test.com (linha 2): motivo em string, não Error',
        ),
      );
    });

    it('cai no default de localhost quando FRONTEND_URL não está definida', async () => {
      const original = process.env['FRONTEND_URL'];
      delete process.env['FRONTEND_URL'];
      try {
        const { service, storage, mail } = serviceWith();
        const csv = ['nome,telefone,email', 'Ana Local,11988887777,analocal@test.com'].join('\n');
        storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

        await service.confirm(
          { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
          user,
        );

        expect(mail.sendInvite).toHaveBeenCalledWith(
          'analocal@test.com',
          expect.stringContaining('http://localhost:3001/redefinir-senha?token='),
        expect.objectContaining({ kind: 'tenant', name: 'Igreja Teste 1' }),
      );
      } finally {
        if (original === undefined) delete process.env['FRONTEND_URL'];
        else process.env['FRONTEND_URL'] = original;
      }
    });

    it('usa FRONTEND_URL do ambiente no link do convite, em vez do default de localhost', async () => {
      const original = process.env['FRONTEND_URL'];
      process.env['FRONTEND_URL'] = 'https://app.orbien.com.br';
      try {
        const { service, storage, mail } = serviceWith();
        const csv = ['nome,telefone,email', 'Ana Prod,11988887777,anaprod@test.com'].join('\n');
        storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

        await service.confirm(
          { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
          user,
        );

        expect(mail.sendInvite).toHaveBeenCalledWith(
          'anaprod@test.com',
          expect.stringContaining('https://app.orbien.com.br/redefinir-senha?token='),
        expect.objectContaining({ kind: 'tenant', name: 'Igreja Teste 1' }),
      );
      } finally {
        if (original === undefined) delete process.env['FRONTEND_URL'];
        else process.env['FRONTEND_URL'] = original;
      }
    });

    it('reporta linha com coluna de nome faltando', async () => {
      const { service, storage } = serviceWith();
      const csv = ['nome,telefone', ',11999998888'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect((result as ImportResult).imported).toBe(0);
      expect((result as ImportResult).errors).toEqual([{ row: 2, reason: 'missing_name' }]);
    });

    it('reporta linha sem telefone e sem email (telefone inválido/ausente)', async () => {
      const { service, storage } = serviceWith();
      const csv = ['nome,telefone', 'Sem Contato,'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect((result as ImportResult).errors).toEqual([{ row: 2, reason: 'missing_phone_and_email' }]);
    });

    it('pula linha duplicada (telefone já cadastrado no tenant)', async () => {
      const { service, storage, client } = serviceWith();
      client.person.findFirst.mockResolvedValue({ id: 'existing' });
      storage.downloadBuffer.mockResolvedValue(Buffer.from(VALID_CSV, 'utf-8'));

      const result = await service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user);

      expect(result).toEqual({ imported: 0, skipped: 1, errors: [] });
      expect(client.person.create).not.toHaveBeenCalled();
    });

    it('registra erro da linha sem interromper as demais quando a criação falha', async () => {
      const { service, storage, client } = serviceWith();
      const csv = [
        'nome,telefone',
        'Falha Aqui,11911112222',
        'Sucesso Aqui,11933334444',
      ].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));
      client.person.create
        .mockRejectedValueOnce(new Error('violação de constraint'))
        .mockResolvedValueOnce({ id: 'ok' });

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect((result as ImportResult).imported).toBe(1);
      expect((result as ImportResult).errors).toEqual([{ row: 2, reason: 'violação de constraint' }]);
    });

    it('linha cujo erro de criação não é uma instância de Error ainda vira mensagem de texto', async () => {
      const { service, storage, client } = serviceWith();
      const csv = ['nome,telefone', 'Falha Não-Error,11911113333'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));
      client.person.create.mockRejectedValueOnce('motivo em string, não Error');

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect((result as ImportResult).errors).toEqual([
        { row: 2, reason: 'motivo em string, não Error' },
      ]);
    });

    it('aceita data no formato BR (DD/MM/YYYY)', async () => {
      const { service, storage, client } = serviceWith();
      storage.downloadBuffer.mockResolvedValue(Buffer.from(VALID_CSV, 'utf-8'));

      await service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user);

      const call = client.person.create.mock.calls[0][0] as { data: { birth_date?: Date } };
      expect(call.data.birth_date).toBeInstanceOf(Date);
      expect(call.data.birth_date!.getUTCFullYear()).toBe(1990);
    });

    it('aceita data em formato ISO (parseável diretamente por `new Date`)', async () => {
      const { service, storage, client } = serviceWith();
      const csv = ['nome,telefone,nascimento', 'Bia,11999998888,1990-06-15'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', birth_date: 'nascimento' } },
        user,
      );

      const call = client.person.create.mock.calls[0][0] as { data: { birth_date?: Date } };
      expect(call.data.birth_date).toBeInstanceOf(Date);
      expect(call.data.birth_date!.getUTCFullYear()).toBe(1990);
      expect(call.data.birth_date!.getUTCMonth()).toBe(5); // junho, 0-indexado
    });

    it('parseDate() com string vazia (chamada direta) devolve undefined — guarda defensiva', () => {
      const { service } = serviceWith();
      const parseDate = (
        service as unknown as { parseDate: (raw: string) => Date | undefined }
      ).parseDate.bind(service);

      expect(parseDate('')).toBeUndefined();
    });

    it('telefone que já vem com código de país não ganha +55 duplicado', async () => {
      const { service, storage, client } = serviceWith();
      const csv = ['nome,telefone', 'Internacional,5511998887766'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      const call = client.person.create.mock.calls[0][0] as { data: { phone?: string } };
      expect(call.data.phone).toBe('+5511998887766');
    });

    it('linha com email mas sem telefone pula a deduplicação por telefone', async () => {
      const { service, storage, client } = serviceWith();
      const csv = ['nome,telefone,email', 'Só Email,,soemail@test.com'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', email: 'email' } },
        user,
      );

      expect((result as ImportResult).imported).toBe(1);
      expect(client.person.findFirst).not.toHaveBeenCalled();
      const call = client.person.create.mock.calls[0][0] as { data: { phone?: string; email?: string } };
      expect(call.data.phone).toBeUndefined();
      expect(call.data.email).toBe('soemail@test.com');
    });

    it('mapping vazio (nenhuma coluna mapeada) reporta linha sem nome', async () => {
      const { service, storage } = serviceWith();
      storage.downloadBuffer.mockResolvedValue(Buffer.from(VALID_CSV, 'utf-8'));

      const result = await service.confirm({ file_id: 'arquivo.csv', mapping: {} }, user);

      expect(result).toEqual({ imported: 0, skipped: 0, errors: [{ row: 2, reason: 'missing_name' }] });
    });

    it('mapping aponta para coluna que não existe no arquivo (coluna faltando)', async () => {
      const { service, storage, client } = serviceWith();
      // O arquivo só tem uma coluna irrelevante — todo o mapeamento aponta
      // para nomes de coluna que o arquivo não tem.
      const csv = ['outra_coluna', 'qualquer valor'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        {
          file_id: 'arquivo.csv',
          mapping: {
            nome: 'nome_que_nao_existe',
            telefone: 'telefone_que_nao_existe',
            email: 'email_que_nao_existe',
            sexo: 'sexo_que_nao_existe',
            birth_date: 'nascimento_que_nao_existe',
            classificação: 'classificacao_que_nao_existe',
          },
        },
        user,
      );

      expect(result).toEqual({ imported: 0, skipped: 0, errors: [{ row: 2, reason: 'missing_name' }] });
      expect(client.person.create).not.toHaveBeenCalled();
    });

    it('classificação desconhecida cai no default visitor', async () => {
      const { service, storage, client } = serviceWith();
      const csv = ['nome,telefone,classificação', 'Ana,11999998888,????'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', classificação: 'classificação' } },
        user,
      );

      const call = client.person.create.mock.calls[0][0] as { data: { classification?: string } };
      expect(call.data.classification).toBe('visitor');
    });

    it('mapeia gênero (masculino) e classificação attendee a partir de texto livre', async () => {
      const { service, storage, client } = serviceWith();
      const csv = ['nome,telefone,sexo,classificação', 'Beto,11999998888,Masculino,Frequentador'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      await service.confirm(
        {
          file_id: 'arquivo.csv',
          mapping: { nome: 'nome', telefone: 'telefone', sexo: 'sexo', classificação: 'classificação' },
        },
        user,
      );

      const call = client.person.create.mock.calls[0][0] as {
        data: { gender?: string; classification?: string };
      };
      expect(call.data.gender).toBe('male');
      expect(call.data.classification).toBe('attendee');
    });

    it('mapeia todas as variações reconhecidas de gênero e classificação', async () => {
      const { service, storage, client } = serviceWith();
      // Cada linha usa um telefone distinto para não colidir na deduplicação,
      // e exercita um rótulo textual diferente de sexo/classificação — é o
      // jeito de cobrir cada `case` dos switches de mapGender/mapClassification.
      const rows = [
        ['Pessoa M', '11900000001', 'm', ''],
        ['Pessoa Male', '11900000002', 'male', ''],
        ['Pessoa Homem', '11900000003', 'homem', ''],
        ['Pessoa F', '11900000004', 'f', ''],
        ['Pessoa Feminino', '11900000005', 'feminino', ''],
        ['Pessoa Female', '11900000006', 'female', ''],
        ['Pessoa Mulher', '11900000007', 'mulher', ''],
        ['Pessoa Outro', '11900000008', 'outro', ''],
        ['Pessoa Other', '11900000009', 'other', ''],
        ['Pessoa Sem Genero', '11900000010', '', ''],
        ['Pessoa Membro', '11900000011', '', 'membro'],
        ['Pessoa Attendee', '11900000012', '', 'attendee'],
      ];
      const csv = ['nome,telefone,sexo,classificação', ...rows.map((r) => r.join(','))].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      const result = await service.confirm(
        {
          file_id: 'arquivo.csv',
          mapping: { nome: 'nome', telefone: 'telefone', sexo: 'sexo', classificação: 'classificação' },
        },
        user,
      );

      expect((result as ImportResult).imported).toBe(rows.length);
      const genders = client.person.create.mock.calls.map(
        (c) => (c[0] as { data: { gender?: string } }).data.gender,
      );
      expect(genders).toEqual([
        'male',
        'male',
        'male',
        'female',
        'female',
        'female',
        'female',
        'other',
        'other',
        undefined,
        undefined,
        undefined,
      ]);
      const classifications = client.person.create.mock.calls.map(
        (c) => (c[0] as { data: { classification?: string } }).data.classification,
      );
      expect(classifications[10]).toBe('member');
      expect(classifications[11]).toBe('attendee');
    });

    it('data de nascimento ilegível (não é ISO nem BR) fica indefinida', async () => {
      const { service, storage, client } = serviceWith();
      const csv = ['nome,telefone,nascimento', 'Ana,11999998888,não é uma data'].join('\n');
      storage.downloadBuffer.mockResolvedValue(Buffer.from(csv, 'utf-8'));

      await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone', birth_date: 'nascimento' } },
        user,
      );

      const call = client.person.create.mock.calls[0][0] as { data: { birth_date?: Date } };
      expect(call.data.birth_date).toBeUndefined();
    });

    it('lê planilha .xlsx pela mesma via de preview/confirm usada para CSV', async () => {
      const { service, storage, client } = serviceWith();
      const sheet = XLSX.utils.aoa_to_sheet([
        ['nome', 'telefone'],
        ['Carla Excel', '11988887777'],
      ]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
      storage.downloadBuffer.mockResolvedValue(buffer);

      const result = await service.confirm(
        { file_id: 'arquivo.xlsx', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect((result as ImportResult).imported).toBe(1);
      expect(client.person.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ full_name: 'Carla Excel' }) }),
      );
    });

    it('planilha com célula ausente (valor nulo/indefinido) vira string vazia, não "undefined"', async () => {
      const { service, storage, client } = serviceWith();
      // sheet_to_json com `defval: ''` normalmente já preenche células ausentes;
      // este teste força um valor nulo explícito na linha lida para cobrir a
      // guarda defensiva `v ?? ''` do parser, mesmo que a biblioteca real não
      // costume produzir esse caso.
      const sheetToJsonSpy = jest
        .spyOn(XLSX.utils, 'sheet_to_json')
        .mockReturnValue([{ nome: 'Ana Nula', telefone: null } as never]);

      try {
        // O buffer precisa ser um .xlsx real para `XLSX.read` não explodir —
        // só o retorno de `sheet_to_json` (acima) é forçado para o caso nulo.
        const sheet = XLSX.utils.aoa_to_sheet([['nome', 'telefone']]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'Sheet1');
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
        storage.downloadBuffer.mockResolvedValue(buffer);

        const result = await service.confirm(
          { file_id: 'arquivo.xlsx', mapping: { nome: 'nome', telefone: 'telefone' } },
          user,
        );

        // Sem telefone (virou ''), mas também sem email -> erro na linha, não crash.
        expect((result as ImportResult).errors).toEqual([{ row: 2, reason: 'missing_phone_and_email' }]);
        expect(client.person.create).not.toHaveBeenCalled();
      } finally {
        sheetToJsonSpy.mockRestore();
      }
    });

    it('erro ao gravar o log de auditoria não interrompe nem falha a importação', async () => {
      const { service, storage, auditRaw } = serviceWith();
      storage.downloadBuffer.mockResolvedValue(Buffer.from(VALID_CSV, 'utf-8'));
      auditRaw.mockRejectedValue(new Error('falha ao gravar auditoria'));

      const result = await service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user);

      // A escrita agora é esperada (`await`) e a falha tratada dentro do
      // helper, então não há mais promise solta para assentar no fim do teste
      // — o que também era um jeito de a linha se perder em silêncio.
      expect((result as ImportResult).imported).toBe(1);
    });

    it('processa arquivo grande (>500 linhas) de forma assíncrona, criando um job', async () => {
      const { service, storage, client, system } = serviceWith();
      const rows = ['nome,telefone'];
      for (let i = 0; i < 501; i++) rows.push(`Pessoa ${i},1199999${String(i).padStart(4, '0')}`);
      storage.downloadBuffer.mockResolvedValue(Buffer.from(rows.join('\n'), 'utf-8'));

      const result = await service.confirm(
        { file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } },
        user,
      );

      expect(result).toEqual({ job_id: 'job-1', status: 'pending' });
      expect(client.importJob.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: 'tenant-1',
          congregation_id: 'cong-1',
          type: 'persons',
          status: JobStatus.pending,
          total_rows: 501,
          created_by: 'user-1',
        }),
      });

      // Deixa o `setImmediate` do worker em background rodar.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(system.importJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: { status: JobStatus.processing },
      });
      expect(system.importJob.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: expect.objectContaining({ status: JobStatus.done, imported: 501 }),
        }),
      );
    });

    it('job em background que falha marca o job como erro e loga, sem derrubar o processo', async () => {
      const { service, storage, system } = serviceWith();
      const rows = ['nome,telefone'];
      for (let i = 0; i < 501; i++) rows.push(`Pessoa ${i},1199999${String(i).padStart(4, '0')}`);
      storage.downloadBuffer.mockResolvedValue(Buffer.from(rows.join('\n'), 'utf-8'));
      // Faz o processamento da primeira linha explodir de um jeito que o
      // try/catch por linha não pega (a busca de duplicata acontece antes dele).
      (system.person.findFirst as jest.Mock).mockRejectedValue(new Error('conexão caiu no meio do job'));
      const loggerErrorSpy = jest.spyOn(
        (service as unknown as { logger: { error: (msg: string) => void } }).logger,
        'error',
      );

      await service.confirm({ file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } }, user);

      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(system.importJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: JobStatus.error,
          errors: [{ row: 0, reason: 'conexão caiu no meio do job' }],
        }),
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Import job job-1 failed: conexão caiu no meio do job'),
      );
    });

    it('job em background que falha com um valor que não é Error usa String(err) na mensagem', async () => {
      const { service, storage, system } = serviceWith();
      const rows = ['nome,telefone'];
      for (let i = 0; i < 501; i++) rows.push(`Pessoa ${i},1199999${String(i).padStart(4, '0')}`);
      storage.downloadBuffer.mockResolvedValue(Buffer.from(rows.join('\n'), 'utf-8'));
      (system.person.findFirst as jest.Mock).mockRejectedValue('motivo em string, não Error');
      const loggerErrorSpy = jest.spyOn(
        (service as unknown as { logger: { error: (msg: string) => void } }).logger,
        'error',
      );

      await service.confirm({ file_id: 'arquivo.csv', mapping: { nome: 'nome', telefone: 'telefone' } }, user);

      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(system.importJob.update).toHaveBeenCalledWith({
        where: { id: 'job-1' },
        data: expect.objectContaining({
          status: JobStatus.error,
          errors: [{ row: 0, reason: 'motivo em string, não Error' }],
        }),
      });
      expect(loggerErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Import job job-1 failed: motivo em string, não Error'),
      );
    });
  });

  describe('findJob', () => {
    it('lança NotFoundException quando o job não existe no tenant/congregação', async () => {
      const { service, client } = serviceWith();
      client.importJob.findFirst.mockResolvedValue(null);

      await expect(service.findJob('tenant-1', 'cong-1', 'job-x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('retorna o job quando encontrado', async () => {
      const { service, client } = serviceWith();
      client.importJob.findFirst.mockResolvedValue({ id: 'job-1', status: JobStatus.done });

      const result = await service.findJob('tenant-1', 'cong-1', 'job-1');

      expect(client.importJob.findFirst).toHaveBeenCalledWith({
        where: { id: 'job-1', tenant_id: 'tenant-1', congregation_id: 'cong-1' },
      });
      expect(result).toEqual({ id: 'job-1', status: JobStatus.done });
    });
  });
});
