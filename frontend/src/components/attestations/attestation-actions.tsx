"use client";

import { useState } from "react";
import { confirmAttestation, revokeAttestation } from "@/lib/api/attestations";
import type { ApiError } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

interface AttestationActionsProps {
  attestationId: string;
  status: string;
  onUpdate?: () => void;
}

export function AttestationActions({
  attestationId,
  status,
  onUpdate,
}: AttestationActionsProps) {
  const [loading, setLoading] = useState(false);
  const { addToast } = useToast();

  async function handleConfirm() {
    setLoading(true);
    try {
      await confirmAttestation(attestationId);
      addToast("Attestation confirmed", "success");
      onUpdate?.();
    } catch (err) {
      const apiError = err as ApiError;
      addToast(apiError.error ?? "Failed to confirm attestation", "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleRevoke() {
    setLoading(true);
    try {
      await revokeAttestation(attestationId);
      addToast("Attestation revoked", "success");
      onUpdate?.();
    } catch (err) {
      const apiError = err as ApiError;
      addToast(apiError.error ?? "Failed to revoke attestation", "error");
    } finally {
      setLoading(false);
    }
  }

  if (status === "pending") {
    return (
      <Button variant="primary" size="sm" loading={loading} onClick={handleConfirm}>
        Confirm
      </Button>
    );
  }

  if (status === "confirmed") {
    return (
      <Button variant="danger" size="sm" loading={loading} onClick={handleRevoke}>
        Revoke
      </Button>
    );
  }

  return null;
}
