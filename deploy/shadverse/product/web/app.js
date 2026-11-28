import lensMap from "./art/glass-normal.png";
import { draftDocument, notesCsv } from "./artifacts.js";
import { energyCore, voiceStates } from "./core.js";
import { icon } from "./icons.js";
import { Signal } from "./identity/audio.js";
import { mountHead } from "./identity/head.js";
import { localPersianVoice, recognizePersian, speakPersian } from "./identity/persian-speech.js";
import { mountScope } from "./instruments.js";
const app = document.querySelector("#app");
const standalone =
  location.protocol === "file:" || document.documentElement.hasAttribute("data-standalone");
let lang = "fa",
  page = "login",
  review = false,
  session = null,
  activation = false,
  drawer = false,
  feedback = "",
  reveal = false;
let tab = "history",
  period = "month",
  draft = "",
  files = [],
  demoState = "idle",
  users = null,
  modelRegistry = null,
  connectorState = null,
  connectorBusy = false,
  micState = "";
const t = (fa, en) => (lang === "fa" ? fa : en);
const safe = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const canPreview = standalone || ["localhost", "127.0.0.1"].includes(location.hostname);
let turns = [],
  sending = false,
  chatFeedback = "";
let workspaceEpoch = 0,
  meterTimer = 0;
let head = null,
  stopScope = null,
  lastPortrait = null,
  voiceEpoch = 0,
  voiceRun = null;
let projects = [],
  projectsLoaded = false,
  projectIds = new Map(),
  taskView = null,
  dueReminders = [],
  activeProject = "",
  notes = [],
  personalNotes = null,
  editingNote = null,
  privateDocuments = null,
  documentPreview = null,
  savedDrafts = [],
  resources = [],
  query = "";
const signal = new Signal(() => {
  demoState = "idle";
  micState = t("پخش یا دریافت صدا پایان یافت.", "Audio session ended.");
  if (page === "voice") syncVoice();
});
function stopAudio() {
  voiceEpoch++;
  clearInterval(meterTimer);
  signal.stop();
  if (voiceRun) {
    voiceRun.abort();
    voiceRun = null;
    sending = false;
  }
}
function clearWorkspace() {
  workspaceEpoch++;
  projects = [];
  projectsLoaded = false;
  projectIds.clear();
  taskView = null;
  dueReminders = [];
  connectorState = null;
  connectorBusy = false;
  activeProject = "";
  notes = [];
  personalNotes = null;
  editingNote = null;
  privateDocuments = null;
  documentPreview = null;
  savedDrafts = [];
  resources = [];
  turns = [];
  sending = false;
  chatFeedback = "";
  query = "";
}
const names = () => ({
  login: t("ورود", "Sign in"),
  main: t("دستیار من", "My assistant"),
  voice: t("دستیار صوتی", "Voice assistant"),
  workspace: t("فضای کار", "Workspace"),
  monitor: t("پایش و ابزارها", "Monitor & tools"),
  plans: t("اشتراک", "Subscription"),
  admin: t("مدیریت سازنده", "Creator administration"),
  history: t("گفت‌وگوها", "Conversations"),
  projects: t("پروژه‌ها", "Projects"),
  memory: t("حافظه", "Memory"),
  files: t("فایل‌ها", "Files"),
  gallery: t("گالری", "Gallery"),
});
const glyph = {
  main: "core",
  voice: "wave",
  workspace: "folder",
  monitor: "wave",
  plans: "plan",
  admin: "shield",
  history: "chat",
  projects: "layers",
  memory: "memory",
  files: "file",
  gallery: "image",
};
const label = (k) => names()[k];
const productName = () => t("جارویس شادوِرس", "SHADVERSE JARVIS");
const emblem = () => '<div class="emblem"><img src="./icon-192.png" alt=""></div>';
const brand = () =>
  `<div class="brand"><img src="./icon-192.png" alt=""><strong>${productName()}</strong></div>`;
const language = () =>
  `<button class="outline lang" data-action="lang">${icon("globe")}${t("EN", "فارسی")}</button>`;
const button = (action, body, cls = "outline") =>
  `<button type="button" class="${cls}" data-action="${action}">${body}</button>`;
const notice = () => `<p class="notice" role="status">${safe(feedback)}</p>`;
const previewLabel = () => t("پیش‌نمایش", "Preview");
const offline = () =>
  t("گفت‌وگو برای این نشست در دسترس نیست.", "Chat is unavailable for this session.");
const attribution = () =>
  `<a href="./OpenClaw-LICENSE.txt" target="_blank" rel="noopener">OpenClaw · MIT</a>`;
