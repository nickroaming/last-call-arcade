// Match rules: playlist, points, comeback drafts, stacking, ties, rematch.
// No DOM, no rendering. Tested in tests/game-tests.js.
import { POWERS, MAX_STACK, statsFor, RARITY, MAX_TIPSY } from './powers.js';
import { shuffle } from '../engine/util.js';

export const POINTS = [3, 2, 1];

/**
 * A playlist of `total` events: every game once (as far as `total` allows),
 * then repeats, at most `perGame` of each, never the same game twice in a row.
 */
export function makePlaylist(ids, perGame = 2, rng = Math.random, total = null) {
  total = total || ids.length * perGame;
  const ok = (p) => p.every((g, i) => i === 0 || g !== p[i - 1]);
  for (let tries = 0; tries < 400; tries++) {
    const first = shuffle(ids, rng).slice(0, Math.min(total, ids.length));
    const extraPool = shuffle(ids.flatMap((id) => Array(perGame - 1).fill(id)), rng);
    const p = shuffle([...first, ...extraPool.slice(0, total - first.length)], rng);
    if (p.length === total && ok(p)) return p;
  }
  const out = [];
  for (let i = 0; i < total; i++) out.push(ids[i % ids.length]);
  return out;
}

export class Match {
  constructor(seats, gameIds, { perGame = 2, rng = Math.random, total = null } = {}) {
    this.seats = seats.slice();
    this.gameIds = gameIds;
    this.perGame = perGame;
    this.total = total;
    this.rng = rng;
    this.reset();
  }
  reset() {
    this.players = this.seats.map((seat) => ({ seat, points: 0, wins: 0, powers: {}, places: [], tipsy: 0 }));
    this.playlist = makePlaylist(this.gameIds, this.perGame, this.rng, this.total);
    this.eventIdx = 0;
    this.suddenDeath = null;
  }
  player(seat) { return this.players.find((p) => p.seat === seat); }
  stats(seat) { const p = this.player(seat); return statsFor(p.powers, { tipsy: p.tipsy }); }
  get current() { return this.suddenDeath ? 'rumble' : this.playlist[this.eventIdx]; }
  get next() { return this.playlist[this.eventIdx + 1] || null; }
  get isLast() { return this.eventIdx >= this.playlist.length - 1; }
  get eventCount() { return this.playlist.length; }

  /** ranking: seats best → worst. Returns the awards. */
  award(ranking) {
    const out = ranking.map((seat, i) => {
      const p = this.player(seat);
      const pts = POINTS[i] || 0;
      p.points += pts;
      p.places.push(i + 1);
      if (i === 0) p.wins += 1;
      // Winner's Curse: winners get tipsier, everyone else sobers up a level.
      p.tipsy = i === 0 ? Math.min(MAX_TIPSY, p.tipsy + 1) : Math.max(0, p.tipsy - 1);
      return { seat, place: i + 1, pts, tipsy: p.tipsy };
    });
    this.lastRanking = ranking.slice();
    return out;
  }

  /** Who drafts after this event: everyone but the winner, last place first. */
  draftOrder(ranking) {
    if (this.isLast || this.suddenDeath) return [];
    return ranking.slice(1).reverse();
  }

  /** Three different powers this seat can still take. */
  offer(seat, n = 3) {
    const p = this.player(seat);
    let avail = POWERS.filter((pw) => (p.powers[pw.id] || 0) < MAX_STACK);
    const out = [];
    while (out.length < n && avail.length) {
      const total = avail.reduce((a, pw) => a + RARITY[pw.rarity].weight, 0);
      let r = this.rng() * total;
      const pick = avail.find((pw) => (r -= RARITY[pw.rarity].weight) <= 0) || avail[avail.length - 1];
      out.push(pick.id);
      avail = avail.filter((pw) => pw !== pick);
    }
    return out;
  }
  pick(seat, id) {
    const p = this.player(seat);
    if ((p.powers[id] || 0) >= MAX_STACK) return false;
    p.powers[id] = (p.powers[id] || 0) + 1;
    return true;
  }
  advance() { this.eventIdx += 1; }
  /** 0 = leading … n-1 = last, by points then wins. */
  rankIndex(seat) { return this.standings().findIndex((p) => p.seat === seat); }

  /** Sorted by points, then event wins. */
  standings() {
    return this.players.slice().sort((a, b) => b.points - a.points || b.wins - a.wins);
  }
  /** Seats still tied for first after the tiebreak (points, then wins). */
  tiedLeaders() {
    const s = this.standings();
    const top = s[0];
    return s.filter((p) => p.points === top.points && p.wins === top.wins).map((p) => p.seat);
  }
  startSuddenDeath(seats) { this.suddenDeath = seats.slice(); }
  /** Final order. If sudden death ran, its winner goes first. */
  finalOrder(sdWinner = null) {
    const s = this.standings().map((p) => p.seat);
    if (sdWinner == null) return s;
    return [sdWinner, ...s.filter((x) => x !== sdWinner)];
  }
}

export { statsFor };
