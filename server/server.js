import "dotenv/config";

import express from "express";
import path from "node:path";

import {
  fileURLToPath
} from "node:url";

import {
  translateWithFallback
} from "./model-router.js";


const app = express();

const port =
  Number(process.env.PORT) || 3000;

const apiKey =
  process.env.GROQ_API_KEY;

const currentFile =
  fileURLToPath(import.meta.url);

const currentDirectory =
  path.dirname(currentFile);

const clientDirectory =
  path.join(
    currentDirectory,
    "../client"
  );


const limits = {
  perMinute: readPositiveInteger(
    "RATE_LIMIT_PER_MINUTE",
    20
  ),

  perDay: readPositiveInteger(
    "RATE_LIMIT_PER_DAY",
    500
  ),

  globalPerDay: readPositiveInteger(
    "GLOBAL_RATE_LIMIT_PER_DAY",
    900
  ),

  cacheMaximum: readPositiveInteger(
    "CACHE_MAXIMUM",
    5000
  ),

  cacheLifetime: readPositiveInteger(
    "CACHE_LIFETIME_MS",
    86400000
  )
};


const translationCache =
  new Map();

const clientUsage =
  new Map();

const globalUsage = {
  day: getCurrentDay(),
  count: 0
};


if (!apiKey) {
  console.error(
    "GROQ_API_KEY .env dosyasında bulunamadı."
  );

  process.exit(1);
}


app.disable("x-powered-by");


if (
  process.env.TRUST_PROXY === "true"
) {
  app.set("trust proxy", 1);
}


app.use(
  express.json({
    limit: "5kb"
  })
);


app.use(
  express.static(clientDirectory)
);


app.get(
  "/api/health",
  (request, response) => {
    response.json({
      status: "ok",
      service: "ZoonLogos API"
    });
  }
);


app.post(
  "/api/translate",
  async (request, response) => {
    try {
      const input =
        validateInput(request.body);

      const cacheKey =
        createCacheKey(input);

      const cachedResult =
        getCachedTranslation(cacheKey);

      if (cachedResult) {
        response.json({
          ...cachedResult,

          meta: {
            ...cachedResult.meta,
            cacheHit: true
          }
        });

        return;
      }


      const quota =
        consumeTranslationQuota(request);

      response.setHeader(
        "X-RateLimit-Limit",
        String(limits.perDay)
      );

      response.setHeader(
        "X-RateLimit-Remaining",
        String(quota.remainingDaily)
      );


      const result =
        await translateWithFallback(
          input,
          apiKey
        );


      const resultWithMetadata = {
        ...result,

        meta: {
          ...result.meta,
          cacheHit: false
        }
      };


      saveTranslationToCache(
        cacheKey,
        resultWithMetadata
      );


      response.json(
        resultWithMetadata
      );

    } catch (error) {
      console.error(
        "ZoonLogos API hatası:",
        error
      );

      const status =
        Number.isInteger(error.status)
          ? error.status
          : 500;

      if (error.retryAfterSeconds) {
        response.setHeader(
          "Retry-After",
          String(error.retryAfterSeconds)
        );
      }

      response.status(status).json({
        error:
          error.message ||
          "Çeviri sırasında hata oluştu.",

        details:
          error.details || null
      });
    }
  }
);


app.use(
  (error, request, response, next) => {
    if (
      error instanceof SyntaxError &&
      error.status === 400
    ) {
      response.status(400).json({
        error:
          "Gönderilen JSON geçerli değil."
      });

      return;
    }

    next(error);
  }
);


app.listen(
  port,
  () => {
    console.log(
      `ZoonLogos çalışıyor: http://localhost:${port}`
    );

    console.log(
      `Dakikalık sınır: ${limits.perMinute}`
    );

    console.log(
      `Kullanıcı günlük sınırı: ${limits.perDay}`
    );

    console.log(
      `Genel günlük sınır: ${limits.globalPerDay}`
    );
  }
);


