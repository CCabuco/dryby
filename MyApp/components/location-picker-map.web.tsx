import React, { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Props = {
  coordinates: Coordinates | null;
  onPick: (coordinates: Coordinates) => void;
};

/**
 * Address pin map.
 *
 * This uses OpenStreetMap tiles through Leaflet rather than Google Maps.
 * Leaflet is open source and OpenStreetMap tiles need no API key, no billing
 * account and no quota, so the picker keeps working without a Maps Platform
 * subscription. The component's props are unchanged, so nothing that renders
 * it needed to be touched.
 *
 * OpenStreetMap's tile usage policy requires attribution, which Leaflet adds
 * to the corner of the map automatically.
 */

const LEAFLET_VERSION = "1.9.4";
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;

// Manila, used only as the starting view when no pin has been set yet.
const FALLBACK = { lat: 14.5995, lng: 120.9842 };

function useLeaflet() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if ((window as any).L) {
      setReady(true);
      return;
    }

    if (!document.querySelector(`link[data-leaflet="1"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = LEAFLET_CSS;
      link.setAttribute("data-leaflet", "1");
      document.head.appendChild(link);
    }

    const existing = document.querySelector(
      `script[data-leaflet="1"]`
    ) as HTMLScriptElement | null;

    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      existing.addEventListener("error", () => setError("Could not load the map."));
      return;
    }

    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.async = true;
    script.setAttribute("data-leaflet", "1");
    script.onload = () => setReady(true);
    script.onerror = () =>
      setError("Could not load the map. Check your connection and try again.");
    document.body.appendChild(script);
  }, []);

  return { ready, error };
}

export default function LocationPickerMap({ coordinates, onPick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const onPickRef = useRef(onPick);

  // Kept in a ref so the map is created once rather than rebuilt whenever the
  // parent re-renders with a new callback identity.
  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  const { ready, error } = useLeaflet();

  const center = useMemo(
    () => ({
      lat: coordinates?.latitude ?? FALLBACK.lat,
      lng: coordinates?.longitude ?? FALLBACK.lng,
    }),
    [coordinates?.latitude, coordinates?.longitude]
  );

  // Create the map once Leaflet is available.
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) {
      return;
    }
    const L = (window as any).L;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: coordinates ? 17 : 12,
      // The picker sits inside a scrolling form, so scroll wheel zoom would
      // trap the page scroll. Zoom controls and pinch still work.
      scrollWheelZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    map.on("click", (event: any) => {
      const { lat, lng } = event.latlng;
      onPickRef.current({ latitude: lat, longitude: lng });
    });

    mapRef.current = map;

    if (coordinates) {
      markerRef.current = L.marker([center.lat, center.lng]).addTo(map);
    }

    // Leaflet measures the container on creation. Inside a modal that has just
    // opened the size can still be zero, which leaves the tiles blank until
    // the next resize.
    setTimeout(() => map.invalidateSize(), 0);

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [ready]);

  // Move the marker and view when the pin changes.
  useEffect(() => {
    if (!ready || !mapRef.current || !coordinates) {
      return;
    }
    const L = (window as any).L;
    const position: [number, number] = [center.lat, center.lng];

    if (markerRef.current) {
      markerRef.current.setLatLng(position);
    } else {
      markerRef.current = L.marker(position).addTo(mapRef.current);
    }
    mapRef.current.setView(position, Math.max(mapRef.current.getZoom(), 16));
  }, [ready, center.lat, center.lng, coordinates]);

  if (error) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>{error}</Text>
        <Text style={styles.placeholderHint}>
          You can still set the pin by entering coordinates below.
        </Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Loading map…</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", borderRadius: 12 }}
      />
      <Text style={styles.hint}>Tap the map to place your pin.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    height: 280,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#E8F1FB",
  },
  hint: {
    position: "absolute",
    left: 10,
    bottom: 10,
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    fontSize: 12,
    color: "#33506B",
    fontWeight: "600",
  },
  placeholder: {
    width: "100%",
    height: 280,
    borderRadius: 12,
    backgroundColor: "#E8F1FB",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  placeholderText: {
    fontSize: 13,
    color: "#33506B",
    textAlign: "center",
    fontWeight: "600",
  },
  placeholderHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#5B7185",
    textAlign: "center",
  },
});
