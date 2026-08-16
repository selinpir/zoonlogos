const serverStatus =
  document.querySelector("#serverStatus");

const checkButton =
  document.querySelector("#checkButton");


checkButton.addEventListener(
  "click",
  checkConnection
);


checkConnection();


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

      if (!response?.success) {
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