const baseConfig = require("./app.json");

module.exports = () => {
  const androidConfig = baseConfig.expo.android ?? {};
  const androidNestedConfig = androidConfig.config ?? {};

  return {
    ...baseConfig,
    expo: {
      ...baseConfig.expo,
      android: {
        ...androidConfig,
        config: {
          ...androidNestedConfig,
          googleMaps: {
            apiKey: process.env.EXPO_PUBLIC_ANDROID_MAPS_API_KEY || "",
          },
        },
      },
      ios: {
        ...baseConfig.expo.ios,
      },
    },
  };
};
