import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, UrlTile, type MapPressEvent } from "react-native-maps";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Props = {
  coordinates: Coordinates | null;
  onPick: (coordinates: Coordinates) => void;
};

/**
 * Address pin map for Android.
 *
 * PROVIDER_GOOGLE was removed because it requires a Google Maps Platform key
 * and an active billing account. Leaving the provider unset falls back to the
 * platform default, and a UrlTile layer draws OpenStreetMap tiles over it, so
 * the picker works with no API key.
 *
 * OpenStreetMap's tile usage policy asks for attribution and reasonable
 * volumes. For heavy use, switch the template below to a self-hosted or
 * commercial tile server rather than hitting tile.openstreetmap.org directly.
 */

const OSM_TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function LocationPickerMap({ coordinates, onPick }: Props) {
  return (
    <MapView
      style={styles.map}
      initialRegion={{
        latitude: coordinates?.latitude ?? 14.5995,
        longitude: coordinates?.longitude ?? 120.9842,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }}
      onPress={(event: MapPressEvent) => {
        const { latitude, longitude } = event.nativeEvent.coordinate;
        onPick({ latitude, longitude });
      }}
    >
      <UrlTile urlTemplate={OSM_TILES} maximumZ={19} flipY={false} />
      {coordinates ? <Marker coordinate={coordinates} /> : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: {
    width: "100%",
    height: 320,
  },
});
