// 次に遊ぶミニゲームをルーレット(スロット)で決める
const easeOut = (t) => 1 - (1 - t) ** 3;

export class MinigameSelector {
  constructor() {
    this.el = document.getElementById('selector');
    this.reel = this.el.querySelector('.reel');
  }

  async pick(game, minigames) {
    const target = Math.floor(Math.random() * minigames.length);
    const n = minigames.length;
    // 何周か回ってから target で止まる
    const steps = n * (minigames.length > 1 ? 5 : 2) + target;
    game.say('');
    this.el.style.display = '';
    this.el.classList.remove('done');
    let last = -1;
    await game.tween(2.6, (t) => {
      const i = Math.floor(easeOut(t) * steps + 0.0001);
      if (i !== last) {
        last = i;
        this.reel.textContent = minigames[i % n].title;
        if (game.sfx.ctx) game.sfx._tick(game.sfx.ctx.currentTime, { freq: 2200, gain: 0.25, dur: 0.025 });
      }
    });
    const mg = minigames[target];
    this.reel.textContent = mg.title;
    this.el.classList.add('done');
    game.sfx.cock?.();
    await game.wait(1.3);
    this.el.style.display = 'none';
    return mg;
  }
}
