import {
  buildMessages,
  translationSchema
} from "./prompt.js";

import {
  validateTranslationResponse
} from "./response-validator.js";


const GROQ_API_URL =
  "https://api.groq.com/openai/v1/chat/completions";


export class GroqApiError extends Error {
  constructor(
    message,
    status,
    retryAfterMs = 0,
    details = null
  ) {
    super(message);

    this.name = "GroqApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.details = details;
  }
}


export async function requestGroqTranslation({
  apiKey,
  model,
  input
}) {
  let response;

  try {
    response = await fetch(GROQ_API_URL, {
      method: "POST",

      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        model,

        messages:
          buildMessages(input),

        temperature: 0.1,

        reasoning_effort: "low",

        include_reasoning: false,

        max_completion_tokens: 512,

        response_format: {
          type: "json_schema",

          json_schema: {
            name: "subtitle_translation",
            strict: true,
            schema: translationSchema
          }
        }
      }),

      signal:
        AbortSignal.timeout(30000)
    });

  } catch (error) {
    if (
      error.name === "TimeoutError" ||
      error.name === "AbortError"
    ) {
      throw new GroqApiError(
        "Groq isteği zaman aşımına uğradı.",
        503
      );
    }

    throw new GroqApiError(
      "Groq sunucusuna bağlanılamadı.",
      503
    );
  }

  const responseData =
    await readResponseData(response);

  if (!response.ok) {
    console.error(
      "Groq hata ayrıntısı:",
      JSON.stringify(responseData, null, 2)
    );

    throw new GroqApiError(
      responseData?.error?.message ||
      `Groq API hatası: ${response.status}`,

      response.status,

      getRetryAfterMilliseconds(response),

      responseData?.error?.failed_generation ||
      null
    );
  }

  const content =
    responseData?.choices?.[0]
      ?.message?.content;

  if (!content) {
    throw new GroqApiError(
      "Model boş cevap döndürdü.",
      422
    );
  }

  let parsedContent;

  try {
    parsedContent =
      JSON.parse(content);
  } catch {
    throw new GroqApiError(
      "Model geçerli JSON döndürmedi.",
      422
    );
  }

  try {
    return validateTranslationResponse(
      parsedContent
    );
  } catch (error) {
    throw new GroqApiError(
      error.message,
      422
    );
  }
}


async function readResponseData(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}


function getRetryAfterMilliseconds(response) {
  const value =
    response.headers.get("retry-after");

  const seconds =
    Number(value);

  return Number.isFinite(seconds)
    ? seconds * 1000
    : 0;
}