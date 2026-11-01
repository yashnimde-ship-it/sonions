// Inside Job's meeting: everything stops, the crew sees who's still in, says what they saw
// (quick lines about a player, or a short typed line), and votes someone out (or skips).
// Then the result: who went, and whether they were the Insider.

import { CHARACTER_INFO } from '../data/characters';
import { MEETING_LINES } from '../data/insideJob';
import type { ServerMsg } from '../net/protocol';
import type { CharacterId } from '../config';

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

type MeetingMsg = Extract<ServerMsg, { t: 'meeting' }>;
type ResultMsg = Extract<ServerMsg, { t: 'meetResult' }>;

export class MeetingUI {
  private root: HTMLElement;
  private head: HTMLElement;
  private list: HTMLElement;
  private chat: HTMLElement;
  private lines: HTMLElement;
  private input: HTMLInputElement;
  private voteBtn: HTMLButtonElement;
  private skipBtn: HTMLButtonElement;
  private reveal: HTMLElement;
  private meeting: MeetingMsg | null = null;
  private endsAt = 0;
  private voted = new Set<string>();
  private picked: string | null = null;
  private myVote: string | null | undefined = undefined;
  private myId = '';
  /** Out for the round: I can watch and read, not talk or vote. */
  private ghost = false;
  onVote: (target: string | null) => void = () => {};
  onSay: (msg: { line?: number; about?: string; text?: string }) => void = () => {};

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'meeting';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="meet-card">
        <header class="meet-head"></header>
        <div class="meet-body">
          <div class="meet-list"></div>
          <div class="meet-side">
            <div class="meet-chat" aria-live="polite"></div>
            <div class="meet-lines"></div>
            <form class="meet-say"><input maxlength="80" placeholder="Say something (Enter)..." autocomplete="off"><button type="submit">SAY</button></form>
            <div class="meet-vote"><button type="button" class="vote-out" disabled>PICK SOMEONE</button><button type="button" class="vote-skip">SKIP VOTE</button></div>
          </div>
        </div>
        <div class="meet-reveal" hidden></div>
      </div>`;
    document.body.append(this.root);
    const q = <T extends HTMLElement>(sel: string) => this.root.querySelector<T>(sel)!;
    this.head = q('.meet-head');
    this.list = q('.meet-list');
    this.chat = q('.meet-chat');
    this.lines = q('.meet-lines');
    this.input = q<HTMLInputElement>('.meet-say input');
    this.voteBtn = q<HTMLButtonElement>('.vote-out');
    this.skipBtn = q<HTMLButtonElement>('.vote-skip');
    this.reveal = q('.meet-reveal');
    this.lines.innerHTML = MEETING_LINES.map((l, i) => `<button type="button" data-line="${i}">${esc(l.replace('@', '…'))}</button>`).join('');
    this.list.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>('[data-id]');
      if (!card || this.myVote !== undefined) return;
      this.picked = card.dataset.id === this.picked ? null : card.dataset.id!;
      this.render();
    });
    this.lines.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-line]');
      if (!b || this.ghost) return;
      const line = Number(b.dataset.line);
      if (MEETING_LINES[line].includes('@') && !this.picked) return this.flash('Pick a player first, then the line');
      this.onSay({ line, about: this.picked ?? undefined });
    });
    q('.meet-say').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.input.value.trim();
      if (!text || this.ghost) return;
      this.onSay({ text });
      this.input.value = '';
    });
    // Keys typed here are for the chat, not the game.
    this.input.addEventListener('keydown', (e) => e.stopPropagation());
    this.voteBtn.addEventListener('click', () => {
      if (!this.picked || this.myVote !== undefined || this.ghost) return;
      this.myVote = this.picked;
      this.onVote(this.picked);
      this.render();
    });
    this.skipBtn.addEventListener('click', () => {
      if (this.myVote !== undefined || this.ghost) return;
      this.myVote = null;
      this.onVote(null);
      this.render();
    });
  }

  get open() {
    return !this.root.hidden;
  }

  start(msg: MeetingMsg, myId: string, ghost: boolean) {
    const fresh = this.meeting?.by !== msg.by || this.root.hidden;
    this.meeting = msg;
    this.myId = myId;
    this.ghost = ghost;
    this.endsAt = performance.now() + msg.ms;
    this.voted = new Set(msg.voted);
    if (fresh) {
      this.picked = null;
      this.myVote = this.voted.has(myId) ? null : undefined;
      this.chat.innerHTML = `<p class="sys">${esc(msg.byName)} called a meeting. Talk it out, then vote.</p>`;
    }
    this.reveal.hidden = true;
    this.root.classList.toggle('ghost', ghost);
    this.root.hidden = false;
    this.render();
    if (!ghost && !matchMedia('(pointer: coarse)').matches) setTimeout(() => this.input.focus(), 50);
  }

  markVoted(id: string) {
    this.voted.add(id);
    this.render();
  }

  say(id: string, name: string, text: string) {
    const who = this.meeting?.alive.find((p) => p.id === id);
    const color = who ? CHARACTER_INFO[who.character as CharacterId]?.color ?? '#fff' : '#fff';
    const p = document.createElement('p');
    p.innerHTML = `<b style="color:${color}">${esc(name)}${id === this.myId ? ' (you)' : ''}</b> ${esc(text)}`;
    this.chat.append(p);
    while (this.chat.children.length > 60) this.chat.firstElementChild?.remove();
    this.chat.scrollTop = this.chat.scrollHeight;
  }

  result(msg: ResultMsg) {
    const name = (id: string | null) => (id === null ? 'skip' : this.meeting?.alive.find((p) => p.id === id)?.name ?? '?');
    const tally = new Map<string | null, string[]>();
    for (const [voter, target] of msg.votes) tally.set(target, [...(tally.get(target) ?? []), name(voter)]);
    const rows = [...tally].sort((a, b) => b[1].length - a[1].length).map(([t, vs]) => `<li><b>${esc(name(t)).toUpperCase()}</b> ${vs.length} · <span>${vs.map(esc).join(', ')}</span></li>`).join('');
    const headline = msg.ejected
      ? `<h2>${esc(msg.name)} ${msg.ejected === this.myId ? '(you) ' : ''}was voted out.</h2><p class="${msg.insider ? 'caught' : 'innocent'}">${msg.insider ? `${esc(msg.name)} WAS THE INSIDER!` : `${esc(msg.name)} was not the Insider.`}</p>`
      : `<h2>Nobody was voted out.</h2><p class="innocent">${msg.votes.length ? 'Not enough votes against anyone.' : 'Nobody voted.'}</p>`;
    this.reveal.innerHTML = `${headline}<ul>${rows || '<li>No votes</li>'}</ul>`;
    this.reveal.hidden = false;
    this.meeting = this.meeting && { ...this.meeting, ms: 0 };
    this.endsAt = performance.now();
    this.render();
  }

  close() {
    this.root.hidden = true;
    this.meeting = null;
    this.input.blur();
  }

  /** Each frame while open: the countdown. */
  tick() {
    if (this.root.hidden || !this.meeting) return;
    const left = Math.max(0, Math.ceil((this.endsAt - performance.now()) / 1000));
    const t = this.head.querySelector('.meet-time');
    if (t && t.textContent !== `${left}s`) t.textContent = `${left}s`;
  }

  private flash(text: string) {
    const p = document.createElement('p');
    p.className = 'sys';
    p.textContent = text;
    this.chat.append(p);
    this.chat.scrollTop = this.chat.scrollHeight;
  }

  private render() {
    const m = this.meeting;
    if (!m) return;
    this.head.innerHTML = `<span class="meet-title">📢 EMERGENCY MEETING</span><span class="meet-by">called by ${esc(m.byName)}</span><span class="meet-time"></span><span class="meet-count">${this.voted.size}/${m.alive.length} voted</span>`;
    this.list.innerHTML = m.alive
      .map((p) => {
        const info = CHARACTER_INFO[p.character as CharacterId];
        const cls = ['meet-player', p.id === this.picked ? 'picked' : '', p.id === this.myId ? 'me' : '', this.myVote === p.id ? 'my-vote' : ''].filter(Boolean).join(' ');
        return `<button type="button" class="${cls}" data-id="${p.id}"${this.myVote !== undefined ? ' disabled' : ''}><img src="/assets/characters/${p.character}-portrait.png" alt=""><span class="pname" style="color:${info?.color ?? '#fff'}">${esc(p.name)}${p.id === this.myId ? ' <small>(you)</small>' : ''}</span>${this.voted.has(p.id) ? '<span class="voted">VOTED</span>' : ''}</button>`;
      })
      .join('');
    const pickedName = m.alive.find((p) => p.id === this.picked)?.name;
    this.voteBtn.disabled = this.ghost || this.myVote !== undefined || !this.picked;
    this.skipBtn.disabled = this.ghost || this.myVote !== undefined;
    this.voteBtn.textContent = this.ghost ? "YOU'RE OUT" : this.myVote !== undefined ? (this.myVote === null ? 'YOU SKIPPED' : `YOU VOTED ${m.alive.find((p) => p.id === this.myVote)?.name.toUpperCase() ?? ''}`) : pickedName ? `VOTE OUT ${pickedName.toUpperCase()}` : 'PICK SOMEONE';
    this.input.disabled = this.ghost;
    this.tick();
  }
}
