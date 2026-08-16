const API_BASE_URL = "https://zoonlogos-api.onrender.com";

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

    if (message.type === "TRANSLATE_SUBTITLE") {
      translateSubtitle(message.payload)
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
  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/health`
    );
  } catch {
    throw new Error(
      "ZoonLogos sunucusuna bağlanılamadı. npm run dev çalışıyor mu?"
    );
  }

  if (!response.ok) {
    throw new Error(
      "ZoonLogos sunucusu yanıt vermedi."
    );
  }

  return response.json();
}

async function translateSubtitle(payload) {
  let response;

  try {
    response = await fetch(
      `${API_BASE_URL}/api/translate`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(payload)
      }
    );
  } catch {
    throw new Error(
      "Çeviri sunucusuna bağlanılamadı. npm run dev çalışıyor mu?"
    );
  }

  const rawText = await response.text();

  let responseData;

  try {
    responseData = JSON.parse(rawText);
  } catch {
    throw new Error(
      "Sunucu geçerli JSON göndermedi."
    );
  }

  if (!response.ok) {
    throw new Error(
      responseData?.error ||
      responseData?.message ||
      "Çeviri isteği başarısız oldu."
    );
  }

  return unwrapResponse(responseData);
}

function unwrapResponse(value) {
  let currentValue = value;

  for (let index = 0; index < 5; index += 1) {
    if (
      !currentValue ||
      typeof currentValue !== "object"
    ) {
      break;
    }

    const hasTranslationData =
      typeof currentValue.meaning === "string" ||
      typeof currentValue.translation === "string";

    if (hasTranslationData) {
      return currentValue;
    }

    if (
      currentValue.data &&
      typeof currentValue.data === "object"
    ) {
      currentValue = currentValue.data;
      continue;
    }

    if (
      currentValue.result &&
      typeof currentValue.result === "object"
    ) {
      currentValue = currentValue.result;
      continue;
    }

    break;
  }

  return currentValue;
}