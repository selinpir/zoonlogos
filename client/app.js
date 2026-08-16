const translationForm =
  document.querySelector("#translationForm");

const sourceLanguage =
  document.querySelector("#sourceLanguage");

const targetLanguage =
  document.querySelector("#targetLanguage");

const swapLanguages =
  document.querySelector("#swapLanguages");

const currentSubtitle =
  document.querySelector("#currentSubtitle");

const selectedText =
  document.querySelector("#selectedText");

const translateButton =
  document.querySelector("#translateButton");

const statusMessage =
  document.querySelector("#statusMessage");

const resultCard =
  document.querySelector("#resultCard");

const translationResult =
  document.querySelector("#translationResult");

const wordResultArea =
  document.querySelector("#wordResultArea");

const selectedMeaning =
  document.querySelector("#selectedMeaning");

const confidence =
  document.querySelector("#confidence");

const explanationArea =
  document.querySelector("#explanationArea");

const explanation =
  document.querySelector("#explanation");

const modelUsed =
  document.querySelector("#modelUsed");

const attemptedModels =
  document.querySelector("#attemptedModels");

const cacheStatus =
  document.querySelector("#cacheStatus");

const fallbackArea =
  document.querySelector("#fallbackArea");

const fallbackReasons =
  document.querySelector("#fallbackReasons");


translationForm.addEventListener(
  "submit",
  translateSubtitle
);

swapLanguages.addEventListener(
  "click",
  swapSelectedLanguages
);


async function translateSubtitle(event) {
  event.preventDefault();

  clearError();

  const requestData = {
    sourceLanguage:
      sourceLanguage.value,

    targetLanguage:
      targetLanguage.value,

    currentSubtitle:
      currentSubtitle.value.trim(),

    selectedText:
      selectedText.value.trim()
  };

  if (!requestData.currentSubtitle) {
    showError(
      "Çevrilecek cümleyi yazmalısın."
    );

    return;
  }

  if (
    requestData.sourceLanguage ===
    requestData.targetLanguage
  ) {
    showError(
      "Kaynak ve hedef dil farklı olmalıdır."
    );

    return;
  }

  setLoadingState(true);

  try {
    const response = await fetch(
      "/api/translate",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify(requestData)
      }
    );

    const responseData =
      await response.json();

    if (!response.ok) {
      throw new Error(
        responseData.error ||
        "Çeviri isteği başarısız oldu."
      );
    }

    showTranslationResult(
      responseData,
      Boolean(requestData.selectedText)
    );

    statusMessage.textContent =
      responseData.meta?.cacheHit
        ? "Sonuç önbellekten getirildi."
        : "Çeviri başarıyla tamamlandı.";

  } catch (error) {
    console.error(error);

    resultCard.hidden = true;

    showError(
      error.message ||
      "Çeviri sırasında hata oluştu."
    );

  } finally {
    setLoadingState(false);
  }
}


function showTranslationResult(
  data,
  hasSelectedText
) {
  resultCard.hidden = false;

  translationResult.textContent =
    showValue(data.translation);

  wordResultArea.hidden =
    !hasSelectedText;

  explanationArea.hidden =
    !hasSelectedText;

  selectedMeaning.textContent =
    showValue(data.meaning);

  explanation.textContent =
    showValue(data.explanation);

  confidence.textContent =
    translateConfidence(
      data.confidence
    );

  modelUsed.textContent =
    showValue(data.meta?.modelUsed);

  attemptedModels.textContent =
    data.meta?.attemptedModels?.length
      ? data.meta.attemptedModels.join(", ")
      : "—";

  cacheStatus.textContent =
    data.meta?.cacheHit
      ? "Kayıtlı sonuç kullanıldı"
      : "Yeni API isteği";

  renderFallbackReasons(
    data.meta?.fallbackReasons || []
  );
}


function renderFallbackReasons(reasons) {
  fallbackReasons.innerHTML = "";

  if (reasons.length === 0) {
    fallbackArea.hidden = true;
    return;
  }

  fallbackArea.hidden = false;

  for (const reason of reasons) {
    const item =
      document.createElement("li");

    item.textContent =
      `${reason.model}: ${reason.message}`;

    fallbackReasons.appendChild(item);
  }
}


function swapSelectedLanguages() {
  const previousSource =
    sourceLanguage.value;

  sourceLanguage.value =
    targetLanguage.value;

  targetLanguage.value =
    previousSource;

  resultCard.hidden = true;

  statusMessage.textContent =
    "Dil yönü değiştirildi.";
}


function setLoadingState(isLoading) {
  translateButton.disabled =
    isLoading;

  translateButton.textContent =
    isLoading
      ? "Groq çeviriyor..."
      : "Groq ile çevir";
}


function showError(message) {
  statusMessage.textContent = message;
  statusMessage.classList.add("error");
}


function clearError() {
  statusMessage.classList.remove("error");
}


function showValue(value) {
  return value || "—";
}


function translateConfidence(value) {
  const names = {
    high: "Yüksek",
    medium: "Orta",
    low: "Düşük"
  };

  return names[value] || "—";
}