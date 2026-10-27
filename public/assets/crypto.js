/* Brief encryption.
   Clients seal each brief with the studio's public key (RSA-OAEP 3072 wraps a fresh AES-256-GCM key).
   Only the studio can open them: its private key is stored in the briefs repo encrypted with a
   passphrase (PBKDF2-SHA256, 600k rounds). Anyone holding the repo key sees ciphertext only. */
(function (global) {
  "use strict";
  const subtle = crypto.subtle, te = new TextEncoder(), td = new TextDecoder();
  const MAGIC = [0x52, 0x53, 0x42, 0x31]; // "RSB1"
  const RSA = { name: "RSA-OAEP", hash: "SHA-256" };
  const ITER = 600000;

  function b64(u8) {
    u8 = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    let s = ""; const CH = 0x8000;
    for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  function unb64(s) { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }
  const rand = n => crypto.getRandomValues(new Uint8Array(n));

  function importPublic(spkiB64) { return subtle.importKey("spki", unb64(spkiB64), RSA, false, ["wrapKey"]); }
  function importPrivate(pkcs8B64) { return subtle.importKey("pkcs8", unb64(pkcs8B64), RSA, false, ["unwrapKey"]); }

  async function seal(pub, obj) {
    const data = te.encode(JSON.stringify(obj));
    const k = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
    const iv = rand(12);
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, k, data));
    const ek = new Uint8Array(await subtle.wrapKey("raw", k, pub, { name: "RSA-OAEP" }));
    const header = te.encode(JSON.stringify({ v: 1, ek: b64(ek), iv: b64(iv) }));
    const out = new Uint8Array(8 + header.length + ct.length);
    out.set(MAGIC, 0); new DataView(out.buffer).setUint32(4, header.length); out.set(header, 8); out.set(ct, 8 + header.length);
    return out;
  }
  async function open(priv, bytes) {
    if (MAGIC.some((m, i) => bytes[i] !== m)) throw new Error("not_a_sealed_brief");
    const hl = new DataView(bytes.buffer, bytes.byteOffset).getUint32(4);
    const h = JSON.parse(td.decode(bytes.subarray(8, 8 + hl)));
    const k = await subtle.unwrapKey("raw", unb64(h.ek), priv, { name: "RSA-OAEP" }, { name: "AES-GCM" }, false, ["decrypt"]);
    const pt = await subtle.decrypt({ name: "AES-GCM", iv: unb64(h.iv) }, k, bytes.subarray(8 + hl));
    return JSON.parse(td.decode(pt));
  }

  async function kek(pass, salt, iter) {
    const base = await subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]);
    return subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  /* New key pair. Returns the file to store in the repo plus the unlocked private key. */
  async function createKeys(pass) {
    const kp = await subtle.generateKey(Object.assign({ modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, RSA), true, ["wrapKey", "unwrapKey"]);
    const spki = new Uint8Array(await subtle.exportKey("spki", kp.publicKey));
    const pkcs8 = new Uint8Array(await subtle.exportKey("pkcs8", kp.privateKey));
    const salt = rand(16), iv = rand(12);
    const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, await kek(pass, salt, ITER), pkcs8));
    const file = { v: 1, kdf: "PBKDF2-SHA256", iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct), publicKey: b64(spki), createdAt: new Date().toISOString() };
    return { file, publicKey: file.publicKey, pkcs8: b64(pkcs8), priv: await importPrivate(b64(pkcs8)) };
  }
  /* Throws "wrong_passphrase" if the passphrase does not match. */
  async function unlock(file, pass) {
    let pkcs8;
    try { pkcs8 = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: unb64(file.iv) }, await kek(pass, unb64(file.salt), file.iter || ITER), unb64(file.ct))); }
    catch (e) { throw new Error("wrong_passphrase"); }
    return { pkcs8: b64(pkcs8), priv: await importPrivate(b64(pkcs8)) };
  }

  global.SSSCrypto = { b64, unb64, importPublic, importPrivate, seal, open, createKeys, unlock };
})(window);
