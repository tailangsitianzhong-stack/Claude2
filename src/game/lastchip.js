// ミニゲーム「ラスト・チップ」(ニムの一種)
// ・テーブル中央にチップの山(17〜23 枚)。順番に 1〜3 枚ずつ取っていく
// ・最後の 1 枚を取らされた人が最下位(必ず 1 人に決まる)
// 目安:1 手 2〜3 秒 × 8〜12 手 ≒ 30 秒〜1 分
import { createChip, tableSpot, label, isMe, easeInOut } from './kit.js';

const COLORS = [0xb02a2a, 0x1f4a8a, 0x1e6a3a, 0xe0d0b0];

export class LastChip {
  constructor(scene) {
    this.scene = scene;
    this.title = 'ラスト・チップ';
    this.firstTime = true;
    this.objects = [];
  }

  cleanup() {
    for (const o of this.objects) o.parent?.remove(o);
    this.objects = [];
  }

  // AI:相手に「4 で割って 1 余る数」を残すのが必勝形。たまに読み違える
  aiTake(remaining) {
    if (remaining <= 4) return Math.max(1, remaining - 1);
    const good = (remaining - 1) % 4;
    if (good !== 0 && Math.random() < 0.8) return good;
    return 1 + Math.floor(Math.random() * 3);
  }

  async play(game) {
    const alive = game.players.filter((p) => p.alive);
    let turn = Math.floor(Math.random() * alive.length);
    let remaining = 17 + Math.floor(Math.random() * 7);
    game.say(
      this.firstTime
        ? `ラスト・チップ:順番にチップを 1〜3 枚取れ。\n最後の 1 枚を取った者が撃つ。`
        : 'ラスト・チップ:最後の 1 枚を取るな',
    );
    await game.wait(this.firstTime ? 3.8 : 2.0);
    this.firstTime = false;

    // 中央に積む(5 枚ずつの山)
    const chips = [];
    for (let i = 0; i < remaining; i++) {
      const c = createChip(COLORS[Math.floor(i / 5) % COLORS.length]);
      const stack = Math.floor(i / 5);
      const a = (stack / Math.ceil(remaining / 5)) * Math.PI * 2;
      c.position.set(game.tablePos.x + Math.cos(a) * 0.07, game.tableTop + 0.003 + (i % 5) * 0.0062, game.tablePos.z + Math.sin(a) * 0.07);
      c.rotation.y = Math.random();
      this.scene.add(c);
      this.objects.push(c);
      chips.push(c);
    }
    const taken = new Map(alive.map((p) => [p.seat, 0]));
    const show = () => {
      game.tags = Object.fromEntries([...taken].map(([s, v]) => [s, `${v}枚`]));
      game.renderPlayers();
    };
    show();
    game.say(`チップは ${remaining} 枚`);
    await game.wait(1.4);

    for (;;) {
      const p = alive[turn % alive.length];
      let n;
      if (isMe(game, p)) {
        n = await game.choose(
          [1, 2, 3].map((k) => ({ label: `${k} 枚取る`, value: k, disabled: k > remaining })),
          `残り ${remaining} 枚。何枚取る?`,
        );
      } else {
        game.say(`${label(game, p)} の番(残り ${remaining} 枚)`);
        await game.wait(0.9 + Math.random() * 0.8);
        n = Math.min(remaining, this.aiTake(remaining));
      }
      // 上から n 枚を、その人の手前へ
      const pile = taken.get(p.seat);
      const moving = chips.splice(chips.length - n, n);
      await Promise.all(
        moving.map(async (c, i) => {
          await game.wait(i * 0.1);
          const from = c.position.clone();
          const to = tableSpot(game, p.seat, 0.42, -0.12, 0.003 + (pile + i) * 0.0062);
          game.sfx.chip();
          await game.tween(0.4, (t) => {
            const e = easeInOut(t);
            c.position.lerpVectors(from, to, e);
            c.position.y += Math.sin(Math.PI * e) * 0.06;
          });
        }),
      );
      remaining -= n;
      taken.set(p.seat, pile + n);
      show();
      game.setFloat(p.seat, `+${n}`);
      if (remaining === 0) {
        game.say(`${label(game, p)} が最後の 1 枚を取った!`);
        await game.wait(2.0);
        game.clearFloats();
        return [p];
      }
      game.say(`${label(game, p)} は ${n} 枚取った。残り ${remaining} 枚`);
      await game.wait(0.9);
      game.setFloat(p.seat, null);
      turn++;
    }
  }
}
