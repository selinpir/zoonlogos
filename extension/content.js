(() => {
  const CAPTION_SELECTOR =
    ".atvwebplayersdk-captions-text";

  const HOVER_DELAY = 250;

  let tooltipElement = null;
  let statusElement = null;

  let zoonlogosEnabled = false;
  let zoonlogosConsent = false;

  let lastPointer = {
    x: 0,
    y: 0
  };

  let animationFramePending = false;
  let hoverTimer = null;
  let activeKey = "";
  let requestNumber = 0;

  const translationCache = new Map();
  const pendingRequests = new Map();

  initializeZoonLogos();


  function initializeZoonLogos() {
    createInterface();
    mountInterface();

    loadExtensionSettings();

    chrome.storage.onChanged.addListener(
      handleStorageChange
    );

    document.addEventListener(
      "pointermove",
      handlePointerMove,
      {
        passive: true,
        capture: true
      }
    );

    document.addEventListener(
      "pointerleave",
      clearActiveWord,
      {
        passive: true
      }
    );

    document.addEventListener(
      "fullscreenchange",
      handleFullscreenChange
    );

    window.addEventListener(
      "blur",
      clearActiveWord
    );

    showStatus(
      "ZoonLogos hazırlanıyor..."
    );
  }


  function loadExtensionSettings() {
    chrome.storage.local.get(
      {
        zoonlogosConsent: false,
        zoonlogosEnabled: false
      },

      (settings) => {
        if (chrome.runtime.lastError) {
          console.error(
            "ZoonLogos ayarları okunamadı:",
            chrome.runtime.lastError.message
          );

          applyExtensionState(
            false,
            false
          );

          return;
        }

        applyExtensionState(
          settings.zoonlogosConsent,
          settings.zoonlogosEnabled
        );
      }
    );
  }


  function handleStorageChange(
    changes,
    storageArea
  ) {
    if (storageArea !== "local") {
      return;
    }

    const consent =
      changes.zoonlogosConsent
        ? changes.zoonlogosConsent.newValue
        : zoonlogosConsent;

    const enabled =
      changes.zoonlogosEnabled
        ? changes.zoonlogosEnabled.newValue
        : zoonlogosEnabled;

    applyExtensionState(
      consent,
      enabled
    );
  }


  function applyExtensionState(
    consent,
    enabled
  ) {
    zoonlogosConsent =
      Boolean(consent);

    zoonlogosEnabled =
      zoonlogosConsent &&
      Boolean(enabled);

    if (zoonlogosEnabled) {
      statusElement?.classList.remove(
        "zoonlogos-status-disabled"
      );

      showStatus(
        "ZoonLogos aktif"
      );

      return;
    }

    clearActiveWord();

    statusElement?.classList.add(
      "zoonlogos-status-disabled"
    );

    showStatus(
      zoonlogosConsent
        ? "ZoonLogos kapalı"
        : "ZoonLogos için onay gerekli"
    );
  }


  function createInterface() {
    statusElement =
      document.createElement("div");

    statusElement.id =
      "zoonlogos-status";

    const statusDot =
      document.createElement("span");

    statusDot.className =
      "zoonlogos-status-dot";

    const statusText =
      document.createElement("span");

    statusText.className =
      "zoonlogos-status-text";

    statusElement.append(
      statusDot,
      statusText
    );

    tooltipElement =
      document.createElement("div");

    tooltipElement.id =
      "zoonlogos-tooltip";

    tooltipElement.setAttribute(
      "role",
      "status"
    );

    tooltipElement.setAttribute(
      "aria-live",
      "polite"
    );
  }


  function mountInterface() {
    const host =
      getInterfaceHost();

    if (!host) {
      return;
    }

    if (
      statusElement.parentElement !== host
    ) {
      host.appendChild(
        statusElement
      );
    }

    if (
      tooltipElement.parentElement !== host
    ) {
      host.appendChild(
        tooltipElement
      );
    }
  }


  function getInterfaceHost() {
    const fullscreenElement =
      document.fullscreenElement;

    if (
      fullscreenElement &&
      fullscreenElement.tagName !== "VIDEO"
    ) {
      return fullscreenElement;
    }

    return document.documentElement;
  }


  function handleFullscreenChange() {
    window.setTimeout(
      () => {
        mountInterface();
        clearActiveWord();
      },
      100
    );
  }


  function handlePointerMove(event) {
    lastPointer = {
      x: event.clientX,
      y: event.clientY
    };

    if (!zoonlogosEnabled) {
      hideTooltip();
      return;
    }

    if (animationFramePending) {
      return;
    }

    animationFramePending = true;

    requestAnimationFrame(
      () => {
        animationFramePending = false;

        inspectPointer(
          lastPointer.x,
          lastPointer.y
        );
      }
    );
  }


  function inspectPointer(x, y) {
    if (!zoonlogosEnabled) {
      clearActiveWord();
      return;
    }

    const caption =
      findCaptionAtPoint(x, y);

    if (!caption) {
      clearActiveWord();
      return;
    }

    const wordInformation =
      findWordAtPoint(
        caption,
        x,
        y
      );

    if (!wordInformation) {
      clearActiveWord();
      return;
    }

    const {
      word,
      sentence
    } = wordInformation;

    const key =
      `${sentence.toLowerCase()}::${word.toLowerCase()}`;

    positionTooltip(x, y);

    if (key === activeKey) {
      return;
    }

    startWordHover({
      key,
      word,
      sentence,
      x,
      y
    });
  }


  function findCaptionAtPoint(
    x,
    y
  ) {
    const captions =
      document.querySelectorAll(
        CAPTION_SELECTOR
      );

    for (const caption of captions) {
      if (!isVisible(caption)) {
        continue;
      }

      const sentence =
        normalizeText(
          caption.innerText
        );

      if (!sentence) {
        continue;
      }

      const rectangle =
        caption.getBoundingClientRect();

      const pointerIsInside =
        x >= rectangle.left - 4 &&
        x <= rectangle.right + 4 &&
        y >= rectangle.top - 4 &&
        y <= rectangle.bottom + 4;

      if (pointerIsInside) {
        return caption;
      }
    }

    return null;
  }


  function findWordAtPoint(
    caption,
    x,
    y
  ) {
    const sentence =
      normalizeText(
        caption.innerText
      );

    if (!sentence) {
      return null;
    }

    const walker =
      document.createTreeWalker(
        caption,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (
              !node.nodeValue?.trim()
            ) {
              return NodeFilter.FILTER_REJECT;
            }

            return NodeFilter.FILTER_ACCEPT;
          }
        }
      );

    let textNode;

    while (
      (textNode = walker.nextNode())
    ) {
      const text =
        textNode.nodeValue;

      const wordPattern =
        /[A-Za-z]+(?:['’\-][A-Za-z]+)*/g;

      let match;

      while (
        (match = wordPattern.exec(text))
      ) {
        const range =
          document.createRange();

        range.setStart(
          textNode,
          match.index
        );

        range.setEnd(
          textNode,
          match.index +
          match[0].length
        );

        const rectangles =
          range.getClientRects();

        for (
          const rectangle
          of rectangles
        ) {
          const pointerIsInside =
            x >= rectangle.left - 3 &&
            x <= rectangle.right + 3 &&
            y >= rectangle.top - 4 &&
            y <= rectangle.bottom + 4;

          if (pointerIsInside) {
            return {
              word:
                cleanWord(
                  match[0]
                ),

              sentence
            };
          }
        }
      }
    }

    return null;
  }


  function startWordHover({
    key,
    word,
    sentence,
    x,
    y
  }) {
    cancelHoverTimer();

    activeKey = key;
    requestNumber += 1;

    const currentRequest =
      requestNumber;

    hideTooltip();

    hoverTimer =
      window.setTimeout(
        async () => {
          if (
            currentRequest !==
              requestNumber ||
            activeKey !== key
          ) {
            return;
          }

          positionTooltip(x, y);
          showLoading(word);

          try {
            const result =
              await getTranslation(
                sentence,
                word,
                key
              );

            if (
              currentRequest !==
                requestNumber ||
              activeKey !== key
            ) {
              return;
            }

            showTranslation(
              word,
              result
            );
          } catch (error) {
            const requestIsStillActive =
              currentRequest ===
                requestNumber &&
              activeKey === key;

            if (
              !requestIsStillActive
            ) {
              return;
            }

            console.error(
              "ZoonLogos çeviri hatası:",
              error
            );

            showError(
              word,
              error.message ||
                "Çeviri yapılamadı."
            );
          }
        },

        HOVER_DELAY
      );
  }


  async function getTranslation(
    sentence,
    word,
    key
  ) {
    if (
      translationCache.has(key)
    ) {
      return translationCache.get(
        key
      );
    }

    if (
      pendingRequests.has(key)
    ) {
      return pendingRequests.get(
        key
      );
    }

    const request =
      sendTranslationRequest(
        sentence,
        word
      );

    pendingRequests.set(
      key,
      request
    );

    try {
      const result =
        await request;

      translationCache.set(
        key,
        result
      );

      return result;
    } finally {
      pendingRequests.delete(
        key
      );
    }
  }


  async function sendTranslationRequest(
    sentence,
    word
  ) {
    const response =
      await chrome.runtime.sendMessage({
        type: "TRANSLATE_SUBTITLE",

        payload: {
          sourceLanguage: "en",
          targetLanguage: "tr",
          currentSubtitle: sentence,
          selectedText: word
        }
      });

    if (
      !response ||
      (
        response.ok !== true &&
        response.success !== true
      )
    ) {
      console.error(
        "Background cevabı:",
        response
      );

      throw new Error(
        response?.error ||
          "Çeviri yapılamadı."
      );
    }

    const data =
      response.data;

    if (
      !data ||
      typeof data !== "object"
    ) {
      console.error(
        "Beklenmeyen sunucu cevabı:",
        response
      );

      throw new Error(
        "Sunucudan çeviri sonucu alınamadı."
      );
    }

    const meaning =
      data.meaning ||
      data.wordMeaning ||
      data.selectedMeaning;

    const sentenceTranslation =
      data.translation ||
      data.sentenceTranslation;

    if (
      !meaning &&
      !sentenceTranslation
    ) {
      console.error(
        "Eksik çeviri cevabı:",
        response
      );

      throw new Error(
        "Kelime ve cümle çevirisi alınamadı."
      );
    }

    return {
      meaning:
        meaning ||
        sentenceTranslation,

      sentenceTranslation:
        sentenceTranslation || "",

      explanation:
        data.explanation || ""
    };
  }


  function positionTooltip(
    x,
    y
  ) {
    if (!tooltipElement) {
      return;
    }

    const tooltipWidth = 290;
    const margin = 12;

    let left = x + 16;
    let top = y - 78;

    if (
      left + tooltipWidth >
      window.innerWidth - margin
    ) {
      left =
        x -
        tooltipWidth -
        16;
    }

    if (top < margin) {
      top = y + 24;
    }

    left = Math.max(
      margin,
      left
    );

    tooltipElement.style.left =
      `${left}px`;

    tooltipElement.style.top =
      `${top}px`;
  }


  function showLoading(word) {
    tooltipElement.replaceChildren();

    const wordElement =
      document.createElement(
        "strong"
      );

    wordElement.className =
      "zoonlogos-tooltip-word";

    wordElement.textContent =
      word;

    const messageElement =
      document.createElement(
        "span"
      );

    messageElement.className =
      "zoonlogos-tooltip-loading";

    messageElement.textContent =
      "Bağlama göre çevriliyor…";

    tooltipElement.append(
      wordElement,
      messageElement
    );

    tooltipElement.classList.add(
      "zoonlogos-tooltip-visible"
    );
  }


  function showTranslation(
    word,
    result
  ) {
    tooltipElement.replaceChildren();

    const header =
      document.createElement(
        "div"
      );

    header.className =
      "zoonlogos-tooltip-header";

    const wordElement =
      document.createElement(
        "span"
      );

    wordElement.className =
      "zoonlogos-tooltip-word";

    wordElement.textContent =
      word;

    const arrowElement =
      document.createElement(
        "span"
      );

    arrowElement.className =
      "zoonlogos-tooltip-arrow";

    arrowElement.textContent =
      "→";

    const meaningElement =
      document.createElement(
        "span"
      );

    meaningElement.className =
      "zoonlogos-tooltip-meaning";

    meaningElement.textContent =
      result.meaning;

    header.append(
      wordElement,
      arrowElement,
      meaningElement
    );

    tooltipElement.appendChild(
      header
    );

    if (
      result.sentenceTranslation
    ) {
      const sentenceElement =
        document.createElement(
          "p"
        );

      sentenceElement.className =
        "zoonlogos-tooltip-sentence";

      sentenceElement.textContent =
        result.sentenceTranslation;

      tooltipElement.appendChild(
        sentenceElement
      );
    }

    if (result.explanation) {
      const explanationElement =
        document.createElement(
          "p"
        );

      explanationElement.className =
        "zoonlogos-tooltip-explanation";

      explanationElement.textContent =
        result.explanation;

      tooltipElement.appendChild(
        explanationElement
      );
    }

    tooltipElement.classList.add(
      "zoonlogos-tooltip-visible"
    );
  }


  function showError(
    word,
    message
  ) {
    tooltipElement.replaceChildren();

    const wordElement =
      document.createElement(
        "strong"
      );

    wordElement.className =
      "zoonlogos-tooltip-word";

    wordElement.textContent =
      word;

    const messageElement =
      document.createElement(
        "span"
      );

    messageElement.className =
      "zoonlogos-tooltip-error";

    messageElement.textContent =
      message ||
      "Anlam bulunamadı.";

    tooltipElement.append(
      wordElement,
      messageElement
    );

    tooltipElement.classList.add(
      "zoonlogos-tooltip-visible"
    );
  }


  function clearActiveWord() {
    cancelHoverTimer();

    activeKey = "";
    requestNumber += 1;

    hideTooltip();
  }


  function cancelHoverTimer() {
    if (!hoverTimer) {
      return;
    }

    window.clearTimeout(
      hoverTimer
    );

    hoverTimer = null;
  }


  function hideTooltip() {
    tooltipElement?.classList.remove(
      "zoonlogos-tooltip-visible"
    );
  }


  function showStatus(message) {
    const textElement =
      statusElement?.querySelector(
        ".zoonlogos-status-text"
      );

    if (textElement) {
      textElement.textContent =
        message;
    }
  }


  function isVisible(element) {
    const style =
      window.getComputedStyle(
        element
      );

    const rectangle =
      element.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity) !== 0 &&
      rectangle.width > 0 &&
      rectangle.height > 0
    );
  }


  function normalizeText(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }


  function cleanWord(word) {
    return word
      .replace(/’/g, "'")
      .replace(
        /^[-']+|[-']+$/g,
        ""
      );
  }
})();