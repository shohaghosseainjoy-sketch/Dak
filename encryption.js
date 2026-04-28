// ============================================================
// NexChat - Encryption Utility (Basic E2E Simulation)
// Uses SubtleCrypto API for AES-GCM encryption
// ============================================================

const EncryptionUtil = (() => {
  // Generate a shared secret key from two user IDs (deterministic)
  const generateChatKey = async (uid1, uid2) => {
    const sorted = [uid1, uid2].sort().join('_nexchat_secret_');
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(sorted),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('nexchat_salt_v1'),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  };

  // Encrypt a message
  const encrypt = async (plaintext, key) => {
    try {
      const encoder = new TextEncoder();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        encoder.encode(plaintext)
      );
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv, 0);
      combined.set(new Uint8Array(encrypted), iv.length);
      return btoa(String.fromCharCode(...combined));
    } catch (e) {
      console.error('Encryption error:', e);
      return plaintext;
    }
  };

  // Decrypt a message
  const decrypt = async (ciphertext, key) => {
    try {
      const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      // If decryption fails, return as-is (unencrypted message)
      return ciphertext;
    }
  };

  // Hash phone number for privacy
  const hashPhone = async (phone) => {
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(phone));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  return { generateChatKey, encrypt, decrypt, hashPhone };
})();

window.EncryptionUtil = EncryptionUtil;
