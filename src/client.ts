import axios, { AxiosInstance, InternalAxiosRequestConfig } from "axios";
import { config } from "./config.js";

interface TokenStore {
  accessToken: string | null;
  refreshToken: string | null;
  expiration: string | null;
}

const store: TokenStore = {
  accessToken: config.token,
  refreshToken: null,
  expiration: null,
};

export const http: AxiosInstance = axios.create({
  baseURL: config.baseUrl,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  timeout: 30_000,
});

// ─── Request interceptor: inject token ──────────────────────────────────────
http.interceptors.request.use(async (req: InternalAxiosRequestConfig) => {
  // If token expired or missing, try to get a new one
  if (shouldRefresh()) {
    await authenticate();
  }
  if (store.accessToken) {
    req.headers["Authorization"] = `Bearer ${store.accessToken}`;
  }
  return req;
});

// ─── Response interceptor: retry once on 401 ────────────────────────────────
http.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      store.accessToken = null; // force re-auth
      await authenticate();
      if (store.accessToken) {
        original.headers["Authorization"] = `Bearer ${store.accessToken}`;
        return http(original);
      }
    }
    return Promise.reject(err);
  }
);

function shouldRefresh(): boolean {
  if (!store.accessToken) return true;
  if (!store.expiration) return false;
  // refresh if less than 5 min remaining
  return new Date(store.expiration).getTime() - Date.now() < 5 * 60 * 1000;
}

export async function authenticate(): Promise<void> {
  // Option 1: long-lived token already in env — no refresh needed
  if (config.token && !store.expiration) {
    store.accessToken = config.token;
    return;
  }

  // Option 2: use refreshToken if available
  if (store.refreshToken) {
    try {
      const res = await axios.post(`${config.baseUrl}/Conta/RefreshToken`, {
        refreshToken: store.refreshToken,
      });
      applyTokenResponse(res.data);
      return;
    } catch {
      store.refreshToken = null;
    }
  }

  // Option 3: login with email/password
  if (config.email && config.senha) {
    const res = await axios.post(`${config.baseUrl}/Conta/Login`, {
      email: config.email,
      senha: config.senha,
    });
    applyTokenResponse(res.data);
    return;
  }

  throw new Error(
    "Não foi possível autenticar: defina GRONER_TOKEN ou GRONER_EMAIL + GRONER_SENHA no .env"
  );
}

function applyTokenResponse(data: {
  accessToken: string;
  refreshToken?: string;
  expiration?: string;
}): void {
  store.accessToken = data.accessToken;
  store.refreshToken = data.refreshToken ?? null;
  store.expiration = data.expiration ?? null;
}

/** Gera token de longa duração (500 dias) e salva no store. */
export async function gerarToken(email: string, senha: string): Promise<string> {
  const res = await axios.post(`${config.baseUrl}/Conta/GerarToken`, {
    email,
    senha,
  });
  const token: string = res.data.accessToken ?? res.data.token ?? res.data;
  store.accessToken = token;
  return token;
}
