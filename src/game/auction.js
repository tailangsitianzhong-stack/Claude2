// ミニゲーム「ゴールド・オークション」
// ・全員チップ 10 枚から。金塊(1〜6 点)を 3 回せりにかける
// ・毎回、全員が一斉に入札額(0〜手持ち)を秘密で決めて公開する
// ・「一番高い入札が 1 人だけ」ならその人が落札し、入札分のチップを払う
//   一番高い額が同額で並んだら、その人たちは打ち消し合い、次に高い単独の入札者が落札
//   単独の入札者がいなければ流札。払うのは落札者だけ
// ・3 回終わって金塊の点数が一番低い人が最下位
//   同点なら残りチップが少ない方、それも同じならサイコロ決着
// 目安:1 分前後
import * as THREE from 'three';
import { createChip, tableSpot, label, isMe, easeInOut, staggered, rollOff, shuffle } from './kit.js';

const START_CHIPS = 10;
const ROUNDS = 3;

// 部屋に映り込み用の環境がないので、金属感は控えめにして金色をはっきり出す
const goldMat = new THREE.MeshStandardMaterial({ color: 0xb8860b, metalness: 0.3, roughness: 0.45, emissive: 0x4a3000, emissiveIntensity: 0.55 });
function createGoldBar() {
  const g = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 0.035), goldMat);
  g.castShadow = true;
  return g;
}

// 落札者を決める(一番高い「単独の」入札)
export function auctionWinner(bids) {
  const counts = new Map();
  for (const b of bids.values()) counts.set(b, (counts.get(b) ?? 0) + 1);
  const unique = [...bids].filter(([, b]) => b > 0 && counts.get(b) === 1).sort((a, b) => b[1] - a[1]);
  return unique.length ? { seat: unique[0][0], bid: unique[0][1] } : null;
}

export class GoldAuction {
  constructor(scene) {
    this.scene = scene;
    this.title = 'ゴールド・オークション';
    this.firstTime = true;
    this.objects = [];
  }

  cleanup() {
    for (const o of this.objects) o.parent?.remove(o);
    this.objects = [];
  }

  // AI:金塊の価値に応じて入札。後のラウンドのために少し残す。たまに大胆に張る
  aiBid(value, chips, roundsLeft) {
    const reserve = Math.max(0, roundsLeft - 1) * 2;
    const budget = Math.max(0, chips - reserve);
    let b = Math.round(value * (0.6 + Math.random() * 0.9));
    if (Math.random() < 0.15) b += 2 + Math.floor(Math.random() * 3);
    if (roundsLeft === 1) b = Math.max(b, Math.round(chips * (0.4 + Math.random() * 0.6)));
    return Math.max(0, Math.min(budget || chips, b, chips));
  }

