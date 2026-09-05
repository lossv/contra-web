export type Snapshot = {
  state: string;
  level: number;
  lives: number;
  score: number;
  weapon: string;
  progress: number;
  high: number;
  boss: number;
  bossMax: number;
  room: number;
  muted?: boolean;
};
type Rect = { x: number; y: number; w: number; h: number };
type Platform = Rect & { kind?: string };
type Enemy = Rect & {
  type: string;
  hp: number;
  max: number;
  timer: number;
  dir: number;
  home: number;
  phase: number;
  dead?: boolean;
};
type Bullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  r: number;
  enemy: boolean;
  power: number;
  laser?: boolean;
  low?: boolean;
};
type Drop = { x: number; y: number; kind: string; t: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  life: number;
  color: string;
  size: number;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const hit = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const hash = (i: number) => {
  const v = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};
export class Game {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cb: (s: Snapshot) => void;
  state = 'menu';
  level = 0;
  easy = true;
  lives = 5;
  score = 0;
  high = 0;
  weapon = 'R';
  room = 0;
  muted = false;
  p = {
    x: 100,
    y: 400,
    w: 22,
    h: 38,
    vx: 0,
    vy: 0,
    dir: 1,
    ground: false,
    crouch: false,
    inv: 0,
    fire: 0,
    coyote: 0,
    buffer: 0,
  };
  platforms: Platform[] = [];
  enemies: Enemy[] = [];
  bullets: Bullet[] = [];
  drops: Drop[] = [];
  particles: Particle[] = [];
  keys = new Set<string>();
  camX = 0;
  camY = 0;
  width = 4600;
  height = 540;
  timer = 0;
  shake = 0;
  boss: Enemy | null = null;
  checkpoint = { x: 100, y: 410 };
  kills = 0;
  transition = 0;
  banner = 0;
  raf = 0;
  last = 0;
  acc = 0;
  uiTimer = 0;
  musicTimer = 0;
  note = 0;
  audio: AudioContext | null = null;
  abort = new AbortController();
  selected = 0;
  constructor(canvas: HTMLCanvasElement, cb: (s: Snapshot) => void) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.cb = cb;
    try {
      this.high = Number(localStorage.getItem('iron-commando-best')) || 0;
    } catch {}
    const opts = { signal: this.abort.signal };
    window.addEventListener('keydown', this.keyDown, opts);
    window.addEventListener('keyup', this.keyUp, opts);
    window.addEventListener('blur', this.onBlur, opts);
    document.addEventListener('visibilitychange', this.onVisibility, opts);
    this.setup(0);
    this.state = 'menu';
    this.emit();
    this.raf = requestAnimationFrame(this.loop);
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (t: unknown, o: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (context?.registerTool) {
      const result = (data: unknown) => ({
        content: [{ type: 'text', text: JSON.stringify(data) }],
      });
      for (const tool of [
        {
          name: 'read_game_state',
          description:
            'Read the current game level, score, lives, progress and status.',
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: () => result(this.snapshot()),
        },
        {
          name: 'start_game',
          description:
            'Start a new three-stage campaign or practice from a selected level. This resets the current run.',
          inputSchema: {
            type: 'object',
            properties: {
              level: { type: 'integer', minimum: 1, maximum: 3 },
              difficulty: { type: 'string', enum: ['casual', 'classic'] },
            },
            required: ['level', 'difficulty'],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute: (input: unknown) => {
            const v = input as { level: number; difficulty: string };
            if (
              !v ||
              !Number.isInteger(v.level) ||
              v.level < 1 ||
              v.level > 3 ||
              !['casual', 'classic'].includes(v.difficulty)
            )
              throw new Error(
                'Choose level 1–3 and casual or classic difficulty.',
              );
            this.start(v.level - 1, v.difficulty === 'casual');
            return result(this.snapshot());
          },
        },
      ]) {
        try {
          Promise.resolve(
            context.registerTool(tool, { signal: this.abort.signal }),
          ).catch(() => {});
        } catch {}
      }
    }
  }
  keyDown = (e: KeyboardEvent) => {
    if (
      ['BUTTON', 'INPUT', 'SELECT'].includes(
        (e.target as HTMLElement)?.tagName,
      ) &&
      e.code === 'Enter'
    )
      return;
    if (
      [
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'Space',
        'KeyZ',
        'KeyX',
        'KeyJ',
        'KeyK',
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'KeyP',
        'Escape',
        'Enter',
        'KeyM',
      ].includes(e.code)
    ) {
      e.preventDefault();
      if (!e.repeat) this.input(e.code, true);
    }
  };
  keyUp = (e: KeyboardEvent) => this.input(e.code, false);
  onBlur = () => {
    this.keys.clear();
    if (this.state === 'playing') {
      this.state = 'paused';
      this.emit();
    }
  };
  onVisibility = () => {
    if (document.hidden) this.onBlur();
  };
  input(code: string, down: boolean) {
    if (!down) {
      this.keys.delete(code);
      return;
    }
    if (this.keys.has(code)) return;
    this.keys.add(code);
    if (['KeyX', 'KeyK', 'Space'].includes(code)) this.p.buffer = 0.14;
    if (code === 'KeyP' || code === 'Escape') this.pause();
    if (code === 'KeyM') this.setMuted(!this.muted);
    if (code === 'Enter') {
      if (this.state === 'menu') this.start(this.selected, this.easy);
      else if (this.state === 'paused') this.pause();
      else if (this.state === 'clear') this.next();
      else if (this.state === 'gameover') this.start(this.level, this.easy);
      else if (this.state === 'victory') this.start(0, this.easy);
    }
  }
  held(...codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }
  setMuted(m: boolean) {
    this.muted = m;
    this.emit();
  }
  unlock() {
    try {
      this.audio ??= new AudioContext();
      void this.audio.resume().catch(() => {});
    } catch {}
  }
  tone(
    freq: number,
    dur = 0.07,
    type: OscillatorType = 'square',
    vol = 0.024,
    end?: number,
  ) {
    if (this.muted || !this.audio || this.audio.state !== 'running') return;
    try {
      const a = this.audio,
        o = a.createOscillator(),
        g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, a.currentTime);
      if (end)
        o.frequency.exponentialRampToValueAtTime(end, a.currentTime + dur);
      g.gain.setValueAtTime(vol, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur);
      o.connect(g);
      g.connect(a.destination);
      o.start();
      o.stop(a.currentTime + dur);
    } catch {}
  }
  music(dt: number) {
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 0.19;
      const notes = [
        147, 0, 147, 220, 196, 0, 165, 196, 131, 0, 131, 196, 165, 0, 147, 110,
      ];
      const f = notes[this.note++ % notes.length];
      if (f)
        this.tone(f * (this.level === 1 ? 0.75 : 1), 0.14, 'triangle', 0.016);
      if (this.note % 4 === 0) this.tone(65, 0.05, 'square', 0.01, 35);
    }
  }
  makeEnemy(x: number, y: number, type = 'soldier', hp = 2): Enemy {
    return {
      x,
      y,
      w: type === 'turret' ? 32 : 24,
      h: type === 'turret' ? 30 : 38,
      type,
      hp,
      max: hp,
      timer: 1 + hash(x) * 1.5,
      dir: -1,
      home: x,
      phase: hash(x) * 6,
    };
  }
  setup(level: number) {
    this.level = clamp(level, 0, 2);
    this.platforms = [];
    this.enemies = [];
    this.bullets = [];
    this.drops = [];
    this.particles = [];
    this.boss = null;
    this.camX = 0;
    this.camY = 0;
    this.room = 0;
    this.transition = 0;
    this.banner = 3;
    this.width = 4600;
    this.height = 540;
    this.p = {
      x: 100,
      y: 410,
      w: 22,
      h: 38,
      vx: 0,
      vy: 0,
      dir: 1,
      ground: false,
      crouch: false,
      inv: 2.5,
      fire: 0,
      coyote: 0,
      buffer: 0,
    };
    if (this.level === 0) {
      for (const [x, w] of [
        [0, 690],
        [810, 760],
        [1690, 850],
        [2670, 840],
        [3650, 950],
      ])
        this.platforms.push({ x, y: 454, w, h: 86, kind: 'ground' });
      for (const [x, y, w] of [
        [420, 366, 185],
        [690, 401, 130],
        [1090, 365, 230],
        [1470, 383, 140],
        [1880, 365, 210],
        [2280, 378, 180],
        [2530, 399, 150],
        [2860, 355, 225],
        [3300, 375, 180],
        [3500, 400, 160],
        [3910, 354, 200],
      ])
        this.platforms.push({
          x,
          y,
          w,
          h: 16,
          kind: x === 690 || x === 2530 || x === 3500 ? 'bridge' : 'ledge',
        });
      for (const x of [
        530, 1030, 1230, 1440, 1810, 2120, 2390, 2820, 3140, 3420, 3790, 4020,
      ])
        this.enemies.push(this.makeEnemy(x, 416));
      for (const [x, y] of [
        [1140, 335],
        [1950, 335],
        [2930, 325],
        [3950, 324],
      ])
        this.enemies.push(this.makeEnemy(x, y, 'turret', 6));
      for (const x of [1450, 2310, 3190])
        this.enemies.push(this.makeEnemy(x, 200, 'drone', 3));
      for (const [x, y, kind] of [
        [350, 414, 'S'],
        [1120, 327, 'M'],
        [1950, 324, 'L'],
        [2760, 414, 'B'],
        [3890, 414, 'S'],
      ] as [number, number, string][])
        this.drops.push({ x, y, kind, t: 0 });
      this.boss = {
        ...this.makeEnemy(4400, 289, 'fortress', this.easy ? 100 : 140),
        w: 160,
        h: 165,
        timer: 1.4,
      };
    } else if (this.level === 1) {
      this.width = 960;
      this.platforms = [{ x: 0, y: 477, w: 960, h: 63, kind: 'metal' }];
      this.p.x = 465;
      this.p.y = 439;
      this.loadRoom();
    } else {
      this.width = 960;
      this.height = 2520;
      this.camY = 1980;
      this.platforms = [{ x: 50, y: 2430, w: 860, h: 90, kind: 'ground' }];
      const lanes = [
        150, 310, 470, 570, 410, 250, 130, 290, 450, 550, 390, 230, 130, 290,
        450, 580, 420, 260, 100, 260, 420, 560, 400, 240, 100, 280, 440, 330,
      ];
      for (let i = 0; i < lanes.length; i++) {
        const x = lanes[i],
          y = 2352 - i * 78,
          w = 250;
        this.platforms.push({ x, y, w, h: 21, kind: 'rock' });
        if (i % 3 === 1)
          this.enemies.push(this.makeEnemy(x + 160, y - 30, 'turret', 4));
        if (i % 6 === 2)
          this.drops.push({
            x: x + 60,
            y: y - 35,
            kind: ['S', 'M', 'B', 'L'][Math.floor(i / 6) % 4],
            t: 0,
          });
      }
      this.platforms.push({ x: 110, y: 198, w: 750, h: 30, kind: 'rock' });
      this.p.x = 180;
      this.p.y = 2392;
      this.boss = {
        ...this.makeEnemy(490, 68, 'giant', this.easy ? 125 : 165),
        w: 155,
        h: 128,
        timer: 1.8,
      };
    }
    this.checkpoint = { x: this.p.x, y: this.p.y };
  }
  loadRoom() {
    this.bullets = [];
    this.enemies = [];
    this.drops = [];
    this.transition = 0;
    this.banner = 2;
    if (this.room === 3) {
      this.boss = {
        ...this.makeEnemy(372, 146, 'core', this.easy ? 125 : 175),
        w: 216,
        h: 148,
        timer: 1.4,
      };
      return;
    }
    this.boss = null;
    const positions =
      this.room === 0
        ? [240, 465, 690]
        : this.room === 1
          ? [195, 375, 555, 735]
          : [175, 325, 475, 625, 775];
    positions.forEach((x, i) => {
      const e = this.makeEnemy(
        x,
        245 - (i % 2) * 35,
        i === Math.floor(positions.length / 2) ? 'reactor' : 'target',
        this.room === 0 ? 8 : 12,
      );
      e.w = 38;
      e.h = 42;
      e.timer = 1.7 + i * 0.35;
      this.enemies.push(e);
    });
  }
  start(level = 0, easy = true) {
    this.easy = easy;
    this.selected = level;
    this.lives = easy ? 5 : 3;
    this.score = 0;
    this.kills = 0;
    this.weapon = 'R';
    this.keys.clear();
    this.setup(level);
    this.state = 'playing';
    this.unlock();
    this.tone(440, 0.12, 'triangle');
    this.emit();
  }
  next() {
    if (this.state !== 'clear') return;
    this.lives = Math.max(this.lives, this.easy ? 3 : 2);
    this.setup(this.level + 1);
    this.state = 'playing';
    this.emit();
  }
  menu() {
    this.state = 'menu';
    this.selected = this.level;
    this.setup(this.level);
    this.keys.clear();
    this.emit();
  }
  preview(level: number) {
    if (this.state !== 'menu') return;
    this.selected = level;
    this.setup(level);
    this.emit();
  }
  pause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.keys.clear();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.unlock();
    }
    this.emit();
  }
  snapshot(): Snapshot {
    let progress =
      this.level === 0
        ? this.p.x / 4400
        : this.level === 1
          ? (this.room + (1 - this.enemies.filter((e) => !e.dead).length / 5)) /
            4
          : (2430 - this.p.y) / 2300;
    return {
      state: this.state,
      level: this.level,
      lives: this.lives,
      score: this.score,
      weapon: this.weapon,
      high: this.high,
      progress: clamp(progress, 0, 1),
      boss: this.bossActive() ? Math.max(0, this.boss!.hp) : 0,
      bossMax: this.boss?.max || 0,
      room: this.room,
      muted: this.muted,
    };
  }
  emit() {
    this.cb(this.snapshot());
  }
  bossActive() {
    return (
      !!this.boss &&
      !this.boss.dead &&
      (this.level === 0
        ? this.p.x > 3900
        : this.level === 1
          ? this.room === 3
          : this.p.y < 430)
    );
  }
  addScore(n: number) {
    this.score += n;
    if (this.score > this.high) {
      this.high = this.score;
      try {
        localStorage.setItem('iron-commando-best', String(this.high));
      } catch {}
    }
  }
  burst(x: number, y: number, color = '#ff9d48', count = 18) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2,
        v = 40 + Math.random() * 160;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        t: 0.4 + Math.random() * 0.4,
        life: 0.8,
        color: i % 3 ? color : '#fff1ac',
        size: 2 + Math.random() * 5,
      });
    }
    this.shake = Math.max(this.shake, 0.12);
  }
  hurt(fall = false) {
    if (this.state !== 'playing' || (!fall && this.p.inv > 0)) return;
    this.lives--;
    this.burst(this.p.x + 11, this.p.y + 15, '#f77542', 26);
    this.tone(170, 0.3, 'sawtooth', 0.05, 35);
    this.shake = 0.3;
    if (this.lives <= 0) {
      this.lives = 0;
      this.state = 'gameover';
      this.keys.clear();
      this.emit();
      return;
    }
    this.weapon = 'R';
    this.p.inv = 3;
    this.p.vy = 0;
    this.p.vx = 0;
    this.bullets = this.bullets.filter((b) => !b.enemy);
    if (fall) {
      this.p.x = this.checkpoint.x;
      this.p.y = this.checkpoint.y;
      this.camY = clamp(this.p.y - 350, 0, this.height - 540);
    }
    this.emit();
  }
  fire() {
    const p = this.p;
    let dx = p.dir,
      dy = 0;
    if (this.level === 1) {
      dx = 0;
      dy = -1;
    } else {
      const up = this.held('ArrowUp', 'KeyW'),
        down = this.held('ArrowDown', 'KeyS'),
        move = this.held('ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD');
      if (up) {
        dy = -1;
        dx = move ? p.dir : 0;
      } else if (down && !p.ground) {
        dy = 1;
        dx = move ? p.dir : 0;
      }
    }
    const angle = Math.atan2(dy, dx),
      spread = this.weapon === 'S' ? [-0.23, -0.115, 0, 0.115, 0.23] : [0];
    const speed = this.weapon === 'L' ? 920 : 640;
    for (const a of spread)
      this.bullets.push({
        x: p.x + 11 + (this.level === 1 ? 0 : dx * 15),
        y: p.y + (p.crouch ? 29 : 15),
        vx: Math.cos(angle + a) * speed,
        vy: Math.sin(angle + a) * speed,
        life: 1.2,
        r: this.weapon === 'L' ? 4 : 3,
        enemy: false,
        power: this.weapon === 'L' ? 3 : 1,
        laser: this.weapon === 'L',
      });
    p.fire =
      this.weapon === 'M'
        ? 0.075
        : this.weapon === 'L'
          ? 0.18
          : this.weapon === 'S'
            ? 0.19
            : 0.16;
    this.tone(this.weapon === 'L' ? 900 : 430, 0.045, 'square', 0.017, 120);
  }
  enemyShoot(e: Enemy, count = 1, speed = 140) {
    const x = e.x + e.w / 2,
      y = e.y + e.h * 0.5,
      px = this.p.x + 11,
      py = this.p.y + 18;
    const aim = Math.atan2(py - y, px - x);
    for (let i = 0; i < count; i++) {
      const a = aim + (i - (count - 1) / 2) * 0.2;
      this.bullets.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 5,
        r: 5,
        enemy: true,
        power: 1,
        low: this.level === 1,
      });
    }
    this.tone(145, 0.07, 'triangle', 0.011);
  }
  update(dt: number) {
    this.timer += dt;
    this.shake = Math.max(0, this.shake - dt);
    this.banner = Math.max(0, this.banner - dt);
    for (const a of this.particles) {
      a.t -= dt;
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.vy += 180 * dt;
    }
    this.particles = this.particles.filter((a) => a.t > 0);
    if (this.state !== 'playing') return;
    this.music(dt);
    const p = this.p;
    p.inv = Math.max(0, p.inv - dt);
    p.fire -= dt;
    p.buffer -= dt;
    p.coyote -= dt;
    const left = this.held('ArrowLeft', 'KeyA'),
      right = this.held('ArrowRight', 'KeyD');
    p.crouch = this.held('ArrowDown', 'KeyS') && p.ground && !left && !right;
    p.vx = (Number(right) - Number(left)) * (this.level === 1 ? 270 : 225);
    if (p.crouch) p.vx = 0;
    if (p.vx) p.dir = Math.sign(p.vx);
    if (p.ground) p.coyote = 0.1;
    if (p.buffer > 0 && p.coyote > 0) {
      p.vy = -535;
      p.ground = false;
      p.coyote = 0;
      p.buffer = 0;
      p.crouch = false;
      this.tone(230, 0.14, 'triangle', 0.025, 600);
    }
    const oldY = p.y;
    p.x = clamp(
      p.x + p.vx * dt,
      this.level === 0 ? Math.max(0, this.camX - 50) : 25,
      this.width - p.w - 25,
    );
    p.vy += 1300 * dt;
    p.y += p.vy * dt;
    p.ground = false;
    for (const f of this.platforms) {
      if (
        p.vy >= 0 &&
        p.x + p.w > f.x + 1 &&
        p.x < f.x + f.w - 1 &&
        oldY + p.h <= f.y + 3 &&
        p.y + p.h >= f.y
      ) {
        p.y = f.y - p.h;
        p.vy = 0;
        p.ground = true;
        if (
          (this.level === 0 && p.x > this.checkpoint.x + 200) ||
          (this.level === 2 && p.y < this.checkpoint.y - 50)
        ) {
          this.checkpoint = {
            x: clamp(p.x, f.x + 20, f.x + f.w - 40),
            y: f.y - p.h,
          };
        }
      }
    }
    if (this.level === 0)
      this.camX = Math.max(this.camX, clamp(p.x - 330, 0, this.width - 960));
    if (this.level === 2)
      this.camY = Math.min(this.camY, clamp(p.y - 320, 0, this.height - 540));
    if (p.y > this.height + 70 || (this.level === 2 && p.y > this.camY + 610))
      this.hurt(true);
    if (this.state !== 'playing') return;
    if (this.held('KeyZ', 'KeyJ') && p.fire <= 0) this.fire();
    for (const e of this.enemies) {
      if (e.dead || Math.abs(e.x - p.x) > 900 || Math.abs(e.y - p.y) > 700)
        continue;
      e.timer -= dt;
      e.phase += dt;
      if (e.type === 'soldier') {
        e.x += e.dir * 38 * dt;
        const floor = this.platforms.find(
          (f) =>
            Math.abs(f.y - e.y - e.h) < 5 &&
            e.x + e.w / 2 > f.x &&
            e.x + e.w / 2 < f.x + f.w,
        );
        if (Math.abs(e.x - e.home) > 65 || !floor) {
          e.dir *= -1;
          e.x += e.dir * 5;
        }
      } else if (e.type === 'drone') {
        e.x = e.home + Math.sin(e.phase) * 80;
        e.y = 180 + Math.sin(e.phase * 1.7) * 40;
      }
      if (e.timer <= 0) {
        e.timer = (this.easy ? 2.5 : 1.8) + (e.type === 'turret' ? 0.4 : 0);
        this.enemyShoot(e, e.type === 'turret' ? 3 : 1, this.easy ? 130 : 165);
      }
      if (this.level !== 1 && hit(this.playerRect(), e)) this.hurt();
    }
    if (this.bossActive()) {
      const b = this.boss!;
      b.timer -= dt;
      b.phase += dt;
      if (this.level === 1) b.x = 372 + Math.sin(b.phase * 0.6) * 125;
      if (b.timer <= 0) {
        b.timer =
          b.hp < b.max * 0.5
            ? this.easy
              ? 1.2
              : 0.85
            : this.easy
              ? 1.8
              : 1.35;
        this.enemyShoot(b, b.hp < b.max * 0.5 ? 7 : 5, this.easy ? 155 : 190);
        if (this.level === 2) {
          for (const side of [-1, 1])
            this.bullets.push({
              x: b.x + b.w / 2,
              y: b.y + b.h,
              vx: side * 110,
              vy: 170,
              life: 5,
              r: 8,
              enemy: true,
              power: 1,
            });
        }
      }
      if (this.level !== 1 && hit(this.playerRect(), b)) this.hurt();
    }
    for (const b of this.bullets) {
      const ox = b.x,
        oy = b.y;
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.enemy) {
        if (this.level === 1 && p.crouch && b.low) continue;
        if (
          hit(this.playerRect(), {
            x: b.x - b.r,
            y: b.y - b.r,
            w: b.r * 2,
            h: b.r * 2,
          })
        ) {
          this.hurt();
          b.life = 0;
        }
      } else {
        const swept = {
          x: Math.min(ox, b.x) - b.r,
          y: Math.min(oy, b.y) - b.r,
          w: Math.abs(b.x - ox) + 2 * b.r,
          h: Math.abs(b.y - oy) + 2 * b.r,
        };
        for (const e of this.bossActive()
          ? [...this.enemies, this.boss!]
          : this.enemies) {
          if (e.dead || !hit(swept, e)) continue;
          e.hp -= b.power;
          b.life = 0;
          this.burst(b.x, b.y, '#f3cf72', 3);
          if (e.hp <= 0) {
            e.dead = true;
            this.burst(
              e.x + e.w / 2,
              e.y + e.h / 2,
              '#ff823b',
              e === this.boss ? 65 : 20,
            );
            this.tone(110, 0.25, 'sawtooth', 0.035, 32);
            this.addScore(
              e === this.boss ? 5000 : e.type === 'soldier' ? 100 : 250,
            );
            this.kills++;
            if (e === this.boss) {
              this.transition = 2.5;
              this.shake = 0.7;
              this.bullets = this.bullets.filter((q) => !q.enemy);
            } else if (this.level !== 1 && this.kills % 6 === 0)
              this.drops.push({
                x: e.x + 10,
                y: e.y + 10,
                kind: ['S', 'M', 'L', 'B'][Math.floor(this.kills / 6) % 4],
                t: 0,
              });
          }
          break;
        }
      }
    }
    this.bullets = this.bullets.filter(
      (b) =>
        b.life > 0 &&
        b.x > this.camX - 100 &&
        b.x < this.camX + 1060 &&
        b.y > this.camY - 100 &&
        b.y < this.camY + 650,
    );
    for (const d of this.drops) {
      d.t += dt;
      if (Math.abs(p.x + 11 - d.x) < 29 && Math.abs(p.y + 22 - d.y) < 40) {
        if (d.kind === 'B') p.inv = 9;
        else this.weapon = d.kind;
        d.t = -999;
        this.addScore(200);
        this.tone(550, 0.18, 'triangle', 0.035, 1100);
        this.burst(d.x, d.y, '#d6ed87', 12);
      }
    }
    this.drops = this.drops.filter((d) => d.t > -900);
    if (
      this.level === 1 &&
      this.room < 3 &&
      this.enemies.every((e) => e.dead) &&
      this.transition === 0
    ) {
      this.transition = 2;
      this.bullets = [];
      this.addScore(500);
      this.weapon = ['S', 'M', 'L'][this.room];
      p.inv = 3;
    }
    if (this.transition > 0) {
      this.transition -= dt;
      if (this.transition <= 0) {
        this.transition = 0;
        if (this.level === 1 && this.room < 3) {
          this.room++;
          this.loadRoom();
        } else {
          this.state = this.level === 2 ? 'victory' : 'clear';
          this.keys.clear();
          this.addScore(this.lives * 300);
          this.emit();
        }
      }
    }
    this.uiTimer += dt;
    if (this.uiTimer > 0.1) {
      this.uiTimer = 0;
      this.emit();
    }
  }
  playerRect(): Rect {
    const p = this.p;
    return p.crouch
      ? { x: p.x - 4, y: p.y + 24, w: 32, h: 14 }
      : { x: p.x + 3, y: p.y + 3, w: 16, h: 34 };
  }
  loop = (now = 0) => {
    const dt = Math.min((now - this.last) / 1000, 0.08);
    this.last = now;
    this.acc += dt;
    while (this.acc >= 1 / 60) {
      this.update(1 / 60);
      this.acc -= 1 / 60;
    }
    this.draw();
    this.raf = requestAnimationFrame(this.loop);
  };
  destroy() {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.keys.clear();
    if (this.audio) void this.audio.close().catch(() => {});
  }
  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.ceil(w), Math.ceil(h));
  }
  text(
    t: string,
    x: number,
    y: number,
    size = 14,
    color = '#e3e9b6',
    align: CanvasTextAlign = 'left',
  ) {
    const c = this.ctx;
    c.font = `bold ${size}px monospace`;
    c.textAlign = align;
    c.fillStyle = '#09120d';
    c.fillText(t, x + 2, y + 2);
    c.fillStyle = color;
    c.fillText(t, x, y);
  }
  poly(points: number[][], color: string) {
    const c = this.ctx;
    c.fillStyle = color;
    c.beginPath();
    points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
    c.fill();
  }
  jungle() {
    const c = this.ctx,
      t = this.timer,
      cx = this.state === 'menu' ? 450 : this.camX;
    this.rect(0, 0, 960, 540, '#122820');
    this.rect(510 - cx * 0.07, 20, 340, 380, '#213c2b');
    this.rect(550 - cx * 0.07, 28, 180, 350, '#29462f');
    for (let i = 0; i < 18; i++) {
      const x = i * 85 - ((cx * 0.12) % 85);
      this.poly(
        [
          [x - 100, 300],
          [x + 22, 95 + hash(i) * 120],
          [x + 145, 310],
        ],
        i % 2 ? '#233f30' : '#2a4934',
      );
    }
    for (let layer = 0; layer < 3; layer++) {
      const spacing = [113, 157, 223][layer],
        par = [0.18, 0.35, 0.65][layer];
      for (let i = -1; i < 12; i++) {
        const world = Math.floor((cx * par) / spacing) + i,
          x = i * spacing - ((cx * par) % spacing),
          wide = layer === 2 ? 29 : 16,
          top = hash(world + layer * 50) * 80;
        this.rect(
          x,
          top,
          wide,
          490,
          layer === 2 ? '#233326' : layer === 1 ? '#284432' : '#30503a',
        );
        this.rect(
          x + wide - 7,
          top,
          5,
          410,
          layer === 2 ? '#3c4930' : '#3d5739',
        );
        for (let j = 0; j < 5; j++) {
          const yy = top + j * 57;
          this.rect(
            x - 32,
            yy,
            wide + 64,
            13,
            layer === 2 ? '#2c482c' : '#355b38',
          );
          this.rect(
            x - 14,
            yy - 12,
            wide + 36,
            18,
            layer === 2 ? '#365734' : '#3c623c',
          );
          this.rect(x - 50, yy + 11, wide + 92, 9, '#243f2b');
          if (layer === 2) {
            this.poly(
              [
                [x, yy + 14],
                [x - 66, yy + 56],
                [x - 37, yy + 20],
              ],
              '#37522e',
            );
            this.poly(
              [
                [x + 10, yy + 3],
                [x + 95, yy + 30],
                [x + 65, yy + 8],
              ],
              '#47613a',
            );
          }
        }
        if (layer === 2) {
          this.rect(x + 38, 90, 3, 220 + hash(i) * 100, '#647445');
          for (let v = 0; v < 6; v++)
            this.rect(x + 33, 105 + v * 37, 11, 5, '#5c6c3a');
        }
      }
    }
    c.globalAlpha = 0.1;
    this.poly(
      [
        [600, 0],
        [641, 0],
        [408, 454],
        [260, 454],
      ],
      '#dddf8b',
    );
    this.poly(
      [
        [728, 0],
        [752, 0],
        [696, 454],
        [555, 454],
      ],
      '#dde5a1',
    );
    c.globalAlpha = 1;
    this.rect(0, 467, 960, 73, '#173f39');
    for (let i = 0; i < 35; i++) {
      const xx = ((i * 77 + t * 25) % 1040) - 60;
      this.rect(
        xx,
        476 + hash(i) * 60,
        24 + hash(i + 8) * 55,
        2,
        i % 3 ? '#35655a' : '#72927a',
      );
    }
    for (let i = 0; i < 16; i++) {
      const x = (hash(i) * 1200 - cx * 0.7) % 1000,
        y = 360 + Math.sin(t * 0.5 + i) * 25;
      c.globalAlpha = 0.4 + Math.sin(t + i) * 0.2;
      this.rect(x, y, 3, 3, '#b4c583');
    }
    c.globalAlpha = 1;
  }
  waterfall() {
    const c = this.ctx,
      cy = this.state === 'menu' ? 800 : this.camY,
      t = this.timer;
    this.rect(0, 0, 960, 540, '#183643');
    for (let i = 0; i < 14; i++) {
      const x = i * 93 - 60;
      this.poly(
        [
          [x, 540],
          [x + 60, 80 + hash(i) * 180],
          [x + 180, 540],
        ],
        '#254650',
      );
    }
    this.rect(357, 0, 260, 540, '#72a6a4');
    this.rect(397, 0, 177, 540, '#a2c1ad');
    this.rect(438, 0, 75, 540, '#cfdbc0');
    for (let i = 0; i < 48; i++) {
      const x = 359 + hash(i) * 255,
        y =
          ((hash(i + 80) * 760 + t * (120 + hash(i) * 180) + cy * 0.5) % 640) -
          100;
      this.rect(
        x,
        y,
        3 + hash(i + 4) * 10,
        25 + hash(i + 12) * 90,
        i % 3 ? '#c0d4bb' : '#5d9198',
      );
    }
    for (const side of [0, 1]) {
      const x = side ? 720 : 0;
      this.rect(x, 0, 240, 540, '#304b47');
      for (let i = 0; i < 8; i++) {
        const y = i * 89 - ((cy * 0.8) % 89);
        this.rect(x + hash(i) * 70, y, 160, 74, '#3c5850');
        this.rect(x + hash(i + 40) * 80, y, 155, 5, '#66806a');
        this.rect(x + hash(i + 9) * 150, y + 15, 40, 5, '#263f3c');
        for (let j = 0; j < 3; j++)
          this.rect(x + hash(i + j) * 190, y + j * 19, 33, 7, '#476645');
      }
    }
    c.globalAlpha = 0.25;
    for (let i = 0; i < 10; i++)
      this.rect(
        270 + Math.sin(i + t * 0.4) * 80,
        420 + i * 13,
        430,
        9,
        '#c0d9bf',
      );
    c.globalAlpha = 1;
  }
  base() {
    const c = this.ctx,
      t = this.timer;
    this.rect(0, 0, 960, 540, '#131d26');
    this.poly(
      [
        [0, 0],
        [270, 150],
        [270, 325],
        [0, 540],
      ],
      '#273b40',
    );
    this.poly(
      [
        [960, 0],
        [690, 150],
        [690, 325],
        [960, 540],
      ],
      '#273b40',
    );
    this.poly(
      [
        [0, 0],
        [960, 0],
        [690, 150],
        [270, 150],
      ],
      '#1e2d33',
    );
    this.poly(
      [
        [0, 540],
        [270, 325],
        [690, 325],
        [960, 540],
      ],
      '#34434a',
    );
    c.strokeStyle = '#597171';
    c.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      let k = i / 6,
        xx = 270 * k,
        yy = 150 * k;
      c.strokeRect(xx, yy, 960 - xx * 2, 540 - yy * 2);
    }
    c.strokeStyle = '#718179';
    c.globalAlpha = 0.35;
    for (let i = -5; i <= 5; i++) {
      c.beginPath();
      c.moveTo(480 + i * 25, 325);
      c.lineTo(480 + i * 145, 540);
      c.stroke();
    }
    c.globalAlpha = 1;
    this.rect(150, 122, 660, 221, '#17272e');
    this.rect(162, 135, 636, 195, '#344d4e');
    this.rect(175, 146, 610, 169, '#26393e');
    for (let i = 0; i < 11; i++) {
      this.rect(180 + i * 55, 148, 2, 163, '#425857');
      this.rect(180 + i * 55, 148, 47, 6, '#526764');
    }
    for (let j = 0; j < 3; j++) this.rect(177, 182 + j * 47, 606, 2, '#182e34');
    for (const x of [95, 837]) {
      this.rect(x, 40, 28, 339, '#0c1b22');
      this.rect(x + 5, 47, 17, 321, '#41564f');
      for (let i = 0; i < 8; i++) {
        this.rect(x + 8, 60 + i * 39, 11, 21, '#af9960');
        this.rect(x + 8, 60 + i * 39, 11, 5, '#edc772');
      }
    }
    for (const x of [277, 654]) {
      this.rect(x, 50, 31, 10, '#425854');
      this.rect(x + 3, 52, 25, 6, '#d6e3b8');
    }
    this.rect(399, 90, 162, 29, '#14292d');
    this.text(`SECTOR 0${this.room + 1}`, 480, 110, 17, '#df9e60', 'center');
    this.rect(148, 333, 666, 18, '#67786b');
    for (let i = 0; i < 22; i++)
      this.poly(
        [
          [150 + i * 31, 334],
          [164 + i * 31, 334],
          [176 + i * 31, 350],
          [163 + i * 31, 350],
        ],
        '#303b39',
      );
    if (this.transition > 0 && this.room < 3) {
      this.rect(451, 147, 58, 182, '#071b24');
      this.rect(455, 150, 50, 174, '#7bceab');
      this.text('通路开启', 480, 386, 20, '#bee7bc', 'center');
    } else {
      this.rect(161, 344, 638, 3, Math.sin(t * 7) > 0 ? '#e58754' : '#763e31');
      this.rect(161, 351, 638, 2, '#743d30');
    }
    this.rect(0, 477, 960, 63, '#1e3236');
    this.rect(0, 476, 960, 3, '#7e9180');
    for (let i = 0; i < 20; i++) {
      this.rect(i * 50, 486, 42, 3, '#3e5655');
      this.rect(i * 50, 501, 42, 16, '#162a31');
    }
  }
  terrain(f: Platform) {
    if (
      f.y < this.camY - 30 ||
      f.y > this.camY + 550 ||
      f.x + f.w < this.camX ||
      f.x > this.camX + 960
    )
      return;
    const { x, y, w, h } = f;
    if (f.kind === 'bridge') {
      this.rect(x, y + 6, w, 9, '#584c2d');
      for (let xx = x; xx < x + w; xx += 17) {
        this.rect(xx, y, 14, 9, '#c2a266');
        this.rect(xx + 2, y + 2, 9, 2, '#e0be7b');
      }
      this.rect(x, y - 24, 4, 29, '#a59461');
      this.rect(x + w - 4, y - 24, 4, 29, '#a59461');
      this.rect(x, y - 21, w, 2, '#87825a');
      return;
    }
    if (f.kind === 'metal') return;
    const waterfall = this.level === 2;
    this.rect(x, y, w, h, waterfall ? '#3f5750' : '#39462c');
    this.rect(x, y, w, 6, waterfall ? '#92a580' : '#7f9653');
    this.rect(x, y + 6, w, 5, waterfall ? '#607e62' : '#506735');
    for (let xx = 0; xx < w; xx += 32) {
      const i = Math.floor(x + xx + y);
      this.rect(x + xx + 2, y + 13, 26, 6, waterfall ? '#627669' : '#4f5a36');
      if (h > 30) {
        this.rect(x + xx + hash(i) * 9, y + 28, 16, 10, '#253b2b');
        this.rect(x + xx + 7, y + 52, 20, 6, waterfall ? '#6c8070' : '#69704a');
      }
      this.rect(
        x + xx + hash(i + 2) * 15,
        y - 4,
        3,
        7,
        waterfall ? '#a6b888' : '#a1b069',
      );
    }
    if (f.kind !== 'ground')
      this.poly(
        [
          [x + 4, y + h],
          [x + w - 5, y + h],
          [x + w - 24, y + h + 13],
          [x + 18, y + h + 8],
        ],
        waterfall ? '#273f3c' : '#283e29',
      );
  }
  soldier(
    x: number,
    y: number,
    dir: number,
    hero = false,
    scale = 1,
    crouch = false,
  ) {
    const c = this.ctx;
    c.save();
    c.translate(Math.round(x + 11), Math.round(y));
    c.scale(dir * scale, scale);
    const skin = hero ? '#dfa16b' : '#bda275',
      shade = hero ? '#b76e49' : '#846849',
      pants = hero ? '#6a91a2' : '#b76e42',
      dark = hero ? '#304f60' : '#633b2d',
      band = hero ? '#ee6542' : '#b6a767';
    if (crouch) {
      this.rect(-15, 26, 30, 9, pants);
      this.rect(5, 23, 13, 8, skin);
      this.rect(10, 20, 10, 5, band);
      this.rect(-18, 32, 11, 5, dark);
      this.rect(12, 28, 26, 5, '#171f21');
      this.rect(18, 27, 18, 2, '#a5ae8a');
    } else {
      const walking = this.state === 'menu' || Math.abs(this.p.vx) > 0 || !hero;
      let stride = walking ? Math.sin(this.timer * 13) * 4 : 0;
      this.rect(-8, 25, 7, 12, pants);
      this.rect(3, 25, 7, 10, pants);
      this.rect(-8 - stride, 33, 7, 8, dark);
      this.rect(3 + stride, 33, 7, 8, dark);
      this.rect(-10 - stride, 39, 11, 4, '#182b2a');
      this.rect(3 + stride, 39, 12, 4, '#182b2a');
      this.rect(-8, 11, 17, 16, skin);
      this.rect(-8, 14, 4, 12, shade);
      this.rect(-6, 24, 17, 5, dark);
      this.rect(-1, 24, 4, 3, '#d6c37b');
      this.rect(-3, 12, 5, 14, hero ? '#354b3b' : '#744a32');
      this.rect(-4, 0, 12, 12, skin);
      this.rect(-5, 0, 13, 4, '#293d2b');
      this.rect(-5, 4, 15, 3, band);
      this.rect(-12, 5, 9, 3, band);
      this.rect(-14, 8, 5, 3, band);
      this.rect(6, 7, 3, 2, '#202a25');
      this.rect(8, 9, 3, 3, skin);
      const up = hero && this.level !== 1 && this.held('ArrowUp', 'KeyW'),
        down = hero && !this.p.ground && this.held('ArrowDown', 'KeyS');
      c.save();
      c.translate(7, 16);
      if (up) c.rotate(this.p.vx ? -Math.PI / 4 : -Math.PI / 2);
      else if (down) c.rotate(this.p.vx ? Math.PI / 4 : Math.PI / 2);
      else if (this.level === 1 && hero) c.rotate(-Math.PI / 2);
      this.rect(0, 0, 12, 5, skin);
      this.rect(8, -2, 24, 5, '#142525');
      this.rect(10, -3, 15, 2, '#b1bb9b');
      this.rect(25, -1, 12, 3, '#263b35');
      this.rect(12, 3, 5, 6, '#182826');
      if (hero && this.p.fire > 0.08 && this.state === 'playing') {
        this.poly(
          [
            [36, 0],
            [46, -5],
            [43, 0],
            [49, 3],
            [38, 4],
          ],
          '#fff0a6',
        );
      }
      c.restore();
    }
    c.restore();
  }
  drawEnemy(e: Enemy) {
    if (e.dead) return;
    const { x, y, w, h } = e;
    if (e.type === 'soldier') this.soldier(x, y, this.p.x > x ? 1 : -1);
    else if (e.type === 'turret') {
      this.rect(x - 4, y + 21, 40, 9, '#223b32');
      this.rect(x, y + 7, 32, 19, '#78916c');
      this.rect(x + 4, y + 3, 24, 22, '#4a6551');
      this.rect(x + 11, y + 9, 10, 10, '#152c2b');
      this.rect(x + 14, y + 12, 5, 5, '#fb8b4c');
      const d = this.p.x < x ? -1 : 1;
      this.rect(x + 15 + (d < 0 ? -25 : 0), y + 12, 27, 6, '#a3ab7c');
      this.rect(x + 5, y + 23, 22, 3, '#bac190');
    } else if (e.type === 'drone') {
      this.rect(x - 13, y + 2, 52, 6, '#465c52');
      this.rect(x - 5, y + 8, 37, 8, '#a7b79d');
      this.rect(x + 3, y + 15, 21, 13, '#596d61');
      this.rect(x + 10, y + 20, 7, 5, '#fa7a43');
      this.rect(x - 16, y, 17, 3, '#e3b876');
      this.rect(x + 24, y, 18, 3, '#e3b876');
    } else if (e.type === 'target' || e.type === 'reactor') {
      this.rect(x - 7, y - 7, w + 14, h + 14, '#102a32');
      this.rect(x - 3, y - 3, w + 6, h + 6, '#9a9675');
      this.rect(x, y, w, h, '#44554e');
      this.rect(
        x + 5,
        y + 5,
        w - 10,
        h - 10,
        e.type === 'reactor' ? '#a4533b' : '#172a2b',
      );
      this.rect(
        x + 12,
        y + 12,
        w - 24,
        h - 24,
        e.type === 'reactor' ? '#ffbb6c' : '#f7754e',
      );
      this.rect(x + 5, y + h + 8, ((w - 10) * e.hp) / e.max, 3, '#eab367');
    } else if (e.type === 'fortress') {
      this.rect(x - 8, y - 50, w + 18, h + 53, '#223b32');
      this.rect(x, y - 40, w, h + 40, '#596c4b');
      this.rect(x + 8, y - 36, w - 16, 10, '#8a9565');
      for (let j = 0; j < 7; j++) {
        for (let i = 0; i < 4; i++) {
          this.rect(
            x + i * 40 + (j % 2) * 5,
            y - 18 + j * 25,
            34,
            18,
            '#465b40',
          );
          this.rect(
            x + i * 40 + (j % 2) * 5,
            y - 18 + j * 25,
            34,
            3,
            '#6d7f56',
          );
        }
      }
      this.rect(x + 29, y + 37, 100, 128, '#172a27');
      this.rect(x + 40, y + 45, 80, 115, '#344437');
      for (let i = 0; i < 4; i++)
        this.rect(x + 45, y + 52 + i * 27, 70, 4, '#788265');
      this.rect(x + 60, y + 77, 40, 47, '#623e2f');
      this.rect(x + 68, y + 83, 24, 33, '#e67544');
      this.rect(x + 73, y + 88, 14, 23, '#ffbd68');
      for (const yy of [y + 12, y + 105]) {
        this.rect(x - 18, yy, 40, 25, '#1b302b');
        this.rect(x - 24, yy + 6, 40, 12, '#849073');
        this.rect(x - 25, yy + 9, 8, 6, '#192b28');
      }
      this.text('01', x + 83, y + 21, 20, '#a4b289', 'center');
    } else if (e.type === 'core') {
      this.rect(x - 14, y - 12, w + 28, h + 24, '#112731');
      this.rect(x - 5, y - 5, w + 10, h + 10, '#a39973');
      this.rect(x, y, w, h, '#354a4c');
      this.rect(x + 17, y + 12, w - 34, h - 24, '#142b36');
      for (let i = 0; i < 4; i++) {
        this.rect(x + 25 + i * 44, y + 22, 31, 16, '#5b6960');
        this.rect(x + 30 + i * 44, y + 27, 20, 5, '#d9b264');
      }
      this.rect(x + 72, y + 49, 72, 76, '#8c533a');
      this.rect(x + 83, y + 60, 50, 55, '#f28645');
      this.rect(
        x + 95,
        y + 70,
        26,
        35,
        Math.sin(this.timer * 12) > 0 ? '#fff3b7' : '#d95335',
      );
      for (const xx of [x + 24, x + w - 48]) {
        this.rect(xx, y + 63, 26, 48, '#779382');
        this.rect(xx + 6, y + 78, 14, 30, '#1b343c');
        this.rect(xx + 9, y + 81, 8, 18, '#fca970');
      }
    } else if (e.type === 'giant') {
      const pulse = Math.sin(this.timer * 5) * 3;
      this.rect(x + 20, y, w - 40, h, '#526d61');
      this.rect(x + 30, y - 8, w - 60, 20, '#91a28a');
      this.rect(x + 17, y + 25, w - 34, 63, '#84987c');
      this.rect(x + 34, y + 19, w - 68, 53, '#253d3b');
      for (const xx of [x + 42, x + 94]) {
        this.rect(xx, y + 35, 25, 13, '#ed8450');
        this.rect(xx + 5, y + 37, 14, 7, '#ffe7a5');
      }
      this.rect(x + 57, y + 61, 42, 12, '#acb394');
      this.rect(x + 52, y + 82, 50, 36, '#402e2b');
      this.rect(x + 58, y + 88, 38, 24, '#cf613e');
      this.rect(x + 66, y + 93, 22, 14, '#fbc97a');
      for (const side of [-1, 1]) {
        const xx = side < 0 ? x - 34 : x + w - 4;
        this.rect(xx, y + 29 + pulse, 37, 76, '#46635d');
        this.rect(xx + 4, y + 31 + pulse, 29, 17, '#8b9e80');
        this.rect(xx + 9, y + 79 + pulse, 22, 31, '#1a363b');
        this.rect(xx + 13, y + 86 + pulse, 14, 25, '#bc8d57');
      }
      this.rect(x + 17, y + h - 3, 46, 13, '#283f3c');
      this.rect(x + w - 63, y + h - 3, 46, 13, '#283f3c');
    }
  }
  draw() {
    const c = this.ctx;
    c.imageSmoothingEnabled = false;
    c.save();
    if (this.shake > 0 && this.state === 'playing')
      c.translate(
        (Math.random() - 0.5) * this.shake * 18,
        (Math.random() - 0.5) * this.shake * 12,
      );
    if (this.level === 0) this.jungle();
    else if (this.level === 1) this.base();
    else this.waterfall();
    const menu = this.state === 'menu';
    if (menu) {
      if (this.level !== 1) {
        this.rect(525, 420, 435, 120, this.level === 0 ? '#374b2c' : '#3f5b54');
        this.rect(525, 420, 435, 8, '#95a26c');
        for (let i = 0; i < 15; i++) {
          this.rect(540 + i * 30, 435 + (i % 4) * 19, 24, 9, '#536444');
          this.rect(542 + i * 30, 455 + (i % 4) * 17, 16, 4, '#293f2d');
        }
        this.soldier(688, 333, 1, true, 2);
        this.rect(670, 418, 89, 5, '#14291c');
        for (let i = 0; i < 8; i++) {
          const x = 817 + i * 17;
          this.poly(
            [
              [x, 422],
              [x - 22, 387 - hash(i) * 35],
              [x + 4, 399],
              [x + 20, 370 + hash(i + 4) * 25],
              [x + 11, 426],
            ],
            '#58733c',
          );
        }
      } else this.soldier(655, 394, 1, true, 1.7);
      c.restore();
      return;
    }
    c.save();
    c.translate(-Math.round(this.camX), -Math.round(this.camY));
    for (const f of this.platforms) this.terrain(f);
    for (const e of this.enemies) this.drawEnemy(e);
    if (this.boss && !this.boss.dead) this.drawEnemy(this.boss);
    for (const d of this.drops) {
      const y = d.y + Math.sin(this.timer * 4 + d.x) * 4;
      this.rect(d.x - 17, y - 12, 34, 25, '#172e26');
      this.rect(
        d.x - 14,
        y - 10,
        28,
        21,
        d.kind === 'B' ? '#769db0' : '#d68448',
      );
      this.rect(d.x - 11, y - 7, 22, 15, '#eee1a9');
      this.text(d.kind, d.x, y + 5, 16, '#364335', 'center');
      this.rect(d.x - 24, y - 3, 7, 7, '#c3c9a0');
      this.rect(d.x + 17, y - 3, 7, 7, '#c3c9a0');
    }
    if (this.p.inv <= 0 || Math.floor(this.timer * 14) % 2 === 0)
      this.soldier(
        this.p.x,
        this.p.y,
        this.level === 1 ? 1 : this.p.dir,
        true,
        1,
        this.p.crouch,
      );
    if (this.p.inv > 3.1) {
      c.strokeStyle = '#a8ddeb';
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(this.p.x + 10, this.p.y + 18, 28, 32, 0, 0, Math.PI * 2);
      c.stroke();
    }
    for (const b of this.bullets) {
      if (b.enemy) {
        this.rect(
          b.x - b.r - 2,
          b.y - b.r - 2,
          b.r * 2 + 4,
          b.r * 2 + 4,
          '#6d4130',
        );
        this.rect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, '#ee7050');
        this.rect(b.x - 2, b.y - 2, 4, 4, '#ffe7a3');
      } else {
        const a = Math.atan2(b.vy, b.vx);
        c.save();
        c.translate(b.x, b.y);
        c.rotate(a);
        this.rect(
          b.laser ? -20 : -8,
          -2,
          b.laser ? 28 : 12,
          b.laser ? 5 : 4,
          b.laser ? '#a8edf0' : '#ffdfa0',
        );
        this.rect(-4, -1, 8, 2, '#ffffff');
        c.restore();
      }
    }
    for (const a of this.particles) {
      c.globalAlpha = clamp(a.t / a.life, 0, 1);
      this.rect(a.x, a.y, a.size, a.size, a.color);
    }
    c.globalAlpha = 1;
    if (this.level === 0) {
      for (
        let i = Math.floor(this.camX / 100);
        i < (this.camX + 960) / 100;
        i++
      ) {
        const x = i * 100 + hash(i) * 30;
        this.poly(
          [
            [x, 536],
            [x - 15, 493],
            [x + 4, 509],
            [x + 23, 487],
            [x + 15, 534],
          ],
          '#253c26',
        );
        this.rect(x, 510, 3, 30, '#6c8046');
      }
    }
    c.restore();
    if (this.banner > 0 && this.state === 'playing') {
      c.globalAlpha = Math.min(1, this.banner);
      this.rect(323, 99, 314, 48, '#10261ddc');
      this.text(
        ['01 · 丛林突袭', '02 · 基地攻坚', '03 · 瀑布要塞'][this.level],
        480,
        129,
        20,
        '#e3e5b9',
        'center',
      );
      c.globalAlpha = 1;
    }
    if (this.level === 2 && this.state === 'playing' && this.p.y > 2050)
      this.text('↑ 向上攀登', 824, 113, 14, '#d5e0b0', 'center');
    if (this.transition > 0 && this.boss?.dead) {
      c.globalAlpha = 0.8;
      this.text('目标已摧毁', 480, 240, 30, '#ffe0a3', 'center');
      c.globalAlpha = 1;
    }
    c.restore();
  }
}
