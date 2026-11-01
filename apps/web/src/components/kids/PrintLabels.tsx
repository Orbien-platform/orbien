"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { KidsLabels } from "@/lib/kids";

// Etiqueta de 62×29 mm. A folha só existe na impressão: na tela fica oculta, e
// ao imprimir tudo o mais some (`visibility`), sobrando as duas etiquetas, uma
// por página. Sem QR — o check-in é por código.
const CSS = `
@page { size: 62mm 29mm; margin: 0; }
.kids-label-sheet { display: none; }
@media print {
  body * { visibility: hidden !important; }
  .kids-label-sheet, .kids-label-sheet * { visibility: visible !important; }
  .kids-label-sheet { display: block; position: absolute; left: 0; top: 0; }
  .kids-label {
    box-sizing: border-box; width: 62mm; height: 29mm; padding: 2mm 3mm;
    display: flex; flex-direction: column; justify-content: space-between;
    break-after: page; page-break-after: always; color: #000; background: #fff;
    font-family: system-ui, sans-serif; overflow: hidden;
  }
  .kids-label:last-child { break-after: auto; page-break-after: auto; }
  .kids-label-name { font-size: 11pt; font-weight: 700; line-height: 1.1; }
  .kids-label-room { font-size: 8pt; }
  .kids-label-code { font-family: ui-monospace, monospace; font-size: 22pt; font-weight: 700; letter-spacing: 0.18em; line-height: 1; }
  .kids-label-allergy { font-size: 8pt; font-weight: 700; border: 0.4mm solid #000; padding: 0.5mm 1.5mm; }
}
`;

/**
 * Etiquetas imprimíveis do check-in (criança e responsável). É ação
 * secundária: o código aparece na tela do check-in e não depende da etiqueta.
 * Monta a folha, abre o diálogo de impressão do navegador e avisa quando ele
 * fecha (`afterprint`), para quem chamou desmontar.
 */
export function PrintLabels({ labels, onDone }: { labels: KidsLabels; onDone: () => void }) {
  // Ref: a impressão dispara uma vez por montagem, mesmo que quem chamou passe
  // um `onDone` novo a cada render.
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    const finish = () => done.current();
    window.addEventListener("afterprint", finish, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", finish);
  }, []);

  const { child_label: child, guardian_label: guardian } = labels;
  return createPortal(
    <div className="kids-label-sheet" aria-hidden="true">
      <style>{CSS}</style>
      <div className="kids-label">
        <div>
          <div className="kids-label-name">{child.child_name}</div>
          <div className="kids-label-room">{child.room_name}</div>
        </div>
        {child.has_allergy ? <div className="kids-label-allergy">⚠ Alergia: {child.allergy}</div> : null}
        <div className="kids-label-code">{child.code}</div>
      </div>
      <div className="kids-label">
        <div>
          <div className="kids-label-name">Responsável de {guardian.child_name}</div>
          <div className="kids-label-room">{guardian.room_name}</div>
        </div>
        <div className="kids-label-code">{guardian.code}</div>
      </div>
    </div>,
    document.body,
  );
}
