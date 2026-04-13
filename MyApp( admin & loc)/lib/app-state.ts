import AsyncStorage from "@react-native-async-storage/async-storage";

const GUEST_MODE_KEY = "dryby_guest_mode";
const ONBOARDING_SEEN_KEY = "dryby_onboarding_seen";

export async function setGuestMode(isGuest: boolean): Promise<void> {
  await AsyncStorage.setItem(GUEST_MODE_KEY, isGuest ? "1" : "0");
}

export async function isGuestMode(): Promise<boolean> {
  const value = await AsyncStorage.getItem(GUEST_MODE_KEY);
  return value === "1";
}

export async function setOnboardingSeen(seen: boolean): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_SEEN_KEY, seen ? "1" : "0");
}

export async function hasSeenOnboarding(): Promise<boolean> {
  const value = await AsyncStorage.getItem(ONBOARDING_SEEN_KEY);
  return value === "1";
}
