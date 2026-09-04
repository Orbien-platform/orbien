import { NotFoundException } from '@nestjs/common';
import { PdfExportService } from './pdf-export.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

function clientWith(overrides: Record<string, unknown> = {}) {
  return {
    serviceOrder: { findFirst: jest.fn() },
    tenant: { findUnique: jest.fn() },
    celebrationAssignment: { findMany: jest.fn() },
    ...overrides,
  };
}

function baseOrder(itemsOverride?: object[]) {
  return {
    id: 'so1',
    title: 'Ordem de Culto — Domingo',
    celebrationInstance: {
      id: 'i1',
      scheduled_date: new Date('2026-09-06T00:00:00Z'),
      celebration: { name: 'Culto de Celebração', start_time: '09:00' },
    },
    items:
      itemsOverride ??
      [
        {
          sequence: 1,
          name: 'Abertura',
          start_offset_minutes: 0,
          duration_minutes: 10,
          responsible_type: 'person',
          person: { full_name: 'Ana Silva' },
          ministry: null,
          responsible_label: null,
          ministry_id: null,
          setlist: null,
        },
      ],
  };
}

function serviceWith(client: ReturnType<typeof clientWith>, storageOverrides?: Partial<StorageService>) {
  const prisma = { client } as unknown as PrismaService;
  const storage = {
    upload: jest.fn().mockResolvedValue('https://cdn/x.pdf'),
    getPresignedGetUrl: jest.fn().mockResolvedValue('https://cdn/x.pdf?sig=abc'),
    ...storageOverrides,
  } as unknown as StorageService;
  return { service: new PdfExportService(prisma, storage), storage };
}

