import Constants from 'expo-constants';
import { API_URL } from '../api/client';

// Public link for a question (served by the backend with link-preview tags; opens the app when installed)
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL || Constants.expoConfig?.extra?.webUrl || API_URL).replace(/\/$/, '').replace('https://YOUR-DOMAIN', API_URL);
export const questionLink = (id) => `${WEB_URL}/q/${id}`;
