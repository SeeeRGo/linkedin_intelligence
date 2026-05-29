import type { AppConfig } from "../config.js";
import { failedTranslation, translateToRussianRecord } from "./openai.js";
import type { TaskConfigRecord } from "./types.js";

type TransliterationTarget = {
  canonical_id: string;
  content_type: "post" | "comment";
  text: string;
};

export type TranslatedContent<T extends TransliterationTarget> = T & {
  translated_text?: string;
};

const translationOptions = (appConfig: AppConfig, taskConfig: TaskConfigRecord) => ({
  apiKey: appConfig.openaiApiKey,
  model: taskConfig.openaiModel || appConfig.openaiScoringModel
});

export const translateContentToRussian = async <T extends TransliterationTarget>(
  record: T,
  appConfig: AppConfig,
  taskConfig: TaskConfigRecord
): Promise<TranslatedContent<T>> => {
  const text = record.text.trim();
  if (!text) {
    return { ...record, translated_text: "" };
  }

  try {
    return {
      ...record,
      translated_text: (await translateToRussianRecord(record, translationOptions(appConfig, taskConfig))).translated_text
    };
  } catch (error) {
    return {
      ...record,
      translated_text: failedTranslation(text).translated_text
    };
  }
};

export const translateBatchToRussian = async <T extends TransliterationTarget>(
  records: T[],
  appConfig: AppConfig,
  taskConfig: TaskConfigRecord
): Promise<TranslatedContent<T>[]> => {
  const cache = new Map<string, string>();
  const translated: TranslatedContent<T>[] = [];

  for (const record of records) {
    const text = record.text.trim();
    if (!text) {
      translated.push({ ...record, translated_text: "" });
      continue;
    }

    const cached = cache.get(text);
    if (cached !== undefined) {
      translated.push({ ...record, translated_text: cached });
      continue;
    }

    const result = await translateContentToRussian(record, appConfig, taskConfig);
    cache.set(text, result.translated_text || text);
    translated.push(result);
  }

  return translated;
};
