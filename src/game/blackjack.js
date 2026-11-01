// ミニゲーム「ブラックジャック」
// ・52 枚のトランプ。A は 1 か 11(都合の良い方)、J・Q・K は 10
// ・全員に 2 枚ずつ伏せて配る。自分のカード(と点数)は自分にしか見えない
// ・1 人ずつ順番に「ヒット(もう 1 枚)」か「スタンド(止める)」
// ・21 を超えたらバーストで 0 点。カードは 5 枚まで
// ・全員が終わったら一斉に開示し、点数が一番小さい人が最下位(同点ならサイコロ決着)
// 目安:1〜2 分
import { makeDeck, createCard, dealCard, flipCard, label, isMe, lowestLoses, shuffle } from './kit.js';

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

  // AI:他の人の点数は見えないので、自分の点数と「相手が何枚引いたか」だけで決める
  //   たくさん引いた相手は高い点(またはバースト)の可能性が高いので、少し強気になる
  aiHit(game, p, total, othersCardCounts) {
    const r = game.rand(p.seat);
    if (total <= 11) return true;
    if (total >= 18) return false;
    const greedy = othersCardCounts.filter((n) => n >= 3).length * 0.08;
    if (total >= 17) return r < 0.08;
    if (total >= 15) return r < 0.35 + greedy;
    return r < 0.8;
  }

  async play(game) {
    const alive = shuffle(game.players.filter((p) => p.alive), () => game.rand());
    game.say(
      this.firstTime
        ? 'ブラックジャック:21 に近づけろ。超えたらバーストで 0 点。\n自分の点数は自分にしか見えない。最後に全員で開示し、一番低い者が撃つ。'
        : 'ブラックジャック:最後に全員で開示',
    );
    await game.wait(this.firstTime ? 4.4 : 2.0);
    this.firstTime = false;

    const deck = makeDeck(() => game.rand());
    const hands = new Map(alive.map((p) => [p.seat, []]));
    const cards = new Map(alive.map((p) => [p.seat, []]));
    const finals = new Map();
    const me = alive.find((p) => isMe(game, p));
    const myTotalText = () => {
      const t = bjTotal(hands.get(me.seat));
      return t > 21 ? `${t}(バースト)` : `${t}`;
    };
    // 伏せて配る。自分のカードだけ表(自分にしか見えない)
    const give = async (p) => {
      const c = deck.pop();
      const h = hands.get(p.seat);
      h.push(c);
      const card = createCard(c, false);
      this.objects.push(card);
      cards.get(p.seat).push(card);
      await dealCard(game, card, p.seat, h.length - 1, MAX_CARDS, { faceUp: isMe(game, p), dur: 0.35 });
    };

    // 2 枚ずつ配る
    for (let k = 0; k < 2; k++) {
      for (const p of alive) await give(p);
    }
    const showCounts = () => {
      game.tags = Object.fromEntries(alive.map((p) => [p.seat, finals.has(p.seat) ? `${cards.get(p.seat).length}枚・済` : `${cards.get(p.seat).length}枚`]));
      game.renderPlayers();
    };
    showCounts();
    if (me) game.say(`あなたの点数:${myTotalText()}(他の人には見えない)`);
    await game.wait(1.2);

    for (const p of alive) {
      game.say(`${label(game, p)} の番`);
      await game.wait(0.8);
      for (;;) {
        const t = bjTotal(hands.get(p.seat));
        if (t >= 21 || hands.get(p.seat).length >= MAX_CARDS) break;
        const hit =
          (await game.decide(
            p,
            () =>
              game.choose(
                [
                  { label: '🂠 ヒット(もう 1 枚)', value: true },
                  { label: '✋ スタンド', value: false },
                ],
                `あなたの点数:${t}。ヒットか、スタンドか?`,
              ),
            async () => {
              await game.wait(0.7 + game.rand(p.seat) * 0.7);
              return this.aiHit(game, p, t, alive.filter((o) => o !== p).map((o) => cards.get(o.seat).length));
            },
          )) === true;
        if (!hit) break;
        game.say(`${label(game, p)}:ヒット`);
        await give(p);
        showCounts();
        if (isMe(game, p)) {
          game.say(`あなたの点数:${myTotalText()}`);
          await game.wait(0.9);
        } else await game.wait(0.4);
      }
      const t = bjTotal(hands.get(p.seat));
      finals.set(p.seat, t > 21 ? 0 : t);
      showCounts();
      // バーストかどうかも、開示まで他の人にはわからない
      game.say(isMe(game, p) ? (t > 21 ? `バースト…(${t})。開示まで黙っていよう` : `あなたは ${t} でスタンド`) : `${label(game, p)} はスタンド`);
      await game.wait(1.1);
    }

    // 全員で開示
    game.say('全員、カードを開示!');
    await game.wait(0.8);
    await Promise.all(alive.flatMap((p) => cards.get(p.seat).filter((c) => !c.userData.faceUp).map((c) => flipCard(game, c, true, 0.4))));
    for (const p of alive) {
      const t = bjTotal(hands.get(p.seat));
      game.setFloat(p.seat, t > 21 ? `💥 ${t}` : `${t}`, { color: t > 21 ? '#ff7a6a' : t === 21 ? '#ffd36a' : '#f3e2bd' });
    }
    game.tags = Object.fromEntries([...finals].map(([s, v]) => [s, `${v}点`]));
    game.renderPlayers();
    await game.wait(1.0);
    game.say(`結果:${alive.map((p) => `${label(game, p)} ${finals.get(p.seat) || 'バースト'}`).join(' ・ ')}`);
    await game.wait(2.6);
    const loser = await lowestLoses(game, alive, (p) => finals.get(p.seat), '最下位が同点');
    return [loser];
  }
}
