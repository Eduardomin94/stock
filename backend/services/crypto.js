import crypto from "crypto";

const SECRET = process.env.STORE_CREDENTIALS_SECRET || "dev_store_secret_change_this";
const KEY = crypto.createHash("sha256").update(SECRET).digest();
const ALGORITHM = "aes-256-cbc";

export function encryptText(value) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  let encrypted = cipher.update(String(value || ""), "utf8", "hex");
  encrypted += cipher.final("hex");

  return `${iv.toString("hex")}:${encrypted}`;
}

export function decryptText(value) {
  if (!value || !String(value).includes(":")) {
    return String(value || "");
  }

  const [ivHex, encryptedHex] = String(value).split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);

  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}