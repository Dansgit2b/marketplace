"use client";
import { useQuery } from "@tanstack/react-query";
import { marketplaceRequest } from "./api-client";
import type { ApiCollection } from "./types";
export function useOwnedCollections() {
  return useQuery({
    queryKey: ["owned", "collections"],
    queryFn: () => marketplaceRequest<ApiCollection[]>("/collections"),
  });
}
