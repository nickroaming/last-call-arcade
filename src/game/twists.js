// Physics twists: 8Bit Fiesta-style rule changes, one per event at most.
export const TWISTS = {
  moon: { name: 'MOON GRAVITY', desc: 'Everyone floats. Bullets drift in long lazy arcs.', grav: 0.45, bulletGrav: 0.35 },
  heavy: { name: 'HEAVY METAL', desc: 'Gravity x1.7. Short jumps, bullets drop hard.', grav: 1.7, bulletGrav: 2 },
  wind: { name: 'CROSSWIND', desc: 'Gusts push players and bullets sideways, then swap direction.', wind: 110 },
  tilt: { name: 'TILT-A-WHIRL', desc: 'Gravity slowly swings left and right.', tilt: 0.55 },
  rubber: { name: 'RUBBER WORLD', desc: 'Every bullet gets +3 bounces.', bounces: 3 },
  bullettime: { name: 'BULLET TIME', desc: 'Bullets crawl at half speed. Plan your shots.', bulletSpeed: 0.5 },
  giant: { name: 'BIG HEAD MODE', desc: 'Everyone is 40% bigger.', size: 1.4 },
  warp: { name: 'WARP EDGES', desc: 'Bullets leaving one side of the screen come out the other.', wrap: true },
  hyper: { name: 'HYPER SPEED', desc: 'Everything runs 25% faster.', timeScale: 1.25 },
  ice: { name: 'ICE RINK', desc: 'Slippery floors. Almost no grip.', ice: true },
};

/** Live values that change over time. */
export function twistEnv(tw, t) {
  if (!tw) return { gx: 0, gy: 1, wind: 0, grav: 1, bulletGrav: 1 };
  const a = tw.tilt ? Math.sin(t * 0.7) * tw.tilt : 0;
  const wind = tw.wind ? tw.wind * Math.sign(Math.sin(t * 0.45 + 0.3)) * Math.min(1, Math.abs(Math.sin(t * 0.45 + 0.3)) * 3) : 0;
  return { gx: Math.sin(a), gy: Math.cos(a), wind, grav: tw.grav || 1, bulletGrav: tw.bulletGrav || 1, tiltA: a };
}
