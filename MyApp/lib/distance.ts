/**
 * Distance helpers.
 *
 * Distance is always relative to the person looking at the screen, so it is
 * computed at display time from the viewer's coordinates and the shop's
 * coordinates. It is never read from a stored field.
 *
 * The `distanceKm` field that exists on shop documents is a leftover from an
 * earlier version. It was written with a hardcoded fallback of 0.9 km, which
 * is what produced the incorrect distances reported in TC-020. Nothing should
 * read it. `resolveDistanceKm` returns null when a real distance cannot be
 * worked out, and callers should show "Distance unavailable" rather than
 * inventing a number.
 */

export type Coordinates = {
  latitude: number;
  longitude: number;
};

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

/** Great-circle distance in kilometres between two points. */
export function haversineKm(
  origin: Coordinates,
  destination: Coordinates
): number {
  const R = 6371;
  const dLat = toRadians(destination.latitude - origin.latitude);
  const dLon = toRadians(destination.longitude - origin.longitude);
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** True when a value is a usable latitude/longitude pair. */
export function isValidCoordinates(value: unknown): value is Coordinates {
  if (!value || typeof value !== "object") {
    return false;
  }
  const { latitude, longitude } = value as Partial<Coordinates>;
  return (
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

/**
 * Works out how far a shop is from the viewer.
 * Returns null when the viewer's location is unknown, when the shop has no
 * coordinates, or when the calculation does not produce a finite result.
 */
export function resolveDistanceKm(
  viewer: Coordinates | null | undefined,
  shopCoordinates: unknown
): number | null {
  if (!viewer || !isValidCoordinates(viewer)) {
    return null;
  }
  if (!isValidCoordinates(shopCoordinates)) {
    return null;
  }

  const distance = haversineKm(viewer, shopCoordinates);
  return Number.isFinite(distance) ? Math.max(0, distance) : null;
}

/**
 * Formats a distance for display. Callers pass the result of
 * resolveDistanceKm directly, including null.
 */
export function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null) {
    return "Distance unavailable";
  }
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`;
  }
  return `${distanceKm.toFixed(1)} km away`;
}
