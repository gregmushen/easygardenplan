import type { BedGeometry, Coordinate, GeographicTransform, MetricPoint } from "@easygardenplan/contracts";

const earthRadiusMeters = 6_371_008.8;
const epsilon = 1e-8;

function longitudeDelta(value: number): number {
  let result = value;
  while (result > 180) result -= 360;
  while (result < -180) result += 360;
  return result;
}

export function projectToLocal(coordinate: Coordinate, anchor: Coordinate): MetricPoint {
  const radians = Math.PI / 180;
  return { x: earthRadiusMeters * longitudeDelta(coordinate.longitude - anchor.longitude) * radians * Math.cos(anchor.latitude * radians), y: earthRadiusMeters * (coordinate.latitude - anchor.latitude) * radians };
}

export function localToGeographic(point: MetricPoint, anchor: Coordinate): Coordinate {
  const degrees = 180 / Math.PI;
  const latitude = anchor.latitude + point.y / earthRadiusMeters * degrees;
  let longitude = anchor.longitude + point.x / (earthRadiusMeters * Math.cos(anchor.latitude * Math.PI / 180)) * degrees;
  while (longitude > 180) longitude -= 360;
  while (longitude < -180) longitude += 360;
  return { latitude, longitude };
}

export function signedArea(ring: readonly MetricPoint[]): number {
  return ring.reduce((sum, point, index) => { const next = ring[(index + 1) % ring.length]!; return sum + point.x * next.y - next.x * point.y; }, 0) / 2;
}

function orientation(a: MetricPoint, b: MetricPoint, c: MetricPoint): number { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
function onSegment(a: MetricPoint, b: MetricPoint, p: MetricPoint): boolean { return Math.abs(orientation(a, b, p)) < epsilon && p.x >= Math.min(a.x, b.x) - epsilon && p.x <= Math.max(a.x, b.x) + epsilon && p.y >= Math.min(a.y, b.y) - epsilon && p.y <= Math.max(a.y, b.y) + epsilon; }
function intersects(a: MetricPoint, b: MetricPoint, c: MetricPoint, d: MetricPoint): boolean {
  const abC = orientation(a, b, c), abD = orientation(a, b, d), cdA = orientation(c, d, a), cdB = orientation(c, d, b);
  if (((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))) return true;
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

export function pointInRing(point: MetricPoint, ring: readonly MetricPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const a = ring[index]!, b = ring[previous]!;
    if (onSegment(a, b, point)) return true;
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function validateBedGeometry(geometry: BedGeometry): string[] {
  const errors: string[] = [];
  const rings = [geometry.outer, ...geometry.exclusions];
  rings.forEach((ring, ringIndex) => {
    if (Math.abs(signedArea(ring)) < 0.01) errors.push(`${ringIndex ? "Exclusion" : "Outer ring"} has negligible area`);
    for (let first = 0; first < ring.length; first += 1) for (let second = first + 1; second < ring.length; second += 1) {
      if (second === first + 1 || (first === 0 && second === ring.length - 1)) continue;
      if (intersects(ring[first]!, ring[(first + 1) % ring.length]!, ring[second]!, ring[(second + 1) % ring.length]!)) errors.push(`${ringIndex ? "Exclusion" : "Outer ring"} self-intersects`);
    }
  });
  geometry.exclusions.forEach((exclusion, index) => {
    if (!exclusion.every((point) => pointInRing(point, geometry.outer))) errors.push(`Exclusion ${index + 1} is not contained in the outer ring`);
    geometry.exclusions.slice(index + 1).forEach((other, offset) => { if (exclusion.some((point) => pointInRing(point, other)) || other.some((point) => pointInRing(point, exclusion))) errors.push(`Exclusions ${index + 1} and ${index + offset + 2} overlap`); });
  });
  return [...new Set(errors)];
}

export function applyTransform(point: MetricPoint, transform: GeographicTransform): MetricPoint {
  const cosine = Math.cos(transform.rotationRadians), sine = Math.sin(transform.rotationRadians);
  return { x: (point.x * cosine - point.y * sine) * transform.scale + transform.translationMeters.x, y: (point.x * sine + point.y * cosine) * transform.scale + transform.translationMeters.y };
}

export function calibrationScale(a: MetricPoint, b: MetricPoint, measuredMeters: number): number {
  const current = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(measuredMeters > 0) || current < epsilon) throw new Error("Calibration requires a positive measurement and a non-zero edge");
  return measuredMeters / current;
}
