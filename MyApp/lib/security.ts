const COMMON_PASSWORDS = new Set([
  "123456",
  "12345678",
  "123456789",
  "password",
  "qwerty",
  "111111",
  "abc123",
  "password123",
  "letmein",
  "admin",
]);

const BANNED_WORDS = ["kill", "attack", "hate", "bomb", "terror", "abuse", "racist"];

const INJECTION_PATTERN =
  /<\s*script|<\/?\w+[^>]*>|(\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bdrop\b|\bunion\b|\balter\b|\btruncate\b|--|;)/i;

export function sanitizeInput(value: string): string {
  return value.replace(/[<>]/g, "").replace(/\s+/g, " ").trimStart();
}

export function normalizeEmail(value: string): string {
  return sanitizeInput(value).trim().toLowerCase();
}

export function containsBlockedContent(value: string): boolean {
  const lowered = value.toLowerCase();
  return BANNED_WORDS.some((word) => lowered.includes(word)) || INJECTION_PATTERN.test(value);
}

export function validateName(value: string): boolean {
  const normalized = value.trim().replace(/\s+/g, " ");
  return /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(normalized) && normalized.length >= 2 && normalized.length <= 50;
}

export function validateEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validatePHPhone(value: string): boolean {
  return /^\+63\d{10}$/.test(value);
}

export function normalizePHPhone(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("63")) {
    return `+${digits.slice(0, 12)}`;
  }

  return `+63${digits.slice(0, 10)}`;
}

export function getPasswordIssue(value: string): string {
  if (value.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (COMMON_PASSWORDS.has(value.toLowerCase())) {
    return "Please use a less common password.";
  }

  return "";
}

export function getPasswordStrength(value: string): "weak" | "medium" | "strong" {
  const lengthScore = value.length >= 12 ? 2 : value.length >= 8 ? 1 : 0;
  const varietyScore =
    (/[a-z]/.test(value) ? 1 : 0) +
    (/[A-Z]/.test(value) ? 1 : 0) +
    (/\d/.test(value) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(value) ? 1 : 0);

  const score = lengthScore + (varietyScore >= 3 ? 1 : 0);

  if (score >= 3) {
    return "strong";
  }
  if (score >= 1) {
    return "medium";
  }
  return "weak";
}

export function pruneAttempts(attempts: number[], windowMs = 60000): number[] {
  const now = Date.now();
  return attempts.filter((timestamp) => now - timestamp < windowMs);
}

export function getRetrySeconds(attempts: number[], windowMs = 60000): number {
  if (!attempts.length) {
    return 0;
  }

  const oldest = attempts[0];
  const elapsed = Date.now() - oldest;
  const remaining = Math.ceil((windowMs - elapsed) / 1000);
  return Math.max(remaining, 1);
}
