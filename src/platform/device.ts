import { ulid } from 'ulid';

const DEVICE_ID_KEY = 'inventek.deviceId';

export function getDeviceId(): string {
  if (typeof localStorage === 'undefined') return 'dev_unknown';
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${ulid()}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}
