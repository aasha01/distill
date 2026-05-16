import { useState, useEffect, useCallback } from "react";
import Modal from "@cloudscape-design/components/modal";
import Box from "@cloudscape-design/components/box";
import Button from "@cloudscape-design/components/button";
import FormField from "@cloudscape-design/components/form-field";
import Select from "@cloudscape-design/components/select";
import SpaceBetween from "@cloudscape-design/components/space-between";
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import Alert from "@cloudscape-design/components/alert";
import {
  getLLMConfig, patchLLMConfig, listModels,
  PROVIDERS, PROVIDER_LABELS,
} from "../../api/llmConfig";
import type { LLMConfig, Provider } from "../../api/llmConfig";

interface Props {
  visible: boolean;
  onClose: () => void;
}

type ModelFetchState = "idle" | "loading" | "ok" | "error" | "empty";

const LOCAL_PROVIDERS: Provider[] = ["ollama", "lmstudio"];

export default function ModelSettingsModal({ visible, onClose }: Props) {
  const [current, setCurrent] = useState<LLMConfig | null>(null);
  const [provider, setProvider] = useState<Provider>("ollama");
  const [model, setModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchState, setFetchState] = useState<ModelFetchState>("idle");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchModels = useCallback(async (p: Provider) => {
    setFetchState("loading");
    setAvailableModels([]);
    try {
      const models = await listModels(p);
      if (models.length === 0) {
        setFetchState("empty");
      } else {
        setAvailableModels(models);
        setFetchState("ok");
      }
    } catch {
      setFetchState("error");
    }
  }, []);

  // Load current config when modal opens
  useEffect(() => {
    if (!visible) return;
    setSaveStatus(null);
    getLLMConfig()
      .then((cfg) => {
        setCurrent(cfg);
        setProvider(cfg.provider as Provider);
        setModel(cfg.model);
      })
      .catch(() => setSaveStatus({ type: "error", msg: "Could not reach backend." }));
  }, [visible]);

  // Fetch models whenever provider changes
  useEffect(() => {
    if (!visible) return;
    setModel("");
    fetchModels(provider);
  }, [provider, visible, fetchModels]);

  const handleApply = async () => {
    setSaving(true);
    setSaveStatus(null);
    try {
      const updated = await patchLLMConfig({ provider, model });
      setCurrent(updated);
      setSaveStatus({ type: "success", msg: `Switched to ${updated.provider} / ${updated.model}` });
    } catch {
      setSaveStatus({ type: "error", msg: "Failed to apply — check backend logs." });
    } finally {
      setSaving(false);
    }
  };

  const providerOptions = PROVIDERS.map((p) => ({ value: p, label: PROVIDER_LABELS[p] }));
  const modelOptions = availableModels.map((m) => ({ value: m, label: m }));
  const unchanged = current?.provider === provider && current?.model === model;
  const isLocal = LOCAL_PROVIDERS.includes(provider);

  const modelDescription = () => {
    if (fetchState === "loading") return "Fetching models from your local server...";
    if (fetchState === "ok") return `${availableModels.length} model${availableModels.length !== 1 ? "s" : ""} found`;
    if (fetchState === "error") return "Could not reach the local server";
    if (fetchState === "empty") return "No models found";
    return "Select a model";
  };

  return (
    <Modal
      visible={visible}
      onDismiss={onClose}
      header="Model Settings"
      size="medium"
      footer={
        <Box float="right">
          <SpaceBetween direction="horizontal" size="xs">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={handleApply}
              loading={saving}
              disabled={saving || !model || unchanged || fetchState === "loading"}
            >
              Apply
            </Button>
          </SpaceBetween>
        </Box>
      }
    >
      <SpaceBetween size="l">

        {saveStatus && (
          <StatusIndicator type={saveStatus.type === "success" ? "success" : "error"}>
            {saveStatus.msg}
          </StatusIndicator>
        )}

        <FormField label="Provider">
          <Select
            selectedOption={providerOptions.find((o) => o.value === provider) ?? null}
            onChange={({ detail }) => setProvider(detail.selectedOption.value as Provider)}
            options={providerOptions}
          />
        </FormField>

        <FormField label="Model" description={modelDescription()}>
          {/* Local providers: always show dropdown with fetched models */}
          {isLocal && (fetchState === "loading" || fetchState === "ok") && (
            <Select
              selectedOption={modelOptions.find((o) => o.value === model) ?? null}
              onChange={({ detail }) => setModel(detail.selectedOption.value)}
              options={modelOptions}
              placeholder="Select a model"
              loadingText="Fetching models..."
              statusType={fetchState === "loading" ? "loading" : "finished"}
              disabled={fetchState === "loading"}
            />
          )}

          {/* Local provider but server unreachable or no models */}
          {isLocal && (fetchState === "error" || fetchState === "empty") && (
            <SpaceBetween size="xs">
              <Alert
                type={fetchState === "error" ? "error" : "warning"}
                action={
                  <Button iconName="refresh" onClick={() => fetchModels(provider)}>
                    Retry
                  </Button>
                }
              >
                {fetchState === "error"
                  ? provider === "lmstudio"
                    ? "LM Studio is not running or the server is not started. Open LM Studio → click the ⚡ Start Server button, then retry."
                    : "Ollama is not running. Start it with: ollama serve"
                  : provider === "lmstudio"
                  ? "No model is loaded in LM Studio. Open LM Studio → select a model → click Load, then retry."
                  : "No models downloaded in Ollama. Run: ollama pull <model-name>"}
              </Alert>
            </SpaceBetween>
          )}

          {/* Cloud providers: static dropdown */}
          {!isLocal && (
            <Select
              selectedOption={modelOptions.find((o) => o.value === model) ?? null}
              onChange={({ detail }) => setModel(detail.selectedOption.value)}
              options={modelOptions}
              placeholder="Select a model"
              statusType={fetchState === "loading" ? "loading" : "finished"}
            />
          )}
        </FormField>

        {current && (
          <Box color="text-body-secondary" fontSize="body-s">
            Active: <strong>{current.provider}</strong> / <strong>{current.model}</strong>
          </Box>
        )}

      </SpaceBetween>
    </Modal>
  );
}
