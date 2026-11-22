import { apiClient } from "./client";
import type {
  DocumentsConfig,
  PreparerProof,
  ProofKind,
  ProofQueue,
  TaskDocument,
  TaskDocumentList,
  UploadStart,
} from "@/lib/types";

export function getDocumentsConfig(): Promise<DocumentsConfig> {
  return apiClient.get("/documents/config");
}

export interface FileMetaRequest {
  file_name: string;
  content_type: string;
  size_bytes: number;
}

// ─── Files on a task ─────────────────────────────────────

export function listTaskDocuments(taskId: string): Promise<TaskDocumentList> {
  return apiClient.get(`/tasks/${taskId}/documents`);
}

export function startTaskUpload(taskId: string, meta: FileMetaRequest): Promise<UploadStart & { document_id: string }> {
  return apiClient.post(`/tasks/${taskId}/documents`, meta);
}

export function completeTaskUpload(taskId: string, documentId: string): Promise<TaskDocument> {
  return apiClient.post(`/tasks/${taskId}/documents/${documentId}/complete`);
}

export function deleteTaskDocument(taskId: string, documentId: string): Promise<void> {
  return apiClient.delete(`/tasks/${taskId}/documents/${documentId}`);
}

export function downloadTaskDocument(taskId: string, documentId: string): Promise<Blob> {
  return apiClient.file(`/tasks/${taskId}/documents/${documentId}`);
}

// ─── Proof documents ─────────────────────────────────────

export function listMyProofs(): Promise<PreparerProof[]> {
  return apiClient.get("/users/me/preparer-proofs");
}

export function startProofUpload(
  kind: ProofKind,
  meta: FileMetaRequest,
): Promise<UploadStart & { proof_id: string }> {
  return apiClient.post("/users/me/preparer-proofs", { kind, ...meta });
}

export function completeProofUpload(proofId: string): Promise<PreparerProof> {
  return apiClient.post(`/users/me/preparer-proofs/${proofId}/complete`);
}

export function withdrawProof(proofId: string): Promise<void> {
  return apiClient.delete(`/users/me/preparer-proofs/${proofId}`);
}

export function downloadMyProof(proofId: string): Promise<Blob> {
  return apiClient.file(`/users/me/preparer-proofs/${proofId}`);
}

export function getProofQueue(): Promise<ProofQueue> {
  return apiClient.get("/admin/preparer-proofs");
}

export function openProofAsAdmin(proofId: string): Promise<Blob> {
  return apiClient.file(`/admin/preparer-proofs/${proofId}/file`);
}

export function rejectProof(proofId: string, note: string): Promise<PreparerProof> {
  return apiClient.post(`/admin/preparer-proofs/${proofId}/reject`, { note });
}
