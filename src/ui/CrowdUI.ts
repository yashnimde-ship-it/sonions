// Crowd Chaos, for the people watching (?watch=CODE): on a phone, a remote to vote with (three
// big cards, a small live map, what the crowd did); on the big screen (?watch=CODE&screen=1),
// the projector view: the whole map with everyone on it, a QR to join, the votes filling up,
// the House Rules board and the event feed. It only shows state and reports votes.

import qrcode from 'qrcode-generator';
import type { CharacterId } from '../config';
import { CHARACTER_INFO } from '../data/characters';
import { CHAOS_CARDS, type ChaosId } from '../data/chaos';
import { decksOf, type MapId, MAPS } from '../data/maps';
import type { ServerMsg, WatchInfo, WatchPlayer } from '../net/protocol';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** An SVG QR code for `text` (scales to its box). */
export function qrSvg(text: string) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/** The link a room's crowd joins with. */
export const watchLink = (code: string) => `${location.origin}/?watch=${code}`;

/** A pop-up with the room's crowd QR (the host shows it from the safehouse). */
export function showCrowdQr(code: string) {
  document.getElementById('crowd-qr-modal')?.remove();
  const el = document.createElement('div');
  el.id = 'crowd-qr-modal';
  el.className = 'modal crowd-qr-modal';
  el.innerHTML = `<h2>Crowd Chaos</h2>
    <p>Everyone watching scans this to vote on what the house does next.</p>
    <div class="qr">${qrSvg(watchLink(code))}</div>
    <p class="link">${esc(watchLink(code).replace(/^https?:\/\//, ''))}</p>
    <div class="actions"><a class="btn small" href="${watchLink(code)}&screen=1" target="_blank" rel="noopener">OPEN BIG SCREEN</a><button type="button" class="btn small" data-close>CLOSE</button></div>`;
  el.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('[data-close]')) el.remove();
  });
  document.body.append(el);
}

type Vote = Extract<ServerMsg, { t: 'chaosVote' }>;
type Frame = Extract<ServerMsg, { t: 'watchFrame' }>;

export class CrowdUI {
  private root = document.createElement('div');
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private info: WatchInfo | null = null;
  private frame: Frame | null = null;
  private vote: (Vote & { at: number }) | null = null;
  private result: { card: ChaosId; votes: number; total: number; at: number } | null = null;
  private feed: string[] = [];
  private images = new Map<string, HTMLImageElement>();
  /** Where each player is drawn (eased toward the latest frame). */
  private drawn = new Map<string, { x: number; y: number }>();
  private lastVoteKey = '';
  private error = '';
  /** A vote was cast. */
  onVote: (card: ChaosId) => void = () => {};

  /** The projector: no voting, the QR on show, the big layout. */
  private screen: boolean;
  /** A map's size in world pixels. */
  private worldSize: (id: MapId) => { w: number; h: number };

