import AsyncStorage from "@react-native-async-storage/async-storage";

const GUEST_CART_KEY = "dryby_cart_guest";
const USER_CART_KEY_PREFIX = "dryby_cart_user_";

export type CartItem = {
  id: string;
  shopId: string;
  shopName: string;
  title: string;
  priceLabel: string;
  address: string;
  distanceKm: number;
  quantity: number;
  addedAt: string;
};

export type NewCartItem = Omit<CartItem, "id" | "quantity" | "addedAt"> & {
  id?: string;
};

function getCartKey(userId?: string): string {
  return userId ? `${USER_CART_KEY_PREFIX}${userId}` : GUEST_CART_KEY;
}

function makeCartItemId(): string {
  return `cart_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sameLineItem(a: CartItem, b: Pick<CartItem, "shopId" | "title" | "priceLabel">): boolean {
  return a.shopId === b.shopId && a.title === b.title && a.priceLabel === b.priceLabel;
}

async function readCart(key: string): Promise<CartItem[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is CartItem =>
        typeof item?.id === "string" &&
        typeof item?.shopId === "string" &&
        typeof item?.shopName === "string" &&
        typeof item?.title === "string" &&
        typeof item?.priceLabel === "string" &&
        typeof item?.address === "string" &&
        typeof item?.distanceKm === "number" &&
        typeof item?.quantity === "number" &&
        typeof item?.addedAt === "string"
    );
  } catch {
    return [];
  }
}

async function writeCart(key: string, items: CartItem[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(items));
}

export async function getCartItems(userId?: string): Promise<CartItem[]> {
  return readCart(getCartKey(userId));
}

export async function addItemToCart(item: NewCartItem, userId?: string): Promise<CartItem[]> {
  const key = getCartKey(userId);
  const items = await readCart(key);
  const index = items.findIndex((existing) =>
    sameLineItem(existing, {
      shopId: item.shopId,
      title: item.title,
      priceLabel: item.priceLabel,
    })
  );

  if (index >= 0) {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      quantity: updated[index].quantity + 1,
      addedAt: new Date().toISOString(),
    };
    await writeCart(key, updated);
    return updated;
  }

  const next: CartItem = {
    ...item,
    id: item.id ?? makeCartItemId(),
    quantity: 1,
    addedAt: new Date().toISOString(),
  };
  const updated = [next, ...items];
  await writeCart(key, updated);
  return updated;
}

export async function removeCartItem(itemId: string, userId?: string): Promise<CartItem[]> {
  const key = getCartKey(userId);
  const items = await readCart(key);
  const updated = items.filter((item) => item.id !== itemId);
  await writeCart(key, updated);
  return updated;
}

export async function clearCart(userId?: string): Promise<void> {
  await AsyncStorage.removeItem(getCartKey(userId));
}

export async function mergeGuestCartToUser(userId: string): Promise<void> {
  const guestItems = await readCart(getCartKey());
  if (!guestItems.length) {
    return;
  }

  const userKey = getCartKey(userId);
  const userItems = await readCart(userKey);
  const merged = [...userItems];

  for (const guestItem of guestItems) {
    const existingIndex = merged.findIndex((item) =>
      sameLineItem(item, {
        shopId: guestItem.shopId,
        title: guestItem.title,
        priceLabel: guestItem.priceLabel,
      })
    );

    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        quantity: merged[existingIndex].quantity + guestItem.quantity,
        addedAt: guestItem.addedAt,
      };
      continue;
    }

    merged.unshift({
      ...guestItem,
      id: makeCartItemId(),
    });
  }

  await writeCart(userKey, merged);
  await clearCart();
}
