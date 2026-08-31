"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import axios from "axios";

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim() || !tenantSlug.trim()) {
      setError("Todos os campos são obrigatórios.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password, tenantSlug.trim().toLowerCase());
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (!err.response) {
          setError("Não foi possível conectar. Verifique sua internet.");
        } else if (err.response.status >= 500) {
          setError("Serviço temporariamente indisponível. Tente novamente.");
        } else if (err.response.data?.code === "TENANT_NOT_FOUND") {
          setError("Código de igreja não encontrado. Verifique e tente novamente.");
        } else if (err.response.status === 401) {
          setError("E-mail ou senha incorretos.");
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
        {/* Card */}
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-8 shadow-[var(--shadow-md)]">
          {/* Logo */}
          <div className="mb-8">
            <h1 className="font-sans text-2xl font-medium text-navy">orbien</h1>
            <p className="mt-1 text-sm font-light text-stone">
              Acesse sua congregação
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            {/* Tenant Slug */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tenant_slug" className="text-sm font-medium text-ink dark:text-white">
                Código da sua igreja
              </Label>
              <Input
                id="tenant_slug"
                type="text"
                placeholder="ex: doca-church"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                autoComplete="organization"
                disabled={isSubmitting}
                className="rounded-[8px]"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-ink dark:text-white">
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

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-ink dark:text-white">
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

            {/* Error message */}
            {error && (
              <p className="rounded-[8px] bg-crimson-dim px-3 py-2 text-sm text-crimson" role="alert">
                {error}
              </p>
            )}

            {/* Submit */}
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

            <Link
              href="/esqueci-senha"
              className="text-center text-sm text-stone hover:text-navy transition-colors"
            >
              Esqueceu sua senha?
            </Link>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-text">
          Orbien · Gestão de igrejas
        </p>
      </div>
    </div>
  );
}
