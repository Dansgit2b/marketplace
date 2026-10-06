"use client";
import { useState } from "react";
import { useMarketConfig } from "@/lib/marketplace/react";
import { getMarketplaceRuntimeConfig } from "@/lib/marketplace/config";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
type Report = {
  id: string;
  account: string;
  status: string;
  body: { collection: string; tokenId?: string; reason: string };
};
export function OpsStatusPanel() {
  const query = useMarketConfig();
  const [key, setKey] = useState(""),
    [reports, setReports] = useState<Report[]>([]),
    [message, setMessage] = useState("");
  const status = query.data?.status;
  const [collection, setCollection] = useState(""),
    [reason, setReason] = useState("");
  async function change(body: Record<string, unknown>) {
    try {
      await operator("collections", { address: collection, ...body });
      setMessage("Collection policy updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Update failed.");
    }
  }
  async function operator(path: string, body?: unknown) {
    const chain = getMarketplaceRuntimeConfig().chainLabel;
    const response = await fetch(
      `/api/marketplace/v1/chains/${chain}/operator/${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${key}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      },
    );
    const json = await response.json();
    if (!response.ok)
      throw new Error(json.error?.message ?? "Operator request failed.");
    return json.data;
  }
  async function load() {
    try {
      setReports(await operator("reports"));
      setMessage("Reports loaded.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed.");
    }
  }
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Market status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={status?.safeForCheckout ? "default" : "outline"}>
            {query.data?.demo
              ? "Demo"
              : status?.safeForCheckout
                ? "Ready for trading"
                : "Trading disabled"}
          </Badge>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt>Chain</dt>
            <dd>{query.data?.chain ?? "Unknown"}</dd>
            <dt>Indexed block</dt>
            <dd>{status?.indexedBlock ?? "Unknown"}</dd>
            <dt>Chain head</dt>
            <dd>{status?.chainHead ?? "Unknown"}</dd>
            <dt>Lag</dt>
            <dd>{status?.lagBlocks ?? "Unknown"}</dd>
          </dl>
          <p className="text-sm text-muted-foreground">
            {status?.reasons.join(" · ")}
          </p>
          {query.error && <p role="alert">{query.error.message}</p>}
          <Button variant="outline" onClick={() => void query.refetch()}>
            Refresh status
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Operator reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            type="password"
            aria-label="Operator access token"
            placeholder="Operator access token"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoComplete="off"
          />
          <Button disabled={!key} onClick={() => void load()}>
            Load reports
          </Button>
          <p role="status" className="text-sm">
            {message}
          </p>
          <div className="space-y-2 rounded border p-3">
            <h3 className="font-medium">Registered collection controls</h3>
            <Input
              aria-label="Collection contract"
              placeholder="Collection contract address"
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
            />
            <Input
              aria-label="Moderation reason"
              placeholder="Reason for content decision"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!key || !collection}
                onClick={() => void change({ verified: true })}
              >
                Mark verified
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!key || !collection}
                onClick={() => void change({ verified: false })}
              >
                Remove verification
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={!key || !collection || !reason}
                onClick={() => void change({ hidden: true, reason })}
              >
                Restrict content
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!key || !collection}
                onClick={() => void change({ hidden: false, reason })}
              >
                Restore content
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!key || !collection}
                onClick={() =>
                  void operator("metadata", { collection })
                    .then(() => setMessage("Metadata refresh queued."))
                    .catch((e) => setMessage(e.message))
                }
              >
                Refresh metadata
              </Button>
            </div>
          </div>
          {reports.map((r) => (
            <div key={r.id} className="space-y-2 rounded border p-3 text-sm">
              <p>{r.body.reason}</p>
              <p className="break-all text-xs text-muted-foreground">
                {r.body.collection} · {r.status}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void operator("reports", { id: r.id, status: "resolved" })
                      .then(load)
                      .catch((e) => setMessage(e.message))
                  }
                >
                  Resolve
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() =>
                    void operator("collections", {
                      address: r.body.collection,
                      hidden: true,
                      reason: r.body.reason,
                    })
                      .then(() =>
                        setMessage("Collection hidden pending review."),
                      )
                      .catch((e) => setMessage(e.message))
                  }
                >
                  Hide collection
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
