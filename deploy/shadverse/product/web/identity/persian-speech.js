const locale = "fa-IR";

export async function recognizePersian(signal) {
  const Speech = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition;
  if (typeof Speech?.available !== "function") throw Error("speech_local");
  const speech = new Speech();
  if (!("processLocally" in speech)) throw Error("speech_local");
  const options = { langs: [locale], processLocally: true };
  if ((await Speech.available(options)) !== "available") throw Error("speech_local");
  signal.throwIfAborted();
  speech.lang = locale;
  speech.processLocally = true;
  speech.continuous = false;
  speech.interimResults = false;
  return new Promise((resolve, reject) => {
    function finish(error, text) {
      signal.removeEventListener("abort", cancel);
      speech.onresult = speech.onerror = speech.onend = null;
      if (error) reject(error);
      else resolve(text);
    }
    function cancel() {
      finish(signal.reason);
      speech.abort();
    }
    speech.onresult = (event) => {
      const text = Array.from(event.results)
        .filter((result) => result.isFinal)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();
      if (text) finish(null, text);
    };
    speech.onerror = ({ error }) =>
      finish(
        Error(
          error === "not-allowed" || error === "service-not-allowed"
            ? "speech_permission"
            : error === "language-not-supported"
              ? "speech_local"
              : "speech_empty",
        ),
      );
    speech.onend = () => finish(Error("speech_empty"));
    signal.addEventListener("abort", cancel, { once: true });
    try {
      speech.start();
    } catch {
      finish(Error("speech_local"));
    }
  });
}

export function localPersianVoice() {
  return globalThis.speechSynthesis
    ?.getVoices()
    .find((voice) => voice.localService && /^fa(?:-|$)/i.test(voice.lang));
}

export function speakPersian(text, voice, signal) {
  signal.throwIfAborted();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  return new Promise((resolve, reject) => {
    function finish(error) {
      signal.removeEventListener("abort", cancel);
      utterance.onend = utterance.onerror = null;
      if (error) reject(error);
      else resolve();
    }
    function cancel() {
      finish(signal.reason);
      speechSynthesis.cancel();
    }
    utterance.onend = () => finish();
    utterance.onerror = () => finish(Error("speech_playback"));
    signal.addEventListener("abort", cancel, { once: true });
    try {
      speechSynthesis.speak(utterance);
    } catch {
      finish(Error("speech_playback"));
    }
  });
}
