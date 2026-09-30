/**
 * A spring from rest at 0 to rest at 1, used as the easing of a move of any
 * length. `t` is the part of the move done: 1 is where the spring settles.
 * `bounce` 0 settles with no overshoot; 0.3 overshoots by about a tenth.
 */
function spring(t: number, bounce = 0) {
  const z = 1 - bounce;
  const w = Math.sqrt(1 - z * z);
  // The spring's own time at which it is within 0.1% of its rest.
  const settle = w ? Math.log(1000 / w) / z : 9.23;
  const tau = Math.min(1, Math.max(0, t)) * settle;
  if (!w) return 1 - Math.exp(-tau) * (1 + tau);
  return 1 - Math.exp(-z * tau) * (Math.cos(w * tau) + (z / w) * Math.sin(w * tau));
}

/** A curve from 0 to 1 as a CSS easing, for a transition, a keyframe
    animation or WAAPI. */
const curveEasing = (curve: (t: number) => number, points = 40) =>
  `linear(${Array.from({ length: points + 1 }, (_, i) => (i === points ? 1 : +curve(i / points).toFixed(4))).join(", ")})`;

export const springEasing = (bounce = 0) => curveEasing((t) => spring(t, bounce));

/** A hand's reach: it speeds up and slows down smoothly, fastest halfway
    (minimum jerk). */
export const reach = (t: number) => t * t * t * (10 - 15 * t + 6 * t * t);

/** The two springs the landing page moves with, as the raw values behind the
    `ease-spring` and `ease-spring-bounce` tokens in `globals.css`. */
export const SPRING_CSS = `:root{--easing-spring:${springEasing(0)};--easing-spring-bounce:${springEasing(0.25)}}`;
