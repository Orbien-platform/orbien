import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/** Janela dos três baldes: uma hora, a mesma do `@Throttle` da rota. */
export const REGISTER_WINDOW_MS = 60 * 60 * 1000;

/**
 * Cadastros por QR, por hora. A unidade natural do culto é o QR (uma
 * congregação, um culto): 500 presentes com 10% de visitantes dão ~50 por hora,
 * então 200 deixa 4× de folga sem abrir a porta a um despejo de milhares de
 * cadastros falsos num único QR.
 */
export const MAX_REGISTERS_PER_TOKEN = 200;

/**
 * Envios com token inexistente ou desativado, por IP e por hora. É o limite
 * "baixo" de antes (20/h): quem chuta tokens esbarra aqui, e quem usa um QR
 * válido nunca incrementa este balde.
 */
export const MAX_INVALID_TOKENS_PER_IP = 20;

/** Teto de chaves por mapa — defesa de memória, não regra de negócio. */
const MAX_KEYS = 10_000;

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Limites do autocadastro de visitante (`POST /public/visitor/register`) que só
 * dá para aplicar **depois** de saber se o token existe. O teto por IP "rede de
 * segurança" continua no `@Throttle` do controller.
 *
 * O estado vive em memória do processo, como o do `ThrottlerGuard`: reinicia no
 * deploy e quando o Render acorda a instância, e vale 1/N com N instâncias. Isso
 * não importa aqui — o pior caso é a janela recomeçar, o mesmo que o limite por
 * IP já tinha; não há dado de usuário em jogo, só contagem.
 *
 * Só se cria contador por token **depois** que o token foi validado no banco, e
 * o contador de inválidos é por IP com teto de chaves. Token inventado nunca
 * vira chave do mapa por token.
 */
@Injectable()
export class VisitorRegisterLimiter {
  private readonly perToken = new Map<string, Bucket>();
  private readonly invalidPerIp = new Map<string, Bucket>();

  /** Antes de consultar o token: o IP já gastou os envios com token inválido? */
  assertIpNotBlocked(ip: string | undefined): void {
    const bucket = this.live(this.invalidPerIp, ip ?? 'sem-ip');
    if (bucket && bucket.count >= MAX_INVALID_TOKENS_PER_IP) this.tooMany();
  }

  /** Token não existe ou está desativado: conta contra o IP, nunca contra o token. */
  recordInvalid(ip: string | undefined): void {
    this.bump(this.invalidPerIp, ip ?? 'sem-ip');
  }

  /** Token válido (já lido do banco): conta o envio no balde do QR. */
  hitToken(qrTokenId: string): void {
    const bucket = this.bump(this.perToken, qrTokenId);
    if (bucket.count > MAX_REGISTERS_PER_TOKEN) this.tooMany();
  }

  private live(map: Map<string, Bucket>, key: string): Bucket | undefined {
    const bucket = map.get(key);
    if (bucket && bucket.resetAt <= Date.now()) {
      map.delete(key);
      return undefined;
    }
    return bucket;
  }

  private bump(map: Map<string, Bucket>, key: string): Bucket {
    const existing = this.live(map, key);
    if (existing) {
      existing.count += 1;
      return existing;
    }
    if (map.size >= MAX_KEYS) this.makeRoom(map);
    const bucket = { count: 1, resetAt: Date.now() + REGISTER_WINDOW_MS };
    map.set(key, bucket);
    return bucket;
  }

  /** Mapa cheio: varre o vencido e, se nada venceu, descarta o mais antigo. */
  private makeRoom(map: Map<string, Bucket>): void {
    const now = Date.now();
    for (const [key, bucket] of map) if (bucket.resetAt <= now) map.delete(key);
    // Cheio, logo há ao menos uma chave: a primeira é a mais antiga.
    if (map.size >= MAX_KEYS) map.delete(map.keys().next().value as string);
  }

  private tooMany(): never {
    throw new HttpException(
      'Muitos cadastros seguidos. Tente de novo em alguns minutos.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
