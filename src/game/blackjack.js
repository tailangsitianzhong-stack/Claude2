// ミニゲーム「ブラックジャック」
// ・52 枚のトランプ。A は 1 か 11(都合の良い方)、J・Q・K は 10
// ・全員に 2 枚ずつ表向きで配り、1 人ずつ順番に「ヒット(もう 1 枚)」か「スタンド(止める)」
// ・21 を超えたらバーストで 0 点。カードは 5 枚まで
// ・全員が終わったら、点数が一番小さい人が最下位(同点ならサイコロ決着)
// 目安:1〜2 分
import { makeDeck, createCard, dealCard, label, isMe, lowestLoses, shuffle } from './kit.js';

export function bjTotal(hand) {
  let sum = 0;
  let aces = 0;
  for (const c of hand) {
    sum += Math.min(10, c.r);
    if (c.r === 1) aces++;
  }
  if (aces && sum + 10 <= 21) sum += 10;
  return sum;
}

const MAX_CARDS = 5;

export class Blackjack {
  constructor(scene) {
    this.scene = scene;
    this.title = 'ブラックジャック';
    this.firstTime = true;
    this.objects = [];
  }

  cleanup() {
    for (const o of this.objects) o.parent?.remove(o);
    this.objects = [];
  }

  // AI:12 以上で、これ以上引くと危ない・すでに誰かより上ならスタンド
  aiHit(total, others) {
    if (total <= 11) return true;
    const standing = others.filter((v) => v !== null);
    // 全員が終わっていて、このままだと自分が一番下なら引くしかない
    if (standing.length === others.length && standing.length && total <= Math.min(...standing)) return total < Math.min(...standing) || total <= 16;
    if (total >= 17) return false;
    if (standing.length && total > Math.min(...standing)) return Math.random() < 0.25;
    return total <= 14 || Math.random() < 0.45;
  }

  async play(game) {
    const alive = shuffle(game.players.filter((p) => p.alive));
    game.say(
      this.firstTime
        ? 'ブラックジャック:21 に近づけろ。超えたらバーストで 0 点。\nA は 1 か 11、絵札は 10。一番点数が低い者が撃つ。'
        : 'ブラックジャック:21 を超えるな',
    );
    await game.wait(this.firstTime ? 4.2 : 2.0);
    this.firstTime = false;

    const deck = makeDeck();
    const hands = new Map(alive.map((p) => [p.seat, []]));
    const finals = new Map(alive.map((p) => [p.seat, null]));
    const showTotal = (p) => {
      const t = bjTotal(hands.get(p.seat));
      game.setFloat(p.seat, t > 21 ? `💥 ${t}` : `${t}`, { color: t > 21 ? '#ff7a6a' : t === 21 ? '#ffd36a' : '#f3e2bd' });
    };
    const give = async (p) => {
      const c = deck.pop();
      const h = hands.get(p.seat);
      h.push(c);
      const card = createCard(c, false);
      this.objects.push(card);
      // 並びが変わるので、全体を MAX_CARDS 枚分の位置に置く
      await dealCard(game, card, p.seat, h.length - 1, MAX_CARDS, { faceUp: true, dur: 0.35 });
    };

    // 2 枚ずつ配る
    for (let k = 0; k < 2; k++) {
      for (const p of alive) await give(p);
    }
    for (const p of alive) showTotal(p);
    await game.wait(0.6);

    for (const p of alive) {
      game.controls.setFocus(null);
      game.say(`${label(game, p)} の番`);
      await game.wait(0.8);
      for (;;) {
        const t = bjTotal(hands.get(p.seat));
        if (t >= 21 || hands.get(p.seat).length >= MAX_CARDS) break;
        let hit;
        if (isMe(game, p)) {
          hit =
            (await game.choose(
              [
                { label: '🂠 ヒット(もう 1 枚)', value: true },
                { label: '✋ スタンド', value: false },
              ],
              `あなたは ${t}。ヒットか、スタンドか?`,
            )) === true;
        } else {
          await game.wait(0.7 + Math.random() * 0.6);
          hit = this.aiHit(t, alive.filter((o) => o !== p).map((o) => finals.get(o.seat)));
        }
        if (!hit) break;
        game.say(`${label(game, p)}:ヒット`);
        await give(p);
        showTotal(p);
        await game.wait(0.5);
      }
      const t = bjTotal(hands.get(p.seat));
      finals.set(p.seat, t > 21 ? 0 : t);
      game.say(t > 21 ? `${label(game, p)} はバースト!(0 点)` : `${label(game, p)} は ${t} でスタンド`);
      game.tags = Object.fromEntries([...finals].filter(([, v]) => v !== null).map(([s, v]) => [s, `${v}点`]));
      game.renderPlayers();
      await game.wait(1.2);
    }

    game.say(`結果:${alive.map((p) => `${label(game, p)} ${finals.get(p.seat)}`).join(' ・ ')}`);
    await game.wait(2.4);
    const loser = await lowestLoses(game, alive, (p) => finals.get(p.seat), '最下位が同点');
    return [loser];
  }
}