function validateInput(body) {
  const sourceLanguage =
    String(
      body?.sourceLanguage || ""
    ).trim();

  const targetLanguage =
    String(
      body?.targetLanguage || ""
    ).trim();

  const currentSubtitle =
    String(
      body?.currentSubtitle || ""
    )
      .replace(/\s+/g, " ")
      .trim();

  const selectedText =
    String(
      body?.selectedText || ""
    )
      .replace(/\s+/g, " ")
      .trim();


  if (
    sourceLanguage !== "en" ||
    targetLanguage !== "tr"
  ) {
    throw createInputError(
      "Yalnızca İngilizceden Türkçeye çeviri destekleniyor."
    );
  }


  if (!currentSubtitle) {
    throw createInputError(
      "Çevrilecek cümle boş olamaz."
    );
  }


  if (!selectedText) {
    throw createInputError(
      "Çevrilecek kelime boş olamaz."
    );
  }


  if (currentSubtitle.length > 500) {
    throw createInputError(
      "Altyazı en fazla 500 karakter olabilir."
    );
  }


  if (selectedText.length > 80) {
    throw createInputError(
      "Seçilen ifade en fazla 80 karakter olabilir."
    );
  }


  if (
    !/^[A-Za-z]+(?:['’\-][A-Za-z]+)*$/.test(
      selectedText
    )
  ) {
    throw createInputError(
      "Seçilen metin geçerli bir İngilizce kelime olmalıdır."
    );
  }


  return {
    sourceLanguage,
    targetLanguage,
    currentSubtitle,
    selectedText:
      selectedText.replace(/’/g, "'")
  };
}


function consumeTranslationQuota(
  request
) {
  const now = Date.now();

  const currentDay =
    getCurrentDay();

  resetGlobalUsageIfNecessary(
    currentDay
  );


  if (
    globalUsage.count >=
    limits.globalPerDay
  ) {
    throw createRateLimitError(
      "ZoonLogos günlük genel kullanım sınırına ulaştı. Lütfen yarın tekrar deneyin.",
      secondsUntilNextDay()
    );
  }


  const clientIdentifier =
    request.ip || "unknown-client";

  let usage =
    clientUsage.get(
      clientIdentifier
    );


  if (!usage) {
    usage = {
      minuteStartedAt: now,
      minuteCount: 0,
      day: currentDay,
      dayCount: 0,
      lastUsedAt: now
    };
  }


  if (
    now - usage.minuteStartedAt >=
    60000
  ) {
    usage.minuteStartedAt = now;
    usage.minuteCount = 0;
  }


  if (usage.day !== currentDay) {
    usage.day = currentDay;
    usage.dayCount = 0;
  }


  if (
    usage.minuteCount >=
    limits.perMinute
  ) {
    const retryAfterSeconds =
      Math.max(
        1,
        Math.ceil(
          (
            60000 -
            (
              now -
              usage.minuteStartedAt
            )
          ) / 1000
        )
      );

    throw createRateLimitError(
      "Çok hızlı çeviri yapılıyor. Lütfen kısa bir süre bekleyin.",
      retryAfterSeconds
    );
  }


  if (
    usage.dayCount >=
    limits.perDay
  ) {
    throw createRateLimitError(
      "Günlük çeviri sınırına ulaştınız. Lütfen yarın tekrar deneyin.",
      secondsUntilNextDay()
    );
  }


  usage.minuteCount += 1;
  usage.dayCount += 1;
  usage.lastUsedAt = now;

  globalUsage.count += 1;

  clientUsage.set(
    clientIdentifier,
    usage
  );


  return {
    remainingDaily:
      Math.max(
        0,
        limits.perDay -
        usage.dayCount
      )
  };
}


function resetGlobalUsageIfNecessary(
  currentDay
) {
  if (globalUsage.day === currentDay) {
    return;
  }

  globalUsage.day = currentDay;
  globalUsage.count = 0;
}


function createCacheKey(input) {
  return JSON.stringify({
    sourceLanguage:
      input.sourceLanguage,

    targetLanguage:
      input.targetLanguage,

    currentSubtitle:
      input.currentSubtitle.toLowerCase(),

    selectedText:
      input.selectedText.toLowerCase()
  });
}


function getCachedTranslation(cacheKey) {
  const cached =
    translationCache.get(cacheKey);

  if (!cached) {
    return null;
  }


  if (
    cached.expiresAt <= Date.now()
  ) {
    translationCache.delete(cacheKey);
    return null;
  }


  return cached.value;
}


function saveTranslationToCache(
  cacheKey,
  value
) {
  if (
    translationCache.size >=
    limits.cacheMaximum
  ) {
    const oldestKey =
      translationCache
        .keys()
        .next()
        .value;

    if (oldestKey) {
      translationCache.delete(
        oldestKey
      );
    }
  }


  translationCache.set(
    cacheKey,
    {
      value,

      expiresAt:
        Date.now() +
        limits.cacheLifetime
    }
  );
}


function getCurrentDay() {
  return new Date()
    .toISOString()
    .slice(0, 10);
}


function secondsUntilNextDay() {
  const now = new Date();

  const nextDay =
    new Date(now);

  nextDay.setUTCHours(
    24,
    0,
    0,
    0
  );

  return Math.max(
    1,
    Math.ceil(
      (
        nextDay.getTime() -
        now.getTime()
      ) / 1000
    )
  );
}


function createInputError(message) {
  const error =
    new Error(message);

  error.status = 400;

  return error;
}


function createRateLimitError(
  message,
  retryAfterSeconds
) {
  const error =
    new Error(message);

  error.status = 429;

  error.retryAfterSeconds =
    retryAfterSeconds;

  return error;
}


const cleanupTimer =
  windowSafeInterval(
    cleanupExpiredData,
    60 * 60 * 1000
  );


function cleanupExpiredData() {
  const now = Date.now();


  for (
    const [
      cacheKey,
      cached
    ] of translationCache
  ) {
    if (cached.expiresAt <= now) {
      translationCache.delete(
        cacheKey
      );
    }
  }


  for (
    const [
      clientIdentifier,
      usage
    ] of clientUsage
  ) {
    const hasBeenInactiveForTwoDays =
      now - usage.lastUsedAt >
      2 * 24 * 60 * 60 * 1000;

    if (hasBeenInactiveForTwoDays) {
      clientUsage.delete(
        clientIdentifier
      );
    }
  }
}


function windowSafeInterval(
  callback,
  delay
) {
  const timer =
    setInterval(
      callback,
      delay
    );

  timer.unref?.();

  return timer;
}
function readPositiveInteger(
  environmentVariable,
  fallbackValue
) {
  const value =
    Number(
      process.env[
        environmentVariable
      ]
    );

  if (
    Number.isInteger(value) &&
    value > 0
  ) {
    return value;
  }

  return fallbackValue;
}