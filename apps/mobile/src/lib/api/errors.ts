// Contrato de erro do ApiClient (MOB-01) — distingue erro de rede (sem
// resposta do servidor) de erro HTTP (servidor respondeu com status de
// erro), para o app poder mostrar "erro de rede" em vez de tela vazia
// (Edge Case da spec: "dispositivo sem internet").

/** `fetch` rejeitou — sem resposta do servidor (sem internet, DNS, timeout). */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("Erro de rede");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

/** Servidor respondeu com status de erro (4xx/5xx). */
export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    const message =
      body && typeof body === "object" && "message" in body && typeof (body as { message: unknown }).message === "string"
        ? (body as { message: string }).message
        : `HTTP ${status}`;
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}
