// Kids — termo de consentimento (T31, KIDS-06): leitura, aceite e revogação.
import { useCallback, useEffect, useState } from "react";

import { AppButton } from "../../components/AppButton";
import { Screen } from "../../components/Screen";
import { StatusMessage } from "../../components/StatusMessage";
import { ConsentTerm } from "../../components/kids/ConsentTerm";
import { describeLoadError, type LoadErrorState } from "../../lib/api/load-error";
import { getConsentStatus } from "../../lib/kids/kids-client";
import type { KidsConsentStatus } from "../../lib/kids/types";
import { CircleAlert, WifiOff } from "../../lib/theme/icons";

export default function ConsentimentoScreen() {
  const [status, setStatus] = useState<KidsConsentStatus | null>(null);
  const [error, setError] = useState<LoadErrorState | null>(null);

  const load = useCallback(() => {
    getConsentStatus()
      .then((result) => {
        setStatus(result);
        setError(null);
      })
      .catch((err: unknown) => setError(describeLoadError(err, "o termo de consentimento")));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <StatusMessage
        testID="consent-load-error"
        icon={error.offline ? WifiOff : CircleAlert}
        message={error.message}
        description={error.description}
        tone="danger"
      >
        <AppButton testID="consent-retry" title="Tentar de novo" variant="secondary" onPress={load} />
      </StatusMessage>
    );
  }

  return <Screen scroll>{status ? <ConsentTerm status={status} onChanged={load} /> : null}</Screen>;
}
