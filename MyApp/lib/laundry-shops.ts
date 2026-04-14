export type LaundryAction = "wash" | "dry" | "fold";
export type ServiceSpeed = "standard" | "express" | "both";
export type LoadCategoryKey = "normal" | "heavy";
export type DayKey = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

export type AddressFields = {
  houseUnit: string;
  streetName: string;
  barangay: string;
  cityMunicipality: string;
  province: string;
  zipCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
};

export type PickupWindow = {
  id: string;
  label: string;
  startHour: number;
  endHour: number;
  forService: ServiceSpeed;
  enabled: boolean;
};

export type LoadConfig = {
  title: string;
  description: string;
  includedItems: string[];
  commonServices: string[];
  allowedActions: LaundryAction[];
  enabled: boolean;
};

export type LaundryService = {
  id: string;
  serviceName: string;
  actions: LaundryAction[];
  serviceSpeed: ServiceSpeed;
  pricePerKg: number;
  estimatedHours: number;
  enabled: boolean;
  description: string;
};

export type PromoConfig = {
  enabled: boolean;
  title: string;
  discountPercent: number;
  weekendOnly: boolean;
};

export type LaundryShop = {
  id: string;
  ownerUid: string;
  ownerEmail: string;
  shopName: string;
  ownerName: string;
  contactNumber: string;
  address: string;
  addressFields: AddressFields;
  ratingAverage: number;
  ratingCount: number;
  distanceKm: number;
  isActive: boolean;
  isOpen: boolean;
  openingTime: string;
  closingTime: string;
  standardCutoffTime: string;
  operatingDays: DayKey[];
  deliveryAvailable: boolean;
  pickupAvailable: boolean;
  maxOrdersPerDay: number;
  bannerImageUrl: string;
  logoImageUrl: string;
  loadConfigs: Record<LoadCategoryKey, LoadConfig>;
  pickupWindows: PickupWindow[];
  promo: PromoConfig;
  priceRangeMin: number;
  priceRangeMax: number;
  priceLabel: string;
};

type UnknownRecord = Record<string, unknown>;

export const DAY_OPTIONS: DayKey[] = [
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
  "Sun",
];

export const ACTION_OPTIONS: LaundryAction[] = ["wash", "dry", "fold"];

export const EMPTY_ADDRESS_FIELDS: AddressFields = {
  houseUnit: "",
  streetName: "",
  barangay: "",
  cityMunicipality: "",
  province: "",
  zipCode: "",
  country: "Philippines",
  latitude: null,
  longitude: null,
};

export const DEFAULT_LOAD_CONFIGS: Record<LoadCategoryKey, LoadConfig> = {
  normal: {
    title: "Normal Load",
    description: "For everyday clothes",
    includedItems: [
      "T-shirts",
      "Shorts",
      "Underwear",
      "Light dresses",
      "Office wear",
    ],
    commonServices: [
      "Wash & Dry",
      "Wash, Dry & Fold",
      "Express (same day)",
      "Standard (next day)",
    ],
    allowedActions: ["wash", "dry", "fold"],
    enabled: true,
  },
  heavy: {
    title: "Heavy Load",
    description: "For thick or bulky items",
    includedItems: [
      "Blankets / Comforters",
      "Jackets / Hoodies",
      "Towels",
      "Jeans",
    ],
    commonServices: [
      "Heavy Wash & Dry",
      "Bedding / Bulky Wash",
      "Extra Dry",
      "Express (optional, higher price)",
    ],
    allowedActions: ["wash", "dry", "fold"],
    enabled: true,
  },
};

