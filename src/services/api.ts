import axios from 'axios';

export const api = axios.create({
  // Em produção, prefira EXPO_PUBLIC_API_URL no .env.
  baseURL: process.env.EXPO_PUBLIC_API_URL ?? 'https://finances-api-jyfj.onrender.com',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});
