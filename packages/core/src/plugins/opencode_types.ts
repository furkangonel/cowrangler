/**
 * Type definitions for Opencode-compatible plugins.
 * These types match the @opencode-ai/plugin interface for compatibility.
 */

export interface TokenExchangeResult {
  type: "success" | "failed";
  refresh?: string;
  access?: string;
  expires?: number;
  email?: string;
  projectId?: string;
  error?: string;
}

export interface OAuthAuthDetails {
  type: "oauth";
  refresh: string;
  access?: string;
  expires?: number;
}

export interface ApiKeyAuthDetails {
  type: "api_key";
  key: string;
}

export interface NonOAuthAuthDetails {
  type: string;
  [key: string]: unknown;
}

export type AuthDetails = OAuthAuthDetails | ApiKeyAuthDetails | NonOAuthAuthDetails;

export type GetAuth = () => Promise<AuthDetails>;

export interface ProviderModel {
  cost?: {
    input: number;
    output: number;
  };
  [key: string]: unknown;
}

export interface Provider {
  models?: Record<string, ProviderModel>;
}

export interface LoaderResult {
  apiKey: string;
  fetch(input: RequestInfo, init?: RequestInit): Promise<Response>;
}

export type AuthPrompt =
  | {
      type: "text";
      key: string;
      message: string;
      placeholder?: string;
      validate?: (value: string) => string | undefined;
      condition?: (inputs: Record<string, string>) => boolean;
    }
  | {
      type: "select";
      key: string;
      message: string;
      options: Array<{ label: string; value: string; hint?: string }>;
      condition?: (inputs: Record<string, string>) => boolean;
    };

export type OAuthAuthorizationResult = { url: string; instructions: string } & (
  | {
      method: "auto";
      callback: () => Promise<TokenExchangeResult>;
    }
  | {
      method: "code";
      callback: (code: string) => Promise<TokenExchangeResult>;
    }
);

export interface AuthMethod {
  provider?: string;
  label: string;
  type: "oauth" | "api";
  prompts?: AuthPrompt[];
  authorize?: (inputs?: Record<string, string>) => Promise<OAuthAuthorizationResult>;
}

export interface PluginEventPayload {
  event: {
    type: string;
    properties?: unknown;
  };
}

export interface PluginResult {
  auth?: {
    provider: string;
    loader?: (getAuth: GetAuth, provider: Provider) => Promise<LoaderResult | Record<string, unknown>>;
    methods: AuthMethod[];
  };
  event?: (payload: PluginEventPayload) => void;
  tool?: Record<string, unknown>;
}
