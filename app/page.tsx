'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Crosshair,
  Volume2,
  VolumeX,
  Maximize,
  Pause,
  Play,
  ArrowUpRight,
  RotateCcw,
} from 'lucide-react';
import { Game, type Snapshot } from './game';
const levels = [
  {
    name: '丛林突袭',
    en: 'JUNGLE',
    brief: '穿过丛林与断桥，摧毁敌军的前线堡垒。',
  },
  { name: '基地攻坚', en: 'BASE', brief: '深入纵深基地，逐室击破防线与核心。' },
  {
    name: '瀑布要塞',
    en: 'WATERFALL',
    brief: '沿瀑布向上攀登，击败山顶的钢铁巨兽。',
  },
];
export default function Home() {
  const canvas = useRef<HTMLCanvasElement>(null),
    frame = useRef<HTMLDivElement>(null),
    game = useRef<Game | null>(null);
  const [s, setS] = useState<Snapshot>({
    state: 'menu',
    level: 0,
    lives: 5,
    score: 0,
    weapon: 'R',
    progress: 0,
    high: 0,
    boss: 0,
    bossMax: 0,
    room: 0,
  });
  const [selected, setSelected] = useState(0),
    [easy, setEasy] = useState(true),
    [muted, setMuted] = useState(false),
    [help, setHelp] = useState(false),
    [full, setFull] = useState(false);
  useEffect(() => {
    const g = new Game(canvas.current!, (v) => {
      setS(v);
      if (v.muted !== undefined) setMuted(v.muted);
    });
    game.current = g;
    return () => {
      g.destroy();
      game.current = null;
    };
  }, []);
  useEffect(() => {
    if (game.current) game.current.easy = easy;
  }, [easy]);
  useEffect(() => {
    if (s.state === 'menu') setSelected(s.level);
  }, [s.state, s.level]);
  useEffect(() => {
    const cb = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', cb);
    return () => document.removeEventListener('fullscreenchange', cb);
  }, []);
  function start(level = selected) {
    setHelp(false);
    game.current?.start(level, easy);
    canvas.current?.focus();
  }
  function key(code: string, down: boolean) {
    game.current?.input(code, down);
  }
  const touch = (code: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      key(code, true);
    },
    onPointerUp: () => key(code, false),
    onPointerCancel: () => key(code, false),
    onLostPointerCapture: () => key(code, false),
  });
  const active = s.state === 'playing' || s.state === 'paused';
  return (
    <main className="arcade">
      <header className="masthead">
        <a className="brand" href="/" aria-label="魂斗罗首页">
          <span className="brand-mark">
            <Crosshair size={23} />
          </span>
          <b>
            CONTRA<span>魂斗罗</span>
          </b>
        </a>
        <div className="edition">
          <i /> 三关战役 <span> / </span> WEB ARCADE
        </div>
        <button
          className="text-button"
          onClick={() => {
            if (s.state === 'playing') game.current?.pause();
            setHelp(!help);
          }}
        >
          操作指南 <ArrowUpRight size={15} />
        </button>
      </header>
      <section className="game-section">
        <div className="mission-bar">
          <div>
            <span className="tiny">OPERATION 01—03</span>
            <h1>
              铁血突击<span> / IRON COMMANDO</span>
            </h1>
          </div>
          <span className="record">
            个人最高 <b>{String(s.high).padStart(6, '0')}</b>
          </span>
        </div>
        <div className={'cabinet ' + (full ? 'is-full' : '')} ref={frame}>
          <div className="game-toolbar">
            <div className="live">
              <i /> {active ? 'MISSION IN PROGRESS' : 'READY TO DEPLOY'}
            </div>
            <div className="tools">
              <button
                aria-label={muted ? '开启声音' : '关闭声音'}
                onClick={() => {
                  game.current?.setMuted(!muted);
                  setMuted(!muted);
                }}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <button
                aria-label="暂停或继续"
                disabled={!active}
                onClick={() => game.current?.pause()}
              >
                {s.state === 'paused' ? (
                  <Play size={17} />
                ) : (
                  <Pause size={17} />
                )}
              </button>
              <button
                aria-label="全屏游戏"
                onClick={async () => {
                  try {
                    if (document.fullscreenElement)
                      await document.exitFullscreen();
                    else await frame.current?.requestFullscreen();
                  } catch {}
                }}
              >
                <Maximize size={18} />
              </button>
            </div>
          </div>
          <div className="screen">
            <canvas
              ref={canvas}
              width={960}
              height={540}
              tabIndex={0}
              aria-label="魂斗罗游戏画面，方向键移动，Z 射击，X 跳跃"
            />
            {s.state === 'menu' && (
              <div className="start-overlay">
                <div className="start-copy">
                  <div className="eyebrow">
                    <span /> THE ARCADE RETURNS
                  </div>
                  <h2>
                    魂斗罗<span>CONTRA</span>
                  </h2>
                  <p>一枪，一跃。重返战场。</p>
                  <button className="deploy" onClick={() => start()}>
                    <Play size={17} fill="currentColor" />{' '}
                    {selected === 0 ? '开始战役' : '练习本关'} <span>↵</span>
                  </button>
                  <div className="difficulty">
                    <button
                      className={easy ? 'chosen' : ''}
                      onClick={() => setEasy(true)}
                    >
                      休闲 · 5 命
                    </button>
                    <span>/</span>
                    <button
                      className={!easy ? 'chosen' : ''}
                      onClick={() => setEasy(false)}
                    >
                      经典 · 3 命
                    </button>
                  </div>
                  <div className="start-caption">{levels[selected].brief}</div>
                </div>
                <div className="scene-label">
                  <span>0{selected + 1} / FIELD NOTES</span>
                  <b>无畏前行</b>
                  <small>RUN. JUMP. FIGHT.</small>
                </div>
              </div>
            )}
            {active && (
              <div className="hud">
                <div>
                  <span>1P</span>
                  <b className="life">{'♥'.repeat(s.lives)}</b>
                </div>
                <div className="hud-score">
                  <span>SCORE</span>
                  <b>{String(s.score).padStart(6, '0')}</b>
                </div>
                <div>
                  <span>WEAPON</span>
                  <b className="weapon">{s.weapon}</b>
                </div>
              </div>
            )}
            {s.state === 'playing' && s.boss > 0 && (
              <div className="boss-health">
                <span>{['前线堡垒', '防御中枢', '钢铁巨兽'][s.level]}</span>
                <div>
                  <i style={{ width: `${(100 * s.boss) / s.bossMax}%` }} />
                </div>
              </div>
            )}
            {s.state === 'playing' && s.level === 1 && (
              <div className="room-label">
                基地防线 {s.room + 1} / 4 · 左右瞄准 · ↓ 卧倒躲弹
              </div>
            )}
            {['paused', 'gameover', 'clear', 'victory'].includes(s.state) && (
              <div className="modal-overlay">
                <div className="modal-card">
                  <span className="eyebrow">
                    {s.state === 'paused'
                      ? 'TAKE A BREATH'
                      : s.state === 'gameover'
                        ? 'MISSION FAILED'
                        : s.state === 'victory'
                          ? 'MISSION ACCOMPLISHED'
                          : 'SECTOR SECURED'}
                  </span>
                  <h2>
                    {s.state === 'paused'
                      ? '战场暂停'
                      : s.state === 'gameover'
                        ? '再次出击'
                        : s.state === 'victory'
                          ? '全线告捷'
                          : '关卡完成'}
                  </h2>
                  <p>
                    {s.state === 'paused'
                      ? '准备好后，继续向前。'
                      : s.state === 'gameover'
                        ? '战士倒下了，斗志还在。'
                        : s.state === 'victory'
                          ? '三道防线已突破。你完成了这场战役。'
                          : `${levels[s.level].name}已突破，下一道防线等着你。`}
                  </p>
                  <div className="result-score">
                    {String(s.score).padStart(6, '0')} <span>PTS</span>
                  </div>
                  <button
                    className="deploy"
                    onClick={() => {
                      if (s.state === 'paused') game.current?.pause();
                      else if (s.state === 'clear') game.current?.next();
                      else start(s.state === 'victory' ? 0 : s.level);
                    }}
                  >
                    {s.state === 'paused' ? (
                      <Play size={17} />
                    ) : (
                      <RotateCcw size={17} />
                    )}{' '}
                    {s.state === 'paused'
                      ? '继续作战'
                      : s.state === 'clear'
                        ? '进入下一关'
                        : s.state === 'victory'
                          ? '再战一次'
                          : '重试本关'}
                  </button>
                  <button
                    className="return"
                    onClick={() => game.current?.menu()}
                  >
                    返回标题画面
                  </button>
                </div>
              </div>
            )}
            {help && (
              <div className="modal-overlay">
                <div className="modal-card guide">
                  <span className="eyebrow">FIELD MANUAL</span>
                  <h2>操作指南</h2>
                  <p>
                    方向键 / WASD 移动；↑ / W 向上瞄准；↓ / S 卧倒。按住 Z / J
                    连续射击，X / K / 空格跳跃。移动同时按上、下可斜射。P / Esc
                    暂停，M 静音。
                  </p>
                  <p>
                    红色子弹与敌人会造成伤害。收集 S 散弹、M 连射、L 激光、B
                    护盾。第二关左右移动对准目标，卧倒躲弹；第三关在平台间逐级向上跳跃。
                  </p>
                  <button className="deploy" onClick={() => setHelp(false)}>
                    明白，准备出发
                  </button>
                </div>
              </div>
            )}
            <div className="scanlines" />
          </div>
          <div className="touch-controls">
            <div className="dpad">
              <button {...touch('ArrowUp')} aria-label="向上瞄准">
                ↑
              </button>
              <button {...touch('ArrowLeft')} aria-label="向左移动">
                ←
              </button>
              <button {...touch('ArrowDown')} aria-label="卧倒">
                ↓
              </button>
              <button {...touch('ArrowRight')} aria-label="向右移动">
                →
              </button>
            </div>
            <div className="action-pad">
              <button {...touch('KeyX')}>
                跳跃 <b>B</b>
              </button>
              <button {...touch('KeyZ')}>
                射击 <b>A</b>
              </button>
            </div>
          </div>
          <div className="screen-footer">
            <span>
              <i /> {String(s.level + 1).padStart(2, '0')} ·{' '}
              {levels[s.level].name}
            </span>
            <span>
              {active ? `${Math.floor(s.progress * 100)}% 已推进` : '单人作战'}
              <i className="divider" /> 60 FPS
            </span>
          </div>
        </div>
        <div className="chapters">
          {levels.map((l, i) => (
            <button
              key={l.en}
              className={
                'chapter ' +
                ((active ? s.level : selected) === i ? 'selected' : '')
              }
              disabled={active}
              onClick={() => {
                setSelected(i);
                game.current?.preview(i);
              }}
            >
              <span className="chapter-no">0{i + 1}</span>
              <div>
                <span className="tiny">{l.en}</span>
                <h3>{l.name}</h3>
              </div>
              <span className="chapter-end">
                {i === 0 ? 'START' : 'SELECT'} ↗
              </span>
            </button>
          ))}
        </div>
        <div className="controls-legend">
          <div>
            <kbd>←</kbd>
            <kbd>→</kbd>
            <span>移动</span>
          </div>
          <div>
            <kbd>↑</kbd>
            <kbd>↓</kbd>
            <span>瞄准 / 卧倒</span>
          </div>
          <div>
            <kbd>Z</kbd>
            <span>射击</span>
          </div>
          <div>
            <kbd>X</kbd>
            <span>跳跃</span>
          </div>
          <div>
            <kbd>P</kbd>
            <span>暂停</span>
          </div>
          <span className="hold-hint">按住射击，保持火力。</span>
        </div>
      </section>
      <footer className="page-footer">
        <span>
          致敬 8-BIT 黄金时代 <b>✳</b> 原创像素 · 非官方同人作品
        </span>
        <span>
          INSERT COURAGE. <span className="orange">PRESS START.</span>
        </span>
      </footer>
    </main>
  );
}
