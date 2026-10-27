const deviceKey = 'pos.registered-device.v1';
const credentialKey = 'pos.device-credential.v1';
export function getDeviceCredential() {
  return globalThis.localStorage?.getItem(credentialKey) || '';
}
export function storeDeviceCredential(credential) {
  if (typeof credential !== 'string' || credential.length < 32) throw new Error('Invalid terminal credential.');
  globalThis.localStorage?.setItem(credentialKey, credential);
}
export function clearDeviceCredential() {
  globalThis.localStorage?.removeItem(credentialKey);
  globalThis.localStorage?.removeItem(deviceKey);
  globalThis.localStorage?.removeItem('pos.terminal.credential.v1');
}
export function deviceProofHeaders() {
  const proof = getDeviceCredential();
  return proof ? { 'x-pos-device-credential': proof } : {};
}
export function fetchWithDeviceProof(input, init = {}) {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  Object.entries(deviceProofHeaders()).forEach(([key, value]) => headers.set(key, value));
  return globalThis.fetch(input, { ...init, headers });
}
