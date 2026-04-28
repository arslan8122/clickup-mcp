export interface ExtensionConfig {
  apiKey: string;
  teamId: string;
}

const KEY = "clickup-daily-update";

export async function loadConfig(): Promise<Partial<ExtensionConfig>> {
  const data = await chrome.storage.local.get(KEY);
  return (data[KEY] as Partial<ExtensionConfig>) || {};
}

export async function saveConfig(cfg: ExtensionConfig): Promise<void> {
  await chrome.storage.local.set({ [KEY]: cfg });
}
