// Match rules: playlist, points, comeback drafts, stacking, ties, rematch.
// No DOM, no rendering. Tested in tests/game-tests.js.
import { POWERS, MAX_STACK, statsFor } from './powers.js';
import { shuffle } from '../engine/util.js';

export const POINTS = [3, 2, 1];

/** Each game `perGame` times, shuffled, never the same game twice in a row. */
export function makePlaylist(ids, perGame = 2, rng = Math.random) {
  const pool = ids.flatMap((id) => Array(perGame).fill(id));
  for (let tries = 0; tries < 200; tries++) {
    const p = shuffle(pool, rng);
    if (p.every((g, i) => i === 0 || g !== p[i - 1])) return p;
  }
  // Greedy fallback: always take the most common game that isn't the last one.
  const left = {}; pool.forEach((g) => { left[g] = (left[g] || 0) + 1; });
  const out = [];
  while (out.length < pool.length) {
    const opts = Object.keys(left).filter((g) => left[g] > 0 && g !== out[out.length - 1])
      .sort((a, b) => left[b] - left[a]);
    const g = opts[0] || Object.keys(left).find((k) => left[k] > 0);
    out.push(g); left[g]--;
  }
  return out;
}

export class Match {
  constructor(seats, gameIds, { perGame = 2, rng = Math.random } = {}) {
    this.seats = seats.slice();
    this.gameIds = gameIds;
    this.perGame = perGame;
    this.rng = rng;
    this.reset();
  }
  reset() {
    this.players = this.seats.map((seat) => ({ seat, points: 0, wins: 0, powers: {}, places: [] }));
    this.playlist = makePlaylist(this.gameIds, this.perGame, this.rng);
    this.eventIdx = 0;
    this.suddenDeath = null;
  }
  player(seat) { return this.players.find((p) => p.seat === seat); }
  stats(seat) { return statsFor(this.player(seat).powers); }
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
      return { seat, place: i + 1, pts };
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
    const avail = POWERS.filter((pw) => (p.powers[pw.id] || 0) < MAX_STACK);
    return shuffle(avail, this.rng).slice(0, n).map((pw) => pw.id);
  }
  pick(seat, id) {
    const p = this.player(seat);
    if ((p.powers[id] || 0) >= MAX_STACK) return false;
    p.powers[id] = (p.powers[id] || 0) + 1;
    return true;
  }
  advance() { this.eventIdx += 1; }

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
