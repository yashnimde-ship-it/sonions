/** The end of a heist: a big WIN or LOSE card over the revealed map. */
export class ResultScreen {
  private root = document.createElement('section');

  constructor(onBack: () => void) {
    this.root.id = 'result';
    this.root.hidden = true;
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.result-back')) onBack();
    });
    document.getElementById('hud')!.append(this.root);
  }

  show(r: { won: boolean; saboteur: boolean; winner: 'runners' | 'saboteur'; banked: number; need: number; total: number }) {
    const reason =
      r.winner === 'runners'
        ? `The Runners banked ${r.banked} of ${r.total} diamonds (needed ${r.need}).`
        : `Time's up: only ${r.banked} of ${r.total} diamonds were banked (needed ${r.need}).`;
    this.root.className = r.won ? 'win' : 'lose';
    this.root.innerHTML = `
      <div class="result-card">
        <span class="kicker">${r.winner === 'runners' ? 'RUNNERS WIN' : 'SABOTEUR WINS'}</span>
        <h1>${r.won ? 'YOU WIN' : 'YOU LOSE'}</h1>
        <p class="reason">${reason}</p>
        <p class="legend"><i class="gem banked"></i> banked <i class="gem floor"></i> dropped <i class="gem hidden"></i> never found</p>
        <button type="button" class="result-back">BACK TO SAFEHOUSE</button>
      </div>`;
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }
}
