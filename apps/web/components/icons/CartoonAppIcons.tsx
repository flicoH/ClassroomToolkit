/*
 * **********************************************************************************************
 *  CopyRight (C) 2026 huangqinjia(flicoH)。
 *  Rights Reserved.
 * **********************************************************************************************
 */
import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function IconShell({ className, children, from, to }: IconProps & { children: ReactNode; from: string; to: string }) {
  const gradientId = `icon-${from.replace("#", "")}-${to.replace("#", "")}`;

  return (
    <svg viewBox="0 0 64 64" className={className} fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="12" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
      </defs>
      <rect x="7" y="7" width="50" height="50" rx="17" fill={`url(#${gradientId})`} />
      <path d="M17 14C23 10 38 10 47 18" stroke="white" strokeOpacity=".38" strokeWidth="4" strokeLinecap="round" />
      <circle cx="49" cy="15" r="4" fill="white" fillOpacity=".28" />
      {children}
    </svg>
  );
}

export function CartoonCountdownIcon(props: IconProps) {
  return (
    <IconShell {...props} from="#38BDF8" to="#2563EB">
      <circle cx="32" cy="34" r="16" fill="white" fillOpacity=".92" />
      <path d="M32 23v11l7 5" stroke="#2563EB" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M25 15h14" stroke="white" strokeWidth="4" strokeLinecap="round" />
      <circle cx="32" cy="34" r="3" fill="#60A5FA" />
      <path d="M20 47c5 4 18 5 25-1" stroke="#DBEAFE" strokeWidth="3" strokeLinecap="round" />
    </IconShell>
  );
}

export function CartoonRandomPickerIcon(props: IconProps) {
  return (
    <IconShell {...props} from="#A78BFA" to="#7C3AED">
      <circle cx="24" cy="29" r="8" fill="white" fillOpacity=".92" />
      <circle cx="41" cy="27" r="7" fill="#FDE68A" />
      <path d="M18 45c1.5-8 12.5-8 15 0" fill="#EDE9FE" />
      <path d="M35 44c1.2-6 10.5-6 12.5 0" fill="#FEF3C7" />
      <path d="M24 14l2.5 4.5L31 21l-4.5 2.4L24 28l-2.5-4.6L17 21l4.5-2.5L24 14Z" fill="white" />
      <path d="M44 39l2 3.5 3.5 2-3.5 2-2 3.5-2-3.5-3.5-2 3.5-2 2-3.5Z" fill="#FDE68A" />
    </IconShell>
  );
}

export function CartoonStudentsIcon(props: IconProps) {
  return (
    <IconShell {...props} from="#60A5FA" to="#0EA5E9">
      <circle cx="24" cy="27" r="7" fill="white" fillOpacity=".95" />
      <circle cx="41" cy="27" r="7" fill="#DBEAFE" />
      <path d="M15 45c2-9 15-10 20-2" fill="white" fillOpacity=".9" />
      <path d="M31 45c2-8 14-9 18-2" fill="#DBEAFE" />
      <path d="M20 22c2-4 7-4 9 0" stroke="#2563EB" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M37 22c2-3 6-3 8 0" stroke="#0284C7" strokeWidth="2.4" strokeLinecap="round" />
    </IconShell>
  );
}

export function CartoonTaskStatsIcon(props: IconProps) {
  return (
    <IconShell {...props} from="#34D399" to="#059669">
      <rect x="18" y="17" width="29" height="34" rx="7" fill="white" fillOpacity=".94" />
      <path d="M25 27h14M25 36h8M25 44h13" stroke="#059669" strokeWidth="3" strokeLinecap="round" />
      <circle cx="20" cy="27" r="3" fill="#BBF7D0" />
      <circle cx="20" cy="36" r="3" fill="#BBF7D0" />
      <circle cx="20" cy="44" r="3" fill="#BBF7D0" />
      <path d="M27 16h11" stroke="#ECFDF5" strokeWidth="5" strokeLinecap="round" />
    </IconShell>
  );
}

export function CartoonSeatingIcon(props: IconProps) {
  return (
    <IconShell {...props} from="#F59E0B" to="#EA580C">
      <rect x="17" y="15" width="30" height="7" rx="3.5" fill="white" fillOpacity=".95" />
      {(
        [
          [18, 29],
          [30, 29],
          [42, 29],
          [18, 42],
          [30, 42],
          [42, 42]
        ] as const
      ).map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x - 4} y={y - 4} width="8" height="8" rx="3" fill="#FFEDD5" />
          <path d={`M${x - 5} ${y + 7}c2-5 8-5 10 0`} stroke="white" strokeWidth="3" strokeLinecap="round" />
        </g>
      ))}
    </IconShell>
  );
}

export function CartoonStickyNoteIcon(props: IconProps) {
  return (
    <IconShell {...props} from="#FDE047" to="#F59E0B">
      <path d="M19 16h26a5 5 0 0 1 5 5v20L38 53H19a5 5 0 0 1-5-5V21a5 5 0 0 1 5-5Z" fill="#FEF3C7" />
      <path d="M38 53V42a1 1 0 0 1 1-1h11" fill="#FCD34D" />
      <path d="M23 27h16M23 35h18M23 43h9" stroke="#B45309" strokeWidth="3" strokeLinecap="round" />
      <circle cx="45" cy="21" r="5" fill="#FB7185" />
    </IconShell>
  );
}

export function CartoonPetPointsIcon(props: IconProps) {
  return (
    <IconShell {...props} from="#FB7185" to="#F97316">
      <path d="M19 37c0-10 6-18 13-18s13 8 13 18c0 8-5 13-13 13s-13-5-13-13Z" fill="#FFF7ED" />
      <path d="M21 23c-5-3-8 2-6 8 4 0 7-2 8-6" fill="#FED7AA" />
      <path d="M43 23c5-3 8 2 6 8-4 0-7-2-8-6" fill="#FED7AA" />
      <circle cx="27" cy="36" r="2.5" fill="#334155" />
      <circle cx="37" cy="36" r="2.5" fill="#334155" />
      <path d="M31 40h2l-1 2-1-2Z" fill="#FB7185" />
      <path d="M28 45c2 2 6 2 8 0" stroke="#F97316" strokeWidth="3" strokeLinecap="round" />
      <path d="M45 14l2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z" fill="#FDE68A" />
      <path d="M17 46h8M39 46h8" stroke="#FDBA74" strokeWidth="3" strokeLinecap="round" />
    </IconShell>
  );
}

export function CartoonGachaIcon(props: IconProps) {
  return (
    <IconShell {...props} from="#22C55E" to="#0F766E">
      <rect x="19" y="15" width="26" height="34" rx="9" fill="#ECFDF5" />
      <circle cx="32" cy="31" r="12" fill="#A7F3D0" />
      <path d="M20 32h24" stroke="#0F766E" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="31" r="5" fill="white" />
      <path d="M26 49h12" stroke="#BBF7D0" strokeWidth="5" strokeLinecap="round" />
      <path d="M24 17c3-4 13-5 18 1" stroke="white" strokeWidth="3" strokeLinecap="round" />
      <path d="M47 39l2 3.5 3.5 2-3.5 2-2 3.5-2-3.5-3.5-2 3.5-2 2-3.5Z" fill="#FDE68A" />
    </IconShell>
  );
}
