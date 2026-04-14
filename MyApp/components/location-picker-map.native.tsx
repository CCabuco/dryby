import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, type MapPressEvent } from "react-native-maps";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Props = {
  coordinates: Coordinates | null;
  onPick: (coordinates: Coordinates) => void;
};

export default function LocationPickerMap({ coordinates, onPick }: Props) {
  return (
    <MapView
      style={styles.map}
      provider={PROVIDER_GOOGLE}
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
