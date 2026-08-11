import { req } from "./client";

export const VaultAPI = {
  status: () => req("/vault/status"),
};
