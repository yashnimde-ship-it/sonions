import type { ServerMsg, Standing } from '../net/protocol';
import { blip } from '../systems/Sound';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
type Result = Extract<ServerMsg, { t: 'result' }>;
type Final = Extract<ServerMsg, { t: 'final' }>;
const MAP_NAMES: Record<string, string> = { estate: 'The Estate', museum: 'Midnight Museum', 'cruise-b1': 'Luxury Cruise B1', 'cruise-f1': 'Luxury Cruise F1' };

/**
 * The end of a round: a big WIN or LOSE card over the revealed map, this round's points, the
 * running scoreboard and a countdown to the next round. And the end of the match: the podium.
 */
export class ResultScreen {
  private root = document.createElement('section');
  private countdown: HTMLElement | null = null;
  private nextAt = 0;
  private last = false;
  private hideSeek = false;
  /** Awards on the final screen (main.ts plays a chime for each as it pops in). */
  awardCount = 0;

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
    const h = r.hunt;
    const list = (names: string[]) => names.map(esc).join(', ');
    const reason = h
      ? r.winner === 'none'
        ? 'The Seeker left, so this round is called off.'
        : r.winner === 'saboteur'
          ? `The Seeker caught everyone: ${list(h.caught)}.`
          : [h.escaped.length ? `Escaped: ${list(h.escaped)}.` : '', h.survived.length ? `Stayed hidden: ${list(h.survived)}.` : '', h.caught.length ? `Caught: ${list(h.caught)}.` : ''].filter(Boolean).join(' ')
      : r.winner === 'none'
        ? 'The Saboteur left, so this round is called off.'
        : r.winner === 'runners'
          ? `The Runners banked ${r.banked} of ${r.total} diamonds (needed ${r.need}).`
          : `Time's up: only ${r.banked} of ${r.total} diamonds were banked (needed ${r.need}).`;
    const sides = h ? (['HIDERS WIN', 'SEEKER WINS'] as const) : (['RUNNERS WIN', 'SABOTEUR WINS'] as const);
    const points = r.points
      .map((p) => `<li class="${p.id === me ? 'me' : ''}"><span class="who">${esc(p.name)}${p.saboteur ? ` <em>${h ? 'SEEKER' : 'SABOTEUR'}</em>` : ''}</span><b data-to="${p.points}">+${p.points}</b></li>`)
      .join('');
    this.root.className = r.winner === 'none' ? 'off' : won ? 'win' : 'lose';
    this.root.innerHTML = `
      <div class="result-card">
        <span class="kicker">ROUND ${r.round} OF ${r.rounds} · ${h ? 'HIDE &amp; SEEK · ' : ''}${r.winner === 'none' ? 'CALLED OFF' : r.winner === 'runners' ? sides[0] : sides[1]}</span>
        <h1>${r.winner === 'none' ? 'NO CONTEST' : won ? 'YOU WIN' : 'YOU LOSE'}</h1>
        <p class="reason">${reason}</p>
        <div class="result-cols">
          <div><h2>THIS ROUND</h2><ol class="points">${points}</ol></div>
          <div><h2>SCOREBOARD</h2>${table(r.standings, me, r.round - 1)}</div>
        </div>
        ${h ? '' : '<p class="legend"><i class="gem banked"></i> banked <i class="gem floor"></i> dropped <i class="gem hidden"></i> never found</p>'}
        <p class="next"></p>
        <button type="button" class="result-back">LEAVE MATCH</button>
      </div>`;
    if (won) confetti(this.root);
    countUpScores(this.root);
    this.countdown = this.root.querySelector('.next');
    this.nextAt = performance.now() + r.nextMs;
    this.last = r.last;
    this.hideSeek = !!h;
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
    const hs = f.mode === 'hideSeek';
    // Awards pop in one by one after the podium.
    const portrait = (id: string) => f.standings.find((s) => s.id === id)?.character;
    const awards = (f.awards ?? [])
      .map((a, i) => `<div class="award ${a.key}${a.id === me ? ' me' : ''}" style="animation-delay:${0.8 + i * 0.35}s"><i class="award-icon"></i><span class="award-title">${esc(a.title)}</span>${portrait(a.id) ? `<img src="/assets/characters/${portrait(a.id)}-portrait.png" alt="">` : ''}<b>${esc(a.name)}</b><span class="award-detail">${esc(a.detail)}</span></div>`)
      .join('');
    this.awardCount = f.awards?.length ?? 0;
    const rounds = f.rounds.map((r, i) => `<li>Round ${i + 1} · ${MAP_NAMES[r.map] ?? r.map} · ${hs ? 'Seeker' : 'Saboteur'} ${esc(r.saboteur)} · <b>${r.winner === 'none' ? 'called off' : r.winner === 'runners' ? (hs ? 'Hiders won' : 'Runners won') : hs ? 'Seeker won' : 'Saboteur won'}</b></li>`).join('');
    this.root.className = iWon ? 'win final' : 'final';
    this.root.innerHTML = `
      <div class="result-card">
        <span class="kicker">MATCH OVER · ${f.rounds.length} ROUND${f.rounds.length === 1 ? '' : 'S'}</span>
        <h1>${title}</h1>
        <div class="podium">${podium}</div>
        ${awards ? `<div class="awards">${awards}</div>` : ''}
        ${table(f.standings, me)}
        <ol class="round-list">${rounds}</ol>
        <button type="button" class="result-back">BACK TO SAFEHOUSE</button>
      </div>`;
    if (iWon) confetti(this.root, 120);
    this.countdown = null;
    this.root.hidden = false;
  }

  /** Call every frame: the countdown to the next round. */
  tick() {
    if (!this.countdown || this.root.hidden) return;
    const s = Math.max(0, Math.ceil((this.nextAt - performance.now()) / 1000));
    const text = this.last ? `Final results in ${s}...` : `Next round starts in ${s}... ${this.hideSeek ? '(new Seeker)' : '(new Saboteur, new map)'}`;
    if (this.countdown.textContent !== text) this.countdown.textContent = text;
  }

  hide() {
    this.root.hidden = true;
    this.countdown = null;
  }
}

