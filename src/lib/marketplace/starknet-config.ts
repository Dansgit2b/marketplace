import { ControllerConnector } from "@cartridge/connector";
import { mainnet, sepolia } from "@starknet-react/chains";
import { braavos, cartridge, jsonRpcProvider, ready } from "@starknet-react/core";
import type { MarketplaceRuntimeConfig } from "@/lib/marketplace/config";

type MarketplaceChainLabel = MarketplaceRuntimeConfig["chainLabel"];



let _controllerConnector: ControllerConnector | null = null;
function getControllerConnector() {
  if (!_controllerConnector) {
    _controllerConnector = new ControllerConnector();
  }
  return _controllerConnector;
}

export function buildStarknetConfig(chainLabel: MarketplaceChainLabel) {
  return {
    chains: [mainnet, sepolia],
    provider: jsonRpcProvider({
      rpc: () => ({
        nodeUrl: process.env.NEXT_PUBLIC_STARKNET_RPC_URL ?? (typeof window !== "undefined" ? `${window.location.origin}/api/marketplace/rpc` : `${process.env.MARKETPLACE_API_URL ?? "http://127.0.0.1:3100"}/rpc`),
      }),
    }),
    explorer: cartridge,
    connectors: [getControllerConnector(), ready(), braavos()],
    defaultChainId:
      chainLabel === "SN_MAIN"
        ? mainnet.id
        : (chainLabel === "SN_SEPOLIA" || chainLabel === "LOCAL")
          ? sepolia.id
          : undefined,
  };
}
