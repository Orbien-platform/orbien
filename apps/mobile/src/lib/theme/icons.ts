// Ícones do app (§5 do STYLE-GUIDE.md): `lucide-react-native`, a mesma
// família do `lucide-react` do web — consistência entre plataformas é o
// motivo declarado da escolha. Outline sempre, stroke 1.5
// (`ICON_STROKE_WIDTH` em ./tokens.ts), nos quatro tamanhos de
// `iconSize`.
//
// Import por ícone (`lucide-react-native/icons/<nome>`, subpath público do
// pacote), nunca do barril `lucide-react-native`: o barril reexporta ~1600
// ícones, e importar dele arrasta todos para o bundle do Metro. Em teste a
// diferença é grosseira — o `_layout` das tabs levava ~69s pelo barril
// contra menos de 1s por aqui.
//
// Este módulo é a lista fechada do que o app usa. Ícone novo entra aqui,
// não na tela, para o custo continuar visível num só lugar.
export { default as Bell } from "lucide-react-native/icons/bell";
export { default as BookOpen } from "lucide-react-native/icons/book-open";
export { default as Building2 } from "lucide-react-native/icons/building-2";
export { default as CalendarCheck } from "lucide-react-native/icons/calendar-check";
export { default as CalendarDays } from "lucide-react-native/icons/calendar-days";
export { default as CalendarOff } from "lucide-react-native/icons/calendar-off";
export { default as Check } from "lucide-react-native/icons/check";
export { default as ChevronRight } from "lucide-react-native/icons/chevron-right";
export { default as Church } from "lucide-react-native/icons/church";
export { default as CircleAlert } from "lucide-react-native/icons/circle-alert";
export { default as CircleCheck } from "lucide-react-native/icons/circle-check";
export { default as CircleUser } from "lucide-react-native/icons/circle-user";
export { default as Clock } from "lucide-react-native/icons/clock";
export { default as ExternalLink } from "lucide-react-native/icons/external-link";
export { default as Eye } from "lucide-react-native/icons/eye";
export { default as EyeOff } from "lucide-react-native/icons/eye-off";
export { default as FileText } from "lucide-react-native/icons/file-text";
export { default as HandHeart } from "lucide-react-native/icons/hand-heart";
export { default as Inbox } from "lucide-react-native/icons/inbox";
export { default as ListMusic } from "lucide-react-native/icons/list-music";
export { default as Lock } from "lucide-react-native/icons/lock";
export { default as LogOut } from "lucide-react-native/icons/log-out";
export { default as Mail } from "lucide-react-native/icons/mail";
export { default as MapPin } from "lucide-react-native/icons/map-pin";
export { default as Moon } from "lucide-react-native/icons/moon";
export { default as Music } from "lucide-react-native/icons/music";
export { default as Newspaper } from "lucide-react-native/icons/newspaper";
export { default as RefreshCw } from "lucide-react-native/icons/refresh-cw";
export { default as Smartphone } from "lucide-react-native/icons/smartphone";
export { default as Square } from "lucide-react-native/icons/square";
export { default as SquareCheck } from "lucide-react-native/icons/square-check";
export { default as Sun } from "lucide-react-native/icons/sun";
export { default as UserCheck } from "lucide-react-native/icons/user-check";
export { default as Users } from "lucide-react-native/icons/users";
export { default as WifiOff } from "lucide-react-native/icons/wifi-off";

/** Forma mínima que os componentes do app esperam de um ícone lucide —
 * evita cada componente redeclarar as três props que usa. */
export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}
