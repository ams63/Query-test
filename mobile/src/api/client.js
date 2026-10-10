import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getInitialUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  let url = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:4000';
  if (Platform.OS === 'android') {
    url = url.replace('localhost', '10.0.2.2').replace('127.0.0.1', '10.0.2.2');
  } else if (Platform.OS === 'ios' || Platform.OS === 'web') {
    url = url.replace('10.0.2.2', 'localhost');
  }
  return url;
};

export const API_URL = getInitialUrl().replace(/\/$/, '');

let authToken = null;
let onUnauthorized = null;
export const setToken = (t) => { authToken = t; };
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(status, code, details) { super(code); this.status = status; this.code = code; this.details = details; }
}

async function request(method, path, body, isForm) {
  const headers = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && authToken && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, data.error || 'SERVER_ERROR', data.details);
  }
  return data;
}

// Local file (from image picker / recorder) → multipart part
export const filePart = (uri, fallbackType) => {
  const clean = uri.split('?')[0];
  const ext = (clean.split('.').pop() || '').toLowerCase();
  const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime', m4a: 'audio/mp4', aac: 'audio/aac', caf: 'audio/x-caf', '3gp': 'video/3gpp', webm: 'audio/webm' };
  return { uri, name: `upload.${ext || 'bin'}`, type: types[ext] || fallbackType };
};

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  patch: (p, b) => request('PATCH', p, b),
  put: (p, b) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
  form: (p, fd) => request('POST', p, fd, true),
};
