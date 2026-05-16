import { apiClient } from "../config/api";
import type { AnalyzeResult, SummaryData, ConceptMap } from "../types";

export interface AnalyzePayload {
  transcript: string;
  student_name: string;
  session_label?: string;
}

export interface ProgressEvent {
  stage: string;
  message: string;
  detail?: string;
  chunk?: number;
  total_chunks?: number;
}

export interface SummaryReadyEvent {
  session_id: string;
  summary: SummaryData;
  concept_map: ConceptMap;
}

export async function analyzeTranscript(payload: AnalyzePayload): Promise<AnalyzeResult> {
  const { data } = await apiClient.post<AnalyzeResult>("/api/analyze", payload);
  return data;
}

/**
 * Streams progress events from /api/analyze/stream using fetch + ReadableStream.
 * - onProgress: called for each stage progress event
 * - onSummaryReady: called as soon as summary + concept map are ready (before questions)
 * - resolves with the final AnalyzeResult (including questions) when stream ends
 */
export async function analyzeTranscriptStream(
  payload: AnalyzePayload,
  onProgress: (event: ProgressEvent) => void,
  onSummaryReady: (event: SummaryReadyEvent) => void,
): Promise<AnalyzeResult> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:8000";
  const response = await fetch(`${baseUrl}/api/analyze/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Server error ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      for (const line of part.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const raw = JSON.parse(line.slice(6)) as ProgressEvent & {
          result?: AnalyzeResult;
          session_id?: string;
          summary?: SummaryData;
          concept_map?: ConceptMap;
        };
        if (raw.stage === "summary_ready" && raw.session_id && raw.summary && raw.concept_map) {
          onSummaryReady({ session_id: raw.session_id, summary: raw.summary, concept_map: raw.concept_map });
          continue;
        }
        if (raw.stage === "done" && raw.result) return raw.result;
        if (raw.stage === "error") throw new Error(raw.message);
        onProgress(raw);
      }
    }
  }

  throw new Error("Stream ended without a result.");
}
