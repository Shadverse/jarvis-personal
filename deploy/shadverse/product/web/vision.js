import { localPersianVoice, recognizePersian, speakPersian } from "./identity/persian-speech.js";

const maxFileBytes = 20_000_000;
const defaults = { imageSide: 768, imageBytes: 2_500_000, sessionMs: 300_000, reuse: false };
const supportedFiles = ["image/png", "image/jpeg", "image/webp"];
const states = {
  idle: ["آماده", "Idle"],
  camera: ["دوربین فعال", "Camera active"],
  screen: ["اشتراک صفحه فعال", "Screen sharing active"],
  capturing: ["در حال گرفتن تصویر", "Capturing"],
  listening: ["در حال شنیدن فارسی", "Listening in Persian"],
  analyzing: ["در حال تحلیل تصویر", "Analyzing image"],
  speaking: ["در حال پخش پاسخ", "Speaking"],
  interrupted: ["متوقف شد", "Stopped"],
  error: ["خطا", "Error"],
};
const errors = {
  NotAllowedError: ["دسترسی داده نشد.", "Permission was denied."],
  NotFoundError: ["دوربین پیدا نشد.", "No camera was found."],
  AbortError: ["گرفتن تصویر متوقف شد.", "Capture was interrupted."],
  NotReadableError: [
    "دوربین یا صفحه در دسترس نیست یا مشغول است.",
    "The camera or screen is unavailable or in use.",
  ],
  OverconstrainedError: ["دوربین انتخاب‌شده در دسترس نیست.", "The selected camera is unavailable."],
  unsupported: [
    "از مرورگر امن و سازگار استفاده کنید یا تصویر بارگذاری کنید.",
    "Use a supported secure browser or upload an image.",
  ],
  vision_image: [
    "تصویر معتبر و با اندازهٔ مجاز انتخاب کنید.",
    "Choose a valid image within the size limit.",
  ],
  vision_unavailable: ["تحلیل زنده هنوز فعال نیست.", "Live analysis is unavailable."],
  vision_context: [
    "مهلت تصویر پایان یافته است. دوباره تصویر را برای تحلیل بفرستید.",
    "The visual context expired. Resend the selected image to start a new context.",
  ],
  vision_canceled: ["تحلیل لغو شد.", "Analysis was canceled."],
  vision_failed: ["مدل پاسخی نداد.", "The model did not return an answer."],
  speech_local: [
    "بازشناسی فارسی روی دستگاه در دسترس نیست. پرسش را بنویسید.",
    "On-device Persian recognition is unavailable. Type your question.",
  ],
  speech_permission: ["مجوز میکروفون داده نشد.", "Microphone permission was denied."],
  speech_empty: [
    "گفتاری تشخیص داده نشد. دوباره تلاش کنید یا بنویسید.",
    "No speech detected. Try again or type your question.",
  ],
  speech_playback: [
    "پخش فارسی در دسترس نیست. پاسخ را بخوانید.",
    "Persian playback is unavailable. Read the answer.",
  ],
  token_budget: ["سهمیهٔ توکن کافی نیست.", "The token budget is exhausted."],
  no_model: [
    "مسیر رایگان سازگار در دسترس نیست.",
    "No compatible approved free route is available.",
  ],
  busy: ["یک تحلیل در حال اجراست.", "An analysis is already running."],
  limit: ["سقف درخواست‌های تصویری پر شده است.", "The vision request limit was reached."],
  auth: ["دوباره وارد شوید.", "Sign in again."],
};

