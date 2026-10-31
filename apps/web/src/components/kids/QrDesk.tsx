"use client";

import { useState } from "react";
import { CheckinDone, OutOfRangeConfirm, rangeFrom, type RangeAsk } from "@/components/kids/CheckinDialog";
import { QrReader } from "@/components/kids/QrReader";
import { apiErrorMessage } from "@/lib/api-error";
import {
  checkInByQr,
  kidsErrorCode,
  kidsErrorStatus,
  parseKidsQr,
  type KidsCheckinResult,
  type KidsRosterItem,
} from "@/lib/kids";

interface QrDeskProps {
  sessionId: string;
  roomName: string;
  /** Os presentes: o QR de check-out acha a criança por aqui. */
  items: KidsRosterItem[];
  onCheckedIn: () => void;
  /** O QR de check-out foi lido e é de alguém desta turma: a mesa abre a entrega. */
  onCheckout: (item: KidsRosterItem, qr: string) => void;
}

/**
 * O campo "Ler QR" do balcão: um só para os dois QRs, porque quem lê não deveria
 * ter de escolher o que está apontando. `kidsci1` (app do responsável) faz o
 * check-in; `kidsco1` (tela do código) abre a entrega da criança. Nada aqui
 * decide se o QR vale — isso é do servidor, que recusa tudo com a mesma frase.
 */
export function QrDesk({ sessionId, roomName, items, onCheckedIn, onCheckout }: QrDeskProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KidsCheckinResult | null>(null);
  const [ask, setAsk] = useState<{ qr: string; range: RangeAsk } | null>(null);
  const [askError, setAskError] = useState<string | null>(null);

  async function checkIn(qr: string, confirmOutOfRange: boolean) {
    setBusy(true);
    setError(null);
    setAskError(null);
    try {
      const r = await checkInByQr(sessionId, { qr, ...(confirmOutOfRange && { confirm_out_of_range: true }) });
      setAsk(null);
      setResult(r);
      onCheckedIn();
    } catch (err) {
      const code = kidsErrorCode(err);
      const range = code === "OUT_OF_RANGE_CONFIRM" ? rangeFrom(err) : null;
      let message: string;
      if (range) {
        setAsk({ qr, range });
        return;
      } else if (code === "kids_out_of_range") {
        message = "Criança fora da faixa etária da turma";
      } else if (kidsErrorStatus(err) === 409) {
        message = "Esta criança já está presente";
      } else if (code === "kids_consent_required") {
        message = `${apiErrorMessage(err, "É preciso o consentimento do responsável.")}. Registre-o na ficha da criança.`;
      } else {
        message = apiErrorMessage(err, "Não foi possível fazer o check-in. Tente de novo.");
      }
      if (confirmOutOfRange) setAskError(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  }

  function read(text: string) {
    setError(null);
    const qr = parseKidsQr(text);
    if (qr === null) {
      setError("Este não é um QR do Kids. Leia o QR do app do responsável ou o da tela do código.");
    } else if (qr.kind === "checkin") {
      void checkIn(qr.qr, false);
    } else {
      const item = items.find((i) => i.checkin_id === qr.checkinId);
      if (item) onCheckout(item, qr.qr);
      else setError("Esta criança não está presente nesta turma.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <QrReader onRead={read} disabled={busy} />
      {error ? (
        <p role="alert" className="text-sm text-crimson">
          {error}
        </p>
      ) : null}
      {result ? (
        <CheckinDone
          result={result}
          childName={result.labels.child_label.child_name}
          roomName={roomName}
          onClose={() => setResult(null)}
        />
      ) : null}
      {ask ? (
        <OutOfRangeConfirm
          subject="A criança"
          description={roomName}
          roomName={roomName}
          ask={ask.range}
          busy={busy}
          error={askError}
          onBack={() => setAsk(null)}
          onConfirm={() => void checkIn(ask.qr, true)}
          onClose={() => setAsk(null)}
        />
      ) : null}
    </div>
  );
}
