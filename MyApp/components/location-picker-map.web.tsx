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

const GOOGLE_MAPS_WEB_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

function useGoogleMapsScript() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if ((window as any).google?.maps) {
      setReady(true);
      return;
    }
    if (!GOOGLE_MAPS_WEB_KEY) {
      setError("Missing Google Maps API key. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.");
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_WEB_KEY}`;
    script.async = true;
    script.onload = () => setReady(true);
    script.onerror = () => setError("Failed to load Google Maps.");
    document.body.appendChild(script);
  }, []);

  return { ready, error };
}

export default function LocationPickerMap({ coordinates, onPick }: Props) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const { ready, error } = useGoogleMapsScript();

  const initialCenter = useMemo(
    () => ({
      lat: coordinates?.latitude ?? 14.5995,
      lng: coordinates?.longitude ?? 120.9842,
    }),
    [coordinates?.latitude, coordinates?.longitude],
  );

  useEffect(() => {
    if (!ready || !mapRef.current) {
      return;
    }
    const googleMaps = (window as any).google?.maps;
    if (!googleMaps) {
      return;
    }
    mapInstanceRef.current = new googleMaps.Map(mapRef.current, {
      center: initialCenter,
      zoom: 15,
      disableDefaultUI: true,
      clickableIcons: false,
    });
    markerRef.current = new googleMaps.Marker({
      position: initialCenter,
      map: mapInstanceRef.current,
    });
    mapInstanceRef.current.addListener("click", (event: any) => {
      const lat = event?.latLng?.lat?.();
      const lng = event?.latLng?.lng?.();
      if (typeof lat === "number" && typeof lng === "number") {
        onPick({ latitude: lat, longitude: lng });
      }
    });
  }, [initialCenter, onPick, ready]);

  useEffect(() => {
    if (!coordinates || !mapInstanceRef.current || !markerRef.current) {
      return;
    }
    markerRef.current.setPosition({
      lat: coordinates.latitude,
      lng: coordinates.longitude,
    });
    mapInstanceRef.current.panTo({
      lat: coordinates.latitude,
      lng: coordinates.longitude,
    });
  }, [coordinates]);

  if (error) {
    return (
      <View style={styles.emptyPreview}>
        <Text style={styles.emptyPreviewText}>{error}</Text>
      </View>
    );
  }

  return <View ref={mapRef} style={styles.webMap} />;
}

const styles = StyleSheet.create({
  webMap: {
    width: "100%",
    height: 320,
  },
  emptyPreview: {
    minHeight: 280,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyPreviewText: {
    maxWidth: 340,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
  },
});
