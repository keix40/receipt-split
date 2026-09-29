"use client";

import { useEffect, useRef } from "react";

/** Persists group id in rs_groups via a route handler (never during RSC render). */
export function GroupRememberClient({ groupId }: { groupId: string }) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    void fetch(`/api/groups/${groupId}/remember`, { method: "POST" });
  }, [groupId]);
  return null;
}
