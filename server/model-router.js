import {
  requestGroqTranslation
} from "./groq-service.js";


const models = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b"
];


const cooldowns = new Map();

const fallbackStatuses = [
  404,
  429,
  498,
  500,
  502,
  503
];


export async function translateWithFallback(
  input,
  apiKey
) {
  const attemptedModels = [];
  const skippedModels = [];
  const fallbackReasons = [];

  for (const model of models) {
    const cooldownUntil =
      cooldowns.get(model) || 0;

    if (Date.now() < cooldownUntil) {
      skippedModels.push(model);
      continue;
    }

    attemptedModels.push(model);

    try {
      const result =
        await requestGroqTranslation({
          apiKey,
          model,
          input
        });

      return {
        ...result,

        meta: {
          modelUsed: model,
          attemptedModels,
          skippedModels,
          fallbackReasons
        }
      };

    } catch (error) {
      if (
        error.status === 401 ||
        error.status === 403
      ) {
        throw error;
      }

      if (
        !fallbackStatuses.includes(
          error.status
        )
      ) {
        throw error;
      }

      cooldowns.set(
        model,
        Date.now() +
          calculateCooldown(error)
      );

      fallbackReasons.push({
        model,
        status: error.status,
        message: error.message
      });
    }
  }

  const error =
    new Error(
      "Şu anda kullanılabilir Groq modeli bulunamadı."
    );

  error.status = 503;

  error.details = {
    attemptedModels,
    skippedModels,
    fallbackReasons
  };

  throw error;
}


function calculateCooldown(error) {
  if (error.retryAfterMs > 0) {
    return error.retryAfterMs;
  }

  if (error.status === 404) {
    return 24 * 60 * 60 * 1000;
  }

  if (error.status === 429) {
    return 60 * 1000;
  }

  return 15 * 1000;
}