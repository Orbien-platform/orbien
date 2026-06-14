"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, CheckCircle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import axios from "axios";

// ─── Inner component (uses useSearchParams — must be inside Suspense) ─────────

function RedefinirSenhaForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [apiError, setApiError] = useState("");

  // Redirect immediately if token missing
  if (!token) {
    router.replace("/login");
    return null;
  }

  const meetsLength = password.length >= 8;
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!meetsLength || passwordsMismatch || password !== confirm) return;

    setApiError("");
    setIsSubmitting(true);
    try {
      await axios.post("/api-proxy/auth/reset-password", { token, password });
      setSuccess(true);
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setApiError("Link inválido ou expirado. Solicite um novo link.");
      } else {
        setApiError("Erro ao redefinir senha. Tente novamente.");
      }
    } finally {
      setIsSubmitting(false);
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
              Crie uma nova senha
            </p>
          </div>

          {success ? (
            /* ── Success state ── */
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle size={40} strokeWidth={1.5} className="text-teal" />
              <p className="text-sm font-medium text-ink dark:text-white">
                Senha redefinida com sucesso!
              </p>
              <Link
                href="/login"
                className="mt-2 flex h-10 w-full items-center justify-center rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] transition-colors"
              >
                Ir para o login
              </Link>
            </div>
          ) : (
            /* ── Form ── */
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
              {/* Nova senha */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-ink dark:text-white">
                  Nova senha
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Mínimo 8 caracteres"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className="rounded-[8px] pr-10"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone hover:text-ink dark:hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={15} strokeWidth={1.5} /> : <Eye size={15} strokeWidth={1.5} />}
                  </button>
                </div>
                {/* Length indicator */}
                {password.length > 0 && (
                  <p className={cn("text-xs", meetsLength ? "text-teal" : "text-stone")}>
                    {meetsLength ? "✓ Mínimo 8 caracteres" : `${8 - password.length} caractere(s) restante(s)`}
                  </p>
                )}
              </div>

              {/* Confirmar senha */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm" className="text-sm font-medium text-ink dark:text-white">
                  Confirmar senha
                </Label>
                <div className="relative">
                  <Input
                    id="confirm"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repita a senha"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    disabled={isSubmitting}
                    className={cn(
                      "rounded-[8px] pr-10",
                      passwordsMismatch && "border-crimson focus:ring-crimson/20"
                    )}
                  />
                  <button
                    type="button"
                    aria-label={showConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone hover:text-ink dark:hover:text-white transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff size={15} strokeWidth={1.5} /> : <Eye size={15} strokeWidth={1.5} />}
                  </button>
                </div>
                {/* Match indicator */}
                {confirm.length > 0 && (
                  <p className={cn("text-xs", passwordsMatch ? "text-teal" : "text-crimson")}>
                    {passwordsMatch ? "✓ Senhas coincidem" : "Senhas não coincidem"}
                  </p>
                )}
              </div>

              {/* API error */}
              {apiError && (
                <div className="rounded-[8px] bg-crimson-dim px-3 py-2" role="alert">
                  <p className="text-sm text-crimson">{apiError}</p>
                  <Link
                    href="/esqueci-senha"
                    className="mt-1 block text-xs text-crimson underline hover:opacity-80"
                  >
                    Solicitar novo link
                  </Link>
                </div>
              )}

              <Button
                type="submit"
                disabled={isSubmitting || !meetsLength || !passwordsMatch}
                className="mt-1 h-10 w-full rounded-[8px] bg-navy font-sans text-sm font-medium text-white hover:bg-[var(--color-navy-dark)] disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="mr-2 animate-spin" />
                    Redefinindo…
                  </>
                ) : (
                  "Redefinir senha"
                )}
              </Button>
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

// ─── Page (wraps in Suspense for useSearchParams) ─────────────────────────────

export default function RedefinirSenhaPage() {
  return (
    <Suspense>
      <RedefinirSenhaForm />
    </Suspense>
  );
}