function gate() {
  const heading = activation
    ? t("فعال‌سازی حساب", "Activate account")
    : t("به جارویس شادوِرس خوش آمدید", "Welcome to SHADVERSE JARVIS");
  const field = (id, text, type, ico, ac, placeholder) =>
    `<label>${text}<span class="field">${icon(ico)}<input name="${id}" type="${type}" autocomplete="${ac}" required dir="${id === "code" ? "ltr" : id === "name" ? "auto" : lang === "fa" ? "rtl" : "ltr"}" placeholder="${placeholder}" ${id === "name" ? 'minlength="3" maxlength="48" pattern="[A-Za-z0-9_.\\-]+" autocapitalize="none" spellcheck="false"' : id === "code" ? 'minlength="43" maxlength="43" autocapitalize="none" spellcheck="false"' : 'minlength="12" maxlength="256"'}>${id === "password" ? button("reveal", icon("eye"), "eye") : ""}</span></label>`;
  return `<main class="gate"><header class="bar">${language()}</header><div class="gatebody">
 <section class="gateform glass" dir="${lang === "fa" ? "rtl" : "ltr"}"><div class="identity">${emblem()}<strong>${productName()}</strong></div><h1>${heading}</h1><p class="sub">${activation ? t("حساب خود را با کد ثبت‌نام فعال کنید.", "Activate your account with a registration code.") : t("وارد فضای شخصی خود شوید.", "Sign in to your private workspace.")}</p>
 <form id="auth">${field("name", t("نام کاربری", "Username"), "text", "user", "username", "jarvis.user")}${field("password", t("رمز عبور", "Password"), reveal ? "text" : "password", "lock", activation ? "new-password" : "current-password", "••••••••••••")}${activation ? field("code", t("کد ثبت‌نام", "Registration code"), "text", "key", "off", "•••• ••••") : ""}
 ${notice()}<button class="primary" type="submit">${activation ? t("فعال‌سازی", "Activate") : t("ورود به جارویس شادوِرس", "Sign in to SHADVERSE JARVIS")}</button></form>
 <div class="gateactions">${button("activation", activation ? t("بازگشت به ورود", "Back to sign in") : t("فعال‌سازی با کد ثبت‌نام", "Activate with a registration code"), "textbtn")}</div>
 ${canPreview ? button("review", t("مشاهدهٔ پیش‌نمایش", "Explore visual preview"), "reviewbtn") : ""}</section></div>
 <footer class="foot"><span class="en">SHADVERSE ©</span>${attribution()}</footer></main>`;
}
function nav(k) {
  const selected = k === page;
  return `<button type="button" class="navbtn${selected ? " selected" : ""}" data-action="${k}"${selected ? ' aria-current="page"' : ""}>${icon(glyph[k])}${label(k)}</button>`;
}
const starters = () => ({
  summarize: [
    t("خلاصه‌سازی متن", "Summarize text"),
    t("این متن را برایم خلاصه کن.", "Please summarize this text."),
  ],
  plan: [
    t("برنامه‌ریزی روزانه", "Plan my day"),
    t("کمکم کن برای امروز برنامه‌ریزی کنم.", "Help me plan my day."),
  ],
});
function home() {
  const connected = !review && session?.chatAvailable;
  return `<div class="studio"><section class="greeting">${emblem()}<h1>${t("از کجا شروع کنیم؟", "Where shall we begin?")}</h1><div class="starters">${Object.entries(
    starters(),
  )
    .map(([key, [caption]]) => button("prompt-" + key, caption, "starter"))
    .join("")}</div></section>
 <section class="composearea" aria-label="${t("گفت‌وگو", "Conversation")}">
 ${turns.length ? `<ol class="thread" aria-label="${t("پیام‌های گفت‌وگو", "Conversation messages")}">${turns.map(({ speaker, text }) => `<li class="turn ${speaker}"><strong>${speaker === "assistant" ? productName() : t("شما", "You")}</strong><p>${safe(text)}</p></li>`).join("")}</ol>` : ""}
 <form id="conversation" class="composer glass"><textarea id="draft" maxlength="4000" aria-label="${t("پیام", "Message")}" placeholder="${t("برای جارویس شادوِرس بنویسید…", "Write your message…")}">${safe(draft)}</textarea>
 <div id="attachments">${files.map((f, i) => `<span class="chip"><bdi>${safe(f.name)}</bdi>${button("remove-" + i, icon("close"), "remove")}</span>`).join("")}</div>
 <div class="tools">${button("attach", icon("attach"), "iconbtn")}<input type="file" multiple id="file" hidden>${button("save-draft", icon("layers") + t("ذخیرهٔ پیش‌نویس", "Save draft"), "textbtn")}
 ${button("voice", icon("wave") + label("voice"), "voicebtn")}<button type="submit" class="primary send" ${connected && !sending ? "" : "disabled"} aria-label="${t("ارسال", "Send")}">${icon("send")}</button></div></form>
 <p class="status" role="status" aria-live="polite">${sending ? t("جارویس در حال آماده‌کردن پاسخ است…", "JARVIS is preparing a reply…") : safe(chatFeedback || (connected ? "" : offline()))}</p></section>
 <section class="library"><h2>${label("workspace")}</h2><div class="shortcuts glass">${["history", "projects", "memory", "files", "gallery"].map((k) => button("tab-" + k, icon(glyph[k]) + "<span>" + label(k) + "</span>", "shortcut")).join("")}</div></section></div>`;
}
function title(k) {
  return `<div class="pagetitle"><h1>${label(k)}</h1></div>`;
}
function voice() {
  const stateLabel = (key) => t(...voiceStates[key]);
  return `<section class="voice-stage cinematic-voice" data-state="${demoState}" aria-labelledby="voice-title">
    <header class="voice-heading"><h1 id="voice-title">${label("voice")}</h1></header>
    <div class="voice-chamber">
      ${energyCore(demoState)}
      <div class="voice-indicator"><i aria-hidden="true"></i><h2 id="state-title" aria-live="polite">${stateLabel(demoState)}</h2></div>
    </div>
    <div class="voice-dock glass">
      <div class="audio-buttons">
        <div class="voice-mic">
          ${button("mic", icon("mic") + `<span class="voice-mic-label">${(session?.chatAvailable ? t("صحبت به فارسی", "Speak Persian") : t("آزمایش میکروفون", "Test microphone"))}</span>`, "mic-check voice-main-control")}
        </div>
        ${button("sample", icon("wave") + t("پخش نمونهٔ انگلیسی", "Play voice sample"), "mic-check")}
        ${button("main", icon("chat") + t("گفت‌وگوی متنی", "Text chat"), "voice-text-control")}
      </div>
      <div class="voice-levels">
        <div class="signal-meter" hidden>
          <label>${t("دامنهٔ صدا", "Audio level")}<meter min="0" max="1" value="0"></meter></label>
          <label>${t("طیف صدا", "Spectrum")}<meter min="0" max="1" value="0"></meter></label>
        </div>
      </div>
      <div class="voice-copy">
        <p class="voice-note">${session?.chatAvailable
          ? t("بازشناسی و پخش گفتار به پشتیبانی فارسیِ محلی مرورگر نیاز دارند.", "Speech recognition and playback require local Persian support in your browser.")
          : t("گفت‌وگوی صوتی زنده در این نشست در دسترس نیست.", "Live voice conversation is unavailable in this session.")}</p>
        <p class="notice" id="audio-status" role="status">${safe(micState)}</p>
      </div>
    </div>
    <div class="voice-tools">${review ? `<details class="voice-review-modes" open><summary>${t("آزمایش حالت‌های حرکت", "Test motion states")}</summary>
      <div class="modes" role="group" aria-label="${t("حالت‌های نمایشی", "Demonstration states")}">${Object.keys(voiceStates)
        .map((key) => `<button type="button" data-action="demo-${key}" aria-pressed="${key === demoState}">${stateLabel(key)}</button>`)
        .join("")}</div>
    </details>` : ""}
    <a class="voice-credits" href="./identity/VOICE-NOTICES.txt" target="_blank" rel="noopener">${t("منابع و مجوزها", "Sources and licenses")}</a></div>
  </section>`;
}
function syncVoice() {
  clearInterval(meterTimer);
  const stage = app.querySelector(".voice-stage");
  if (!stage) return;
  const meters = stage.querySelector(".signal-meter");
  meters.hidden = signal.mode === "off";
  if (!meters.hidden) {
    const elements = meters.querySelectorAll("meter");
    meterTimer = setInterval(() => {
      const levels = signal.read();
      elements.forEach((m, i) => (m.value = levels[i]));
    }, 100);
  }
  stage.dataset.state = demoState;
  const portrait = stage.querySelector(".portrait");
  if (portrait) portrait.dataset.state = demoState;
  head?.setState(demoState);
  stage.querySelector("#state-title").textContent =
    voiceRun && demoState === "speaking" ? t("در حال صحبت", "Speaking") : t(...voiceStates[demoState]);
  for (const b of stage.querySelectorAll(".modes button"))
    b.setAttribute("aria-pressed", String(b.dataset.action === "demo-" + demoState));
  stage.querySelector("#audio-status").textContent = micState;
  for (const [action, mode, ico, off] of [
    ["mic", "mic", "mic", session?.chatAvailable ? t("صحبت به فارسی", "Speak Persian") : t("آزمایش میکروفون", "Test microphone")],
    ["sample", "sample", "wave", t("پخش نمونهٔ انگلیسی", "Play voice sample")],
  ]) {
    const b = stage.querySelector('[data-action="' + action + '"]');
    const stop = mode === "mic" ? t("قطع میکروفون", "Stop microphone") : t("توقف پخش", "Stop playback");
    const active = signal.mode === mode || (mode === "mic" && Boolean(voiceRun));
    const caption = voiceRun && mode === "mic" ? t("لغو نوبت", "Cancel turn") : active ? stop : off;
    if (mode === "mic") b.querySelector(".voice-mic-label").textContent = caption;
    else b.innerHTML = icon(ico) + caption;
    b.setAttribute("aria-pressed", String(active));
  }
}
const privateProjects = () => Boolean(session && !review && page === "workspace" && tab === "projects");
const personalMemory = () => Boolean(session && !review && page === "workspace" && tab === "memory" && !activeProject);
const personalDocuments = () => Boolean(session && !review && page === "workspace" && tab === "files" && !activeProject);
function downloadArtifact(content, type, filename) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function workspaceItems() {
  if (tab === "projects") return projects.map((name) => ({ name }));
  if (personalMemory()) return (personalNotes ?? []).map((note) => ({ ...note, name: note.text }));
  if (personalDocuments()) return privateDocuments ?? [];
  const items =
    {
      history: savedDrafts,
      memory: notes,
      files: resources,
      gallery: resources.filter((f) => f.url),
    }[tab] || [];
  return items.filter((f) => !activeProject || f.project === activeProject);
}
function listItems() {
  const all = workspaceItems();
  const rows = all
    .map((item, i) => ({ item, i }))
    .filter(({ item }) => item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  if (!rows.length)
    return `<p class="empty">${query ? t("موردی پیدا نشد.", "No matches.") : t("این بخش در نشست فعلی خالی است.", "This section is empty in this session.")}</p>`;
  return rows
    .map(
      ({ item, i }) =>
        `<div class="work-row">${item.url ? `<img src="${item.url}" alt="">` : icon(glyph[tab])}<bdi>${safe(item.name)}</bdi>${personalMemory()
          ? button("memory-edit-" + item.id, t("ویرایش", "Edit"), "outline") +
            button("memory-delete-" + item.id, t("حذف", "Delete"), "outline")
          : personalDocuments()
            ? button("document-view-" + item.id, t("پیش‌نمایش", "Preview"), "outline") +
              `<a class="outline" href="/api/documents?id=${encodeURIComponent(item.id)}">${t("دریافت", "Download")}</a>` +
              button("document-delete-" + item.id, t("حذف", "Delete"), "outline")
            : tab === "history" || tab === "projects" ? button("open-item-" + i, icon("arrow") + t("باز کردن", "Open"), "outline") : ""}
          ${tab === "history" ? button("draft-export-" + i, t("دریافت سند", "Download document"), "outline") : ""}
          ${privateProjects() && projectIds.has(item.name) ? button("project-tasks-" + i, t("وظایف", "Tasks"), "outline") : ""}</div>`,
    )
    .join("");
}
const reminderDate = (value) =>
  new Intl.DateTimeFormat(lang, { dateStyle: "medium", timeStyle: "short" }).format(value);
function remindersSection() {
  if (!privateProjects() || !dueReminders.length) return "";
  return `<section class="surface stack">
    <h3>${t("یادآورهای سررسیدشده", "Due reminders")}</h3>
    ${dueReminders.map(({ id, project, title, due }) => `<div class="work-row"><bdi>${safe(project)} · ${safe(title)}</bdi><bdi>${safe(reminderDate(due))}</bdi>${button("reminder-ack-" + id, t("دیدم", "Acknowledge"))}</div>`).join("")}
  </section>`;
}
function projectTasks() {
  if (!privateProjects() || !taskView) return "";
  const { name, tasks, busy, error, input, reminderId, reminderInput } = taskView;
  const rows = tasks.map((task) => {
    const completed = task.completed !== null;
    return `<div class="work-row"><bdi>${safe(task.title)}</bdi>
      <span>${completed ? t("انجام شد", "Completed") : t("باز", "Open")}</span>
      ${task.due === null ? "" : `<bdi>${safe(reminderDate(task.due))}</bdi>`}
      ${button("task-toggle-" + task.id, completed ? t("بازگشایی", "Reopen") : t("تکمیل", "Complete"), "outline")}
      ${completed ? "" : button("reminder-edit-" + task.id, t("تنظیم یادآور", "Set reminder"))}
      ${task.due === null ? "" : button("reminder-cancel-" + task.id, t("لغو یادآور", "Cancel reminder"))}</div>
      ${reminderId !== task.id || completed ? "" : `<div class="controls">
      <label class="field"><input id="reminder-due" type="datetime-local" value="${safe(reminderInput)}" aria-label="${t("زمان محلی یادآور", "Reminder local time")}"></label>
      ${button("reminder-save", t("ذخیرهٔ یادآور", "Save reminder"))}
      ${button("reminder-close", t("انصراف", "Close reminder editor"))}</div>`}`;
  }).join("");
  return `<section class="surface stack" aria-busy="${busy}">
    <h3>${t("وظایف پروژه", "Project tasks")} · <bdi>${safe(name)}</bdi></h3>
    <div class="controls">${button("tasks-close", t("بستن وظایف", "Close tasks"), "outline")}
    <label class="field"><input id="task-title" dir="auto" maxlength="200" value="${safe(input)}" aria-label="${t("عنوان وظیفه", "Task title")}" placeholder="${t("عنوان وظیفه", "Task title")}"></label>
    ${button("task-add", t("افزودن وظیفه", "Add task"), "outline")}</div>
    ${error ? `<p role="status">${safe(error)}</p>` : ""}
    ${rows || (!busy && !error ? `<p class="empty">${t("هنوز وظیفه‌ای ثبت نشده است.", "No tasks yet.")}</p>` : "")}</section>`;
}
function space() {
  const add = tab === "projects" || tab === "memory";
  const editing = personalMemory() && personalNotes?.find((note) => note.id === editingNote);
  return (
    title("workspace") +
    `<section class="surface stack"><div class="seg">${["history", "projects", "memory", "files", "gallery"].map((k) => button("tab-" + k, label(k), tab === k ? "on" : "")).join("")}</div>
 <h2>${label(tab)}</h2><p class="sub">${privateProjects() ? t("پروژه‌های خصوصی در حساب شما ذخیره می‌شوند.", "Private projects stay in your account.") : personalMemory()
   ? t("تنها یادداشت‌هایی که خودتان ذخیره می‌کنید در حساب شما می‌مانند.", "Only notes you save explicitly stay in your account.")
   : personalDocuments()
     ? t("فایل متنی خصوصی تا ۱ مگابایت. فایل به مدل ارسال نمی‌شود.", "Private text file, up to 1 MiB. Files are not sent to the model.")
     : t("محتوای محلی این نشست با خروج پاک می‌شود.", "Local session content clears on sign-out.")}</p>
 <div class="controls"><label class="field">${icon("search")}<input type="search" id="search" aria-label="${t("جست‌وجو", "Search")}" value="${safe(query)}" placeholder="${t("جست‌وجو", "Search")}"></label>
 <select id="project-filter" aria-label="${t("پروژهٔ انتخابی", "Active project")}"><option value="">${t("همهٔ پروژه‌ها", "All projects")}</option>${projects.map((n) => `<option ${n === activeProject ? "selected" : ""}>${safe(n)}</option>`).join("")}</select></div>
 ${add ? `<div class="controls"><label class="field"><input id="item-name" dir="auto" maxlength="${privateProjects() ? 120 : 500}" value="${safe(editing?.text ?? "")}" placeholder="${tab === "projects" ? t("نام پروژه", "Project name") : t("یادداشت حافظه", "Memory note")}" aria-label="${label(tab)}"></label>${button("add-item", icon("layers") + (editing ? t("ذخیره", "Save") : t("افزودن", "Add")))}
 ${editing ? button("memory-cancel", t("انصراف", "Cancel"), "outline") : ""}
 ${personalMemory() ? `<a href="/api/memory?export=1" class="outline">${t("خروجی حافظه", "Export memory")}</a>
   ${personalNotes?.length ? button("memory-csv", t("دریافت جدول CSV", "Download CSV"), "outline") : ""}` : ""}</div>` : ""}
 ${personalDocuments() ? `<input type="file" id="private-document" accept=".txt,.md,.csv" hidden>
   ${button("document-upload", icon("attach") + t("ذخیرهٔ فایل خصوصی", "Save private file"))}
   ${documentPreview ? `<label class="field"><bdi>${safe(documentPreview.name)}</bdi>
      <textarea readonly rows="8" dir="auto" aria-label="${t("متن فایل", "File contents")}">${safe(documentPreview.text)}</textarea></label>` : ""}`
   : ["files", "gallery"].includes(tab) ? `<input type="file" id="workspace-file" multiple hidden ${tab === "gallery" ? 'accept="image/png,image/jpeg,image/webp"' : ""}>${button("pick-file", icon("attach") + t("انتخاب فایل محلی", "Choose local file"))}` : ""}
 <div id="results">${listItems()}</div></section>${remindersSection()}${projectTasks()}`
  );
}
function workspaceConnector() {
  if (!session || review || !connectorState) return "";
  const connector = connectorState.connectors.find(({ id }) => id === "shadverse-workspace");
  if (!connector) return "";
  const granted = connector.status === "granted" && connector.expires > Date.now();
  return `<section class="surface stack" aria-busy="${connectorBusy}">
    <h2>${t("اتصال فضای کار شادوِرس", "SHADVERSE Workspace connector")}</h2>
    <p class="sub">${t("دسترسی محلی و فقط خواندنی به تعداد پروژه‌های حساب، به مدت ۱۵ دقیقه.", "Local, read-only access to your project count for 15 minutes.")}</p>
    <div class="controls">${granted
      ? button("connector-read", t("خواندن تعداد پروژه‌ها", "Read project count")) +
        button("connector-revoke", t("لغو دسترسی", "Revoke access"))
      : button("connector-grant", t("اجازهٔ خواندن تعداد پروژه‌ها", "Allow reading project count"))}</div>
    ${!granted || connectorState.projectCount === undefined ? "" : `<output>${t("تعداد پروژه‌ها", "Projects")} · <bdi>${safe(connectorState.projectCount)}</bdi></output>`}
    </section>`;
}
function monitor() {
  const cards = [
    [t("پردازش تصویر", "Renderer"), lastPortrait?.renderer ?? "—"],
    [t("ذرات رسم‌شده", "Drawn particles"), lastPortrait?.points ?? "—"],
    [
      t("میکروفون مرورگر", "Microphone API"),
      navigator.mediaDevices?.getUserMedia
        ? t("در دسترس", "Available")
        : t("در دسترس نیست", "Unavailable"),
    ],
  ];
  return (
    title("monitor") +
    `<section class="surface stack"><h2>${t("زمان هر فریم مرورگر", "Browser frame interval")}</h2><p class="sub">${t("اندازه‌گیری زنده در همین زبانه", "Live measurements from this tab")}</p>
 <div class="instrument" id="scope"><div class="split"><output dir="auto">—</output><button class="outline" type="button" aria-pressed="false">${t("مکث", "Pause")}</button></div><canvas tabindex="0" aria-label="${t("نمودار زمان فریم؛ برای مرور از کلیدهای جهت استفاده کنید.", "Frame interval chart. Inspect with arrow keys.")}"></canvas><dl class="trace-stats"><div><dt>${t("میانه", "Median")}</dt><dd data-stat="median">—</dd></div><div><dt>${t("بیشینه", "Peak")}</dt><dd data-stat="peak">—</dd></div><div><dt>${t("بازهٔ ثبت", "Window")}</dt><dd data-stat="window">—</dd></div></dl><p class="trace-detail"></p></div>
 <div class="readouts">${cards.map(([k, v]) => `<div><span>${k}</span><bdi>${safe(v)}</bdi></div>`).join("")}</div></section>` + workspaceConnector()
  );
}
function plans() {
  return (
    title("plans") +
    `<div class="stack"><div class="controls"><div class="seg">${button("month", t("ماهانه", "Monthly"), period === "month" ? "on" : "")}${button("year", t("سالانه", "Annual"), period === "year" ? "on" : "")}</div><span class="pill">${t("طرح پیشنهادی", "Planned offering")}</span></div><div class="plans">${["Free", "Pro", "Ultra"].map((x) => `<div class="surface"><h2 class="en">${x}</h2><p class="sub">${period === "month" ? t("دورهٔ ماهانه", "Monthly term") : t("دورهٔ سالانه", "Annual term")}</p></div>`).join("")}</div>
 <div class="surface"><h2>${t("مصرف و سهمیه", "Usage and quotas")}</h2><p class="sub">${t("قیمت‌گذاری، سهمیه و خرید اشتراک در مرحلهٔ بعد تعیین می‌شود.", "Pricing, quotas and purchasing are planned.")}</p></div></div>`
  );
}
function admin() {
  const health = {
    unknown: t("بررسی‌نشده", "Unchecked"),
    healthy: t("سالم", "Healthy"),
    busy: t("در حال پاسخ", "Busy"),
    cooldown: t("وقفهٔ موقت", "Cooling down"),
    retryable: t("آمادهٔ بررسی دوباره", "Ready to retry"),
  };
  const models = !modelRegistry?.routes ? "" : `<h2>${t("مدیریت مدل‌ها", "Model management")}</h2>
    <p class="sub">${t("سهمیهٔ مصرف امروز", "Token budget used today")} <bdi>${modelRegistry.usage.chargedTokens} / ${modelRegistry.dailyTokens}</bdi></p>
    ${modelRegistry.routes.map((route) => `<div class="auditrow split"><bdi>${safe(route.model)}</bdi>
      <span>${route.eligible ? (route.paused ? t("متوقف", "Paused") : health[route.health]) : t("در انتظار تأیید", "Approval pending")}</span>
      ${route.eligible ? button("model-" + (route.paused ? "resume-" : "pause-") + route.id, route.paused ? t("ازسرگیری", "Resume") : t("توقف", "Pause")) : ""}</div>`).join("")}`;
  return (
    title("admin") +
    `<div class="surface stack"><h2>${t("کاربران", "Users")}</h2>${users ? users.map((u) => `<div class="auditrow split"><bdi>${safe(u.name)}</bdi><span>${u.role === "creator" ? t("سازنده", "Creator") : t("عضو", "Member")}</span></div>`).join("") : `<p class="sub">${t("فهرست حساب‌ها فقط در نشست سازنده در دسترس است.", "The account list requires a Creator session.")}</p>`}
 ${models}<h2>${t("کنترل‌های برنامه‌ریزی‌شده", "Planned controls")}</h2><p class="sub">${t("مدیریت اشتراک و مدل‌ها، گزارش هزینه، صدور کد، ثبت رویدادها و توقف اضطراری.", "Subscription and model management, cost reporting, code issuance, audit and emergency stop.")}</p></div>`
  );
}
function shell() {
  const creator = session?.role === "creator" || review;
  return `<div class="shell${page === "voice" ? " voice-shell" : ""}">${page === "voice" ? '<canvas class="voice-matrix" aria-hidden="true"></canvas>' : ""}<button class="scrim ${drawer ? "open" : ""}" aria-label="${t("بستن منو", "Close menu")}" data-action="menu"></button><aside class="rail glass ${drawer ? "open" : ""}">${button("menu", icon("close"), "iconbtn drawerclose")}${brand()}
 <nav class="navgroup"><small>${t("محیط شخصی", "Personal space")}</small>${["main", "voice", "workspace", "monitor"].map(nav).join("")}</nav>
 <nav class="navgroup"><small>${t("حساب کاربری", "Account")}</small>${nav("plans")}${creator ? nav("admin") : ""}</nav>
 <div class="railbottom"><span class="pill">${icon("user")}${review ? previewLabel() : `<bdi>${safe(session.name)}</bdi>`}</span>${button("logout", icon("logout") + t("خروج", "Sign out"), "navbtn")}</div></aside>
 <main class="main"><header class="top"><div class="topstart">${button("menu", icon("menu"), "iconbtn mobilemenu")}</div><strong class="topname">${productName()}</strong><div class="topactions">${review ? `<span class="pill">${previewLabel()}</span>` : ""}${language()}</div></header>
 <div class="page">${{ main: home, voice, workspace: space, monitor, plans, admin }[page]()}${notice()}</div>
 <footer class="footnote"><span class="en">SHADVERSE ©</span>${attribution()}</footer></main></div>`;
}
function render() {
  const old = app.querySelector(".portrait");
  if (old?.dataset.renderer)
    lastPortrait = { renderer: old.dataset.renderer, points: old.dataset.points };
  head?.close();
  head = null;
  stopScope?.();
  stopScope = null;
  document.title = productName();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  const optics = `<svg class="optics-defs" aria-hidden="true" width="0" height="0"><defs><filter id="jarvis-lens" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feImage href="${lensMap}" width="100%" height="100%" preserveAspectRatio="none" result="normals"/><feDisplacementMap in="SourceGraphic" in2="normals" scale="19" xChannelSelector="R" yChannelSelector="G"/></filter></defs></svg>`;
  app.innerHTML = optics + (page === "login" ? gate() : shell());

  const canvas = app.querySelector(".portrait canvas");
  if (canvas) {
    head = mountHead(canvas, () => signal.read(), () => signal.mode !== "off");
    head.setState(page === "voice" ? demoState : "idle");
  }
  const scope = app.querySelector("#scope");
  if (scope) stopScope = mountScope(scope, lang === "fa");
  if (page === "voice") syncVoice();
  for (const [action, fa, en] of [
    ["attach", "افزودن پیوست", "Attach files"],
    ["reveal", "نمایش یا پنهان کردن رمز عبور", "Show or hide password"],
    ["menu", "منوی پیمایش", "Navigation menu"],
  ]) {
    app
      .querySelectorAll(`[data-action="${action}"]`)
      .forEach((el) => el.setAttribute("aria-label", t(fa, en)));
  }
  app
    .querySelectorAll(".remove")
    .forEach((el) => el.setAttribute("aria-label", t("حذف پیوست", "Remove attachment")));
}
async function api(path, body, signal) {
  const response = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
    signal,
    headers: body
      ? { "Content-Type": "application/json", "X-CSRF-Token": session?.csrf || "" }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json();
  if (!response.ok) throw Error(result.error);
  return result;
}
function errorText(code) {
  const errors = {
    credentials: t("نام کاربری یا رمز عبور درست نیست.", "Incorrect username or password."),
    invalid: t(
      "نام کاربری باید ۳ تا ۴۸ نویسهٔ لاتین و رمز عبور دست‌کم ۱۲ نویسه باشد.",
      "Use a 3–48 character username and a password of at least 12 characters.",
    ),
    activation: t(
      "فعال‌سازی انجام نشد. کد و نام کاربری را بررسی کنید.",
      "Activation failed. Check the code and username.",
    ),
    gateway: t(
      "دریافت پاسخ از جارویس ممکن نشد. دوباره تلاش کنید.",
      "JARVIS could not respond. Try again.",
    ),
    file_invalid: t("فایل متنی UTF-8 با نام معتبر و حداکثر ۱ مگابایت انتخاب کنید.", "Choose a valid UTF-8 text file up to 1 MiB."),
    file_missing: t("فایل در حساب شما پیدا نشد.", "This file was not found in your account."),
    integration_scope: t("مجوز این اتصال فعال نیست.", "Connector permission is inactive."),
    integration_invalid: t("درخواست اتصال معتبر نیست.", "Invalid connector request."),
    project_missing: t("پروژه در حساب شما پیدا نشد.", "This project was not found in your account."),
    reminder_missing: t("یادآور دیگر در فهرست سررسید نیست.", "This reminder is no longer due."),
    reminder_invalid: t("زمانی در آینده و حداکثر تا یک سال دیگر انتخاب کنید.", "Choose a future time within the next year."),
    task_closed: t("یادآور فقط برای وظیفهٔ باز تنظیم می‌شود.", "Reminders can be scheduled for open tasks."),
    task_missing: t("این وظیفه در پروژه پیدا نشد.", "This task was not found in the project."),
    task_invalid: t("عنوان معتبر وظیفه را وارد کنید.", "Enter a valid task title."),
    task_cap: t("حداکثر ۱۰۰ وظیفه در هر پروژه مجاز است.", "Each project can hold up to 100 tasks."),
    project_invalid: t("نام معتبر پروژه را وارد کنید.", "Enter a valid project name."),
    project_cap: t("حداکثر ۵۰ پروژه مجاز است.", "You can save up to 50 projects."),
    file_cap: t("به سقف ذخیره‌سازی فایل رسیده‌اید.", "Your file storage limit has been reached."),
    note_missing: t("این یادداشت در حساب شما پیدا نشد.", "This note was not found in your account."),
    note_cap: t("به سقف ۱۰۰ یادداشت رسیده‌اید.", "Your account has reached its 100-note limit."),
    speech_local: t("بازشناسی فارسی روی دستگاه در دسترس نیست. از گفت‌وگوی متنی استفاده کنید.", "Local Persian recognition is unavailable. Use Text chat."),
    speech_permission: t("دسترسی میکروفون رد شد. مجوز مرورگر یا گفت‌وگوی متنی را بررسی کنید.", "Microphone access was denied. Check browser permissions or use Text chat."),
    speech_empty: t("گفتار تشخیص داده نشد. دوباره تلاش کنید یا پیام را بنویسید.", "No speech was recognized. Try again or type your message."),
    speech_playback: t("پخش فارسی در دسترس نیست. پاسخ در گفت‌وگوی متنی آماده است.", "Persian playback is unavailable. The reply is in Text chat."),
    no_model: t("مدل تأییدشده‌ای برای این درخواست در دسترس نیست.", "No approved model is available for this request."),
    token_budget: t("سهمیهٔ توکن امروز برای این درخواست کافی نیست.", "Today's token budget is insufficient for this request."),
    busy: t(
      "جارویس هنوز در حال آماده‌کردن پاسخ قبلی است.",
      "JARVIS is still preparing the previous reply.",
    ),
    auth: t("نشست پایان یافته است. دوباره وارد شوید.", "Your session has ended. Sign in again."),
    archived: t("گفت‌وگوی فعلی بایگانی شده است.", "The current conversation is archived."),
    limit: t(
      "تلاش‌های زیادی انجام شده است. ده دقیقهٔ دیگر دوباره تلاش کنید.",
      "Too many attempts. Try again in ten minutes.",
    ),
  };
  return (
    errors[code] ||
    t("درخواست انجام نشد. اتصال خود را بررسی کنید.", "Request failed. Check your connection.")
  );
}
function returnToGate() {
  stopAudio();
  clearWorkspace();
  session = null;
  page = "login";
  draft = "";
  files = [];
  drawer = false;
  feedback = errorText("auth");
  render();
}
async function runPersianTurn() {
  if (voiceRun) {
    stopAudio();
    demoState = "idle";
    micState = t("نوبت صوتی لغو شد.", "Voice turn canceled.");
    syncVoice();
    return;
  }
  if (sending) {
    micState = errorText("busy");
    syncVoice();
    return;
  }
  const requester = session;
  stopAudio();
  const controller = new AbortController();
  voiceRun = controller;
  sending = true;
  demoState = "listening";
  micState = t("به فارسی صحبت کنید.", "Speak in Persian.");
  syncVoice();
  try {
    const message = (await recognizePersian(controller.signal)).slice(0, 4000).trim();
    controller.signal.throwIfAborted();
    demoState = "thinking";
    micState = t("جارویس در حال آماده‌کردن پاسخ است…", "JARVIS is preparing a reply…");
    syncVoice();
    const { reply } = await api("chat", { message }, controller.signal);
    controller.signal.throwIfAborted();
    if (session !== requester) return;
    turns.push({ speaker: "human", text: message }, { speaker: "assistant", text: reply });
    const voice = localPersianVoice();
    if (!voice) {
      micState = errorText("speech_playback");
    } else {
      demoState = "speaking";
      micState = t("پاسخ جارویس", "JARVIS reply");
      syncVoice();
      await speakPersian(reply, voice, controller.signal);
      micState = t("پاسخ در گفت‌وگوی متنی هم در دسترس است.", "The reply is also in Text chat.");
    }
  } catch (error) {
    if (!controller.signal.aborted && session === requester) {
      if (error.message === "auth") returnToGate();
      else micState = errorText(error.message);
    }
  } finally {
    if (voiceRun === controller) {
      voiceRun = null;
      sending = false;
      demoState = "idle";
      if (page === "voice") syncVoice();
    }
  }
}
app.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.id === "conversation") {
    if (!session?.chatAvailable || sending) return;
    const message = draft.trim();
    if (!message || files.length) {
      chatFeedback = files.length
        ? t(
            "ارسال پیوست فعال نیست. برای ارسال متن، پیوست‌ها را بردارید.",
            "Attachments are unavailable. Remove them to send text.",
          )
        : t("ابتدا متن پیام را بنویسید.", "Write a message first.");
      form.parentElement.querySelector(".status").textContent = chatFeedback;
      return;
    }
    const requester = session;
    sending = true;
    chatFeedback = "";
    form.setAttribute("aria-busy", "true");
    form.querySelector(".send").disabled = true;
    form.parentElement.querySelector(".status").textContent = t(
      "جارویس در حال آماده‌کردن پاسخ است…",
      "JARVIS is preparing a reply…",
    );
    try {
      const { reply } = await api("chat", { message });
      if (session !== requester) return;
      turns.push({ speaker: "human", text: message }, { speaker: "assistant", text: reply });
      if (draft.trim() === message) draft = "";
    } catch (err) {
      if (session !== requester) return;
      if (err.message === "auth") {
        returnToGate();
        return;
      }
      chatFeedback = errorText(err.message);
    }
    if (session !== requester) return;
    sending = false;
    if (page === "main") {
      render();
      app.querySelector(".thread .turn:last-child")?.scrollIntoView({ block: "nearest" });
    }
    return;
  }
  if (form.id !== "auth") return;
  if (standalone) {
    feedback = t("برای ورود، پیش‌نمایش سرور را باز کنید.", "Open the server preview to sign in.");
    render();
    return;
  }
  const data = Object.fromEntries(new FormData(form));
  form.querySelector("[type=submit]").disabled = true;
  try {
    const result = await api(activation ? "activate" : "login", data);
    if (activation) {
      activation = false;
      feedback = t("حساب فعال شد. اکنون وارد شوید.", "Account activated. Sign in to continue.");
    } else {
      clearWorkspace();
      session = result;
      review = false;
      page = "main";
      feedback = "";
    }
  } catch (err) {
    feedback = errorText(err.message);
  }
  render();
});
async function updateConnector(operation) {
  if (connectorBusy) return;
  const requester = session;
  connectorBusy = true;
  try {
    const body = operation && { operation, connector: "shadverse-workspace", scope: "projects:count" };
    const result = await api("integrations", body);
    if (session === requester) connectorState = result;
  } catch (error) {
    if (session !== requester || page !== "monitor") return;
    if (error.message === "auth") {
      returnToGate();
      return;
    }
    if (error.message === "integration_scope" && connectorState) {
      connectorState.connectors[0].status = "not_granted";
      delete connectorState.projectCount;
    }
    feedback = errorText(error.message);
  } finally {
    if (session === requester) {
      connectorBusy = false;
      if (page === "monitor") render();
    }
  }
}
async function updateProjects(name, control) {
  const requester = session;
  if (control) control.disabled = true;
  try {
    const result = await api("actions", name ? { action: "project.create", input: { name } } : undefined);
    if (session !== requester) return;
    if (!name && projectsLoaded && !privateProjects()) return;
    dueReminders = result.dueReminders;
    projects = result.projects.map((project) => project.name);
    projectIds = new Map(result.projects.map((project) => [project.name, project.id]));
    projectsLoaded = true;
    if (name && privateProjects()) {
      activeProject = result.project.name;
      query = "";
    }
  } catch (error) {
    if (session !== requester || !privateProjects()) return;
    if (error.message === "auth") {
      returnToGate();
      return;
    }
    feedback = errorText(error.message);
    render();
    if (name) app.querySelector("#item-name").value = name;
    return;
  }
  if (privateProjects()) render();
}
async function updateTasks(action, fields) {
  const view = taskView;
  const requester = session;
  if (view.busy) return;
  view.busy = true;
  view.error = "";
  render();
  try {
    const result = action
      ? await api("actions", { action, input: { projectId: view.id, ...fields } })
      : await api("actions?project=" + encodeURIComponent(view.id));
    if (session !== requester || taskView !== view) return;
    view.tasks = result.tasks;
    dueReminders = result.dueReminders;
    if (action === "task.setReminder") {
      view.reminderId = null;
      view.reminderInput = "";
    }
    if (action === "task.create" && view.input.trim() === fields.title) view.input = "";
  } catch (error) {
    if (session !== requester || taskView !== view) return;
    if (error.message === "auth") {
      returnToGate();
      return;
    }
    view.error = errorText(error.message);
  } finally {
    if (session === requester && taskView === view) {
      view.busy = false;
      if (privateProjects()) render();
    }
  }
}
async function loadPersonalMemory() {
  const requester = session;
  try {
    const result = await api("memory");
    if (session !== requester || !personalMemory() || personalNotes !== null) return;
    personalNotes = result.notes;
  } catch (error) {
    if (session !== requester || !personalMemory()) return;
    if (error.message === "auth") returnToGate();
    else feedback = errorText(error.message);
  }
  if (session === requester && personalMemory()) render();
}
async function changePersonalMemory(body, control) {
  const requester = session;
  control.disabled = true;
  try {
    const result = await api("memory", body);
    if (session !== requester) return;
    personalNotes = result.notes;
    editingNote = null;
  } catch (error) {
    if (session !== requester) return;
    if (error.message === "auth") returnToGate();
    else {
      feedback = errorText(error.message);
      if (personalMemory()) {
        render();
        const field = app.querySelector("#item-name");
        if (body.text && field) field.value = body.text;
      }
      return;
    }
  }
  if (session === requester && personalMemory()) render();
}
async function updateDocuments(body) {
  const requester = session;
  try {
    const result = body?.operation === "view" ? await api("documents?preview=1&id=" + encodeURIComponent(body.id)) : await api("documents", body);
    if (session !== requester) return;
    if (body?.operation === "view") {
      if (!personalDocuments()) return;
      documentPreview = result;
    } else if (body || privateDocuments === null) {
      privateDocuments = result.files;
      if (body?.operation === "delete") documentPreview = null;
    }
  } catch (error) {
    if (session !== requester || !personalDocuments()) return;
    if (error.message === "auth") returnToGate();
    else feedback = errorText(error.message);
  }
  if (session === requester && personalDocuments()) render();
}
app.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;
  feedback = "";
  const modelAction = /^model-(pause|resume)-([a-z0-9-]+)$/.exec(action);
  if (modelAction && page === "admin" && session?.chatAvailable) {
    const requester = session;
    control.disabled = true;
    try {
      const registry = await api("models", { id: modelAction[2], paused: modelAction[1] === "pause" });
      if (page === "admin" && session === requester) modelRegistry = registry;
    } catch (err) {
      if (page === "admin" && session === requester) feedback = errorText(err.message);
    }
    if (page === "admin" && session === requester) render();
    return;
  }
  if (action === "reveal") {
    const input = app.querySelector("[name=password]");
    reveal = !reveal;
    input.type = reveal ? "text" : "password";
    return;
  }
  if (action.startsWith("prompt-") && Object.hasOwn(starters(), action.slice(7))) {
    const input = app.querySelector("#draft");
    const suggestion = starters()[action.slice(7)][1];
    draft = draft ? draft + "\n" + suggestion : suggestion;
    input.value = draft;
    input.focus();
    input.setSelectionRange(draft.length, draft.length);
    return;
  }
  if (action === "save-draft") {
    if (draft.trim()) {
      savedDrafts.push({ name: draft, project: activeProject });
      feedback = t("پیش‌نویس در این نشست ذخیره شد.", "Draft saved in this session.");
    } else feedback = t("ابتدا متن پیام را بنویسید.", "Write a message first.");
    render();
    return;
  }
  if (personalDocuments() && action.startsWith("document-")) {
    if (action === "document-upload") {
      app.querySelector("#private-document").click();
      return;
    }
    const operation = /^document-(view|delete)-([a-f0-9-]{36})$/.exec(action);
    if (!operation) return;
    if (operation[1] === "view" || confirm(t("این فایل حذف شود؟", "Delete this file?"))) {
      control.disabled = true;
      await updateDocuments({ operation: operation[1], id: operation[2] });
    }
    return;
  }
  if (action.startsWith("draft-export-") && page === "workspace" && tab === "history") {
    const item = workspaceItems()[Number(action.slice("draft-export-".length))];
    if (item) downloadArtifact(draftDocument(item.name, lang), "text/html;charset=utf-8", "jarvis-draft.html");
    return;
  }
  if (action === "memory-csv" && personalMemory() && personalNotes?.length) {
    downloadArtifact(notesCsv(personalNotes, lang), "text/csv;charset=utf-8", "jarvis-notes.csv");
    return;
  }
  if (personalMemory() && action.startsWith("memory-")) {
    if (action === "memory-cancel") {
      editingNote = null;
      render();
      return;
    }
    const noteAction = /^memory-(edit|delete)-([a-f0-9-]{36})$/.exec(action);
    const note = personalNotes?.find((item) => item.id === noteAction?.[2]);
    if (!note) return;
    if (noteAction[1] === "edit") {
      editingNote = note.id;
      render();
      app.querySelector("#item-name").focus();
    } else if (confirm(t("این یادداشت حذف شود؟", "Delete this note?"))) {
      await changePersonalMemory({ operation: "delete", id: note.id }, control);
    }
    return;
  }
  if (privateProjects() && action.startsWith("project-tasks-")) {
    const name = workspaceItems()[Number(action.slice("project-tasks-".length))]?.name;
    const id = projectIds.get(name);
    if (id && taskView?.id !== id) {
      taskView = { id, name, tasks: [], busy: false, error: "", input: "", reminderId: null, reminderInput: "" };
      await updateTasks();
    }
    return;
  }
  if (privateProjects() && action.startsWith("reminder-ack-")) {
    const reminder = dueReminders.find(({ id }) => id === action.slice("reminder-ack-".length));
    if (!reminder) return;
    const requester = session;
    control.disabled = true;
    try {
      const result = await api("actions", {
        action: "task.acknowledgeReminder",
        input: { projectId: reminder.projectId, taskId: reminder.id, due: reminder.due },
      });
      if (session === requester) dueReminders = result.dueReminders;
    } catch (error) {
      if (session !== requester) return;
      if (error.message === "auth") returnToGate();
      else {
        feedback = errorText(error.message);
        if (error.message === "reminder_missing")
          dueReminders = dueReminders.filter((item) => item !== reminder);
      }
    }
    if (session === requester && privateProjects()) render();
    return;
  }
  if (privateProjects() && taskView) {
    if (action === "tasks-close") {
      taskView = null;
      render();
      return;
    }
    if (action === "reminder-close") {
      taskView.reminderId = null;
      render();
      return;
    }
    if (action === "reminder-save" && taskView.reminderId) {
      const due = new Date(taskView.reminderInput).getTime();
      if (!Number.isSafeInteger(due)) {
        taskView.error = errorText("reminder_invalid");
        render();
      } else await updateTasks("task.setReminder", { taskId: taskView.reminderId, due });
      return;
    }
    const reminderAction = /^reminder-(edit|cancel)-([a-f0-9-]{36})$/.exec(action);
    if (reminderAction) {
      const task = taskView.tasks.find(({ id }) => id === reminderAction[2]);
      if (!task) return;
      if (reminderAction[1] === "cancel") {
        await updateTasks("task.setReminder", { taskId: task.id, due: null });
      } else {
        taskView.reminderId = task.id;
        taskView.reminderInput = "";
        render();
        app.querySelector("#reminder-due")?.focus();
      }
      return;
    }
    if (action === "task-add") {
      const title = taskView.input.trim();
      if (title) await updateTasks("task.create", { title });
      return;
    }
    if (action.startsWith("task-toggle-")) {
      const task = taskView.tasks.find(({ id }) => id === action.slice("task-toggle-".length));
      if (task) await updateTasks("task.setCompleted", { taskId: task.id, completed: task.completed === null });
      return;
    }
  }
  if (page === "monitor" && session && !review && action.startsWith("connector-")) {
    control.disabled = true;
    await updateConnector(action.slice("connector-".length));
    if (control.isConnected) control.disabled = false;
    return;
  }
  if (action === "add-item") {
    const name = app.querySelector("#item-name").value.trim();
    if (!name) return;
    if (personalMemory()) {
      await changePersonalMemory({ operation: editingNote ? "edit" : "add", id: editingNote, text: name }, control);
      return;
    }
    if (privateProjects()) {
      await updateProjects(name, control);
      return;
    }
    if (tab === "projects") {
      if (!projects.includes(name)) projects.push(name);
      activeProject = name;
    } else notes.push({ name, project: activeProject });
    query = "";
    render();
    return;
  }
  if (action === "pick-file") {
    app.querySelector("#workspace-file").click();
    return;
  }
  if (action.startsWith("open-item-")) {
    const item = workspaceItems()[Number(action.slice(10))];
    if (!item) return;
    if (tab === "projects") {
      activeProject = item.name;
      tab = "files";
    } else {
      draft = item.name;
      page = "main";
    }
    query = "";
    render();
    return;
  }
  if (action === "attach") {
    app.querySelector("#file")?.click();
    return;
  }
  if (action.startsWith("demo-") && Object.hasOwn(voiceStates, action.slice(5))) {
    stopAudio();
    micState = t("نمایش حرکت بدون ورودی صوتی", "Motion demonstration without audio input");
    demoState = action.slice(5);
    syncVoice();
    app.querySelector('[data-action="' + action + '"]')?.focus({ preventScroll: true });
    return;
  }
  if (action === "activation") {
    activation = !activation;
    reveal = false;
  } else if (action === "lang") lang = lang === "fa" ? "en" : "fa";
  else if (action === "review" && canPreview) {
    review = true;
    page = location.hash === "#voice" ? "voice" : "main";
  } else if (action === "menu") drawer = !drawer;
  else if (action === "logout") {
    try {
      if (session) await api("logout", {});
    } catch (err) {
      if (err.message !== "auth") {
        feedback = errorText(err.message);
        render();
        return;
      }
    }
    stopAudio();
    clearWorkspace();
    page = "login";
    session = null;
    review = false;
    drawer = false;
    draft = "";
    files = [];
    users = null;
    micState = "";
    demoState = "idle";
    reveal = false;
  } else if (action === "mic" && session?.chatAvailable && !review) {
    await runPersianTurn();
    return;
  } else if (action === "mic" || action === "sample") {
    const stopping = signal.mode === action;
    stopAudio();
    if (stopping) {
      demoState = "idle";
      micState = t("صدا متوقف شد.", "Audio stopped.");
      syncVoice();
      return;
    }
    const epoch = voiceEpoch;
    control.disabled = true;
    try {
      if ((await signal.start(action)) && epoch === voiceEpoch) {
        demoState = action === "mic" ? "listening" : "speaking";
        micState =
          action === "mic"
            ? t(
                "ورودی زندهٔ میکروفون؛ پردازش فقط در مرورگر",
                "Live microphone input, processed in this browser",
              )
            : t(
                review ? "پخش نمونهٔ ضبط‌شده؛ حرکت هماهنگ با صدا" : "پخش نمونهٔ ضبط‌شده",
                review ? "Prerecorded sample, motion driven by playback" : "Prerecorded sample",
              );
      }
    } catch {
      if (epoch === voiceEpoch) {
        demoState = "error";
        micState = t("دسترسی به صدا ممکن نشد.", "Audio is unavailable.");
      }
    } finally {
      control.disabled = false;
      if (epoch === voiceEpoch) syncVoice();
    }
    return;
  } else if (action.startsWith("tab-")) {
    stopAudio();
    query = "";
    tab = action.slice(4);
    page = "workspace";
    drawer = false;
  } else if (action.startsWith("remove-")) files.splice(Number(action.slice(7)), 1);
  else if (["month", "year"].includes(action)) period = action;
  else if (["main", "voice", "workspace", "monitor", "plans", "admin"].includes(action)) {
    if (action === "admin" && !review && session?.role !== "creator") return;
    stopAudio();
    demoState = "idle";
    micState = "";
    page = action;
    drawer = false;
    users = null;
    modelRegistry = null;
    if (page === "admin" && !review) {
      try {
        const requester = session;
        const [result, registry] = await Promise.all([
          api("admin"),
          requester.chatAvailable ? api("models") : null,
        ]);
        if (page !== "admin" || session !== requester) return;
        users = result.users;
        modelRegistry = registry;
      } catch (err) {
        users = null;
        feedback = errorText(err.message);
      }
    }
  }
  render();
  if (action === "monitor" && session && !review) void updateConnector();
  if (privateProjects() && (!projectsLoaded || ["workspace", "tab-projects"].includes(action))) void updateProjects();
  if (personalMemory() && personalNotes === null) void loadPersonalMemory();
  if (personalDocuments() && privateDocuments === null) void updateDocuments();
});
app.addEventListener("input", (event) => {
  if (event.target.id === "draft") draft = event.target.value;
  if (event.target.id === "task-title" && taskView) taskView.input = event.target.value;
  if (event.target.id === "reminder-due" && taskView) taskView.reminderInput = event.target.value;
  if (event.target.id === "search") {
    query = event.target.value;
    app.querySelector("#results").innerHTML = listItems();
  }
});
app.addEventListener("change", async (event) => {
  if (event.target.id === "private-document" && personalDocuments()) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size < 1 || file.size > 1024 * 1024) {
      feedback = errorText("file_invalid");
      render();
      return;
    }
    const requester = session;
    const reader = new FileReader();
    reader.onload = () => {
      if (session === requester && personalDocuments()) {
        void updateDocuments({ operation: "add", name: file.name, content: reader.result.split(",")[1] });
      }
    };
    reader.onerror = () => {
      if (session === requester && personalDocuments()) {
        feedback = errorText("file_invalid");
        render();
      }
    };
    reader.readAsDataURL(file);
    return;
  }
  if (event.target.id === "project-filter") {
    activeProject = event.target.value;
    editingNote = null;
    documentPreview = null;
    render();
    if (personalMemory() && personalNotes === null) void loadPersonalMemory();
    if (personalDocuments() && privateDocuments === null) void updateDocuments();
    return;
  }
  if (event.target.id === "workspace-file") {
    const epoch = workspaceEpoch,
      project = activeProject;
    for (const f of Array.from(event.target.files)) {
      let url = null;
      if (
        ["image/png", "image/jpeg", "image/webp"].includes(f.type) &&
        f.size <= 12 * 1024 * 1024
      ) {
        try {
          const bitmap = await createImageBitmap(f, {
            resizeWidth: 160,
            resizeHeight: 160,
            resizeQuality: "medium",
          });
          const thumb = document.createElement("canvas");
          thumb.width = thumb.height = 160;
          thumb.getContext("2d").drawImage(bitmap, 0, 0);
          bitmap.close();
          url = thumb.toDataURL("image/webp");
        } catch {}
      }
      if (epoch !== workspaceEpoch) return;
      resources.push({ name: f.name, project, url });
    }
    render();
    return;
  }
  if (event.target.id === "file") {
    files.push(...event.target.files);
    render();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && drawer) {
    drawer = false;
    render();
    app.querySelector(".mobilemenu")?.focus();
  }
});
function showSession(user) {
  clearWorkspace();
  session = user;
  page = "main";
  render();
}
if (standalone && location.hash === "#voice") {
  review = true;
  page = "voice";
}
if (!standalone && location.pathname !== "/review")
  api("session")
    .then(showSession)
    .catch(() => {});
render();

if (!standalone && window.isSecureContext && "serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js").catch(() => {});

function suspendAudio() {
  stopAudio();
  if (page === "voice") {
    demoState = "idle";
    micState = "";
    syncVoice();
  }
}
window.addEventListener("pagehide", suspendAudio);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) suspendAudio();
});

app.addEventListener("pointerover", (event) => {
  const pane = event.target.closest?.(".glass,.surface");
  if (
    !pane ||
    pane.contains(event.relatedTarget) ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;
  const bounds = pane.getBoundingClientRect();
  pane.style.setProperty(
    "--key-x",
    Math.round((100 * (event.clientX - bounds.left)) / bounds.width) + "%",
  );
});
