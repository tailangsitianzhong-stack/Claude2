// ミニゲーム「コイン・スプーフ」(酒場で昔から遊ばれている当てっこ)
// ・全員が 0〜3 枚のコインを手の中に隠して握る
// ・順番に「全員のコインの合計」を予想して言う。すでに誰かが言った数は言えない
// ・一斉に手を開き、ぴったり当てた人は「抜け」(安全)。当たりがいなければもう一度
// ・抜けた人を除いて続け、最後まで残った 1 人が最下位
// 目安:1 回 10〜15 秒 × 4〜6 回 ≒ 1〜1.5 分
import * as THREE from 'three';
import { tableSpot, label, isMe, easeInOut, staggered } from './kit.js';

const coinMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, metalness: 0.3, roughness: 0.45, emissive: 0x4a3000, emissiveIntensity: 0.55 });
function createCoin() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.003, 24), coinMat);
  m.castShadow = true;
  return m;
}

export class Spoof {
  constructor(scene) {
    this.scene = scene;
    this.title = 'コイン・スプーフ';
    this.firstTime = true;
    this.objects = [];
  }

  cleanup() {
    for (const o of this.objects) o.parent?.remove(o);
    this.objects = [];
  }

  // AI:自分の枚数 + 他の人の平均(1.5 枚)を基本に、先に言った人の予想も少し参考にする
  aiGuess(own, n, taken, earlier) {
    let est = own + 1.5 * (n - 1);
    if (earlier.length) {
      // 先に言った人の予想 − その人の想定(1.5 + 他の平均)… を大まかに平均と混ぜる
      const hint = earlier.reduce((a, b) => a + b, 0) / earlier.length;
      est = est * 0.7 + hint * 0.3;
    }
    est += (Math.random() - 0.5) * 1.2;
    const lo = own;
    const hi = own + 3 * (n - 1);
    let best = null;
    for (let v = lo; v <= hi; v++) {
      if (taken.has(v)) continue;
      if (best === null || Math.abs(v - est) < Math.abs(best - est)) best = v;
    }
    if (best === null) for (let v = 0; v <= 3 * n; v++) if (!taken.has(v)) return v;
    return best;
  }

  async play(game) {
    let group = game.players.filter((p) => p.alive);
    game.say(
      this.firstTime
        ? 'コイン・スプーフ:0〜3 枚のコインを隠して握れ。順番に全員の合計を予想し、\nぴったり当てた者から抜けていく。最後に残った者が撃つ。'
        : 'コイン・スプーフ:最後に残るな',
    );
    await game.wait(this.firstTime ? 4.6 : 2.0);
    this.firstTime = false;
    const status = new Map(group.map((p) => [p.seat, '']));
    const show = () => {
      game.tags = Object.fromEntries([...status].map(([s, v]) => [s, v]));
      game.renderPlayers();
    };
    let starter = Math.floor(Math.random() * group.length);

    while (group.length > 1) {
      this.cleanup();
      game.clearFloats();
      const n = group.length;
      // 握る枚数を決める
      const hold = new Map();
      for (const p of group) if (!isMe(game, p)) hold.set(p.seat, Math.floor(Math.random() * 4));
      const me = group.find((p) => isMe(game, p));
      if (me) {
        const v = await game.choose(
          [0, 1, 2, 3].map((k) => ({ label: `🪙 ${k} 枚`, value: k })),
          `コインを何枚握る?(残り ${n} 人)`,
        );
        hold.set(me.seat, v);
      } else {
        game.say(`全員がコインを握る……(残り ${n} 人)`);
        await game.wait(1.4);
      }
      // 握った拳を前に出す
      for (const p of group) {
        if (isMe(game, p)) continue;
        const u = p.character.userData;
        const arm = u.arms[0];
        arm.controlled = true;
        arm.target.copy(p.character.worldToLocal(tableSpot(game, p.seat, 0.55, 0.05, 0.12)));
      }

      // 順番に予想する
      const order = [...group.slice(starter % n), ...group.slice(0, starter % n)];
      const guesses = new Map();
      const taken = new Set();
      for (const p of order) {
        let g;
        if (isMe(game, p)) {
          const opts = [];
          for (let v = 0; v <= 3 * n; v++) opts.push({ label: String(v), value: v, disabled: taken.has(v) });
          g = await game.choose(opts, `あなたは ${hold.get(p.seat)} 枚。全員の合計は?(言われた数は選べない)`);
        } else {
          game.say(`${label(game, p)} の予想……`);
          await game.wait(0.9 + Math.random() * 0.6);
          g = this.aiGuess(hold.get(p.seat), n, taken, [...guesses.values()]);
        }
        guesses.set(p.seat, g);
        taken.add(g);
        game.setFloat(p.seat, `予想 ${g}`);
        game.say(`${label(game, p)}:「${g}」`);
        await game.wait(0.8);
      }

      // 一斉に手を開く
      game.say('せーので開け!');
      await game.wait(0.8);
      const total = [...hold.values()].reduce((a, b) => a + b, 0);
      await staggered(group, 0.05, game, async (p) => {
        const k = hold.get(p.seat);
        for (let i = 0; i < k; i++) {
          const c = createCoin();
          this.scene.add(c);
          this.objects.push(c);
          const to = tableSpot(game, p.seat, 0.4, 0.05 * (i - 1), 0.003);
          const from = tableSpot(game, p.seat, 0.55, 0.05, 0.12);
          game.sfx.chip();
          await game.tween(0.25, (t) => c.position.lerpVectors(from, to, easeInOut(t)));
        }
        game.setFloat(p.seat, `${k} 枚(予想 ${guesses.get(p.seat)})`);
        const arm = p.character.userData.arms[0];
        arm.controlled = false;
      });
      const hit = group.find((p) => guesses.get(p.seat) === total);
      game.say(`合計は ${total} 枚!\n${hit ? `${label(game, hit)} がぴったり当てて抜けた` : '当たりなし。もう一度'}`);
      await game.wait(2.6);
      if (hit) {
        status.set(hit.seat, '抜け');
        show();
        const idx = group.indexOf(hit);
        group = group.filter((p) => p !== hit);
        starter = idx; // 抜けた人の次の人から
      } else starter++;
    }
    for (const p of game.players) p.character.userData.arms[0].controlled = false;
    game.clearFloats();
    game.say(`最後に残ったのは ${label(game, group[0])}`);
    await game.wait(1.8);
    return group;
  }
}
