// プレイヤーの顔（動物）。紺の輪郭のフラットなイラストを SVG で描く。

import { memo } from 'react';

const INK = '#2B2A55';
const S = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round' as const };

export const AVATAR_NAMES = ['いぬ', 'ねこ', 'うさぎ', 'くま', 'パンダ', 'コアラ', 'かえる', 'ぶた', 'さる', 'ペンギン', 'きつね', 'ねずみ'];

function Eyes({ y = 35, dx = 7, r = 2.6, color = INK }: { y?: number; dx?: number; r?: number; color?: string }) {
  return (
    <>
      <circle cx={32 - dx} cy={y} r={r} fill={color} />
      <circle cx={32 + dx} cy={y} r={r} fill={color} />
    </>
  );
}

function Smile({ y = 42, w = 4 }: { y?: number; w?: number }) {
  return <path d={`M${32 - w} ${y} Q32 ${y + 3.5} ${32 + w} ${y}`} fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />;
}

function Cheeks({ y = 41, dx = 12 }: { y?: number; dx?: number }) {
  return (
    <>
      <circle cx={32 - dx} cy={y} r="3" fill="#FF7FA0" opacity="0.45" />
      <circle cx={32 + dx} cy={y} r="3" fill="#FF7FA0" opacity="0.45" />
    </>
  );
}

