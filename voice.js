(function () {
  function $(selector) {
    return document.querySelector(selector);
  }

  function recognitionFactory() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function addVoiceButton() {
    const form = $("#noteForm");
    const body = $("#noteBody");
    const title = $("#noteTitle");
    if (!form || !body || document.querySelector("#voiceNoteButton")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.id = "voiceNoteButton";
    button.className = "wide";
    button.textContent = "Голосовая заметка";
    form.insertBefore(button, form.querySelector("button.primary"));

    button.addEventListener("click", () => {
      const SpeechRecognition = recognitionFactory();
      if (!SpeechRecognition) {
        body.focus();
        alert("На этом устройстве используйте микрофон на клавиатуре iPhone: нажмите поле заметки, затем значок микрофона.");
        return;
      }

      const rec = new SpeechRecognition();
      rec.lang = "ru-RU";
      rec.interimResults = true;
      rec.continuous = false;

      const previous = body.value.trim();
      button.textContent = "Слушаю...";
      button.disabled = true;

      rec.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          text += event.results[i][0].transcript;
        }
        body.value = previous ? previous + "\n" + text.trim() : text.trim();
        if (!title.value.trim()) title.value = "Голосовая заметка";
      };

      rec.onerror = () => {
        body.focus();
        alert("Голосовой ввод не запустился. На iPhone можно нажать поле заметки и использовать микрофон на клавиатуре.");
      };

      rec.onend = () => {
        button.textContent = "Голосовая заметка";
        button.disabled = false;
      };

      rec.start();
    });
  }

  window.addEventListener("load", addVoiceButton);
})();
