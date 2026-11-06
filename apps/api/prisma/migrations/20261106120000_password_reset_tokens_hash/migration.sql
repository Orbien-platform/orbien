-- PEND-24: password_reset_tokens passa a guardar o SHA-256 do token, não o token.
--
-- Quem lia o banco enquanto o token valia (30 min na redefinição, 7 dias no
-- convite) redefinia a senha da conta. Agora o valor em claro só existe no
-- e-mail/link; a API busca por hash (mesmo desenho de refresh_tokens.token_hash).
--
-- Renomear (token -> token_hash) em vez de manter o nome: o nome diz o que a
-- coluna guarda e quebra de forma barulhenta qualquer código antigo que ainda
-- grave ou busque `token`, em vez de gravar claro sem ninguém notar. O RENAME é
-- só catálogo (sem reescrita da tabela) e o índice único acompanha.
--
-- Tokens em voo NÃO expiram: o UPDATE abaixo converte cada token ainda gravado
-- em claro para o seu SHA-256 (sha256 nativo, Postgres 11+; convert_to UTF8 =
-- os mesmos bytes que o createHash('sha256').update(string) do Node usa). O link
-- já enviado por e-mail continua valendo, e nenhum token em claro sobra na
-- tabela. Não há fallback de busca em claro no código: depois desta migration a
-- API só procura por hash. Roda uma única vez, pelo histórico do Prisma (reaplicar
-- re-hashearia hashes, por isso não é script de bootstrap).

ALTER TABLE "password_reset_tokens" RENAME COLUMN "token" TO "token_hash";
ALTER INDEX "password_reset_tokens_token_key" RENAME TO "password_reset_tokens_token_hash_key";

UPDATE "password_reset_tokens"
SET "token_hash" = encode(sha256(convert_to("token_hash", 'UTF8')), 'hex');
