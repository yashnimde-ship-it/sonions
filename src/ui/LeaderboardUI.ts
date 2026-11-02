// The leaderboard: the top players in the region by REP (src/data/ranks.ts), with each one's
// rank badge, and my own row pinned at the bottom wherever I am. The top few are MOST WANTED.
// The badge artwork lives in public/assets/ranks. Keeping this renderer shared makes the
// profile, results, and leaderboard always show the same insignia.

import { MOST_WANTED, RANKS, rankOf, type BoardRow } from '../data/ranks';
import type { ServerMsg } from '../net/protocol';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** A rank badge: the rank's colour, its initial, and the division. MOST WANTED gets a star. */
export function rankBadge(rep: number, mostWanted = false) {
  const r = rankOf(rep);
  const file = r.id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
  const src = mostWanted ? '/assets/ranks/most-wanted.png' : `/assets/ranks/${file}-${r.division}.png`;
  const label = mostWanted ? 'MOST WANTED' : r.label;
  return `<span class="rank-badge${mostWanted ? ' wanted' : ''}" style="--rank:${r.color}" title="${label}"><span class="rank-badge-art"><img src="${src}" alt="" aria-hidden="true"></span><span class="rank-badge-label">${label}</span></span>`;
}

export class LeaderboardUI {
  private root: HTMLElement;
  private body: HTMLElement;
  private view: 'board' | 'ranks' = 'board';
  private data: Extract<ServerMsg, { t: 'leaderboard' }> | null = null;
  onOpen: () => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'leaderboard';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="lb-card">
        <header><span class="lb-title">🏆 LEADERBOARD</span><span class="lb-region"></span><button type="button" class="lb-close" data-close aria-label="Close">✕</button></header>
        <nav class="lb-tabs" aria-label="Rank information"><button type="button" data-lb-view="board">LEADERBOARD</button><button type="button" data-lb-view="ranks">RANK GUIDE</button></nav>
        <div class="lb-body"><p class="lb-empty">Loading…</p></div>
      </div>`;
    document.body.append(this.root);
    this.body = this.root.querySelector('.lb-body')!;
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-close]') || e.target === this.root) this.close();
      const tab = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-lb-view]');
      if (tab) {
        this.view = tab.dataset.lbView as 'board' | 'ranks';
        this.render();
        tab.blur();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (!this.root.hidden && e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    }, true);
  }

  get open() {
    return !this.root.hidden;
  }

  show() {
    this.root.hidden = false;
    this.view = 'board';
    this.render();
    this.onOpen();
  }

  close() {
    this.root.hidden = true;
  }

  set(msg: Extract<ServerMsg, { t: 'leaderboard' }>) {
    this.data = msg;
    this.render();
  }

  private render() {
    const msg = this.data;
    const region = this.root.querySelector('.lb-region')!;
    this.root.querySelectorAll<HTMLButtonElement>('[data-lb-view]').forEach((button) => button.classList.toggle('on', button.dataset.lbView === this.view));
    if (this.view === 'ranks') {
      region.textContent = 'RANK SYSTEM';
      this.body.innerHTML = this.rankGuide();
      return;
    }
    if (!msg) {
      region.textContent = '';
      this.body.innerHTML = '<p class="lb-empty">Loading…</p>';
      return;
    }
    region.textContent = `${msg.region.toUpperCase()} · TOP ${msg.rows.length || 100}`;
    const row = (r: BoardRow, pinned = false) => {
      const wanted = r.place <= msg.mostWanted;
      return `<li class="${r.you ? 'you' : ''}${wanted ? ' wanted' : ''}${pinned ? ' pinned' : ''}"><span class="lb-place">${r.place}</span><span class="lb-name">${esc(r.name)}${r.you ? ' <small>(you)</small>' : ''}</span>${rankBadge(r.rep, wanted)}<span class="lb-rep">${r.rep} <small>REP</small></span><span class="lb-wins">${r.wins} <small>W</small> · ${r.matches} <small>M</small></span></li>`;
    };
    const mine = msg.me && !msg.rows.some((r) => r.you) ? `<ol class="lb-me">${row(msg.me, true)}</ol>` : '';
    this.body.innerHTML = msg.rows.length
      ? `<p class="lb-note">★ The top ${msg.mostWanted} are MOST WANTED · finish matches of 3+ players to rank up</p><ol class="lb-list">${msg.rows.map((r) => row(r)).join('')}</ol>${mine}`
      : `<p class="lb-empty">Nobody has ranked yet. Finish a match of 3 or more players to be first!</p>`;
  }

  private rankGuide() {
    const ranks = RANKS.map((rank, index) => {
      const divisions = [1, 2, 3].map((division) => rankBadge((index * 3 + division - 1) * 100)).join('');
      return `<article class="rank-guide-row"><h3 style="--rank:${rank.color}">${rank.name}</h3><div>${divisions}</div></article>`;
    }).join('');
    return `<section class="rank-guide"><p>Earn REP by finishing ranked matches with 3 or more players. Every division takes 100 REP.</p><div class="rank-guide-list">${ranks}</div><article class="rank-guide-wanted">${rankBadge(0, true)}<p>The top ${this.data?.mostWanted ?? MOST_WANTED} players on the leaderboard are <b>MOST WANTED</b>.</p></article></section>`;
  }
}
