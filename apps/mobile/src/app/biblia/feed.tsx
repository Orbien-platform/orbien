// Placeholder mínimo de `biblia/feed` (T20, biblia-nvi-marcacoes-mobile) —
// existe só para a rota resolver no Expo Router (`Stack.Screen` exige o
// arquivo). A tela de verdade (lista paginada, edição/exclusão, moderação)
// é T22, próximo batch — nota mecânica, não SPEC_DEVIATION: nenhum
// critério de aceite é atendido por este arquivo além de "a rota existe".
import { StatusMessage } from "../../components/StatusMessage";
import { MessageSquare } from "../../lib/theme/icons";

export default function BibliaFeedScreen() {
  return (
    <StatusMessage
      testID="biblia-feed-placeholder"
      icon={MessageSquare}
      message="Feed em construção"
      description="A lista de marcações da congregação chega em breve."
    />
  );
}
