import type { ServerMsg, Standing } from '../net/protocol';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
type Result = Extract<ServerMsg, { t: 'result' }>;
type Final = Extract<ServerMsg, { t: 'final' }>;
const MAP_NAMES: Record<string, string> = { estate: 'The Estate', museum: 'Midnight Museum', 'cruise-b1': 'Luxury Cruise' };

/**
 * The end of a round: a big WIN or LOSE card over the revealed map, this round's points, the
 * running scoreboard and a countdown to the next round. And the end of the match: the podium.
 */
export class ResultScreen {
  private root = document.createElement('section');
  private countdown: HTMLElement | null = null;
  private nextAt = 0;
  private last = false;

  constructor(onBack: () => void) {
    this.root.id = 'result';
    this.root.hidden = true;
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.result-back')) onBack();
    });
    document.getElementById('hud')!.append(this.root);
  }

  /** A round is over. `me` is my player id, `saboteur` whether I was the Saboteur this round. */
  show(r: Result, me: string, saboteur: boolean) {
    const won = r.winner !== 'none' && (r.winner === 'saboteur') === saboteur;
    const reason =
      r.winner === 'none'
        ? 'The Saboteur left, so this round is called off.'
        : r.winner === 'runners'
          ? `The Runners banked ${r.banked} of ${r.total} diamonds (needed ${r.need}).`
          : `Time's up: only ${r.banked} of ${r.total} diamonds were banked (needed ${r.need}).`;
    const points = r.points
      .map((p) => `<li class="${p.id === me ? 'me' : ''}"><span class="who">${esc(p.name)}${p.saboteur ? ' <em>SABOTEUR</em>' : ''}</span><b>+${p.points}</b></li>`)
      .join('');
    this.root.className = r.winner === 'none' ? 'off' : won ? 'win' : 'lose';
    this.root.innerHTML = `
      <div class="result-card">
        <span class="kicker">ROUND ${r.round} OF ${r.rounds} · ${r.winner === 'none' ? 'CALLED OFF' : r.winner === 'runners' ? 'RUNNERS WIN' : 'SABOTEUR WINS'}</span>
        <h1>${r.winner === 'none' ? 'NO CONTEST' : won ? 'YOU WIN' : 'YOU LOSE'}</h1>
        <p class="reason">${reason}</p>
        <div class="result-cols">
          <div><h2>THIS ROUND</h2><ol class="points">${points}</ol></div>
          <div><h2>SCOREBOARD</h2>${table(r.standings, me)}</div>
        </div>
        <p class="legend"><i class="gem banked"></i> banked <i class="gem floor"></i> dropped <i class="gem hidden"></i> never found</p>
        <p class="next"></p>
        <button type="button" class="result-back">LEAVE MATCH</button>
      </div>`;
    this.countdown = this.root.querySelector('.next');
    this.nextAt = performance.now() + r.nextMs;
    this.last = r.last;
    this.root.hidden = false;
    this.tick();
  }

  /** The match is over: podium, totals, and what happened each round. */
  showFinal(f: Final, me: string) {
    // Places share a number on a tie (two on 500 are both 1st).
    const place = (i: number) => f.standings.findIndex((s) => s.total === f.standings[i].total) + 1;
    const top = f.standings.slice(0, 3);
    const podium = [1, 0, 2]
      .map((i) => {
        const p = top[i];
        if (!p) return '<div class="step empty"></div>';
        const n = place(i);
        return `<div class="step s${n}${p.id === me ? ' me' : ''}"><img src="/assets/characters/${p.character}-portrait.png" alt=""><span class="name">${esc(p.name)}</span><b>${p.total}</b><span class="place">${n}</span></div>`;
      })
      .join('');
    const best = f.standings[0]?.total;
    const winners = f.standings.filter((s) => s.total === best);
    const iWon = winners.some((w) => w.id === me);
    const title = !winners.length
      ? 'MATCH OVER'
      : winners.length > 1
        ? iWon
          ? 'YOU TIE FOR THE WIN'
          : `TIE: ${winners.map((w) => esc(w.name)).join(' & ')}`
        : iWon
          ? 'YOU WIN THE MATCH'
          : `${esc(winners[0].name)} WINS`;
    const rounds = f.rounds.map((r, i) => `<li>Round ${i + 1} · ${MAP_NAMES[r.map] ?? r.map} · Saboteur ${esc(r.saboteur)} · <b>${r.winner === 'none' ? 'called off' : r.winner === 'runners' ? 'Runners won' : 'Saboteur won'}</b></li>`).join('');
    this.root.className = iWon ? 'win final' : 'final';
    this.root.innerHTML = `
      <div class="result-card">
        <span class="kicker">MATCH OVER · ${f.rounds.length} ROUND${f.rounds.length === 1 ? '' : 'S'}</span>
        <h1>${title}</h1>
        <div class="podium">${podium}</div>
        ${table(f.standings, me)}
        <ol class="round-list">${rounds}</ol>
        <button type="button" class="result-back">BACK TO SAFEHOUSE</button>
      </div>`;
    this.countdown = null;
    this.root.hidden = false;
  }

  /** Call every frame: the countdown to the next round. */
  tick() {
    if (!this.countdown || this.root.hidden) return;
    const s = Math.max(0, Math.ceil((this.nextAt - performance.now()) / 1000));
    const text = this.last ? `Final results in ${s}...` : `Next round starts in ${s}... (new Saboteur, new map)`;
    if (this.countdown.textContent !== text) this.countdown.textContent = text;
  }

  hide() {
    this.root.hidden = true;
    this.countdown = null;
  }
}

/** Totals so far, with a column per round. */
function table(standings: Standing[], me: string) {
  const rounds = Math.max(0, ...standings.map((s) => s.perRound.length));
  const head = Array.from({ length: rounds }, (_, i) => `<th>R${i + 1}</th>`).join('');
  const rows = standings
    .map((s) => `<tr class="${s.id === me ? 'me' : ''}${s.here ? '' : ' gone'}"><td>${standings.findIndex((o) => o.total === s.total) + 1}</td><td class="who">${esc(s.name)}${s.here ? '' : ' (left)'}</td>${Array.from({ length: rounds }, (_, r) => `<td>${s.perRound[r] ?? '-'}</td>`).join('')}<td class="total">${s.total}</td></tr>`)
    .join('');
  return `<table class="scores"><thead><tr><th>#</th><th>PLAYER</th>${head}<th>TOTAL</th></tr></thead><tbody>${rows}</tbody></table>`;
}
