"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Legacy route — redirects to Integration Marketplace */
export default function ConnectorsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/marketplace");
  }, [router]);
  return (
    <div className="text-slate-400 text-sm py-12 text-center">
      Redirecting to Marketplace…
    </div>
  );
}
