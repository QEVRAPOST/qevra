import type { NetworkId } from "@/types";
import type { WalletAuthChallenge } from "@/features/security/client";

export interface AuthCapabilities {
  wallet: boolean;
  password: boolean;
  google: boolean;
  email: boolean;
  database: boolean;
  embeddedWallet: boolean;
}

export interface AuthIdentityView {
  provider: "wallet" | "google" | "email" | "password";
  email?: string;
  walletAddress?: `0x${string}`;
  expiresAt: string;
}

export interface AuthCurrentSession {
  authenticated: boolean;
  expired?: boolean;
  identity?: AuthIdentityView;
  operatorAuthenticated?: boolean;
  walletSession?: { authenticated: boolean; address?: `0x${string}`; expiresAt?: string };
}

export interface WalletLinkChallenge extends WalletAuthChallenge {
  address: `0x${string}`;
  chainId: number;
}

export interface AuthAccountProfile {
  userId: string;
  email?: string;
  emailVerified: boolean;
  createdAt: string;
}

export type BuiltInWalletStatus =
  | { status: "blocked"; reason: "provider_not_integrated" | "recovery_not_verified"; wallet?: undefined }
  | { status: "active"; reason?: undefined; wallet: { provider: "privy"; address: `0x${string}`; createdAt: string } };

export interface AuthContract {
  capabilities: () => Promise<AuthCapabilities>;
  current: () => Promise<AuthCurrentSession>;
  register: (input: { email: string; password: string }) => Promise<AuthCurrentSession>;
  login: (input: { email: string; password: string }) => Promise<AuthCurrentSession>;
  profile: () => Promise<AuthAccountProfile>;
  requestWalletChallenge: (input: { networkId: NetworkId; address: string }) => Promise<WalletAuthChallenge>;
  walletLogin: (input: { address: string; nonce: string; signature: string }) => Promise<AuthCurrentSession>;
  logout: () => Promise<void>;
  builtInWalletStatus: () => Promise<BuiltInWalletStatus>;
  provisionBuiltInWallet: (consent: true) => Promise<BuiltInWalletStatus>;
  createWalletLinkChallenge: (input: { networkId: NetworkId; address: string }) => Promise<WalletLinkChallenge>;
  verifyWalletLink: (input: { nonce: string; signature: string }) => Promise<{ linked: true; address: `0x${string}`; chainId: number }>;
}
