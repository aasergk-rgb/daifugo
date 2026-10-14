import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export function useSize<T extends HTMLElement>(): [React.RefObject<T>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export function useNow(active: boolean, ms = 250): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

/** value が true になってから ms 後に true を返す */
export function useDelayed(value: boolean, ms: number): boolean {
  const [v, setV] = useState(false);
  useEffect(() => {
    if (!value) {
      setV(false);
      return;
    }
    const t = setTimeout(() => setV(true), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
