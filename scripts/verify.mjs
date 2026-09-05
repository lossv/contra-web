import fs from 'node:fs';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = fs.readFileSync(
  new URL('../app/game.ts', import.meta.url),
  'utf8',
);
const out = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const tools = [];
globalThis.window = { addEventListener() {} };
globalThis.document = {
  addEventListener() {},
  hidden: false,
  modelContext: {
    registerTool(t) {
      tools.push(t);
    },
  },
};
globalThis.localStorage = {
  getItem() {
    return null;
  },
  setItem() {},
};
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};
const { Game } = await import(
  'data:text/javascript;base64,' + Buffer.from(out).toString('base64')
);
const ctx = new Proxy(
  {},
  { get: (o, p) => o[p] ?? (() => {}), set: (o, p, v) => ((o[p] = v), true) },
);
const canvas = { getContext: () => ctx };
let checks = 0;
function ok(v, msg) {
  assert.ok(v, msg);
  checks++;
  console.log('PASS', msg);
}
const g = new Game(canvas, () => {});
ok(g.state === 'menu', 'Starts on the title screen');
for (let i = 0; i < 3; i++) {
  g.start(i, true);
  g.draw();
  ok(
    g.level === i && g.lives === 5,
    'Level ' + (i + 1) + ' initializes and renders',
  );
  g.preview(0);
  ok(g.level === i, 'Preview cannot replace an active run');
}
g.start(0, true);
for (let i = 0; i < 60; i++) g.update(1 / 60);
ok(g.p.ground, 'Player settles on the jungle ground');
const floor = g.p.y;
g.input('KeyX', true);
let highest = g.p.y;
for (let i = 0; i < 70; i++) {
  g.update(1 / 60);
  highest = Math.min(highest, g.p.y);
}
g.input('KeyX', false);
ok(floor - highest > 100 && g.p.ground, 'Jump has >100 px clearance and lands');
g.input('ArrowRight', true);
g.input('KeyZ', true);
for (let i = 0; i < 60; i++) g.update(1 / 60);
g.input('ArrowRight', false);
g.input('KeyZ', false);
ok(g.p.x > 300 && g.bullets.length > 0, 'Movement and held fire work together');
g.weapon = 'S';
g.bullets = [];
g.fire();
ok(g.bullets.length === 5, 'Spread weapon fires five projectiles');
g.weapon = 'L';
g.bullets = [];
g.fire();
ok(g.bullets[0].power === 3 && g.bullets[0].laser, 'Laser deals higher damage');
g.p.inv = 0;
g.hurt();
const lives = g.lives;
g.hurt();
ok(g.lives === lives, 'Respawn invulnerability prevents repeated damage');
g.p.inv = 0;
g.p.y = 800;
g.update(1 / 60);
ok(
  g.lives === lives - 1 && g.p.y < 454,
  'Falling respawns at a safe checkpoint',
);
g.pause();
const frozen = g.p.x;
g.input('ArrowRight', true);
g.update(1);
ok(g.p.x === frozen && g.state === 'paused', 'Pause freezes game simulation');
g.pause();
g.start(1, true);
g.bullets = [];
g.fire();
ok(
  g.bullets[0].vy < 0 && Math.abs(g.bullets[0].vx) < 1,
  'Base weapon aims into the screen',
);
for (let room = 0; room < 3; room++) {
  for (const e of g.enemies) {
    g.bullets.push({
      x: e.x + 15,
      y: e.y + 12,
      vx: 0,
      vy: -1,
      life: 1,
      r: 4,
      enemy: false,
      power: 100,
    });
  }
  g.update(1 / 60);
  ok(
    g.enemies.every((e) => e.dead),
    'Base room ' + (room + 1) + ' targets can be destroyed',
  );
  for (let i = 0; i < 125; i++) g.update(1 / 60);
  ok(g.room === room + 1, 'Base room ' + (room + 1) + ' advances');
}
ok(g.boss?.type === 'core', 'Fourth base room contains the boss');
for (let level = 0; level < 3; level++) {
  g.start(level, true);
  if (level === 0) g.p.x = 4300;
  if (level === 1) {
    g.room = 3;
    g.loadRoom();
  }
  if (level === 2) g.p.y = 170;
  const b = g.boss;
  g.p.inv = 10;
  g.bullets.push({
    x: b.x + 20,
    y: b.y + 20,
    vx: 0,
    vy: 0,
    life: 1,
    r: 4,
    enemy: false,
    power: 1000,
  });
  g.update(1 / 60);
  ok(b.dead, 'Boss ' + (level + 1) + ' takes damage and can be defeated');
  for (let i = 0; i < 160; i++) g.update(1 / 60);
  ok(
    g.state === (level === 2 ? 'victory' : 'clear'),
    'Boss ' + (level + 1) + ' triggers correct completion state',
  );
  if (level < 2) {
    g.next();
    ok(
      g.level === level + 1 && g.state === 'playing',
      'Continue carries into the next stage',
    );
  }
}
g.start(2, true);
const ledges = [...g.platforms].sort((a, b) => b.y - a.y);
for (let i = 1; i < ledges.length; i++) {
  const rise = ledges[i - 1].y - ledges[i].y;
  assert.ok(rise <= 108, 'Unreachable waterfall rise: ' + rise);
}
ok(true, 'Every waterfall platform is within jump height');
g.start(0, false);
for (let i = 0; i < 3; i++) {
  g.p.inv = 0;
  g.hurt();
}
ok(
  g.state === 'gameover' && g.lives === 0,
  'Classic mode has three lives and game over',
);
const read = tools.find((t) => t.name === 'read_game_state'),
  start = tools.find((t) => t.name === 'start_game');
ok(read && start, 'WebMCP registers both game tools');
start.execute({ level: 2, difficulty: 'classic' });
ok(g.level === 1 && g.lives === 3, 'WebMCP start uses visible game state');
let threw = false;
try {
  start.execute({ level: 9, difficulty: 'classic' });
} catch {
  threw = true;
}
ok(threw && g.level === 1, 'Invalid WebMCP input preserves state');
ok(
  JSON.parse(read.execute().content[0].text).level === 1,
  'WebMCP read returns current state',
);
g.start(2, true);
g.enemies = [];
g.boss = null;
g.p.inv = 1000;
for (let i = 0; i < 5; i++) g.update(1 / 60);
const path = [...g.platforms].sort((a, b) => b.y - a.y).slice(1);
for (const platform of path) {
  const target = Math.max(
    platform.x + 10,
    Math.min(g.p.x, platform.x + platform.w - 32),
  );
  g.input('KeyX', true);
  let landed = false;
  for (let i = 0; i < 80; i++) {
    const delta = target - g.p.x;
    g.input('ArrowRight', delta > 3);
    g.input('ArrowLeft', delta < -3);
    g.update(1 / 60);
    if (i > 3 && g.p.ground && Math.abs(g.p.y + g.p.h - platform.y) < 2) {
      landed = true;
      break;
    }
  }
  g.input('KeyX', false);
  g.input('ArrowRight', false);
  g.input('ArrowLeft', false);
  assert.ok(landed, 'Cannot reach waterfall platform at y=' + platform.y);
}
ok(g.p.y < 200, 'Actual jump inputs climb the entire waterfall');
g.destroy();
console.log(`${checks} checks passed`);