export const DEFAULT_PICKUP_WINDOWS: PickupWindow[] = [
  {
    id: "std-9-12",
    label: "9:00 AM - 12:00 PM",
    startHour: 9,
    endHour: 12,
    forService: "standard",
    enabled: true,
  },
  {
    id: "std-12-15",
    label: "12:00 PM - 3:00 PM",
    startHour: 12,
    endHour: 15,
    forService: "standard",
    enabled: true,
  },
  {
    id: "std-15-18",
    label: "3:00 PM - 6:00 PM",
    startHour: 15,
    endHour: 18,
    forService: "standard",
    enabled: true,
  },
  {
    id: "exp-9-10",
    label: "9:00 AM - 10:00 AM",
    startHour: 9,
    endHour: 10,
    forService: "express",
    enabled: true,
  },
  {
    id: "exp-10-11",
    label: "10:00 AM - 11:00 AM",
    startHour: 10,
    endHour: 11,
    forService: "express",
    enabled: true,
  },
  {
    id: "exp-11-12",
    label: "11:00 AM - 12:00 PM",
    startHour: 11,
    endHour: 12,
    forService: "express",
    enabled: true,
  },
  {
    id: "exp-12-13",
    label: "12:00 PM - 1:00 PM",
    startHour: 12,
    endHour: 13,
    forService: "express",
    enabled: true,
  },
  {
    id: "exp-13-14",
    label: "1:00 PM - 2:00 PM",
    startHour: 13,
    endHour: 14,
    forService: "express",
    enabled: true,
  },
  {
    id: "exp-14-15",
    label: "2:00 PM - 3:00 PM",
    startHour: 14,
    endHour: 15,
    forService: "express",
    enabled: true,
  },
  {
    id: "exp-15-16",
    label: "3:00 PM - 4:00 PM",
    startHour: 15,
    endHour: 16,
    forService: "express",
    enabled: true,
  },
  {
    id: "exp-16-17",
    label: "4:00 PM - 5:00 PM",
    startHour: 16,
    endHour: 17,
    forService: "express",
    enabled: true,
  },
  {
    id: "exp-17-18",
    label: "5:00 PM - 6:00 PM",
    startHour: 17,
    endHour: 18,
    forService: "express",
    enabled: true,
  },
];

const DAY_BY_INDEX: DayKey[] = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function safeString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function safeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function safeNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function sanitizeTimeString(value: unknown, fallback: string): string {
  const raw = safeString(value);
  if (!raw) {
    return fallback;
  }
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw) ? raw : fallback;
}

function normalizeActions(value: unknown): LaundryAction[] {
  if (!Array.isArray(value)) {
    return [...ACTION_OPTIONS];
  }

  const mapped = value
    .map((item) => safeString(item).toLowerCase())
    .filter((item): item is LaundryAction =>
      ACTION_OPTIONS.includes(item as LaundryAction)
    );

  return mapped.length ? Array.from(new Set(mapped)) : [...ACTION_OPTIONS];
}

function normalizeServiceSpeed(value: unknown, fallback: ServiceSpeed): ServiceSpeed {
  const normalized = safeString(value).toLowerCase();
  if (normalized === "standard" || normalized === "express" || normalized === "both") {
    return normalized;
  }
  return fallback;
}

function normalizeDay(value: unknown): DayKey | null {
  const normalized = safeString(value);
  return DAY_OPTIONS.includes(normalized as DayKey) ? (normalized as DayKey) : null;
}

function normalizeOperatingDays(value: unknown): DayKey[] {
  if (!Array.isArray(value)) {
    return [...DAY_OPTIONS];
  }

  const mapped = value
    .map((item) => normalizeDay(item))
    .filter((item): item is DayKey => !!item);

  return mapped.length ? Array.from(new Set(mapped)) : [...DAY_OPTIONS];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => safeString(item))
    .filter(Boolean);
}

