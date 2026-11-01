// ミニゲーム「チキン・ダイス」
// ・1 人ずつ順番に、サイコロを好きなだけ振って出た目を足していく
// ・いつでも「やめる」で合計を確定できる。ただし 1 が出たらバーストで 0 点、番は終わり
// ・全員が終わったら、合計が一番小さい人が最下位(同点ならサイコロ決着)
// 目安:1 人 4〜5 回 × 4 人 ≒ 1〜2 分
import { createDie, rollDie, tableSpot, label, isMe, lowestLoses, shuffle } from './kit.js';

export class ChickenDice {
  constructor(scene) {
    this.scene = scene;
    this.title = 'チキン・ダイス';
    this.firstTime = true;
    this.objects = [];
  }

  cleanup() {
    for (const o of this.objects) o.parent?.remove(o);
    this.objects = [];
  }

  // AI:まだ誰も確定していなければ 10〜14 を目標、確定した人がいれば「一番低い人+1」を超えるまで振る
  aiWantsRoll(game, p, total, banked, remaining) {
    if (total === 0) return true;
    const done = [...banked.values()];
    let target = 10 + Math.floor(game.rand(p.seat) * 5);
    if (done.length) {
      const low = Math.min(...done);
      target = remaining === 0 ? low + 1 : Math.max(8, Math.min(target, low + 3));
    }
    return total < target;
  }

  async play(game) {
    const alive = shuffle(game.players.filter((p) => p.alive), () => game.rand());
    game.say(
      this.firstTime
        ? 'チキン・ダイス:順番にサイコロを好きなだけ振り、出た目を足していく。\n1 が出たら 0 点。合計が一番小さい者が撃つ。'
        : 'チキン・ダイス:1 を出したら 0 点',
    );
    await game.wait(this.firstTime ? 4.2 : 2.0);
    this.firstTime = false;

    const banked = new Map();
    const show = () => {
      game.tags = Object.fromEntries([...banked].map(([s, v]) => [s, `${v}点`]));
      game.renderPlayers();
    };
    const die = createDie();
    this.objects.push(die);

    for (let i = 0; i < alive.length; i++) {
      const p = alive[i];
      const remaining = alive.length - 1 - i;
      // 振る人のサイコロの方を全員で見る
      const spot = tableSpot(game, p.seat, 0.25);
      game.controls.setFocus(isMe(game, p) ? spot : p.character.userData.head.getWorldPosition(spot.clone()));
      for (const o of alive) o.character.userData.focus = spot;
      game.say(`${label(game, p)} の番`);
      await game.wait(1.0);
      let total = 0;
      let bust = false;
      for (;;) {
        // 振るかどうか
        let roll = true;
        if (total > 0) {
          if (!isMe(game, p) && game.controllers[p.seat] === 'remote') game.say(`${label(game, p)}:合計 ${total}。振るか、やめるか……`);
          roll =
            (await game.decide(
              p,
              () =>
                game.choose(
                  [
                    { label: `🎲 もう一度振る(今 ${total})`, value: true },
                    { label: `✋ やめる(${total} で確定)`, value: false },
                  ],
                  `合計 ${total}。振るか、やめるか?`,
                ),
              async () => {
                await game.wait(0.5 + game.rand(p.seat) * 0.5);
                return this.aiWantsRoll(game, p, total, banked, remaining);
              },
            )) === true;
        }
        if (!roll) break;
        const v = 1 + Math.floor(game.rand() * 6);
        const from = tableSpot(game, p.seat, 0.6, 0.05, 0.15);
        const to = tableSpot(game, p.seat, 0.25, (Math.random() - 0.5) * 0.12);
        await rollDie(game, die, v, from, to);
        if (v === 1) {
          bust = true;
          total = 0;
          game.setFloat(p.seat, '💥 0', { color: '#ff7a6a' });
          game.say(`1 が出た! ${label(game, p)} はバースト、0 点`);
          await game.wait(1.6);
          break;
        }
        total += v;
        game.setFloat(p.seat, `${total}`);
        game.say(`${label(game, p)}:${v}(合計 ${total})`);
        await game.wait(0.5);
      }
      if (!bust) {
        game.say(`${label(game, p)} は ${total} 点で確定`);
        await game.wait(1.0);
      }
      banked.set(p.seat, total);
      show();
    }
    game.clearFocus();
    die.parent?.remove(die);

    const line = alive.map((p) => `${label(game, p)} ${banked.get(p.seat)}`).join(' ・ ');
    game.say(`結果:${line}`);
    await game.wait(2.4);
    const loser = await lowestLoses(game, alive, (p) => banked.get(p.seat), '最下位が同点');
    return [loser];
  }
}
