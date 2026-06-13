import axios from "axios";
import { getAccessToken, getRefreshToken, saveTokens, clearTokens } from "./auth";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null): void {
  for (const pending of failedQueue) {
    if (error) pending.reject(error);
    else pending.resolve(token!);
  }
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as typeof error.config & { _retry?: boolean };

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      if (typeof window !== "undefined") window.location.href = "/login";
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
        { refresh_token: refreshToken }
      );
      const { access_token, refresh_token } = data as {
        access_token: string;
        refresh_token: string;
      };
      saveTokens(access_token, refresh_token);
      processQueue(null, access_token);
      original.headers.Authorization = `Bearer ${access_token}`;
      return api(original);
    } catch (refreshError) {
      processQueue(refreshError, null);
      clearTokens();
      if (typeof window !== "undefined") window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
