"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readApiErrorMessage } from "@/lib/api/read-error-response";

export function CreateGroupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/groups", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), currency: "USD" }),
      });
      if (!res.ok) throw new Error(await readApiErrorMessage(res));
      const json = (await res.json()) as { id: string };
      router.push(`/groups/${json.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create group");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex max-w-md flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Group name
        <input
          required
          className="rounded-lg border px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-fit rounded-lg bg-stone-900 px-5 py-3 text-white disabled:opacity-50 dark:bg-white dark:text-stone-900"
      >
        {busy ? "Creating…" : "Create group"}
      </button>
    </form>
  );
}
