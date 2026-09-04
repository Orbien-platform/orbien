"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import axios from "axios";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Informe e-mail e senha.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setError("Não foi possível conectar. Verifique sua internet.");
        } else if (err.response.data?.code === "PLATFORM_ACCOUNT_AMBIGUOUS") {
          // Erro de configuração, não do usuário: o mesmo e-mail tem
          // platform_support em mais de um tenant. A mensagem vem da API
          // porque só ela sabe o que fazer a respeito.
          setError(err.response.data.message);
        } else if (err.response.status === 401) {
          // A API não distingue senha errada de conta sem acesso de
          // plataforma, de propósito — ver AuthContext.login.
          setError("E-mail ou senha incorretos, ou conta sem acesso à plataforma.");
        } else if (err.response.status >= 500) {
          setError("Serviço temporariamente indisponível. Tente novamente.");
        } else {
          setError("Erro ao entrar. Tente novamente.");
        }
      } else {
        setError("Não foi possível conectar. Verifique sua internet.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-8 shadow-[var(--shadow-md)]">
          <div className="mb-8">
            <h1 className="font-sans text-2xl font-medium text-navy">orbien</h1>
            <p className="mt-1 text-sm font-light text-stone">
              Console da plataforma
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="email"
                className="text-sm font-medium text-ink dark:text-white"
              >
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={isSubmitting}
                className="rounded-[8px]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="password"
                className="text-sm font-medium text-ink dark:text-white"
              >
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={isSubmitting}
                className="rounded-[8px]"
              />
            </div>

            {error && (
              <p
                className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson"
                role="alert"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 h-10 w-full rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Entrando…
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-text">
          Acesso restrito · Orbien Plataforma
        </p>
      </div>
    </div>
  );
}
