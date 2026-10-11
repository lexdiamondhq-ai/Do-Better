import { Skia } from '@shopify/react-native-skia';

/**
 * The surface of a printed card. Matte is paper: a faint grain, and a touch of light that follows
 * the tilt. Foil lays moving bands of colour and a line of glare over the same paper.
 * `tilt` runs from -1 to 1 on each axis; `foil` is 0 for matte and 1 for foil.
 */
export const SURFACE = Skia.RuntimeEffect.Make(`
uniform vec2 size;
uniform vec2 tilt;
uniform vec3 base;
uniform float foil;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

vec3 overlay(vec3 b, vec3 s) {
  vec3 lo = 2.0 * b * s;
  vec3 hi = 1.0 - 2.0 * (1.0 - b) * (1.0 - s);
  return mix(lo, hi, step(0.5, b));
}

vec4 main(vec2 xy) {
  vec2 uv = xy / size;
  vec2 c = uv - 0.5;

  vec3 paper = base + (hash(floor(xy * 2.0)) - 0.5) * 0.035;
  paper *= 1.0 - 0.07 * (c.x * tilt.x + c.y * tilt.y);

  float t = uv.x * 0.9 + uv.y * 0.55 + tilt.x * 0.9 + tilt.y * 0.6;
  vec3 rainbow = 0.5 + 0.5 * cos(6.28318 * (t * 1.3 + vec3(0.0, 0.33, 0.67)));
  float lines = 0.5 + 0.5 * sin((xy.x - xy.y * 0.6) * 1.1);
  vec3 shine = mix(paper, overlay(paper, rainbow), 0.5 + 0.12 * lines) + rainbow * 0.08;
  float g = c.x * 0.8 + c.y * 0.6 + 0.3 - (tilt.x * 0.55 + tilt.y * 0.45);
  float glare = exp(-g * g * 14.0) * 0.26 + exp(-g * g * 160.0) * 0.2;
  shine += (1.0 - shine) * glare;

  return vec4(mix(paper, shine, foil), 1.0);
}
`);

/** A `#RRGGBB` colour as three numbers from 0 to 1, the form the surface shader takes. */
export function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
