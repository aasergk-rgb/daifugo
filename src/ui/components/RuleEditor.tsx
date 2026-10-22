// ルール設定画面（プリセット + 全ルールを自由に変更 + カスタム保存）

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { rankLabel } from '../../engine/cards';
import { EFFECT_INFO, EFFECT_KEYS, EffectKey, effectDisplayName, PRESETS, RuleConfig, cloneConfig, matchPreset, normalizeConfig, ruleBadges } from '../../engine/rules';
import { genId } from '../../net/protocol';
import { updateSettings, useSettings } from '../settings';
import { sfx } from '../sound';
import { Icon } from './Icon';

type K = keyof RuleConfig;

type Field =
  | { k: K; type: 'toggle'; label: string; desc: string; dep?: K }
  | { k: K; type: 'select'; label: string; desc: string; options: [string | number, string][]; dep?: K }
  | { k: K; type: 'number'; label: string; desc: string; min: number; max: number; suffix?: string; dep?: K };

interface Section {
  id: string;
  title: string;
  icon: string;
  fields?: Field[];
  effects?: boolean;
}

const SECTIONS: Section[] = [
  {
    id: 'deck',
    title: 'デッキ',
    icon: 'layers',
    fields: [
      { k: 'jokers', type: 'select', label: 'ジョーカー', desc: '最強のカード兼ワイルドカード。どのカードの代わりにもなる。', options: [[0, 'なし'], [1, '1枚'], [2, '2枚']] },
      { k: 'blindCards', type: 'number', label: 'ブラインドカード', desc: 'ランダムに抜いて使わないカードの枚数（連盟公式は4人で2枚）。', min: 0, max: 8, suffix: '枚' },
    ],
  },
  {
    id: 'play',
    title: '出し方',
    icon: 'cards',
    fields: [
      { k: 'sequence', type: 'toggle', label: '階段（シークエンス）', desc: '同じマークの連続した数字を3枚以上まとめて出せる。' },
      { k: 'seqMinLength', type: 'select', label: '階段の最小枚数', desc: '階段として認める最小の枚数。', options: [[3, '3枚'], [4, '4枚'], [5, '5枚']], dep: 'sequence' },
      {
        k: 'seqCompare',
        type: 'select',
        label: '階段の強さ比較',
        desc: '「最弱札で比較」なら 3-4-5 に 4-5-6 が出せる。「重複不可」なら 6-7-8 以上が必要。',
        options: [['weakest', '最弱札で比較'], ['noOverlap', '重複不可']],
        dep: 'sequence',
      },
      {
        k: 'passRule',
        type: 'select',
        label: 'パス後の扱い',
        desc: '一度パスしたら場が流れるまで出せない（連盟公式）か、次に回ってきたら再び出せるか。',
        options: [['rejoin', '再び出せる'], ['untilFlush', '流れるまで出せない']],
      },
      { k: 'firstLead', type: 'select', label: '最初の親', desc: 'セット最初のゲームで最初に出す人。', options: [['d3', '♦3を持つ人'], ['s3', '♠3を持つ人'], ['random', 'ランダム']] },
      { k: 'mustPlayD3', type: 'toggle', label: 'ダイヤ3スタート', desc: '最初の親が♦3の場合、最初の出しに♦3を含めなければならない。' },
      { k: 'nextLead', type: 'select', label: '2戦目以降の親', desc: '前のゲームの結果で決まる最初の親。', options: [['daihinmin', '大貧民'], ['daifugo', '大富豪'], ['d3', '♦3を持つ人']] },
    ],
  },
  {
    id: 'rev',
    title: '革命',
    icon: 'rotate',
    fields: [
      { k: 'revolution', type: 'toggle', label: '革命', desc: '同じ数字を4枚以上出すとカードの強さが逆転する（ジョーカーは最強のまま）。もう一度起きると革命返し。' },
      { k: 'revolutionCount', type: 'number', label: '革命に必要な枚数', desc: '連盟の3人制では3枚。', min: 3, max: 6, suffix: '枚', dep: 'revolution' },
      { k: 'seqRevolution', type: 'toggle', label: '階段革命', desc: '長い階段を出しても革命が起きる（連盟公式では不採用）。' },
      { k: 'seqRevolutionLength', type: 'number', label: '階段革命の枚数', desc: 'この枚数以上の階段で革命。', min: 4, max: 8, suffix: '枚', dep: 'seqRevolution' },
    ],
  },
  {
    id: 'lock',
    title: '縛り',
    icon: 'lock',
    fields: [
      { k: 'suitLock', type: 'toggle', label: 'マーク縛り（スート縛り）', desc: '同じマークが2回続くと、場が流れるまでそのマークしか出せない。' },
      { k: 'numberLock', type: 'toggle', label: '数字縛り（階段縛り）', desc: '数字が1つずつ続くと、場が流れるまで次の数字しか出せない。マーク縛りと同時なら激縛り。' },
    ],
  },
  { id: 'effects', title: '効果札', icon: 'star', effects: true },
  {
    id: 'special',
    title: '特殊な出し',
    icon: 'zap',
    fields: [
      { k: 'spade3Return', type: 'toggle', label: 'スペ3返し', desc: 'ジョーカー1枚出しに♠3を出せて、場が流れる。' },
      { k: 'sandstorm', type: 'toggle', label: '砂嵐', desc: '3のスリーカードはどんなスリーカードにも勝ち、場が流れる。' },
      { k: 'ambulance', type: 'toggle', label: '救急車', desc: '9のペアはどんなペアにも勝ち、場が流れる。' },
      { k: 'rokurokubi', type: 'toggle', label: 'ろくろ首', desc: '6のペアはどんなペアにも勝ち、場が流れる。' },
      { k: 'sixCardFlush', type: 'toggle', label: 'シックスカード', desc: '6枚出し（4枚+ジョーカー2枚）で場が流れる。' },
      { k: 'strongestSeq', type: 'toggle', label: '最強階段', desc: 'ジョーカーを2の上（革命中は3の上）に置いた階段が作れ、出すと場が流れる。' },
      { k: 'doubleJokerFlush', type: 'toggle', label: 'ダブルジョーカー', desc: 'ジョーカー2枚のペアは最強で、場が流れる。' },
    ],
  },
  {
    id: 'finish',
    title: '上がり・身分',
    icon: 'crown',
    fields: [
      { k: 'forbiddenFinish', type: 'toggle', label: '反則上がり（禁止上がり）', desc: '最後の1手に特定のカードを含むと反則で最下位になる。' },
      { k: 'forbidJoker', type: 'toggle', label: '　└ ジョーカー', desc: 'ジョーカーを含む上がりは反則。', dep: 'forbiddenFinish' },
      { k: 'forbidStrongest', type: 'toggle', label: '　└ 2（革命中は3）', desc: '最強の数字を含む上がりは反則。', dep: 'forbiddenFinish' },
      { k: 'forbidEight', type: 'toggle', label: '　└ 8切り', desc: '8切りで上がるのは反則。', dep: 'forbiddenFinish' },
      { k: 'forbidSpade3', type: 'toggle', label: '　└ ♠3単体', desc: '♠3を1枚で出して上がるのは反則。', dep: 'forbiddenFinish' },
      { k: 'miyakoOchi', type: 'toggle', label: '都落ち', desc: '前回の大富豪が1位になれないと、その瞬間に大貧民へ転落。' },
      { k: 'gekokujo', type: 'toggle', label: '下剋上', desc: '大貧民が1位で上がると、その場でゲーム終了し全員の身分が逆転する。' },
      { k: 'tenpen', type: 'toggle', label: '天変地異', desc: '大貧民の配札が10以下だけなら、大富豪と手札をまるごと交換。' },
    ],
  },
  {
    id: 'exchange',
    title: 'カード交換',
    icon: 'swap',
    fields: [
      { k: 'exchange', type: 'toggle', label: 'カード交換', desc: '2戦目以降、下位は最も強いカードを、上位は好きなカードを渡す。' },
      { k: 'exchangeTop', type: 'number', label: '大富豪 ⇔ 大貧民', desc: '交換する枚数。', min: 0, max: 4, suffix: '枚', dep: 'exchange' },
      { k: 'exchangeSecond', type: 'number', label: '富豪 ⇔ 貧民', desc: '交換する枚数（4人以上）。', min: 0, max: 3, suffix: '枚', dep: 'exchange' },
    ],
  },
  {
    id: 'match',
    title: '試合形式',
    icon: 'trophy',
    fields: [
      { k: 'games', type: 'number', label: 'ゲーム数', desc: '1試合で遊ぶゲームの数。', min: 1, max: 30, suffix: '戦' },
      { k: 'setLength', type: 'number', label: 'セットの長さ', desc: 'このゲーム数ごとに身分をリセット（0 = リセットしない）。連盟公式は4。', min: 0, max: 12, suffix: '戦' },
      {
        k: 'scoring',
        type: 'select',
        label: '得点',
        desc: '連盟式: 4人で 大富豪6・富豪4・貧民2・大貧民0。シンプル: 人数-1 から 1 点ずつ減る。',
        options: [['simple', 'シンプル'], ['federation', '連盟式']],
      },
      { k: 'setFinalBonus', type: 'number', label: 'セット最終戦ボーナス', desc: 'セット最後のゲームの大富豪に加点。', min: 0, max: 10, suffix: '点' },
      { k: 'turnSeconds', type: 'number', label: '持ち時間', desc: '1手の制限時間（0 = 無制限）。時間切れは自動でパス。オンライン向け。', min: 0, max: 120, suffix: '秒' },
    ],
  },
];

const RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

interface Props {
  value: RuleConfig;
  onChange?: (c: RuleConfig) => void;
  onClose: () => void;
  title?: string;
  readOnly?: boolean;
}

export function RuleEditor({ value, onChange, onClose, title = 'ルール設定', readOnly }: Props) {
  const settings = useSettings();
  const [cfg, setCfg] = useState<RuleConfig>(() => cloneConfig(value));
  const [section, setSection] = useState('deck');
  const [saveName, setSaveName] = useState('');
  const preset = matchPreset(cfg);
  const custom = settings.customRules.find((r) => JSON.stringify(normalizeConfig(r.config)) === JSON.stringify(normalizeConfig(cfg)));

  const set = (patch: Partial<RuleConfig>) => {
    if (readOnly) return;
    sfx('click');
    setCfg((c) => normalizeConfig({ ...c, ...patch }));
  };
  const setEffect = (k: EffectKey, patch: Partial<{ on: boolean; rank: number }>) => {
    if (readOnly) return;
    sfx('click');
    setCfg((c) => normalizeConfig({ ...c, effects: { ...c.effects, [k]: { ...c.effects[k], ...patch } } }));
  };

  const commit = () => {
    onChange?.(normalizeConfig(cfg));
    onClose();
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const anim = useRef(0);

  // 見出しが固定バーのすぐ下に来るスクロール位置
  const sectionTop = (box: HTMLElement, id: string) => {
    const el = document.getElementById(`rs-${id}`);
    if (!el) return 0;
    const offset = (stickyRef.current?.offsetHeight ?? 0) + 10;
    return el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - offset;
  };

  // スクロール位置から今見ている項目を選ぶ
  useEffect(() => {
    const box = scrollRef.current;
    if (!box) return;
    const onScroll = () => {
      if (anim.current) return;
      let cur = SECTIONS[0].id;
      for (const s of SECTIONS) if (sectionTop(box, s.id) <= box.scrollTop + 40) cur = s.id;
      if (box.scrollTop + box.clientHeight >= box.scrollHeight - 2) cur = SECTIONS[SECTIONS.length - 1].id;
      setSection(cur);
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      box.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(anim.current);
    };
  }, []);

  // 横並びのメニュー（スマホ）では選択中の項目が見えるように寄せる
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = navRef.current;
    const btn = nav?.querySelector<HTMLElement>('button.on');
    if (!nav || !btn || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollTo({ left: btn.offsetLeft - (nav.clientWidth - btn.offsetWidth) / 2, behavior: 'smooth' });
  }, [section]);

  // OS のアニメーション設定に左右されないよう自前でなめらかにスクロールする
  const scrollTo = (id: string) => {
    const box = scrollRef.current;
    if (!box) return;
    setSection(id);
    cancelAnimationFrame(anim.current);
    const from = box.scrollTop;
    const to = Math.max(0, Math.min(sectionTop(box, id), box.scrollHeight - box.clientHeight));
    const dur = Math.min(650, 250 + Math.abs(to - from) * 0.25);
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      box.scrollTop = from + (to - from) * e;
      anim.current = t < 1 ? requestAnimationFrame(step) : 0;
    };
    anim.current = requestAnimationFrame(step);
  };

  // 親要素の backdrop-filter に閉じ込められないよう body 直下に描画する
  return createPortal(
    <motion.div className="rule-editor" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}>
      <header className="re-head">
        <button className="btn ghost sm" onClick={onClose}>
          ← 戻る
        </button>
        <h2>{title}</h2>
        {!readOnly && (
          <button className="btn primary" onClick={commit}>
            この設定で決定
          </button>
        )}
      </header>

      <div className="re-presets">
        {PRESETS.map((p) => (
          <button key={p.id} className={`preset-card ${preset === p.id ? 'on' : ''}`} onClick={() => !readOnly && setCfg(cloneConfig(p.config))} disabled={readOnly}>
            <small>{p.sub}</small>
            <b>{p.name}</b>
            <span>{p.desc}</span>
          </button>
        ))}
        {settings.customRules.map((r) => (
          <div key={r.id} className={`preset-card custom ${custom?.id === r.id ? 'on' : ''}`}>
            <button className="pc-main" onClick={() => !readOnly && setCfg(cloneConfig(r.config))} disabled={readOnly}>
              <small>CUSTOM</small>
              <b>{r.name}</b>
              <span>{ruleBadges(r.config).slice(0, 8).join('・')}</span>
            </button>
            {!readOnly && (
              <button className="pc-del" title="削除" onClick={() => updateSettings({ customRules: settings.customRules.filter((x) => x.id !== r.id) })}>
                ×
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="re-body">
        <nav className="re-nav" ref={navRef}>
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'on' : ''} onClick={() => scrollTo(s.id)}>
              <Icon name={s.icon} size={18} />
              {s.title}
            </button>
          ))}
        </nav>
        <div className="re-sections" ref={scrollRef}>
          <div className="re-current" ref={stickyRef}>
            <b>{preset ? PRESETS.find((p) => p.id === preset)!.name : custom ? custom.name : 'カスタム'}</b>
            <div className="badges">
              {ruleBadges(cfg).map((b) => (
                <span key={b} className="badge">
                  {b}
                </span>
              ))}
            </div>
          </div>
          {SECTIONS.map((s) => (
            <section key={s.id} id={`rs-${s.id}`} className="re-section">
              <h3>
                <Icon name={s.icon} size={18} />
                {s.title}
              </h3>
              {s.fields?.map((f) => {
                const disabled = readOnly || (f.dep ? !cfg[f.dep] : false);
                const v = cfg[f.k] as any;
                return (
                  <div key={f.k} className={`re-row ${disabled && !readOnly ? 'is-disabled' : ''}`}>
                    <div className="re-label">
                      <b>{f.label}</b>
                      <span>{f.desc}</span>
                    </div>
                    <div className="re-ctrl">
                      {f.type === 'toggle' && (
                        <button className={`switch ${v ? 'on' : ''}`} onClick={() => !disabled && set({ [f.k]: !v } as any)} disabled={disabled} aria-pressed={!!v}>
                          <i />
                        </button>
                      )}
                      {f.type === 'select' && (
                        <div className="seg">
                          {f.options.map(([ov, ol]) => (
                            <button key={String(ov)} className={v === ov ? 'on' : ''} onClick={() => !disabled && set({ [f.k]: ov } as any)} disabled={disabled}>
                              {ol}
                            </button>
                          ))}
                        </div>
                      )}
                      {f.type === 'number' && (
                        <div className="stepper">
                          <button onClick={() => set({ [f.k]: Math.max(f.min, v - 1) } as any)} disabled={disabled || v <= f.min}>
                            −
                          </button>
                          <span>
                            {v}
                            {f.suffix}
                          </span>
                          <button onClick={() => set({ [f.k]: Math.min(f.max, v + 1) } as any)} disabled={disabled || v >= f.max}>
                            ＋
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {s.effects && (
                <>
                  <p className="re-note">それぞれの効果を発動させる数字も自由に変えられます（例：9リバース → Kリバース）。</p>
                  {EFFECT_KEYS.map((k) => {
                    const e = cfg.effects[k];
                    return (
                      <div key={k} className="re-row effect-row">
                        <div className="re-label">
                          <b>
                            <span className="eff-mark">{EFFECT_INFO[k].short}</span>
                            {effectDisplayName(k, e.rank)}
                          </b>
                          <span>{EFFECT_INFO[k].desc}</span>
                        </div>
                        <div className="re-ctrl col">
                          <button className={`switch ${e.on ? 'on' : ''}`} onClick={() => setEffect(k, { on: !e.on })} disabled={readOnly}>
                            <i />
                          </button>
                          <select value={e.rank} onChange={(ev) => setEffect(k, { rank: Number(ev.target.value) })} disabled={readOnly || !e.on}>
                            {RANKS.map((r) => (
                              <option key={r} value={r}>
                                {rankLabel(r)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}
                  <div className="re-row">
                    <div className="re-label">
                      <b>階段に含まれる効果札も発動</b>
                      <span>例：7-8-9 の階段で8切り（連盟公式では不採用）。</span>
                    </div>
                    <div className="re-ctrl">
                      <button className={`switch ${cfg.effectsInSequence ? 'on' : ''}`} onClick={() => set({ effectsInSequence: !cfg.effectsInSequence })} disabled={readOnly}>
                        <i />
                      </button>
                    </div>
                  </div>
                  <div className="re-row">
                    <div className="re-label">
                      <b>5飛びを枚数分</b>
                      <span>5を2枚出したら2人飛ばす。OFFなら常に1人。</span>
                    </div>
                    <div className="re-ctrl">
                      <button className={`switch ${cfg.skipPerCard ? 'on' : ''}`} onClick={() => set({ skipPerCard: !cfg.skipPerCard })} disabled={readOnly}>
                        <i />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </section>
          ))}
          {!readOnly && (
            <section className="re-section re-save">
              <h3>
                <Icon name="pencil" size={18} />カスタムルールとして保存
              </h3>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = saveName.trim() || `マイルール${settings.customRules.length + 1}`;
                  updateSettings({ customRules: [...settings.customRules, { id: genId(), name, config: normalizeConfig(cfg) }] });
                  setSaveName('');
                  sfx('win');
                }}
              >
                <input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="ルール名（例：うちの地元ルール）" maxLength={20} />
                <button className="btn">保存</button>
              </form>
            </section>
          )}
        </div>
      </div>
    </motion.div>,
    document.body,
  );
}
