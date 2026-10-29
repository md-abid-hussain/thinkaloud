"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { post } from "@/lib/client/useRun";

export default function MarkSeen({ conceptId, slug }: { conceptId: string; slug: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await post(`/api/concepts/${conceptId}/seen`, { slug }).catch(() => {});
        router.refresh();
      }}
    >
      Mark as read
    </button>
  );
}
  