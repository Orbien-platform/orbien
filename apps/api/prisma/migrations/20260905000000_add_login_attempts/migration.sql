-- Limitador de tentativas de login, compartilhado entre instâncias.
--
-- O que existia era um `Map` por processo, só em `forgot-password`: com mais de
-- uma instância no Render, N processos = N janelas, e a proteção valia 1/N. As
-- duas rotas de login não tinham nada — e `POST /auth/platform/login` é a porta
-- do console, que leva a `POST /auth/impersonate` e daí a qualquer tenant.
--
-- Tabela e não Redis porque não há Redis provisionado, e uma tabela atende os
-- dois requisitos que importam: sobrevive ao restart e é a mesma para todas as
-- instâncias. Se um Redis entrar depois, o que muda é a implementação do
-- serviço, não as rotas.
--
-- A RLS segue o desenho de `password_reset_tokens`: sem policy nenhuma, o que
-- em `ENABLE`+`FORCE` nega a todo mundo — só `prisma.system` (conexão direta,
-- role com BYPASSRLS) alcança a tabela, que é como o serviço a usa. A tabela
-- guarda e-mail tentado; deixá-la legível pela conexão da aplicação daria a
-- qualquer rota autenticada a lista de quem anda tentando entrar.

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "window_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "blocked_at" TIMESTAMP(3),

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "login_attempts_identifier_key" ON "login_attempts"("identifier");

-- CreateIndex
CREATE INDEX "login_attempts_window_at_idx" ON "login_attempts"("window_at");

-- RLS: apenas prisma.system (BYPASSRLS) acessa — sem policy para orbien_app = negação implícita
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "login_attempts" FORCE ROW LEVEL SECURITY;
