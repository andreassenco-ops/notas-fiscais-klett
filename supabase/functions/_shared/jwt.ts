// JWT Utilities for Patient Authentication
// Uses HMAC-SHA256 for secure token signing

const encoder = new TextEncoder();

interface JwtPayload {
  sub: string; // patient id
  cpf: string;
  nome: string;
  iat: number;
  exp: number;
}

/**
 * Base64URL encode
 */
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Base64URL decode
 */
function base64UrlDecode(str: string): Uint8Array {
  // Restore standard base64
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  while (base64.length % 4) {
    base64 += "=";
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Create HMAC-SHA256 signature
 */
async function createSignature(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(signature);
}

/**
 * Verify HMAC-SHA256 signature
 */
async function verifySignature(data: string, signature: Uint8Array, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  // Create a new ArrayBuffer copy to avoid TypeScript compatibility issues
  const signatureBuffer = new ArrayBuffer(signature.length);
  new Uint8Array(signatureBuffer).set(signature);
  return await crypto.subtle.verify("HMAC", key, signatureBuffer, encoder.encode(data));
}

/**
 * Create a JWT token for a patient
 */
export async function createPatientToken(
  patientId: string | number,
  cpf: string,
  nome: string,
  secret: string,
  expiresInSeconds: number = 86400 * 7 // 7 days default
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  
  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  
  const payload: JwtPayload = {
    sub: String(patientId),
    cpf,
    nome,
    iat: now,
    exp: now + expiresInSeconds,
  };
  
  const headerEncoded = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const payloadEncoded = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;
  const signature = await createSignature(dataToSign, secret);
  const signatureEncoded = base64UrlEncode(signature);
  
  return `${dataToSign}.${signatureEncoded}`;
}

/**
 * Verify and decode a patient JWT token
 */
export async function verifyPatientToken(
  token: string,
  secret: string
): Promise<{ valid: boolean; payload?: JwtPayload; error?: string }> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { valid: false, error: "Invalid token format" };
    }
    
    const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
    const dataToVerify = `${headerEncoded}.${payloadEncoded}`;
    const signature = base64UrlDecode(signatureEncoded);
    
    // Verify signature
    const isValid = await verifySignature(dataToVerify, signature, secret);
    if (!isValid) {
      return { valid: false, error: "Invalid signature" };
    }
    
    // Decode payload
    const payloadBytes = base64UrlDecode(payloadEncoded);
    const payloadString = new TextDecoder().decode(payloadBytes);
    const payload = JSON.parse(payloadString) as JwtPayload;
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return { valid: false, error: "Token expired" };
    }
    
    return { valid: true, payload };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : "Token verification failed" 
    };
  }
}

/**
 * Extract token from Authorization header
 */
export function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}