function normalizeAddressFields(value: unknown): AddressFields {
  const source = toRecord(value);
  const latitude = safeNumber(source.latitude, NaN);
  const longitude = safeNumber(source.longitude, NaN);
  return {
    houseUnit: safeString(source.houseUnit),
    streetName: safeString(source.streetName),
    barangay: safeString(source.barangay),
    cityMunicipality: safeString(source.cityMunicipality),
    province: safeString(source.province),
    zipCode: safeString(source.zipCode),
    country: safeString(source.country, "Philippines") || "Philippines",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function normalizePickupWindow(
  value: unknown,
  fallback: PickupWindow,
  index: number
): PickupWindow {
  const source = toRecord(value);
  const forService = normalizeServiceSpeed(source.forService, fallback.forService);
  const startHour = safeNumber(source.startHour, fallback.startHour);
  const endHour = safeNumber(source.endHour, fallback.endHour);
  const fallbackLabel = `${formatHourLabel(startHour)} - ${formatHourLabel(endHour)}`;

  return {
    id: safeString(source.id, `${forService}-${index}`) || `${forService}-${index}`,
    label: safeString(source.label, fallbackLabel) || fallbackLabel,
    startHour: Math.min(Math.max(Math.floor(startHour), 0), 23),
    endHour: Math.min(Math.max(Math.floor(endHour), 1), 24),
    forService,
    enabled: safeBoolean(source.enabled, true),
  };
}

function normalizeLoadConfig(
  value: unknown,
  fallback: LoadConfig
): LoadConfig {
  const source = toRecord(value);
  return {
    title: safeString(source.title, fallback.title) || fallback.title,
    description:
      safeString(source.description, fallback.description) || fallback.description,
    includedItems: normalizeStringArray(source.includedItems).length
      ? normalizeStringArray(source.includedItems)
      : [...fallback.includedItems],
    commonServices: normalizeStringArray(source.commonServices).length
      ? normalizeStringArray(source.commonServices)
      : [...fallback.commonServices],
    allowedActions: normalizeActions(source.allowedActions),
    enabled: safeBoolean(source.enabled, fallback.enabled),
  };
}

function normalizePromo(value: unknown): PromoConfig {
  const source = toRecord(value);
  return {
    enabled: safeBoolean(source.enabled, false),
    title: safeString(source.title, ""),
    discountPercent: Math.min(Math.max(safeNumber(source.discountPercent, 0), 0), 90),
    weekendOnly: safeBoolean(source.weekendOnly, false),
  };
}

export function formatHourLabel(hour: number): string {
  const normalized = Math.min(Math.max(Math.floor(hour), 0), 23);
  const suffix = normalized >= 12 ? "PM" : "AM";
  const display = normalized % 12 || 12;
  return `${display}:00 ${suffix}`;
}

export function formatPriceLabel(min: number, max: number): string {
  if (min <= 0 && max <= 0) {
    return "Price not set";
  }
  const roundedMin = Math.round(min);
  const roundedMax = Math.round(max);
  if (roundedMin > 0 && roundedMax > 0 && roundedMin !== roundedMax) {
    return `P${roundedMin}-${roundedMax}/kg`;
  }
  return `P${roundedMin || roundedMax}/kg`;
}

export function buildAddressLabel(address: AddressFields): string {
  return [
    address.houseUnit,
    address.streetName,
    address.barangay,
    address.cityMunicipality,
    address.province,
    address.zipCode,
    address.country,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
}

export function normalizeLaundryService(id: string, value: unknown): LaundryService {
  const source = toRecord(value);
  const serviceName = safeString(source.serviceName, "Unnamed service") || "Unnamed service";
  return {
    id,
    serviceName,
    actions: normalizeActions(source.actions),
    serviceSpeed: normalizeServiceSpeed(source.serviceSpeed, "both"),
    pricePerKg: Math.max(0, safeNumber(source.pricePerKg, 0)),
    estimatedHours: Math.max(0, safeNumber(source.estimatedHours, 0)),
    enabled: safeBoolean(source.enabled, true),
    description: safeString(source.description),
  };
}

export function computePriceRangeFromServices(services: LaundryService[]): {
  min: number;
  max: number;
} {
  const prices = services
    .filter((service) => service.enabled && service.pricePerKg > 0)
    .map((service) => service.pricePerKg);

  if (!prices.length) {
    return { min: 0, max: 0 };
  }

  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
  };
}

export function parseLaundryShop(id: string, data: unknown): LaundryShop {
  const source = toRecord(data);
  const addressFields = normalizeAddressFields(source.addressFields);
  const fallbackAddress = buildAddressLabel(addressFields);
  const normalizedAddress = safeString(source.address, fallbackAddress) || fallbackAddress;

  const pickupWindowsRaw = Array.isArray(source.pickupWindows) ? source.pickupWindows : [];
  const pickupWindows = pickupWindowsRaw.length
    ? pickupWindowsRaw.map((item, index) =>
        normalizePickupWindow(
          item,
          DEFAULT_PICKUP_WINDOWS[index % DEFAULT_PICKUP_WINDOWS.length],
          index
        )
      )
    : [...DEFAULT_PICKUP_WINDOWS];

  const loadConfigsSource = toRecord(source.loadConfigs);
  const loadConfigs: Record<LoadCategoryKey, LoadConfig> = {
    normal: normalizeLoadConfig(loadConfigsSource.normal, DEFAULT_LOAD_CONFIGS.normal),
    heavy: normalizeLoadConfig(loadConfigsSource.heavy, DEFAULT_LOAD_CONFIGS.heavy),
  };

  const minPrice = Math.max(0, safeNumber(source.priceRangeMin, 0));
  const maxPrice = Math.max(0, safeNumber(source.priceRangeMax, 0));
  const isActive = safeBoolean(source.isActive, safeBoolean(source.isOpen, true));

  return {
    id,
    ownerUid: safeString(source.ownerUid),
    ownerEmail: safeString(source.ownerEmail),
    shopName: safeString(source.shopName, "Laundry Shop") || "Laundry Shop",
    ownerName: safeString(source.ownerName, "Laundry Owner") || "Laundry Owner",
    contactNumber: safeString(source.contactNumber),
    address: normalizedAddress,
    addressFields,
    ratingAverage: safeNumber(source.ratingAverage, 0),
    ratingCount: Math.max(0, safeNumber(source.ratingCount, 0)),
    distanceKm: Math.max(0, safeNumber(source.distanceKm, 0.9)),
    isActive,
    isOpen: isActive,
    openingTime: sanitizeTimeString(source.openingTime, "08:00"),
    closingTime: sanitizeTimeString(source.closingTime, "19:00"),
    standardCutoffTime: sanitizeTimeString(source.standardCutoffTime, "19:00"),
    operatingDays: normalizeOperatingDays(source.operatingDays),
    deliveryAvailable: safeBoolean(source.deliveryAvailable, true),
    pickupAvailable: safeBoolean(source.pickupAvailable, true),
    maxOrdersPerDay: Math.max(1, safeNumber(source.maxOrdersPerDay, 25)),
    bannerImageUrl: safeString(source.bannerImageUrl),
    logoImageUrl: safeString(source.logoImageUrl),
    loadConfigs,
    pickupWindows,
    promo: normalizePromo(source.promo),
    priceRangeMin: minPrice,
    priceRangeMax: maxPrice,
    priceLabel: formatPriceLabel(minPrice, maxPrice),
  };
}

export function makeDefaultShopPayload(ownerUid: string, ownerEmail: string): UnknownRecord {
  const defaultPrice = { min: 60, max: 180 };
  return {
    ownerUid,
    ownerEmail,
    shopName: "My Laundry Shop",
    ownerName: "Laundry Owner",
    contactNumber: "",
    address: "",
    addressFields: { ...EMPTY_ADDRESS_FIELDS },
    ratingAverage: 0,
    ratingCount: 0,
    distanceKm: 0.9,
    isActive: true,
    isOpen: true,
    openingTime: "08:00",
    closingTime: "19:00",
    standardCutoffTime: "19:00",
    operatingDays: [...DAY_OPTIONS],
    deliveryAvailable: true,
    pickupAvailable: true,
    maxOrdersPerDay: 25,
    bannerImageUrl: "",
    logoImageUrl: "",
    loadConfigs: {
      normal: { ...DEFAULT_LOAD_CONFIGS.normal },
      heavy: { ...DEFAULT_LOAD_CONFIGS.heavy },
    },
    pickupWindows: DEFAULT_PICKUP_WINDOWS.map((item) => ({ ...item })),
    promo: {
      enabled: false,
      title: "",
      discountPercent: 0,
      weekendOnly: false,
    },
    priceRangeMin: defaultPrice.min,
    priceRangeMax: defaultPrice.max,
  };
}

export function getServiceSupportMap(services: LaundryService[]): {
  standard: boolean;
  express: boolean;
} {
  const enabled = services.filter((service) => service.enabled);
  return {
    standard: enabled.some(
      (service) => service.serviceSpeed === "standard" || service.serviceSpeed === "both"
    ),
    express: enabled.some(
      (service) => service.serviceSpeed === "express" || service.serviceSpeed === "both"
    ),
  };
}

function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((item) => Number(item));
  return hours * 60 + minutes;
}

export function isShopAutoOpen(shop: LaundryShop, now = new Date()): boolean {
  const dayKey = DAY_BY_INDEX[now.getDay()];
  if (!shop.operatingDays.includes(dayKey)) {
    return false;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = timeToMinutes(shop.openingTime);
  const closeMinutes = timeToMinutes(shop.closingTime);
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

export function isShopCurrentlyOpen(shop: LaundryShop, now = new Date()): boolean {
  if (!shop.isActive) {
    return false;
  }
  return isShopAutoOpen(shop, now);
}

export function getVisiblePickupWindows(
  shop: LaundryShop,
  serviceType: "standard" | "express",
  forDate: Date,
  now = new Date()
): PickupWindow[] {
  const serviceWindows = shop.pickupWindows.filter((window) => {
    if (!window.enabled) {
      return false;
    }
    if (window.forService === "both") {
      return true;
    }
    return window.forService === serviceType;
  });

  const isToday =
    now.getFullYear() === forDate.getFullYear() &&
    now.getMonth() === forDate.getMonth() &&
    now.getDate() === forDate.getDate();

  if (!isToday) {
    return serviceWindows;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return serviceWindows.filter((window) => nowMinutes < window.endHour * 60);
}

export function getCutoffHour(shop: LaundryShop): number {
  return Number(shop.standardCutoffTime.split(":")[0] ?? 19);
}
