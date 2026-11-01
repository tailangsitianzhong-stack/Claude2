// ミニゲーム「スリーカード・ポーカー」
// ・52 枚のトランプから 3 枚ずつ配る(自分のカードだけ表、他の人のは伏せたまま)
// ・1 回だけ、好きな枚数(0〜3 枚)を山札と交換できる
// ・一斉に表にして役の強さで勝負。一番弱い役の人が最下位
//   強い順:ストレートフラッシュ > スリーカード > ストレート > フラッシュ > ワンペア > ハイカード
//   同じ役なら数字の大きさ(A が最強、A-2-3 のストレートは一番弱いストレート)
//   それでも同じならマークの強さ(♠ > ♥ > ♦ > ♣)で比べる
// 目安:1 分前後
import { makeDeck, createCard, dealCard, flipCard, label, isMe, cardName, SUIT_ORDER, staggered } from './kit.js';

const HAND_NAMES = ['ハイカード', 'ワンペア', 'フラッシュ', 'ストレート', 'スリーカード', 'ストレートフラッシュ'];
const hi = (c) => (c.r === 1 ? 14 : c.r);

// 役の評価。大きい配列ほど強い(先頭から比べる)
export function evaluate3(hand) {
  const rs = hand.map(hi).sort((a, b) => b - a);
  const flush = hand.every((c) => c.s === hand[0].s);
  let straight = rs[0] - rs[1] === 1 && rs[1] - rs[2] === 1;
  let top = rs;
  if (!straight && rs[0] === 14 && rs[1] === 3 && rs[2] === 2) {
    straight = true;
    top = [3, 2, 1];
  }
  const three = rs[0] === rs[2];
  const pairRank = rs[0] === rs[1] ? rs[0] : rs[1] === rs[2] ? rs[1] : 0;
  let cat;
  let ranks;
  if (straight && flush) [cat, ranks] = [5, top];
  else if (three) [cat, ranks] = [4, rs];
  else if (straight) [cat, ranks] = [3, top];
  else if (flush) [cat, ranks] = [2, rs];
  else if (pairRank) [cat, ranks] = [1, [pairRank, rs.find((r) => r !== pairRank)]];
  else [cat, ranks] = [0, rs];
  // 最後の比較用:一番強いカードのマーク
  const best = [...hand].sort((a, b) => hi(b) - hi(a) || SUIT_ORDER[b.s] - SUIT_ORDER[a.s])[0];
  return { cat, key: [cat, ...ranks, SUIT_ORDER[best.s]], name: HAND_NAMES[cat] };
}

