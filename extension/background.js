const API_BASE_URL = "https://zoonlogos-api.onrender.com";

const WAKE_ATTEMPT_LIMIT = 10;
const WAKE_RETRY_DELAY = 6000;
const HEALTH_VALIDITY_TIME = 8 * 60 * 1000;


let lastSuccessfulHealthCheck = 0;
let activeWakeRequest = null;


chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (message.type === "CHECK_BACKEND") {
      checkBackend()
        .then((data) => {
          sendResponse({
            ok: true,
            success: true,
            data
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            success: false,
            error:
              error.message ||
              "Sunucu kontrol edilemedi."
          });
        });

      return true;
    }


    if (
      message.type ===
      "TRANSLATE_SUBTITLE"
    ) {
      translateSubtitle(
        message.payload
      )
        .then((data) => {
          sendResponse({
            ok: true,
            success: true,
            data
          });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            success: false,
            error:
              error.message ||
              "Çeviri yapılamadı."
          });
        });

      return true;
    }


    return false;
  }
);


async function checkBackend() {
  return ensureBackendAwake(true);
}


async function ensureBackendAwake(
  forceCheck = false
) {
  const healthCheckIsFresh =
    Date.now() -
      lastSuccessfulHealthCheck <
    HEALTH_VALIDITY_TIME;


  if (
    !forceCheck &&
    healthCheckIsFresh
  ) {
    return {
      status: "ok",
      cachedHealthCheck: true
    };
  }


  if (activeWakeRequest) {
    return activeWakeRequest;
  }


  activeWakeRequest =
    wakeBackend()
      .finally(() => {
        activeWakeRequest = null;
      });


  return activeWakeRequest;
}


async function wakeBackend() {
  let lastError = null;


  for (
    let attempt = 1;
    attempt <= WAKE_ATTEMPT_LIMIT;
    attempt += 1
  ) {
    try {
      const {
        response,
        data
      } = await fetchJson(
        `${API_BASE_URL}/api/health`
      );


      if (!response.ok) {
        const error =
          new Error(
            data?.error ||
            "ZoonLogos sunucusu yanıt vermedi."
          );

        error.retryable =
          response.status >= 500;

        throw error;
      }


      if (data?.status !== "ok") {
        const error =
          new Error(
            "Sunucu henüz hazır değil."
          );

        error.retryable = true;

        throw error;
      }


      lastSuccessfulHealthCheck =
        Date.now();


      return data;

    } catch (error) {
      lastError = error;


      const shouldRetry =
        error.retryable !== false &&
        attempt <
          WAKE_ATTEMPT_LIMIT;


      if (!shouldRetry) {
        break;
      }


      await wait(
        WAKE_RETRY_DELAY
      );
    }
  }


  throw new Error(
    lastError?.message ||
    "ZoonLogos sunucusu uyandırılamadı. Lütfen biraz sonra tekrar deneyin."
  );
}


async function translateSubtitle(
  payload
) {
  await ensureBackendAwake();


  try {
    return await requestTranslation(
      payload
    );

  } catch (error) {
    if (
      error.code !== "NON_JSON_RESPONSE"
    ) {
      throw error;
    }


    lastSuccessfulHealthCheck = 0;

    await ensureBackendAwake(true);


    return requestTranslation(
      payload
    );
  }
}


async function requestTranslation(
  payload
) {
  const {
    response,
    data
  } = await fetchJson(
    `${API_BASE_URL}/api/translate`,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify(payload)
    }
  );


  if (!response.ok) {
    const error =
      new Error(
        data?.error ||
        data?.message ||
        "Çeviri isteği başarısız oldu."
      );

    error.status =
      response.status;

    throw error;
  }


  return unwrapResponse(data);
}


async function fetchJson(
  url,
  options = {}
) {
  let response;


  try {
    response = await fetch(
      url,
      options
    );
  } catch {
    const error =
      new Error(
        "Sunucuya bağlanılamadı. Sunucu uyanıyor olabilir."
      );

    error.code =
      "NETWORK_ERROR";

    error.retryable = true;

    throw error;
  }


  const rawText =
    await response.text();


  let data;


  try {
    data = JSON.parse(rawText);

  } catch {
    const isMissingEndpoint =
      response.status === 404;


    const error =
      new Error(
        isMissingEndpoint
          ? "ZoonLogos API adresi bulunamadı."
          : "Sunucu uyanıyor. Lütfen bekleyin."
      );


    error.code =
      "NON_JSON_RESPONSE";

    error.retryable =
      !isMissingEndpoint;


    throw error;
  }


  return {
    response,
    data
  };
}


function unwrapResponse(value) {
  let currentValue = value;


  for (
    let index = 0;
    index < 5;
    index += 1
  ) {
    if (
      !currentValue ||
      typeof currentValue !== "object"
    ) {
      break;
    }


    const hasTranslationData =
      typeof currentValue.meaning ===
        "string" ||
      typeof currentValue.translation ===
        "string";


    if (hasTranslationData) {
      return currentValue;
    }


    if (
      currentValue.data &&
      typeof currentValue.data ===
        "object"
    ) {
      currentValue =
        currentValue.data;

      continue;
    }


    if (
      currentValue.result &&
      typeof currentValue.result ===
        "object"
    ) {
      currentValue =
        currentValue.result;

      continue;
    }


    break;
  }


  return currentValue;
}


function wait(milliseconds) {
  return new Promise(
    (resolve) => {
      window.setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}