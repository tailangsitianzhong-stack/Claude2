// ミニゲーム「早撃ち」
// ・「構えろ」のあと、ランダムな間をおいて呼び鈴と「撃て!」の合図が出る
// ・合図のあとに一番遅く手を出した人に ✕。合図の前に手を出した「お手つき」も ✕
// ・3 回やって ✕ が一番多い人が最下位。同点なら、その人たちだけで決着がつくまで続ける
// 目安:1 回 5〜7 秒 × 3〜4 回 ≒ 30〜60 秒
import { tableSpot, label, isMe, easeInOut } from './kit.js';

const ROUNDS = 3;
// キャラクターごとの反応の速さ(秒)
const BASE = [0.27, 0.31, 0.3, 0.28];

export class QuickDraw {
  constructor(scene) {
    this.scene = scene;
    this.title = '早撃ち';
    this.firstTime = true;
  }

  cleanup(game) {
    const box = game?.ui.choices;
    if (box) {
      box.innerHTML = '';
      box.style.display = 'none';
    }
  }

  // 手を素早く前に出す(テーブルを叩く)
  async slam(game, p) {
    const u = p.character.userData;
    const arm = u.arms[0];
    arm.controlled = true;
    u.reachTarget = 0.3;
    const from = arm.target.clone();
    const to = p.character.worldToLocal(tableSpot(game, p.seat, 0.5, 0.05, 0.03));
    game.sfx.chip();
    await game.tween(0.12, (t) => arm.target.lerpVectors(from, to, easeInOut(t)));
    await game.wait(0.6);
    arm.controlled = false;
    u.reachTarget = 0;
  }

  // 1 回分。group の人の反応時間(お手つきは -1)を返す
  async duel(game, group) {
    game.clearFloats();
    game.say('構えろ……');
    const start = game.clock;
    const signal = 1.6 + game.rand() * 2.6;
    let playerPress = null;
    const me = group.find((p) => isMe(game, p));
    // プレイヤーのボタン
    const box = game.ui.choices;
    const onKey = (e) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        press();
      }
    };
    let btn = null;
    const press = () => {
      if (playerPress !== null) return;
      playerPress = game.clock - start;
      // 押したことが分かるようにボタンを灰色にする
      if (btn) {
        btn.classList.add('pressed');
        btn.textContent = '✔ 抜いた!';
      }
    };
    if (me) {
      box.innerHTML = '';
      const b = document.createElement('button');
      btn = b;
      b.textContent = '🔫 抜け!';
      b.className = 'big';
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        press();
      });
      box.appendChild(b);
      box.style.display = '';
      window.addEventListener('keydown', onKey);
      document.exitPointerLock?.();
      this._press = press;
    }
    // コンピューターの手を出す時刻
    const at = new Map();
    for (const p of group) {
      if (game.isHuman(p)) continue;
      const early = game.rand(p.seat) < 0.04;
      at.set(p.seat, early ? signal * (0.4 + game.rand(p.seat) * 0.5) : signal + BASE[p.seat] + game.rand(p.seat) * 0.3);
    }
    const acted = new Set();
    let fired = false;
    const total = signal + 1.6;
    await game.tween(total, () => {
      const now = game.clock - start;
      if (!fired && now >= signal) {
        fired = true;
        game.sfx.bell();
        game.say('撃て!');
        game.ui.message.classList.add('shout');
        game.setOverlay('#fff', 0.18, 0);
        setTimeout(() => game.setOverlay('#fff', 0, 250), 40);
      }
      for (const [seat, tm] of at) {
        if (!acted.has(seat) && now >= tm) {
          acted.add(seat);
          this.slam(game, game.players[seat]);
        }
      }
      if (me && playerPress !== null && !acted.has(me.seat)) {
        acted.add(me.seat);
        game.sfx.chip();
      }
    });
    game.ui.message.classList.remove('shout');
    window.removeEventListener('keydown', onKey);
    box.innerHTML = '';
    box.style.display = 'none';
    this._press = null;

    // 人間の反応時間は本人の端末で測った値を全員で使う(通信相手の分は届くのを待つ)
    const times = new Map();
    if (group.some((p) => game.controllers[p.seat] === 'remote')) game.say('全員の結果を待っています……');
    for (const p of group) {
      const tm = await game.decide(
        p,
        () => Math.round((playerPress ?? 99) * 1000) / 1000,
        () => at.get(p.seat),
      );
      times.set(p.seat, tm < signal ? -1 : tm - signal);
    }
    for (const p of group) {
      const r = times.get(p.seat);
      game.setFloat(p.seat, r < 0 ? 'お手つき!' : r > 9 ? '遅すぎ' : `${r.toFixed(2)}秒`, { color: r < 0 ? '#ff7a6a' : '#f3e2bd' });
    }
    return times;
  }

  // その回の ✕(お手つき全員、いなければ一番遅い人)
  strikesOf(group, times) {
    const early = group.filter((p) => times.get(p.seat) < 0);
    if (early.length) return early;
    const slow = Math.max(...group.map((p) => times.get(p.seat)));
    return group.filter((p) => times.get(p.seat) === slow);
  }

  async play(game) {
    const alive = game.players.filter((p) => p.alive);
    game.say(
      this.firstTime
        ? '早撃ち:合図「撃て!」が出たら、すぐに「抜け!」を押せ。\n一番遅い者と、合図の前に押した者に ✕。3 回で ✕ が一番多い者が撃つ。'
        : '早撃ち:3 本勝負',
    );
    await game.wait(this.firstTime ? 4.4 : 2.0);
    this.firstTime = false;
    const strikes = new Map(alive.map((p) => [p.seat, 0]));
    const show = () => {
      game.tags = Object.fromEntries([...strikes].map(([s, v]) => [s, '✕'.repeat(v) || '-']));
      game.renderPlayers();
    };
    show();

    for (let r = 1; r <= ROUNDS; r++) {
      game.say(`${r} 本目`);
      await game.wait(1.0);
      const times = await this.duel(game, alive);
      const bad = this.strikesOf(alive, times);
      for (const p of bad) strikes.set(p.seat, strikes.get(p.seat) + 1);
      show();
      game.say(`✕:${bad.map((p) => label(game, p)).join('、')}${times.get(bad[0].seat) < 0 ? '(お手つき)' : '(一番遅い)'}`);
      await game.wait(2.2);
    }

    // ✕ が一番多い人。同点なら、その人たちだけで決着戦
    let max = Math.max(...strikes.values());
    let group = alive.filter((p) => strikes.get(p.seat) === max);
    while (group.length > 1) {
      game.say(`${group.map((p) => label(game, p)).join(' と ')} が ✕ ${max} で並んだ。決着戦!`);
      await game.wait(2.0);
      const times = await this.duel(game, group);
      const bad = this.strikesOf(group, times);
      if (bad.length === group.length) {
        game.say('全員同じ…… もう一度');
        await game.wait(1.6);
        continue;
      }
      game.say(`✕:${bad.map((p) => label(game, p)).join('、')}`);
      await game.wait(1.8);
      group = bad;
      max += 1;
    }
    game.clearFloats();
    return group;
  }
}
