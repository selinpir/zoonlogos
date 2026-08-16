const PRIVACY_POLICY_URL =
  "https://zoonlogos-api.onrender.com/privacy.html";


const serverStatus =
  document.querySelector("#serverStatus");

const checkButton =
  document.querySelector("#checkButton");

const consentPanel =
  document.querySelector("#consentPanel");

const settingsPanel =
  document.querySelector("#settingsPanel");

const consentCheckbox =
  document.querySelector("#consentCheckbox");

const saveConsentButton =
  document.querySelector("#saveConsentButton");

const enabledToggle =
  document.querySelector("#enabledToggle");

const enabledDescription =
  document.querySelector("#enabledDescription");

const privacyLink =
  document.querySelector("#privacyLink");


privacyLink.href =
  PRIVACY_POLICY_URL;


checkButton.addEventListener(
  "click",
  checkConnection
);


saveConsentButton.addEventListener(
  "click",
  saveConsent
);


enabledToggle.addEventListener(
  "change",
  updateEnabledState
);


initializePopup();


function initializePopup() {
  chrome.storage.local.get(
    {
      zoonlogosConsent: false,
      zoonlogosEnabled: false
    },

    (settings) => {
      if (chrome.runtime.lastError) {
        showOffline(
          "Eklenti ayarları okunamadı."
        );

        return;
      }

      if (settings.zoonlogosConsent) {
        showSettings(
          settings.zoonlogosEnabled
        );
      } else {
        showConsentPanel();
      }
    }
  );

  checkConnection();
}


function showConsentPanel() {
  consentPanel.hidden = false;
  settingsPanel.hidden = true;
}


function showSettings(isEnabled) {
  consentPanel.hidden = true;
  settingsPanel.hidden = false;

  enabledToggle.checked =
    Boolean(isEnabled);

  updateEnabledDescription(
    Boolean(isEnabled)
  );
}


function saveConsent() {
  if (!consentCheckbox.checked) {
    serverStatus.className =
      "status offline";

    serverStatus.textContent =
      "Devam etmek için veri bildirimini kabul et.";

    return;
  }

  saveConsentButton.disabled = true;

  chrome.storage.local.set(
    {
      zoonlogosConsent: true,
      zoonlogosEnabled: true
    },

    () => {
      saveConsentButton.disabled = false;

      if (chrome.runtime.lastError) {
        showOffline(
          "Ayarlar kaydedilemedi."
        );

        return;
      }

      showSettings(true);

      serverStatus.className =
        "status online";

      serverStatus.textContent =
        "ZoonLogos etkinleştirildi";
    }
  );
}


function updateEnabledState() {
  const isEnabled =
    enabledToggle.checked;

  enabledToggle.disabled = true;

  chrome.storage.local.set(
    {
      zoonlogosEnabled: isEnabled
    },

    () => {
      enabledToggle.disabled = false;

      if (chrome.runtime.lastError) {
        enabledToggle.checked =
          !isEnabled;

        showOffline(
          "Eklenti ayarı değiştirilemedi."
        );

        return;
      }

      updateEnabledDescription(
        isEnabled
      );

      serverStatus.className =
        isEnabled
          ? "status online"
          : "status offline";

      serverStatus.textContent =
        isEnabled
          ? "ZoonLogos etkin"
          : "ZoonLogos devre dışı";
    }
  );
}


function updateEnabledDescription(
  isEnabled
) {
  enabledDescription.textContent =
    isEnabled
      ? "İngilizce altyazılarda etkin"
      : "Çeviri özelliği kapalı";
}


function checkConnection() {
  serverStatus.className =
    "status checking";

  serverStatus.textContent =
    "Sunucu kontrol ediliyor...";

  checkButton.disabled = true;

  chrome.runtime.sendMessage(
    {
      type: "CHECK_BACKEND"
    },

    (response) => {
      checkButton.disabled = false;

      if (chrome.runtime.lastError) {
        showOffline(
          chrome.runtime.lastError.message
        );

        return;
      }

      const requestSucceeded =
        response?.ok === true ||
        response?.success === true;

      if (!requestSucceeded) {
        showOffline(
          response?.error
        );

        return;
      }

      serverStatus.className =
        "status online";

      serverStatus.textContent =
        "ZoonLogos sunucusu aktif";
    }
  );
}


function showOffline(message) {
  serverStatus.className =
    "status offline";

  serverStatus.textContent =
    message ||
    "ZoonLogos sunucusuna bağlanılamadı.";
}