describe('PdfExportService', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('generateServiceOrderPdf', () => {
    it('lança NotFoundException quando a OC não existe', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('gera o PDF com branding do tenant, faz upload e retorna a URL assinada', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(baseOrder());
      client.tenant.findUnique.mockResolvedValue({
        name: 'Igreja Central',
        brandingConfig: { primary_color: '#123456', logo_url: null, app_name: 'Central App' },
      });
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      const { service, storage } = serviceWith(client);

      const result = await service.generateServiceOrderPdf('t1', 'g1', 'so1');

      expect(storage.upload).toHaveBeenCalledWith(
        expect.any(Buffer),
        'tenants/t1/oc/so1.pdf',
        'application/pdf',
      );
      expect(storage.getPresignedGetUrl).toHaveBeenCalledWith('tenants/t1/oc/so1.pdf', 86_400);
      expect(result).toEqual({
        pdf_url: 'https://cdn/x.pdf?sig=abc',
        expires_at: expect.any(String),
      });
    }, 20000);

    it('usa cor/nome padrão quando o tenant não tem branding nem nome', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(baseOrder());
      client.tenant.findUnique.mockResolvedValue(null);
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'so1')).resolves.toEqual(
        expect.objectContaining({ pdf_url: expect.any(String) }),
      );
    }, 20000);

    it('usa o nome do tenant quando não há app_name na branding', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(baseOrder());
      client.tenant.findUnique.mockResolvedValue({
        name: 'Igreja Central',
        brandingConfig: { primary_color: null, logo_url: null, app_name: null },
      });
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'so1')).resolves.toEqual(
        expect.objectContaining({ pdf_url: expect.any(String) }),
      );
    }, 20000);

    it('inclui item de ministério com voluntários confirmados e setlist com tom/bpm', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(
        baseOrder([
          {
            sequence: 1,
            name: 'Louvor',
            start_offset_minutes: 10,
            duration_minutes: 20,
            responsible_type: 'ministry',
            person: null,
            ministry: { id: 'm1', name: 'Ministério de Louvor' },
            responsible_label: null,
            ministry_id: 'm1',
            setlist: {
              songs: [
                { title: 'Grande é o Senhor', key: 'G', bpm: 90 },
                { title: 'Sem metadados', key: null, bpm: null },
              ],
            },
          },
        ]),
      );
      client.tenant.findUnique.mockResolvedValue({
        name: 'Igreja Central',
        brandingConfig: { primary_color: '#123456', logo_url: null, app_name: 'Central' },
      });
      client.celebrationAssignment.findMany.mockResolvedValue([
        {
          volunteerProfile: { person: { full_name: 'Carlos' } },
          celebrationMinistry: { ministry_id: 'm1' },
        },
        // Segundo voluntário confirmado no MESMO ministério: exercita o ramo
        // em que volunteersByMinistry[mid] já existe (não recria o array).
        {
          volunteerProfile: { person: { full_name: 'Débora' } },
          celebrationMinistry: { ministry_id: 'm1' },
        },
      ]);
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'so1')).resolves.toEqual(
        expect.objectContaining({ pdf_url: expect.any(String) }),
      );
      expect(client.celebrationAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'confirmed',
            celebrationMinistry: expect.objectContaining({ ministry_id: { in: ['m1'] } }),
          }),
        }),
      );
    }, 20000);

    it('inclui item de ministério SEM voluntário confirmado ainda', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(
        baseOrder([
          {
            sequence: 1,
            name: 'Som',
            start_offset_minutes: 0,
            duration_minutes: 5,
            responsible_type: 'ministry',
            person: null,
            ministry: { id: 'm2', name: 'Som' },
            responsible_label: null,
            ministry_id: 'm2',
            setlist: null,
          },
        ]),
      );
      client.tenant.findUnique.mockResolvedValue(null);
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'so1')).resolves.toEqual(
        expect.objectContaining({ pdf_url: expect.any(String) }),
      );
    }, 20000);

    it('inclui item free_text com responsible_label', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(
        baseOrder([
          {
            sequence: 1,
            name: 'Anúncios',
            start_offset_minutes: 0,
            duration_minutes: 5,
            responsible_type: 'free_text',
            person: null,
            ministry: null,
            responsible_label: 'Diácono da semana',
            ministry_id: null,
            setlist: null,
          },
        ]),
      );
      client.tenant.findUnique.mockResolvedValue(null);
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'so1')).resolves.toEqual(
        expect.objectContaining({ pdf_url: expect.any(String) }),
      );
    }, 20000);

    it('usa "—" quando person/label do item estão ausentes', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(
        baseOrder([
          {
            sequence: 1,
            name: 'Item sem responsável',
            start_offset_minutes: 0,
            duration_minutes: 5,
            responsible_type: 'person',
            person: null,
            ministry: null,
            responsible_label: null,
            ministry_id: null,
            setlist: null,
          },
          {
            sequence: 2,
            name: 'Item free_text sem label',
            start_offset_minutes: 5,
            duration_minutes: 5,
            responsible_type: 'free_text',
            person: null,
            ministry: null,
            responsible_label: null,
            ministry_id: null,
            setlist: null,
          },
        ]),
      );
      client.tenant.findUnique.mockResolvedValue(null);
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'so1')).resolves.toEqual(
        expect.objectContaining({ pdf_url: expect.any(String) }),
      );
    }, 20000);

    it('não consulta celebrationAssignment quando não há itens de ministério', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(baseOrder());
      client.tenant.findUnique.mockResolvedValue(null);
      const { service } = serviceWith(client);

      await service.generateServiceOrderPdf('t1', 'g1', 'so1');

      expect(client.celebrationAssignment.findMany).not.toHaveBeenCalled();
    }, 20000);

    it('busca e embute o logo em base64 quando logo_url está presente e o fetch é bem-sucedido', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(baseOrder());
      client.tenant.findUnique.mockResolvedValue({
        name: 'Igreja Central',
        brandingConfig: { primary_color: '#123456', logo_url: 'https://cdn/logo.png', app_name: 'Central' },
      });
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      // PNG 1x1 transparente válido — pdfmake decodifica a imagem de verdade.
      const onePixelPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      );
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => onePixelPng.buffer.slice(onePixelPng.byteOffset, onePixelPng.byteOffset + onePixelPng.byteLength),
      }) as unknown as typeof fetch;
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'so1')).resolves.toEqual(
        expect.objectContaining({ pdf_url: expect.any(String) }),
      );
      expect(global.fetch).toHaveBeenCalledWith('https://cdn/logo.png', expect.any(Object));
    }, 20000);

    it('usa "image/png" como fallback de content-type quando o header não vem no fetch', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(baseOrder());
      client.tenant.findUnique.mockResolvedValue({
        name: 'Igreja Central',
        brandingConfig: { primary_color: '#123456', logo_url: 'https://cdn/logo.png', app_name: 'Central' },
      });
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      const onePixelPng = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      );
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => onePixelPng.buffer.slice(onePixelPng.byteOffset, onePixelPng.byteOffset + onePixelPng.byteLength),
      }) as unknown as typeof fetch;
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'so1')).resolves.toEqual(
        expect.objectContaining({ pdf_url: expect.any(String) }),
      );
    }, 20000);

    it('ignora o logo quando o fetch retorna status não-ok', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(baseOrder());
      client.tenant.findUnique.mockResolvedValue({
        name: 'Igreja Central',
        brandingConfig: { primary_color: '#123456', logo_url: 'https://cdn/logo.png', app_name: 'Central' },
      });
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'so1')).resolves.toEqual(
        expect.objectContaining({ pdf_url: expect.any(String) }),
      );
    }, 20000);

    it('ignora o logo quando o fetch lança erro (timeout/rede)', async () => {
      const client = clientWith();
      client.serviceOrder.findFirst.mockResolvedValue(baseOrder());
      client.tenant.findUnique.mockResolvedValue({
        name: 'Igreja Central',
        brandingConfig: { primary_color: '#123456', logo_url: 'https://cdn/logo.png', app_name: 'Central' },
      });
      client.celebrationAssignment.findMany.mockResolvedValue([]);
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as unknown as typeof fetch;
      const { service } = serviceWith(client);

      await expect(service.generateServiceOrderPdf('t1', 'g1', 'so1')).resolves.toEqual(
        expect.objectContaining({ pdf_url: expect.any(String) }),
      );
    }, 20000);
  });

  describe('políticas de acesso do pdfmake (module init, whitebox)', () => {
    // pdf-export.service.ts configura setLocalAccessPolicy(() => false) e
    // setUrlAccessPolicy(() => false) na importação do módulo — bloqueio
    // deliberado de acesso a arquivo local/URL externa em qualquer PDF gerado.
    // require('pdfmake') aqui devolve o MESMO singleton (cache de módulos do
    // Node) já configurado com essas duas closures pelo import do service
    // acima; forçamos o pdfmake a de fato invocá-las para provar o bloqueio.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfmakeLib = require('pdfmake') as {
      createPdf: (def: object, opts: object) => { getBuffer: () => Promise<Buffer> };
    };

    it('bloqueia imagem apontando para caminho local/não-data (setLocalAccessPolicy)', async () => {
      const doc = pdfmakeLib.createPdf(
        { content: [{ image: './local/nao-existe.png' }] },
        {},
      );

      await expect(doc.getBuffer()).rejects.toThrow(/Access to local file denied/);
    });

    it('bloqueia imagem apontando para URL externa (setUrlAccessPolicy)', async () => {
      // `docDefinition.images` (dicionário nomeado, distinto de content[].image
      // como string direta) passa pelo pré-resolvedor de URLs do pdfmake antes
      // da checagem de arquivo local — é o único caminho que aciona
      // setUrlAccessPolicy em vez de cair primeiro no bloqueio local.
      const doc = pdfmakeLib.createPdf(
        {
          content: [{ image: 'logo' }],
          images: { logo: 'https://example.com/logo.png' },
        },
        {},
      );

      await expect(doc.getBuffer()).rejects.toThrow(/Access to URL denied/);
    });
  });

  describe('formatResponsible (whitebox)', () => {
    it('usa "—" quando responsible_type=ministry mas o item não tem ministry vinculado', () => {
      const client = clientWith();
      const { service } = serviceWith(client);
      const formatResponsible = (
        service as unknown as {
          formatResponsible: (
            item: {
              responsible_type: string;
              person: { full_name: string } | null;
              ministry: { id: string; name: string } | null;
              responsible_label: string | null;
            },
            volunteersByMinistry: Record<string, string[]>,
          ) => string;
        }
      ).formatResponsible.bind(service);

      expect(
        formatResponsible(
          { responsible_type: 'ministry', person: null, ministry: null, responsible_label: null },
          {},
        ),
      ).toBe('—');
    });
  });

  describe('addMinutes (whitebox)', () => {
    it('soma minutos preservando padding de dois dígitos', () => {
      const client = clientWith();
      const { service } = serviceWith(client);
      const addMinutes = (
        service as unknown as { addMinutes: (t: string, m: number) => string }
      ).addMinutes.bind(service);

      expect(addMinutes('09:00', 25)).toBe('09:25');
    });

    it('vira o dia (mod 24) quando ultrapassa a meia-noite', () => {
      const client = clientWith();
      const { service } = serviceWith(client);
      const addMinutes = (
        service as unknown as { addMinutes: (t: string, m: number) => string }
      ).addMinutes.bind(service);

      expect(addMinutes('23:50', 20)).toBe('00:10');
    });

    it('usa 0 como fallback para o minuto quando ausente do parse (defesa do ??)', () => {
      const client = clientWith();
      const { service } = serviceWith(client);
      const addMinutes = (
        service as unknown as { addMinutes: (t: string, m: number) => string }
      ).addMinutes.bind(service);

      expect(addMinutes('', 5)).toBe('00:05');
    });

    it('usa 0 como fallback para a hora quando ausente do parse (defesa do ??)', () => {
      // split(':') de uma string real nunca devolve array vazio, então forçamos
      // via um objeto com .split() controlado — único jeito de exercitar esse
      // ramo defensivo (h sempre vem definido a partir de uma string real).
      const client = clientWith();
      const { service } = serviceWith(client);
      const addMinutes = (
        service as unknown as { addMinutes: (t: string, m: number) => string }
      ).addMinutes.bind(service);
      const fakeTime = { split: () => [] } as unknown as string;

      expect(addMinutes(fakeTime, 5)).toBe('00:05');
    });
  });
});