function stopTracks(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

function normalize(source, width, height, limits, rotate = false) {
  if (!width || !height) throw Error("vision_image");
  const canvas = document.createElement("canvas");
  let scale = Math.min(1, limits.imageSide / Math.max(width, height));
  while (true) {
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    canvas.width = rotate ? h : w;
    canvas.height = rotate ? w : h;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw Error("vision_image");
    if (rotate) {
      context.translate(h, 0);
      context.rotate(Math.PI / 2);
    }
    context.drawImage(source, 0, 0, w, h);
    const data = canvas.toDataURL("image/png").split(",")[1];
    if (data && (data.length / 4) * 3 - (data.match(/=+$/u)?.[0].length ?? 0) <= limits.imageBytes)
      return data;
    if (Math.max(w, h) <= 64) throw Error("vision_image");
    scale *= 0.75;
  }
}

export function createVisionUI({ root, api, render, active, limits, t, safe, button, onAuth }) {
  let stream = null,
    source = null,
    mediaEpoch = 0,
    frame = null,
    context = null,
    question = "";
  let camera = "environment",
    state = "idle",
    feedback = "",
    turns = [],
    timer = null;
  let request = null,
    opening = false,
    contextVersion = 0;

  function update() {
    if (active()) render();
  }
  function status(next, error) {
    state = next;
    feedback = error ? t(...(errors[error] ?? errors.vision_failed)) : "";
    update();
  }
  function stopMedia() {
    mediaEpoch++;
    opening = false;
    stopTracks(stream);
    stream = null;
    source = null;
  }
  function clearContext() {
    contextVersion++;
    const had = context !== null || request !== null;
    context = null;
    turns = [];
    if (had && limits()) void api("vision", { clear: true }).catch(() => {});
  }
  function close() {
    clearContext();
    request?.abort();
    request = null;
    stopMedia();
    clearTimeout(timer);
    timer = null;
    frame = null;
    question = "";
    feedback = "";
    state = "idle";
  }
  function setTimer() {
    if (timer !== null) return;
    timer = setTimeout(
      () => {
        close();
        status("interrupted");
      },
      (limits() ?? defaults).sessionMs,
    );
  }
  function sync() {
    const video = root.querySelector("#vision-video");
    if (video && video.srcObject !== stream) video.srcObject = stream;
  }
  function view() {
    const allowed = Boolean(limits());
    const running = request !== null;
    const streaming = Boolean(stream);
    const blocked = running || opening;
    return `<section class="surface stack" aria-labelledby="vision-title" data-vision-state="${state}">
      <h1 id="vision-title">${t("بینایی جارویس", "JARVIS Vision")}</h1>
      <p class="sub">${t("یک تصویر را پیش‌نمایش کنید و سپس برای تحلیل بفرستید.", "Preview a frame, then submit it explicitly for analysis.")}</p>
      ${allowed ? "" : `<p>${t("پیش‌نمایش محلی فعال است. تحلیل زنده در انتظار پذیرش محیط خصوصی است.", "Local preview is available. Live analysis is awaiting private staging acceptance.")}</p>`}
      <div class="controls">
        <label>${t("دوربین", "Camera")} <select id="vision-facing" ${running ? "disabled" : ""}>
          <option value="environment" ${camera === "environment" ? "selected" : ""}>${t("پشت", "Rear")}</option>
          <option value="user" ${camera === "user" ? "selected" : ""}>${t("جلو", "Front")}</option>
        </select></label>
        ${button("vision-camera", t("بازکردن دوربین", "Open camera"), "outline", blocked)}
        ${button("vision-screen", t("اشتراک صفحه", "Share screen"), "outline", blocked)}
        ${button("vision-upload", t("انتخاب تصویر یا نماگرفت", "Choose image or screenshot"), "outline", blocked)}
        <input id="vision-file" type="file" accept="image/png,image/jpeg,image/webp" hidden>
        ${streaming ? button("vision-frame", frame ? t("گرفتن دوباره", "Retake frame") : t("گرفتن تصویر", "Capture frame"), "outline", blocked) : ""}
        ${source === "camera" && !blocked ? button("vision-camera-off", t("بستن دوربین", "Close camera")) : ""}
        ${streaming || opening || running ? button("vision-stop", t("توقف", "Stop")) : ""}
      </div>
      ${streaming ? '<video id="vision-video" class="vision-media" autoplay muted playsinline></video>' : ""}
      ${
        frame
          ? `<img class="vision-media" src="data:image/png;base64,${frame}" alt="${t("پیش‌نمایش تصویر انتخاب‌شده", "Selected image preview")}">
      <div class="controls">${button("vision-rotate", t("چرخاندن", "Rotate"), "outline", blocked)}
        ${button("vision-clear", t("پاک‌کردن تصویر و زمینه", "Clear image and context"))}</div>`
          : ""
      }
      <label class="field"><textarea id="vision-question" rows="3" maxlength="4000" dir="auto" aria-label="${t("پرسش دربارهٔ تصویر", "Question about the image")}">${safe(question)}</textarea></label>
      <div class="controls">
        ${button("vision-ask", t("ارسال برای تحلیل", "Submit for analysis"), "outline", !frame || !allowed || blocked)}
        ${button("vision-speak", t("پرسش فارسی صوتی", "Ask in Persian by voice"), "outline", !frame || !allowed || blocked)}
        ${button("vision-continuous", t("گفت‌وگوی صوتی پیوسته", "Continuous voice"), "outline", !frame || !allowed || blocked)}
      </div>
      <p role="status">${t(...states[state])}${feedback ? " · " + safe(feedback) : ""}</p>
      ${
        turns.length
          ? `<ol class="thread">${turns
              .map(
                ({ message, reply }) =>
                  `<li class="turn human"><p>${safe(message)}</p></li><li class="turn assistant"><p>${safe(reply)}</p></li>`,
              )
              .join("")}</ol>`
          : ""
      }
    </section>`;
  }
  async function start(kind) {
    stopMedia();
    const epoch = mediaEpoch;
    const media = navigator.mediaDevices;
    if (!isSecureContext || !(kind === "screen" ? media?.getDisplayMedia : media?.getUserMedia)) {
      status("error", "unsupported");
      return;
    }
    opening = true;
    update();
    try {
      const next =
        kind === "screen"
          ? await media.getDisplayMedia({ video: true, audio: false })
          : await media.getUserMedia({
              video: {
                facingMode: { ideal: camera },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
      if (epoch !== mediaEpoch || !active()) {
        stopTracks(next);
        return;
      }
      const track = next.getVideoTracks()[0];
      if (!track) {
        stopTracks(next);
        throw Error("NotFoundError");
      }
      opening = false;
      stream = next;
      source = kind;
      setTimer();
      track.addEventListener(
        "ended",
        () => {
          if (epoch === mediaEpoch) {
            stopMedia();
            status("interrupted");
          }
        },
        { once: true },
      );
      status(kind);
    } catch (error) {
      if (epoch === mediaEpoch && active()) {
        opening = false;
        status("error", error.name === "Error" ? error.message : error.name);
      }
    }
  }
  function useFrame(value) {
    clearContext();
    frame = value;
    setTimer();
    status(source ?? "idle");
  }
  async function choose(file) {
    if (!file) return;
    if (!supportedFiles.includes(file.type) || file.size < 1 || file.size > maxFileBytes) {
      status("error", "vision_image");
      return;
    }
    const version = ++contextVersion;
    status("capturing");
    try {
      const image = await createImageBitmap(file);
      try {
        if (active() && version === contextVersion)
          useFrame(normalize(image, image.width, image.height, limits() ?? defaults));
      } finally {
        image.close();
      }
    } catch {
      if (active() && version === contextVersion) status("error", "vision_image");
    }
  }
  async function analyze(mode) {
    const policy = limits();
    if (!frame || !policy || request) return;
    const initial = question.trim();
    if (mode === "text" && !initial) {
      root.querySelector("#vision-question")?.focus();
      return;
    }
    const controller = new AbortController();
    request = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(policy.sessionMs)]);
    setTimer();
    try {
      do {
        let message = initial;
        if (mode !== "text") {
          status("listening");
          const listening = AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
          message = (await recognizePersian(listening)).slice(0, 4000).trim();
        }
        signal.throwIfAborted();
        status("analyzing");
        const data = await api(
          "vision",
          {
            message,
            ...(context ? { context } : {}),
            ...(!context || !policy.reuse ? { image: frame } : {}),
          },
          signal,
        );
        signal.throwIfAborted();
        context = data.context;
        turns = [...turns, { message, reply: data.reply }].slice(-12);
        question = "";
        if (mode === "text") break;
        const voice = localPersianVoice();
        if (!voice) throw Error("speech_playback");
        status("speaking");
        await speakPersian(data.reply, voice, signal);
      } while (mode === "continuous" && !signal.aborted);
      status(source ?? "idle");
    } catch (error) {
      if (request !== controller) return;
      if (error.message === "auth") {
        onAuth();
        return;
      }
      if (error.message === "vision_context") context = null;
      status("error", error.name === "TimeoutError" ? "speech_empty" : error.message);
    } finally {
      if (request === controller) {
        request = null;
        update();
      }
    }
  }
  async function handle(action) {
    if (action === "camera" || action === "screen") return start(action);
    if (action === "camera-off") {
      stopMedia();
      status("idle");
      return;
    }
    if (action === "upload") root.querySelector("#vision-file")?.click();
    if (action === "stop" || action === "clear") {
      close();
      status("interrupted");
    }
    if (action === "frame" && stream) {
      const video = root.querySelector("#vision-video");
      // Snapshot before render replaces the video element.
      state = "capturing";
      root.querySelector("[data-vision-state]")?.setAttribute("data-vision-state", state);
      try {
        const captured = normalize(
          video,
          video.videoWidth,
          video.videoHeight,
          limits() ?? defaults,
        );
        if (source === "screen") stopMedia();
        useFrame(captured);
      } catch {
        status("error", "vision_image");
      }
    }
    if (action === "rotate" && frame) {
      const epoch = ++contextVersion;
      const image = new Image();
      image.src = "data:image/png;base64," + frame;
      try {
        await image.decode();
        if (epoch === contextVersion && active())
          useFrame(
            normalize(image, image.naturalWidth, image.naturalHeight, limits() ?? defaults, true),
          );
      } catch {
        if (epoch === contextVersion && active()) status("error", "vision_image");
      }
    }
    if (action === "ask") await analyze("text");
    if (action === "speak") await analyze("voice");
    if (action === "continuous") await analyze("continuous");
  }
  return {
    view,
    sync,
    close,
    handle,
    choose,
    input(value) {
      question = value;
    },
    async facing(value) {
      camera = value === "user" ? "user" : "environment";
      if (source === "camera") await start("camera");
    },
  };
}
