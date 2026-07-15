/**
 * crypto/ — audited-library-only cryptography (spec Ch5; ADR-0005).
 * May import ONLY kernel + libsodium (lint-enforced). All libsodium calls
 * live behind these modules; nothing else touches the library.
 */

export { getSodium, type Sodium } from "./sodium";
export { ENVELOPE_VERSION, type CipherEnvelope } from "./envelope";
export { CryptoError } from "./errors";
export {
  seal,
  open,
  generateKey,
  equal,
  zero,
  KEY_BYTES,
  NONCE_BYTES,
  TAG_BYTES,
} from "./aead";