  constructor(code: string, screen: boolean, worldSize: (id: MapId) => { w: number; h: number }) {
    this.screen = screen;
    this.worldSize = worldSize;
    this.root.id = 'crowd';
    this.root.className = screen ? 'screen' : 'remote';
    this.root.innerHTML = `
      <header class="crowd-head"><span class="crowd-brand">VAULT BREAKERS · <b>CROWD CHAOS</b></span><span class="crowd-room">ROOM <b>${esc(code)}</b></span><span class="crowd-count"></span></header>
      <div class="crowd-body">
        <section class="crowd-mapbox"><div class="crowd-score"></div></section>
        <aside class="crowd-side">
          ${screen ? `<div class="crowd-join"><div class="qr">${qrSvg(watchLink(code))}</div><div><b>SCAN TO JOIN THE CHAOS</b><span>${esc(watchLink(code).replace(/^https?:\/\//, ''))}</span></div></div>` : ''}
          <div class="crowd-vote"></div>
          <div class="crowd-rule"></div>
          <ol class="crowd-feed"></ol>
        </aside>
      </div>
      <div class="crowd-splash" hidden></div>`;
    this.root.querySelector('.crowd-mapbox')!.prepend(this.canvas);
    document.body.append(this.root);
    this.root.querySelector('.crowd-vote')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-card]');
      if (!b || this.screen || !this.vote?.options.length) return;
      this.onVote(b.dataset.card as ChaosId);
      // Show it at once; the server's tallies follow.
      this.vote = { ...this.vote, mine: b.dataset.card as ChaosId };
      this.lastVoteKey = '';
    });
    const loop = () => {
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  showError(text: string) {
    this.error = text;
    this.lastVoteKey = '';
  }

  setInfo(info: WatchInfo | null) {
    this.info = info;
    this.error = info ? '' : 'This room has closed. Thanks for watching!';
    this.root.querySelector('.crowd-count')!.textContent = info ? `👀 ${info.watchers} watching` : '';
    this.lastVoteKey = '';
  }

  setFrame(frame: Frame) {
    this.frame = frame;
  }

  setVote(vote: Vote) {
    // A closed vote with no winner announcement still clears the cards.
    this.vote = { ...vote, at: performance.now() };
    this.lastVoteKey = '';
  }

  setResult(card: ChaosId, votes: number, total: number) {
    this.result = { card, votes, total, at: performance.now() };
    const c = CHAOS_CARDS[card];
    this.feed.unshift(`${c.icon} The crowd chose <b style="color:${c.color}">${c.name.toUpperCase()}</b> · ${votes}/${total} votes`);
    this.feed.length = Math.min(this.feed.length, 6);
    this.root.querySelector('.crowd-feed')!.innerHTML = this.feed.map((f) => `<li>${f}</li>`).join('');
    const splash = this.root.querySelector<HTMLElement>('.crowd-splash')!;
    splash.innerHTML = `<span class="kicker">THE CROWD CHOSE</span><span class="big" style="color:${c.color}">${c.icon} ${c.name.toUpperCase()}</span><span class="small">${esc(c.blurb)}</span>`;
    splash.hidden = false;
    splash.classList.remove('pop');
    void splash.offsetWidth;
    splash.classList.add('pop');
    setTimeout(() => (splash.hidden = true), 2600);
  }

  private image(src: string) {
    let img = this.images.get(src);
    if (!img) {
      img = new Image();
      img.src = src;
      this.images.set(src, img);
    }
    return img;
  }

  /** The vote cards and the House Rules board (rebuilt only when something changes). */
  private renderPanels() {
    const now = performance.now();
    const v = this.vote;
    const left = v && v.options.length ? Math.max(0, Math.ceil((v.ms - (now - v.at)) / 1000)) : 0;
    const rule = this.result && now - this.result.at < CHAOS_CARDS[this.result.card].ms ? this.result : null;
    const ruleLeft = rule ? Math.ceil((CHAOS_CARDS[rule.card].ms - (now - rule.at)) / 1000) : 0;
    const key = JSON.stringify([v?.id, v?.options, v?.tallies, v?.mine, left, rule?.card, ruleLeft, this.error, this.frame?.phase, this.info?.status]);
    if (key === this.lastVoteKey) return;
    this.lastVoteKey = key;
    const voteEl = this.root.querySelector('.crowd-vote')!;
    if (this.error) voteEl.innerHTML = `<p class="crowd-wait">${esc(this.error)}</p>`;
    else if (v && v.options.length) {
      const total = v.tallies.reduce((a, b) => a + b, 0);
      voteEl.innerHTML = `<div class="vote-head"><b>THE CROWD DECIDES</b><span>${left}s · ${total}/${v.voters} voted</span></div>
        <div class="vote-cards">${v.options
          .map((id, i) => {
            const c = CHAOS_CARDS[id];
            const n = v.tallies[i] ?? 0;
            const pct = total ? Math.round((n / total) * 100) : 0;
            return `<button type="button" class="vote-card${v.mine === id ? ' mine' : ''}" data-card="${id}" style="--c:${c.color}"${this.screen ? ' disabled' : ''}>
              <span class="icon">${c.icon}</span><span class="name">${c.name}</span><span class="blurb">${esc(c.blurb)}</span>
              <span class="bar"><i style="width:${pct}%"></i></span><span class="tally">${n}</span></button>`;
          })
          .join('')}</div>`;
    } else {
      const playing = this.info?.status === 'playing' && this.frame?.phase === 'live';
      voteEl.innerHTML = `<p class="crowd-wait">${
        !this.info ? 'Connecting to the room...' : playing ? 'Next vote coming up. Get ready to cause chaos!' : this.frame?.phase === 'setup' ? 'The Saboteur is setting traps. Voting starts once the heist is on.' : 'Waiting for the heist to start...'
      }</p>${this.info ? `<p class="crowd-players">${this.info.players.map((p) => `<span style="color:${CHARACTER_INFO[p.character as CharacterId]?.color ?? '#fff'}">${esc(p.name)}</span>`).join(' · ')}</p>` : ''}`;
    }
    this.root.querySelector('.crowd-rule')!.innerHTML = rule
      ? `<span class="label">HOUSE RULE</span><b style="color:${CHAOS_CARDS[rule.card].color}">${CHAOS_CARDS[rule.card].rule}</b><span class="left">${ruleLeft}s</span>`
      : '<span class="label">HOUSE RULE</span><b class="calm">NOTHING STRANGE... YET</b>';
  }

  /** The live map: the map picture with everyone on it (each deck side by side on the ship). */
  private draw() {
    this.renderPanels();
    const box = this.canvas.parentElement!.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(box.width * dpr));
    const H = Math.max(1, Math.round(box.height * dpr));
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const g = this.ctx;
    g.clearRect(0, 0, W, H);
    const f = this.frame;
    const mapId = f?.map ?? this.info?.map;
    const score = this.root.querySelector<HTMLElement>('.crowd-score')!;
    if (!mapId) {
      score.textContent = '';
      return;
    }
    const decks = decksOf(mapId);
    const gap = 12 * dpr;
    const sizes = decks.map((d) => this.worldSize(d));
    // Fit the decks side by side.
    const scale = Math.min((W - gap * (decks.length - 1)) / sizes.reduce((n, s) => n + s.w, 0), H / Math.max(...sizes.map((s) => s.h)));
    let ox = (W - (sizes.reduce((n, s) => n + s.w, 0) * scale + gap * (decks.length - 1))) / 2;
    const now = performance.now();
    const active = this.result && now - this.result.at < CHAOS_CARDS[this.result.card].ms ? CHAOS_CARDS[this.result.card] : null;
    const origin = new Map<string, { x: number; y: number }>();
    decks.forEach((d, i) => {
      const s = sizes[i];
      const w = s.w * scale;
      const h = s.h * scale;
      const oy = (H - h) / 2;
      origin.set(d, { x: ox, y: oy });
      const img = this.image(MAPS[d].preview);
      if (img.complete && img.naturalWidth) g.drawImage(img, ox, oy, w, h);
      else {
        g.fillStyle = '#1a1424';
        g.fillRect(ox, oy, w, h);
      }
      // The crowd's card, over the map: blackout darkens it, the rest tint it.
      if (active) {
        g.fillStyle = active.id === 'blackout' ? 'rgba(4,2,10,0.72)' : `${active.color}33`;
        g.fillRect(ox, oy, w, h);
        g.strokeStyle = active.color;
        g.lineWidth = 4 * dpr;
        g.strokeRect(ox + 2 * dpr, oy + 2 * dpr, w - 4 * dpr, h - 4 * dpr);
      }
      if (decks.length > 1) {
        g.font = `${Math.round(10 * dpr)}px "Press Start 2P"`;
        g.fillStyle = '#ffe39a';
        g.fillText(MAPS[d].name.split('—').pop()!.trim(), ox + 8 * dpr, oy + 18 * dpr);
      }
      ox += w + gap;
    });
    const shake = active?.id === 'earthquake' ? Math.sin(now / 30) * 4 * dpr : 0;
    for (const p of f?.players ?? []) {
      const o = origin.get(p.deck ?? decks[0]) ?? origin.get(decks[0])!;
      const at = this.drawn.get(p.id) ?? { x: p.x, y: p.y };
      at.x += (p.x - at.x) * 0.25;
      at.y += (p.y - at.y) * 0.25;
      this.drawn.set(p.id, at);
      this.dot(p, o.x + at.x * scale + shake, o.y + at.y * scale, dpr);
    }
    const left = f && f.phase !== 'none' ? `${Math.floor(f.msLeft / 60000)}:${String(Math.floor((f.msLeft % 60000) / 1000)).padStart(2, '0')}` : '';
    score.textContent = f && f.phase !== 'none' ? `${f.phase === 'setup' ? 'SETUP' : f.phase === 'live' ? (f.mode === 'hideSeek' ? 'HUNT' : 'HEIST') : 'ROUND OVER'} ${left}${f.mode === 'heist' && f.need ? ` · 💎 ${f.banked}/${f.need}` : ''}` : MAPS[mapId].name;
  }

  private dot(p: WatchPlayer, x: number, y: number, dpr: number) {
    const g = this.ctx;
    const color = CHARACTER_INFO[p.character]?.color ?? '#ffffff';
    const r = (this.screen ? 8 : 6) * dpr;
    g.fillStyle = '#0e0a1a';
    g.beginPath();
    g.arc(x, y, r + 2 * dpr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.hp > 0 ? color : '#6b6178';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    if (p.carrying) {
      g.fillStyle = '#7ceaff';
      g.beginPath();
      g.moveTo(x, y - r - 9 * dpr);
      g.lineTo(x + 5 * dpr, y - r - 4 * dpr);
      g.lineTo(x, y - r + 1 * dpr);
      g.lineTo(x - 5 * dpr, y - r - 4 * dpr);
      g.fill();
    }
    g.font = `${Math.round((this.screen ? 9 : 7) * dpr)}px "Press Start 2P"`;
    g.textAlign = 'center';
    g.fillStyle = '#0e0a1a';
    g.fillText(p.name, x + dpr, y + r + 12 * dpr + dpr);
    g.fillStyle = '#fff4e6';
    g.fillText(p.name, x, y + r + 12 * dpr);
    g.textAlign = 'start';
  }
}