export function compareHands(a, b) {
  for (let i = 0; i < Math.max(a.key.length, b.key.length); i++) {
    const d = (a.key[i] ?? 0) - (b.key[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

export class ThreeCardPoker {
  constructor(scene) {
    this.scene = scene;
    this.title = 'スリーカード・ポーカー';
    this.firstTime = true;
    this.objects = [];
  }

  cleanup(game) {
    for (const o of this.objects) o.parent?.remove(o);
    this.objects = [];
    const box = game?.ui.choices;
    if (box) box.style.display = 'none';
  }

  // AI:役ができていれば基本そのまま。ペアなら弱いキッカーを交換。役なしなら Q 以上だけ残す
  aiSwap(hand) {
    const ev = evaluate3(hand);
    if (ev.cat >= 2) return [];
    if (ev.cat === 1) {
      const pr = ev.key[1];
      return hand.map((c, i) => (hi(c) !== pr && hi(c) < 10 ? i : -1)).filter((i) => i >= 0);
    }
    const keep = hand.map((c, i) => (hi(c) >= 12 ? i : -1)).filter((i) => i >= 0);
    if (!keep.length) {
      const best = hand.reduce((bi, c, i) => (hi(c) > hi(hand[bi]) ? i : bi), 0);
      keep.push(best);
    }
    return [0, 1, 2].filter((i) => !keep.includes(i));
  }

  // プレイヤー:交換するカードを選ぶ(タップで切り替え)
  pickSwap(game, hand) {
    const box = game.ui.choices;
    box.innerHTML = '';
    const sel = new Set();
    game.say(`あなたの手:${evaluate3(hand).name}\n交換するカードを選んで「交換する」(0 枚でも可)`);
    document.exitPointerLock?.();
    return new Promise((res) => {
      hand.forEach((c, i) => {
        const b = document.createElement('button');
        b.className = 'card-toggle';
        b.textContent = cardName(c);
        if (c.s === '♥' || c.s === '♦') b.classList.add('red');
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (sel.has(i)) sel.delete(i);
          else sel.add(i);
          b.classList.toggle('on', sel.has(i));
          ok.textContent = sel.size ? `${sel.size} 枚交換する` : 'このまま勝負';
        });
        box.appendChild(b);
      });
      const ok = document.createElement('button');
      ok.textContent = 'このまま勝負';
      ok.addEventListener('click', (e) => {
        e.stopPropagation();
        box.innerHTML = '';
        box.style.display = 'none';
        this._pick = null;
        res([...sel]);
      });
      box.appendChild(ok);
      box.style.display = '';
      this._pick = (idx) => {
        box.innerHTML = '';
        box.style.display = 'none';
        this._pick = null;
        res(idx);
      };
    });
  }

  async play(game) {
    const alive = game.players.filter((p) => p.alive);
    game.say(
      this.firstTime
        ? 'スリーカード・ポーカー:3 枚で役を作れ。交換は 1 回だけ。\n一番弱い役の者が撃つ。'
        : 'スリーカード・ポーカー:交換は 1 回',
    );
    await game.wait(this.firstTime ? 3.8 : 2.0);
    this.firstTime = false;

    const deck = makeDeck();
    const hands = new Map(alive.map((p) => [p.seat, []]));
    const cards = new Map(alive.map((p) => [p.seat, []]));
    for (let k = 0; k < 3; k++) {
      for (const p of alive) {
        const c = deck.pop();
        hands.get(p.seat)[k] = c;
        const card = createCard(c, false);
        this.objects.push(card);
        cards.get(p.seat)[k] = card;
        await dealCard(game, card, p.seat, k, 3, { dist: 0.42, dur: 0.25 });
      }
    }
    // 自分のカードだけ表にする
    const me = alive.find((p) => isMe(game, p));
    if (me) for (const card of cards.get(me.seat)) await flipCard(game, card, true, 0.25);

    // 交換
    const swaps = new Map();
    for (const p of alive) if (!isMe(game, p)) swaps.set(p.seat, this.aiSwap(hands.get(p.seat)));
    if (me) swaps.set(me.seat, await this.pickSwap(game, hands.get(me.seat)));
    else {
      game.say('全員が手を考えている……');
      await game.wait(1.6);
    }
    for (const p of alive) game.setFloat(p.seat, `交換 ${swaps.get(p.seat).length} 枚`);
    game.say('交換');
    await staggered(alive, 0.2, game, async (p) => {
      for (const i of swaps.get(p.seat)) {
        const old = cards.get(p.seat)[i];
        old.parent?.remove(old);
        const c = deck.pop();
        hands.get(p.seat)[i] = c;
        const card = createCard(c, false);
        this.objects.push(card);
        cards.get(p.seat)[i] = card;
        await dealCard(game, card, p.seat, i, 3, { dist: 0.42, dur: 0.3 });
        if (isMe(game, p)) await flipCard(game, card, true, 0.25);
      }
    });
    await game.wait(0.8);

    // ショーダウン
    game.say('ショーダウン!');
    await game.wait(0.6);
    await Promise.all(alive.flatMap((p) => cards.get(p.seat).filter((c) => !c.userData.faceUp).map((c) => flipCard(game, c, true, 0.4))));
    const evals = new Map(alive.map((p) => [p.seat, evaluate3(hands.get(p.seat))]));
    for (const p of alive) game.setFloat(p.seat, evals.get(p.seat).name, { color: evals.get(p.seat).cat >= 2 ? '#ffd36a' : '#f3e2bd' });
    const order = [...alive].sort((a, b) => compareHands(evals.get(b.seat), evals.get(a.seat)));
    game.tags = Object.fromEntries(order.map((p, i) => [p.seat, `${i + 1}位`]));
    game.renderPlayers();
    game.say(
      order
        .map((p) => `${label(game, p)}:${evals.get(p.seat).name}(${hands.get(p.seat).map(cardName).join(' ')})`)
        .join('\n'),
    );
    await game.wait(4.0);
    const loser = order[order.length - 1];
    game.say(`一番弱いのは ${label(game, loser)}`);
    await game.wait(1.6);
    return [loser];
  }
}
