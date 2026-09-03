import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { ImportResult, PersonsImportService } from './persons-import.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
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
  const auditLogClient = { create: jest.fn().mockResolvedValue({}) };
  const importJobClient = {
    create: jest.fn().mockResolvedValue({ id: 'job-1' }),
    findFirst: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  };

  const client = {
    person: personClient,
    consentRecord: consentRecordClient,
    auditLog: auditLogClient,
    importJob: importJobClient,
  };
  const system = {
    person: personClient,
    consentRecord: consentRecordClient,
    importJob: { ...importJobClient, update: jest.fn().mockResolvedValue({}) },
  };

  const prisma = { client, system } as unknown as PrismaService;
  const storage = {
    upload: jest.fn().mockResolvedValue('https://cdn.test/file'),
    downloadBuffer: jest.fn(),
  } as unknown as jest.Mocked<StorageService>;

  return { service: new PersonsImportService(prisma, storage), storage, client, system };
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

    it('erro ao gravar o log de auditoria não interrompe nem falha a importação (fire-and-forget)', async () => {
      const { service, storage, client } = serviceWith();
      storage.downloadBuffer.mockResolvedValue(Buffer.from(VALID_CSV, 'utf-8'));
      client.auditLog.create.mockRejectedValue(new Error('falha ao gravar auditoria'));

      const result = await service.confirm({ file_id: 'arquivo.csv', mapping: MAPPING }, user);

      expect((result as ImportResult).imported).toBe(1);
      // Deixa a promise fire-and-forget do audit log assentar antes do fim do teste.
      await new Promise((resolve) => setImmediate(resolve));
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