/** Totals so far, with a column per round. After a round (`round`: its index), each row also
 *  carries where it stood before that round, so the board can count up and re-sort itself. */
function table(standings: Standing[], me: string, round?: number) {
  const rounds = Math.max(0, ...standings.map((s) => s.perRound.length));
  const head = Array.from({ length: rounds }, (_, i) => `<th>R${i + 1}</th>`).join('');
  const prev = (s: Standing) => (round === undefined ? s.total : s.total - (s.perRound[round] ?? 0));
  const before = [...standings].sort((a, b) => prev(b) - prev(a)).map((s) => s.id);
  const rows = standings
    .map((s, i) => {
      const old = before.indexOf(s.id);
      const climb = round !== undefined && old > i ? `<span class="climb">${old - i}</span>` : '';
      return `<tr class="${s.id === me ? 'me' : ''}${s.here ? '' : ' gone'}" data-old="${old}" data-prev="${prev(s)}" data-total="${s.total}"><td>${standings.findIndex((o) => o.total === s.total) + 1}</td><td class="who">${esc(s.name)}${s.here ? '' : ' (left)'}${climb}</td>${Array.from({ length: rounds }, (_, r) => `<td>${s.perRound[r] ?? '-'}</td>`).join('')}<td class="total">${s.total}</td></tr>`;
    })
    .join('');
  return `<table class="scores"><thead><tr><th>#</th><th>PLAYER</th>${head}<th>TOTAL</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let lastBlip = 0;

/** Count `el` from `from` to `to` (formatted by `fmt`), starting `delay` ms from now. */
function countUp(el: HTMLElement, from: number, to: number, delay: number, fmt: (v: number) => string) {
  el.textContent = fmt(from);
  if (from === to) return;
  setTimeout(() => {
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 700);
      el.textContent = fmt(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
      // A ticking climb (shared, so several counters at once don't clatter).
      if (now - lastBlip > 65 && t < 1) {
        lastBlip = now;
        blip('count', Math.floor(t * 12));
      }
      if (t < 1) requestAnimationFrame(step);
      else el.classList.add('counted');
    };
    requestAnimationFrame(step);
  }, delay);
}

/** The round card's numbers: this round's points count up one by one, then the totals climb
 *  and the scoreboard rows slide into their new order. */
function countUpScores(root: HTMLElement) {
  if (reducedMotion.matches) return;
  const points = [...root.querySelectorAll<HTMLElement>('.points b[data-to]')];
  points.forEach((el, i) => countUp(el, 0, Number(el.dataset.to), 450 + i * 160, (v) => `+${v}`));
  const boardAt = 450 + points.length * 160 + 450;
  const rows = [...root.querySelectorAll<HTMLElement>('.scores tbody tr')];
  const rowH = rows[0]?.getBoundingClientRect().height ?? 0;
  rows.forEach((tr, i) => {
    const total = tr.querySelector<HTMLElement>('.total');
    if (total) countUp(total, Number(tr.dataset.prev), Number(tr.dataset.total), boardAt, String);
    const old = Number(tr.dataset.old);
    if (rowH && old !== i) tr.animate([{ transform: `translateY(${(old - i) * rowH}px)` }, { transform: 'none' }], { duration: 650, delay: boardAt + 750, easing: 'cubic-bezier(0.3, 1.35, 0.5, 1)', fill: 'backwards' });
  });
  root.style.setProperty('--board-at', `${boardAt + 1100}ms`);
}

/** A shower of pixel confetti over the result screen (it removes itself). */
function confetti(root: HTMLElement, count = 70) {
  const colors = ['#ffc94a', '#5ad8ff', '#6fe07a', '#ff4d6a', '#c77dff', '#ffffff'];
  const box = document.createElement('div');
  box.className = 'confetti';
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * 0.9}s`;
    bit.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
    bit.style.setProperty('--drift', `${(Math.random() - 0.5) * 160}px`);
    bit.style.setProperty('--spin', `${(Math.random() - 0.5) * 1080}deg`);
    box.append(bit);
  }
  root.append(box);
  setTimeout(() => box.remove(), 4000);
}
