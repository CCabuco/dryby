const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

const MAPS_BASE_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";

function formatLatLng(point) {
  return `${point.latitude},${point.longitude}`;
}

exports.getDrivingDistance = functions.https.onCall(async (data) => {
  const apiKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!apiKey) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Missing Google Maps server key."
    );
  }

  const origin = data?.origin;
  const destination = data?.destination;
  if (
    !origin ||
    typeof origin.latitude !== "number" ||
    typeof origin.longitude !== "number" ||
    !destination ||
    typeof destination.latitude !== "number" ||
    typeof destination.longitude !== "number"
  ) {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "Origin and destination coordinates are required."
    );
  }

  const url = new URL(MAPS_BASE_URL);
  url.searchParams.set("origins", formatLatLng(origin));
  url.searchParams.set("destinations", formatLatLng(destination));
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new functions.https.HttpsError("unavailable", "Distance API request failed.");
  }

  const payload = await response.json();
  const element = payload?.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") {
    throw new functions.https.HttpsError("unavailable", "Unable to compute distance.");
  }

  const distanceMeters = Number(element.distance?.value);
  if (!Number.isFinite(distanceMeters)) {
    throw new functions.https.HttpsError("data-loss", "Invalid distance response.");
  }

  return {
    distanceKm: distanceMeters / 1000,
    distanceText: element.distance?.text ?? "",
    durationText: element.duration?.text ?? "",
  };
});
