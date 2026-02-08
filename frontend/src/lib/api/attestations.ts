import { apiClient } from "./client";
import type { Attestation } from "@/lib/types";

export function listAttestations(): Promise<Attestation[]> {
  return apiClient.get("/attestations");
}

export function confirmAttestation(id: string): Promise<Attestation> {
  return apiClient.post(`/attestations/${id}/confirm`);
}

export function revokeAttestation(id: string): Promise<Attestation> {
  return apiClient.post(`/attestations/${id}/revoke`);
}
