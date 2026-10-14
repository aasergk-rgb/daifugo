import { motion, type MotionProps } from 'framer-motion';
import type { CSSProperties } from 'react';
import type { Card } from '../../engine/cards';
import { useSettings } from '../settings';
import { CardSvg } from './CardArt';

type Props = {
  card: Card | null;
  className?: string;
  style?: CSSProperties;
  selected?: boolean;
  dim?: boolean;
  playable?: boolean;
  fresh?: boolean;
  onClick?: () => void;
  title?: string;
} & MotionProps;

export function PlayingCard({ card, className = '', style, selected, dim, playable, fresh, onClick, title, ...motionProps }: Props) {
  const { back } = useSettings();
  const cls = [
    'pcard',
    card ? '' : 'is-back',
    selected ? 'is-selected' : '',
    dim ? 'is-dim' : '',
    playable ? 'is-playable' : '',
    fresh ? 'is-fresh' : '',
    onClick ? 'is-clickable' : '',
    card?.suit === 'X' ? 'is-joker' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <motion.div className={cls} style={style} onClick={onClick} title={title} {...motionProps}>
      <CardSvg card={card} back={back} />
      {fresh && <span className="pcard-new">NEW</span>}
    </motion.div>
  );
}
