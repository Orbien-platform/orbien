"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import axios from "axios";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !tenantSlug.trim()) return;

    setIsSubmitting(true);
    try {
      await axios.post("/api-proxy/auth/forgot-password", {
        email: email.trim().toLowerCase(),
        tenant_slug: tenantSlug.trim().toLowerCase(),
      });
    } catch {
      // API always returns 200; any error treated the same as success
    } finally {
      setIsSubmitting(false);
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--surface-parchment)] px-4">
      <div className="w-full max-w-[400px]">
        <div className="rounded-[12px] border border-[var(--border-default)] bg-[var(--surface-base)] p-8 shadow-[var(--shadow-md)]">
          {/* Logo */}
          <div className="mb-8">
            <h1 className="font-sans text-2xl font-medium text-navy">orbien</h1>
            <p className="mt-1 text-sm font-light text-stone">
              Recuperação de acesso
            </p>
          </div>

          {sent ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <Mail size={40} strokeWidth={1.5} className="text-teal" />
              <p className="text-sm text-ink dark:text-white">
                Se o email estiver cadastrado, você receberá um link de
                redefinição em instantes.
              </p>
              <Link
                href="/login"
                className="mt-2 text-sm text-stone hover:text-navy transition-colors"
              >
                Voltar para o login
              </Link>
            </div>
          ) : (
            /* ── Form ── */
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
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

              <Button
                type="submit"
                disabled={isSubmitting || !email.trim() || !tenantSlug.trim()}
                className="mt-1 h-10 w-full rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Enviando…
                  </>
                ) : (
                  "Enviar link de redefinição"
                )}
              </Button>

              <Link
                href="/login"
                className="text-center text-sm text-stone hover:text-navy transition-colors"
              >
                Voltar para o login
              </Link>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-muted-text">
          Orbien · Gestão de igrejas
        </p>
      </div>
    </div>
  );
}
