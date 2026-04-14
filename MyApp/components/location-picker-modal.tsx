import * as Location from "expo-location";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import LocationPickerMap from "./location-picker-map";

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Props = {
  visible: boolean;
  title: string;
  initialCoordinates?: Coordinates | null;
  onClose: () => void;
  onSave: (coordinates: Coordinates) => void;
};

function formatCoordinate(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(6) : "";
}

function parseCoordinate(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function LocationPickerModal({
  visible,
  title,
  initialCoordinates,
  onClose,
  onSave,
}: Props) {
  const [latitudeText, setLatitudeText] = useState("");
  const [longitudeText, setLongitudeText] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const [errorText, setErrorText] = useState("");

  useEffect(() => {
    if (!visible) {
      return;
    }

    setLatitudeText(formatCoordinate(initialCoordinates?.latitude));
    setLongitudeText(formatCoordinate(initialCoordinates?.longitude));
    setErrorText("");
  }, [initialCoordinates?.latitude, initialCoordinates?.longitude, visible]);

  const coordinates = useMemo(() => {
    const latitude = parseCoordinate(latitudeText);
    const longitude = parseCoordinate(longitudeText);
    if (latitude === null || longitude === null) {
      return null;
    }
    return { latitude, longitude };
  }, [latitudeText, longitudeText]);

  const handleUseCurrentLocation = async () => {
    setIsLocating(true);
    setErrorText("");

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setErrorText("Location permission was denied.");
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setLatitudeText(position.coords.latitude.toFixed(6));
      setLongitudeText(position.coords.longitude.toFixed(6));
    } catch {
      setErrorText("Unable to fetch your current location right now.");
    } finally {
      setIsLocating(false);
    }
  };

  const handleSave = () => {
    if (!coordinates) {
      setErrorText("Enter valid latitude and longitude values.");
      return;
    }

    if (coordinates.latitude < -90 || coordinates.latitude > 90) {
      setErrorText("Latitude must be between -90 and 90.");
      return;
    }

    if (coordinates.longitude < -180 || coordinates.longitude > 180) {
      setErrorText("Longitude must be between -180 and 180.");
      return;
    }

    onSave(coordinates);
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>
            Save a pin location for this address. You can use your current location or enter the
            coordinates manually.
          </Text>

          <View style={styles.rowHidden}>
            <TextInput value={latitudeText} onChangeText={setLatitudeText} />
            <TextInput value={longitudeText} onChangeText={setLongitudeText} />
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, isLocating && styles.disabledButton]}
              onPress={() => void handleUseCurrentLocation()}
              disabled={isLocating}
            >
              {isLocating ? (
                <ActivityIndicator color="#111827" />
              ) : (
                <Text style={styles.primaryButtonText}>Use Current Location</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.previewCard}>
            <LocationPickerMap
              coordinates={coordinates}
              onPick={(nextCoords) => {
                setLatitudeText(nextCoords.latitude.toFixed(6));
                setLongitudeText(nextCoords.longitude.toFixed(6));
              }}
            />
          </View>

          {!!errorText && <Text style={styles.errorText}>{errorText}</Text>}

          <View style={styles.footerRow}>
            <Pressable style={styles.cancelButton} onPress={onClose}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Pin</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.46)",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  modalCard: {
    width: "100%",
    maxWidth: 760,
    borderRadius: 28,
    backgroundColor: "#F8FBFF",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    color: "#5C6B80",
  },
  row: {
    marginTop: 16,
    flexDirection: "row",
    gap: 12,
  },
  rowHidden: {
    height: 0,
    overflow: "hidden",
  },
  fieldGroup: {
    flex: 1,
  },
  label: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#1E293B",
  },
  input: {
    borderWidth: 1,
    borderColor: "#C8D7E6",
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 14,
    color: "#0F172A",
  },
  actionRow: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  primaryButton: {
    borderRadius: 16,
    backgroundColor: "#F4C430",
    minHeight: 46,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#111827",
    fontWeight: "800",
  },
  disabledButton: {
    opacity: 0.7,
  },
  previewCard: {
    marginTop: 16,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#D6E4F1",
    backgroundColor: "#EAF4FD",
    minHeight: 280,
  },
  errorText: {
    marginTop: 12,
    color: "#B00020",
    fontSize: 12,
    fontWeight: "700",
  },
  footerRow: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  cancelButton: {
    borderRadius: 18,
    backgroundColor: "#E5EDF8",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: "#1D2939",
    fontWeight: "800",
  },
  saveButton: {
    borderRadius: 18,
    backgroundColor: "#F4C430",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  saveButtonText: {
    color: "#111827",
    fontWeight: "900",
  },
});