  async play(game) {
    const alive = game.players.filter((p) => p.alive);
    game.say(
      this.firstTime
        ? 'ゴールド・オークション:チップ 10 枚で金塊を 3 回せり落とせ。\n一番高い額が 1 人だけなら落札(同額は打ち消し)。金塊の点数が一番低い者が撃つ。'
        : 'ゴールド・オークション:3 回勝負',
    );
    await game.wait(this.firstTime ? 4.8 : 2.0);
    this.firstTime = false;

    const chips = new Map(alive.map((p) => [p.seat, START_CHIPS]));
    const gold = new Map(alive.map((p) => [p.seat, 0]));
    const show = () => {
      game.tags = Object.fromEntries(alive.map((p) => [p.seat, `金${gold.get(p.seat)}点・チップ${chips.get(p.seat)}`]));
      game.renderPlayers();
    };
    show();
    const values = shuffle([1, 2, 3, 4, 5, 6]).slice(0, ROUNDS);

    for (let r = 0; r < ROUNDS; r++) {
      const value = values[r];
      // 金塊を中央に積む
      const bars = [];
      for (let i = 0; i < value; i++) {
        const b = createGoldBar();
        b.position.set(game.tablePos.x + ((i % 3) - 1) * 0.075, game.tableTop + 0.01 + Math.floor(i / 3) * 0.02, game.tablePos.z);
        this.scene.add(b);
        this.objects.push(b);
        bars.push(b);
      }
      game.sfx.chip();
      game.say(`${r + 1} 回目:金塊 ${value} 点`);
      await game.wait(1.4);

      // 入札
      const bids = new Map();
      for (const p of alive) if (!isMe(game, p)) bids.set(p.seat, this.aiBid(value, chips.get(p.seat), ROUNDS - r));
      const me = alive.find((p) => isMe(game, p));
      if (me) {
        const opts = [];
        for (let k = 0; k <= chips.get(me.seat); k++) opts.push({ label: String(k), value: k });
        bids.set(me.seat, await game.choose(opts, `金塊 ${value} 点。いくら賭ける?(手持ち ${chips.get(me.seat)} 枚)`));
      } else {
        game.say('全員が入札額を考えている……');
        await game.wait(1.6);
      }

      // 公開:入札分のチップを前に出す
      game.say('入札公開!');
      const shown = [];
      await staggered(alive, 0.1, game, async (p) => {
        const b = bids.get(p.seat);
        game.setFloat(p.seat, `入札 ${b}`);
        for (let i = 0; i < b; i++) {
          const c = createChip(0xb02a2a);
          c.position.copy(tableSpot(game, p.seat, 0.42, -0.08, 0.003 + i * 0.0062));
          this.scene.add(c);
          shown.push(c);
        }
        if (b) game.sfx.chip();
      });
      await game.wait(1.2);
      const win = auctionWinner(bids);
      if (win) {
        const p = game.players[win.seat];
        chips.set(win.seat, chips.get(win.seat) - win.bid);
        gold.set(win.seat, gold.get(win.seat) + value);
        game.say(`${label(game, p)} が ${win.bid} 枚で落札!(+${value} 点)`);
        // 金塊を落札者の前へ
        const before = gold.get(win.seat) - value; // それまでに持っていた金塊の数(上に積む)
        await Promise.all(
          bars.map(async (b, i) => {
            const from = b.position.clone();
            const to = tableSpot(game, p.seat, 0.5, 0.14, 0.01 + (before + i) * 0.02);
            await game.tween(0.5, (t) => {
              const e = easeInOut(t);
              b.position.lerpVectors(from, to, e);
              b.position.y += Math.sin(Math.PI * e) * 0.08;
            });
          }),
        );
      } else {
        const top = Math.max(...bids.values());
        game.say(top === 0 ? '誰も入札しなかった…… 流札' : '一番高い額が並んだ…… 単独の入札者なしで流札');
        await game.tween(0.4, (t) => bars.forEach((b) => b.scale.setScalar(1 - t)));
        bars.forEach((b) => b.parent?.remove(b));
      }
      for (const c of shown) c.parent?.remove(c);
      show();
      await game.wait(2.0);
      game.clearFloats();
    }

    // 結果
    const line = alive.map((p) => `${label(game, p)} ${gold.get(p.seat)}点(チップ${chips.get(p.seat)})`).join(' ・ ');
    game.say(`結果:${line}`);
    await game.wait(2.8);
    const lowGold = Math.min(...alive.map((p) => gold.get(p.seat)));
    let tied = alive.filter((p) => gold.get(p.seat) === lowGold);
    if (tied.length > 1) {
      const lowChips = Math.min(...tied.map((p) => chips.get(p.seat)));
      const fewer = tied.filter((p) => chips.get(p.seat) === lowChips);
      game.say(`${tied.map((p) => label(game, p)).join(' と ')} が ${lowGold} 点で並んだ。残りチップが少ない方が負け`);
      await game.wait(2.4);
      tied = fewer;
    }
    const loser = tied.length > 1 ? await rollOff(game, tied, 'チップも同じ') : tied[0];
    return [loser];
  }
}
