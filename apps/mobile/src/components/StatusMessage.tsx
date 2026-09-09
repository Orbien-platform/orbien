// Estado de erro/vazio/carregando — fachada sobre `EmptyState` mantida
// porque as telas (e os testes de cada uma) referenciam este contrato:
// `testID` + `message` + ação opcional em `children`.
//
// O que mudou com o STYLE-GUIDE.md é só o visual: o texto era um
// parágrafo solto no centro da tela; agora vem com o ícone de 28px do §5 e
// a hierarquia de título/descrição do `EmptyState`.
import type { ComponentType, ReactNode } from "react";

import { EmptyState } from "./EmptyState";

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

interface StatusMessageProps {
  testID: string;
  message: string;
  /** Linha de apoio abaixo da mensagem (ex.: o que fazer a seguir). */
  description?: string;
  icon?: ComponentType<IconProps>;
  tone?: "default" | "danger";
  children?: ReactNode;
}

export function StatusMessage({
  testID,
  message,
  description,
  icon,
  tone = "default",
  children,
}: StatusMessageProps) {
  return (
    <EmptyState
      testID={testID}
      icon={icon}
      title={message}
      description={description}
      tone={tone}
    >
      {children}
    </EmptyState>
  );
}