const FACES: (() => JSX.Element)[] = [
  // いぬ（たれ耳）
  () => (
    <>
      <circle cx="32" cy="36" r="19" fill="#F0C08A" {...S} />
      <ellipse cx="14" cy="31" rx="6" ry="12" transform="rotate(18 14 31)" fill="#B97A4E" {...S} />
      <ellipse cx="50" cy="31" rx="6" ry="12" transform="rotate(-18 50 31)" fill="#B97A4E" {...S} />
      <Eyes />
      <ellipse cx="32" cy="41" rx="3.4" ry="2.4" fill={INK} />
      <Smile y={44} w={3} />
    </>
  ),
  // ねこ
  () => (
    <>
      <path d="M15 28 L17 10 L29 20 Z" fill="#F6A85E" {...S} />
      <path d="M49 28 L47 10 L35 20 Z" fill="#F6A85E" {...S} />
      <circle cx="32" cy="36" r="19" fill="#F6A85E" {...S} />
      <path d="M24 22 L26 27 M32 20 V26 M40 22 L38 27" stroke="#D9803A" strokeWidth="2.6" strokeLinecap="round" />
      <Eyes />
      <Smile />
      <path d="M12 38 H20 M12 43 H20 M44 38 H52 M44 43 H52" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  // うさぎ
  () => (
    <>
      <ellipse cx="24" cy="15" rx="5.5" ry="13" fill="#FFFFFF" {...S} />
      <ellipse cx="40" cy="15" rx="5.5" ry="13" fill="#FFFFFF" {...S} />
      <ellipse cx="24" cy="16" rx="2.2" ry="8" fill="#FFB3C4" />
      <ellipse cx="40" cy="16" rx="2.2" ry="8" fill="#FFB3C4" />
      <circle cx="32" cy="38" r="18" fill="#FFFFFF" {...S} />
      <Eyes y={37} />
      <Cheeks y={43} />
      <Smile y={44} w={3} />
    </>
  ),
  // くま
  () => (
    <>
      <circle cx="16" cy="21" r="7.5" fill="#B07A52" {...S} />
      <circle cx="48" cy="21" r="7.5" fill="#B07A52" {...S} />
      <circle cx="32" cy="36" r="19" fill="#B07A52" {...S} />
      <ellipse cx="32" cy="42" rx="8.5" ry="6.5" fill="#F2D1B0" />
      <Eyes y={34} />
      <ellipse cx="32" cy="39.5" rx="2.8" ry="2" fill={INK} />
      <Smile y={43} w={3} />
    </>
  ),
  // パンダ
  () => (
    <>
      <circle cx="16" cy="21" r="7.5" fill={INK} {...S} />
      <circle cx="48" cy="21" r="7.5" fill={INK} {...S} />
      <circle cx="32" cy="36" r="19" fill="#FFFFFF" {...S} />
      <ellipse cx="24" cy="35" rx="5" ry="6" transform="rotate(-20 24 35)" fill={INK} />
      <ellipse cx="40" cy="35" rx="5" ry="6" transform="rotate(20 40 35)" fill={INK} />
      <Eyes y={34} dx={7.5} r={1.8} color="#FFFFFF" />
      <ellipse cx="32" cy="41" rx="2.6" ry="1.9" fill={INK} />
      <Smile y={44} w={3} />
    </>
  ),
  // コアラ
  () => (
    <>
      <circle cx="13" cy="28" r="10" fill="#A9ABC4" {...S} />
      <circle cx="51" cy="28" r="10" fill="#A9ABC4" {...S} />
      <circle cx="13" cy="28" r="5" fill="#FFC3D1" />
      <circle cx="51" cy="28" r="5" fill="#FFC3D1" />
      <circle cx="32" cy="37" r="18" fill="#C5C7DA" {...S} />
      <Eyes y={34} dx={8} />
      <ellipse cx="32" cy="41" rx="4.5" ry="5.5" fill={INK} />
    </>
  ),
  // かえる
  () => (
    <>
      <circle cx="32" cy="38" r="18" fill="#6CCB6A" {...S} />
      <circle cx="21" cy="21" r="8" fill="#6CCB6A" {...S} />
      <circle cx="43" cy="21" r="8" fill="#6CCB6A" {...S} />
      <circle cx="21" cy="21" r="4.5" fill="#FFFFFF" />
      <circle cx="43" cy="21" r="4.5" fill="#FFFFFF" />
      <circle cx="21" cy="22" r="2.4" fill={INK} />
      <circle cx="43" cy="22" r="2.4" fill={INK} />
      <path d="M22 41 Q32 49 42 41" fill="none" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <Cheeks y={39} dx={13} />
    </>
  ),
  // ぶた
  () => (
    <>
      <path d="M15 26 L14 12 L26 19 Z" fill="#FFB3C4" {...S} />
      <path d="M49 26 L50 12 L38 19 Z" fill="#FFB3C4" {...S} />
      <circle cx="32" cy="36" r="19" fill="#FFB3C4" {...S} />
      <Eyes y={32} dx={8} />
      <ellipse cx="32" cy="41" rx="7" ry="5" fill="#FF8FAB" {...S} strokeWidth={2.5} />
      <circle cx="29.5" cy="41" r="1.5" fill={INK} />
      <circle cx="34.5" cy="41" r="1.5" fill={INK} />
    </>
  ),
  // さる
  () => (
    <>
      <circle cx="13" cy="36" r="7" fill="#F2D1B0" {...S} />
      <circle cx="51" cy="36" r="7" fill="#F2D1B0" {...S} />
      <circle cx="32" cy="35" r="19" fill="#A86E45" {...S} />
      <path d="M32 26 C22 22 17 32 21 38 C18 46 26 52 32 52 C38 52 46 46 43 38 C47 32 42 22 32 26 Z" fill="#F2D1B0" />
      <Eyes y={35} dx={6} />
      <Smile y={45} w={4} />
    </>
  ),
  // ペンギン
  () => (
    <>
      <circle cx="32" cy="35" r="20" fill="#3A3970" {...S} />
      <path d="M32 24 C22 24 18 32 19 40 C20 47 26 52 32 52 C38 52 44 47 45 40 C46 32 42 24 32 24 Z" fill="#FFFFFF" />
      <Eyes y={35} dx={6.5} />
      <path d="M28 40 L36 40 L32 45 Z" fill="#FFB547" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <Cheeks y={42} dx={11} />
    </>
  ),
  // きつね
  () => (
    <>
      <path d="M14 30 L14 8 L30 20 Z" fill="#FF8A3D" {...S} />
      <path d="M50 30 L50 8 L34 20 Z" fill="#FF8A3D" {...S} />
      <circle cx="32" cy="36" r="19" fill="#FF8A3D" {...S} />
      <path d="M14 37 C20 40 26 44 32 52 C38 44 44 40 50 37 C46 52 38 55 32 55 C26 55 18 52 14 37 Z" fill="#FFFFFF" />
      <Eyes y={34} />
      <ellipse cx="32" cy="43" rx="2.8" ry="2" fill={INK} />
    </>
  ),
  // ねずみ
  () => (
    <>
      <circle cx="14" cy="22" r="10" fill="#B8B8CC" {...S} />
      <circle cx="50" cy="22" r="10" fill="#B8B8CC" {...S} />
      <circle cx="14" cy="22" r="5" fill="#FFC3D1" />
      <circle cx="50" cy="22" r="5" fill="#FFC3D1" />
      <circle cx="32" cy="38" r="17" fill="#B8B8CC" {...S} />
      <Eyes y={36} dx={6.5} />
      <circle cx="32" cy="42" r="2.4" fill="#FF7FA0" />
      <path d="M14 42 H22 M42 42 H50" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
];

export const AVATAR_COUNT = FACES.length;

/** 動物の顔。className には丸い枠（avatar-emoji など）を渡す */
export const Avatar = memo(function Avatar({ id, className = 'avatar-emoji', title }: { id: number; className?: string; title?: string }) {
  const Face = FACES[((id % FACES.length) + FACES.length) % FACES.length];
  return (
    <span className={`avatar ${className}`} title={title ?? AVATAR_NAMES[id % AVATAR_NAMES.length]}>
      <svg viewBox="0 0 64 64" aria-hidden>
        <Face />
      </svg>
    </span>
  );
});
