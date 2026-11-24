// Match rules: playlist, points, comeback drafts, stacking, ties, rematch.
// No DOM, no rendering. Tested in tests/game-tests.js.
import { POWERS, MAX_STACK, statsFor, RARITY, MAX_TIPSY } from './powers.js';
import { shuffle } from '../engine/util.js';

export const POINTS = [3, 2, 1];

/** MASH-UP: two random cards (never another MASH-UP), added to `powers`. Returns their ids. */
export function mashup(powers, rng = Math.random) {
  const got = [];
  for (let k = 0; k < 2; k++) {
    const pool = POWERS.filter((pw) => pw.id !== 'mashup' && (powers[pw.id] || 0) < MAX_STACK);
    if (!pool.length) break;
    const pick = pool[Math.floor(rng() * pool.length) % pool.length];
    powers[pick.id] = (powers[pick.id] || 0) + 1;
    got.push(pick.id);
  }
  return got;
}

/**
 * A playlist of `total` events: every game once (as far as `total` allows),
 * then repeats, at most `perGame` of each, never the same game twice in a row.
 */
export function makePlaylist(ids, perGame = 2, rng = Math.random, total = null, tierOf = null, roleOf = null) {
  total = total || ids.length * perGame;
  if (tierOf && total <= ids.length) return actPlaylist(ids, rng, total, tierOf, roleOf);
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

/**
 * The night in three acts: ~40% grounded games (tier 1), ~25% strange (tier 2),
 * the rest mind-bending (tier 3). Which games appear is random; the order of
 * the acts is not. Falls back to other tiers when one runs short.
 */
export function actPlaylist(ids, rng, total, tierOf, roleOf = null) {
  // an act's opener or finale always makes the cut; the rest of the act is a random draw
  const role = (id) => (roleOf ? roleOf(id) : null);
  const pools = [1, 2, 3].map((k) => { const p = shuffle(ids.filter((id) => (tierOf(id) || 1) === k), rng); return [...p.filter(role), ...p.filter((id) => !role(id))]; });
  const want = [Math.round(total * 0.4), Math.round(total * 0.25)];
  want.push(total - want[0] - want[1]);
  const out = [];
  for (let k = 0; k < 3; k++) for (let i = 0; i < want[k] && pools[k].length; i++) out.push({ id: pools[k].shift(), k });
  const rest = shuffle(pools.flat(), rng); // short tier: borrow from the others
  while (out.length < total && rest.length) { const id = rest.shift(); out.push({ id, k: tierOf(id) || 1 }); }
  // acts in order; inside an act, an event marked opener goes first and a finale goes last
  const w = (o) => o.k * 10 + (roleOf && roleOf(o.id) === 'opener' ? 0 : roleOf && roleOf(o.id) === 'finale' ? 9 : 5);
  out.sort((a, b) => w(a) - w(b));
  return out.map((o) => o.id);
}

export class Match {
  constructor(seats, gameIds, { perGame = 2, rng = Math.random, total = null, tierOf = null, roleOf = null } = {}) {
    this.tierOf = tierOf;
    this.roleOf = roleOf;
    this.seats = seats.slice();
    this.gameIds = gameIds;
    this.perGame = perGame;
    this.total = total;
    this.rng = rng;
    this.reset();
  }
  reset() {
    this.players = this.seats.map((seat) => ({ seat, points: 0, wins: 0, powers: {}, places: [], tipsy: 0 }));
    this.playlist = makePlaylist(this.gameIds, this.perGame, this.rng, this.total, this.tierOf, this.roleOf);
    this.winners = [];
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
      p.tipsy = this.noTipsy ? 0 : i === 0 ? Math.min(MAX_TIPSY, p.tipsy + 1) : Math.max(0, p.tipsy - 1);
      return { seat, place: i + 1, pts, tipsy: p.tipsy };
    });
    this.lastRanking = ranking.slice();
    this.winners[this.eventIdx] = ranking[0];
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
    p.gained = [id];
    if (id === 'mashup') { p.gained = mashup(p.powers, this.rng); return true; }
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
