// components/SafeMap.web.tsx
// This file ONLY runs on the Web
import React from "react";
import { Text, View } from "react-native";

export const MapView = ({ children, style }: any) => (
  <View
    style={[
      style,
      {
        backgroundColor: "#e0e0e0",
        justifyContent: "center",
        alignItems: "center",
      },
    ]}
  >
    <Text
      style={{
        color: "#555",
        textAlign: "center",
        padding: 20,
        fontSize: 16,
        fontWeight: "bold",
      }}
    >
      Live Maps are only available on the Mobile App.
    </Text>
    {children}
  </View>
);

// We return a dummy component for Marker so the code doesn't break
export const Marker = () => null;
