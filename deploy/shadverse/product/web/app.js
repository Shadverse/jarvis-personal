import { energyCore, voiceStates } from "./core.js";
import { icon } from "./icons.js";
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
  micState = "";
const t = (fa, en) => (lang === "fa" ? fa : en);
const safe = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const names = () => ({
  login: t("ورود", "Sign in"),
  main: t("دستیار من", "My assistant"),
  voice: t("دستیار صوتی", "Voice assistant"),
  workspace: t("فضای کار", "Workspace"),
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
const brand = () =>
  '<div class="brand"><img src="./icon-192.png" alt=""><div>SHADVERSE <b>JARVIS</b></div></div>';
const language = () =>
  `<button class="outline lang" data-action="lang">${icon("globe")}${t("EN", "فارسی")}</button>`;
const button = (action, body, cls = "outline") =>
  `<button type="button" class="${cls}" data-action="${action}">${body}</button>`;
const notice = () => `<p class="notice" role="status">${safe(feedback)}</p>`;
const previewLabel = () => t("پیش‌نمایش", "Preview");
const offline = () =>
  t(
    "اتصال به دستیار در این پیش‌نمایش غیرفعال است.",
    "Assistant connection is disabled in this preview.",
  );
const attribution = () =>
  `<a href="./OpenClaw-LICENSE.txt" target="_blank" rel="noopener">OpenClaw · MIT</a>`;
function gate() {
  const heading = activation
    ? t("فعال‌سازی حساب", "Activate account")
    : t("به جارویس شادوِرس خوش آمدید", "Welcome to SHADVERSE JARVIS");
  const field = (id, text, type, ico, ac, placeholder) =>
    `<label>${text}<span class="field">${icon(ico)}<input name="${id}" type="${type}" autocomplete="${ac}" required dir="ltr" placeholder="${placeholder}" ${id === "name" ? 'minlength="3" maxlength="48" pattern="[A-Za-z0-9_.\\-]+"' : 'minlength="12" maxlength="256"'}>${id === "password" ? button("reveal", icon("eye"), "eye") : ""}</span></label>`;
  return `<main class="gate"><header class="bar">${brand()}${language()}</header><div class="gatebody">
 <div class="gateart">${energyCore()}</div>
 <section class="gateform glass" dir="${lang === "fa" ? "rtl" : "ltr"}"><span class="seal">${icon("lock")}</span><h1>${heading}</h1><p class="sub">${activation ? t("حساب خود را با کد ثبت‌نام فعال کنید.", "Activate your account with a registration code.") : t("وارد فضای شخصی خود شوید.", "Sign in to your private workspace.")}</p>
 <form id="auth">${field("name", t("نام کاربری", "Username"), "text", "user", "username", "jarvis.user")}${field("password", t("گذرواژه", "Password"), reveal ? "text" : "password", "lock", activation ? "new-password" : "current-password", "••••••••••••")}${activation ? field("code", t("کد ثبت‌نام", "Registration code"), "text", "key", "off", "•••• ••••") : ""}
 ${notice()}<button class="primary" type="submit">${activation ? t("فعال‌سازی", "Activate") : t("ورود به جارویس شادوِرس", "Sign in to SHADVERSE JARVIS")}${icon("arrow")}</button></form>
 <div class="gateactions">${button("activation", icon(activation ? "user" : "key") + (activation ? t("بازگشت به ورود", "Back to sign in") : t("فعال‌سازی با کد ثبت‌نام", "Activate with a registration code")), "textbtn")}</div>
 ${button("review", t("مشاهدهٔ پیش‌نمایش", "Explore visual preview"), "reviewbtn")}</section></div>
 <footer class="foot"><span class="en">SHADVERSE ©</span>${attribution()}</footer></main>`;
}
function nav(k) {
  return button(k, icon(glyph[k]) + label(k), `navbtn ${k === page ? "selected" : ""}`);
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
  return `<div class="studio"><section class="greeting">${energyCore()}<h1>${t("از کجا شروع کنیم؟", "Where shall we begin?")}</h1><div class="starters">${Object.entries(
    starters(),
  )
    .map(([key, [caption]]) => button("prompt-" + key, caption, "starter"))
    .join("")}</div></section>
 <section class="composearea" aria-label="${t("گفت‌وگو", "Conversation")}">
 ${session?.controlUI && !review ? `<p><a class="outline" href="${safe(session.controlUI)}" target="_blank" rel="noreferrer">${t("باز کردن دستیار متصل", "Open paired assistant")}</a></p>` : ""}<div class="composer glass"><textarea id="draft" dir="auto" aria-label="${t("پیام", "Message")}" placeholder="${t("برای جارویس شادوِرس بنویسید…", "Write your message…")}">${safe(draft)}</textarea>
 <div id="attachments">${files.map((f, i) => `<span class="chip"><bdi>${safe(f.name)}</bdi>${button("remove-" + i, icon("close"), "remove")}</span>`).join("")}</div>
 <div class="tools">${button("attach", icon("attach"), "iconbtn")}<input type="file" multiple id="file" hidden><select aria-label="${t("انتخاب مدل", "Model selection")}" disabled><option>${t("مدل پیش‌فرض", "Default model")}</option></select>
 ${button("voice", icon("wave") + label("voice"), "voicebtn")}<button class="primary send" disabled aria-label="${t("ارسال", "Send")}" title="${offline()}">${icon("send")}</button></div></div><p class="status"><i></i>${offline()}</p></section>
 <section class="library"><h2>${label("workspace")}</h2><div class="shortcuts glass">${["history", "projects", "memory", "files", "gallery"].map((k) => button("tab-" + k, icon(glyph[k]) + "<span>" + label(k) + "</span>", "shortcut")).join("")}</div></section></div>`;
}
function title(k) {
  return `<div class="pagetitle"><h1>${label(k)}</h1></div>`;
}
function voice() {
  const stateLabel = (k) => t(...voiceStates[k]);
  return `<section class="voice-stage" data-state="${demoState}"><h1>${label("voice")}</h1>
  <p class="sub">${t("این حالت‌ها نمایشی هستند. سرویس صوتی متصل نیست.", "Voice states are demonstrations. The voice service is disconnected.")}</p>
  ${energyCore(demoState)}
  <div class="waveform" aria-hidden="true">${"<i></i>".repeat(39)}</div>
  <h2 aria-live="polite">${stateLabel(demoState)}</h2>
  <div class="modes glass" role="group" aria-label="${t("انتخاب حالت نمایشی", "Select demonstration state")}">${Object.keys(
    voiceStates,
  )
    .map(
      (k) =>
        `<button type="button" data-action="demo-${k}" aria-pressed="${k === demoState}">${stateLabel(k)}</button>`,
    )
    .join("")}</div>
  ${button("mic", icon("mic") + t("بررسی میکروفون", "Check microphone"), "mic-check")}
  <p class="notice" role="status">${safe(micState)}</p></section>`;
}
function space() {
  return (
    title("workspace") +
    `<section class="surface stack"><div class="controls"><div class="seg">${["history", "projects", "memory", "files", "gallery"].map((k) => button("tab-" + k, label(k), tab === k ? "on" : "")).join("")}</div>
 <label class="field">${icon("search")}<input type="search" id="search" aria-label="${t("جست‌وجو", "Search")}" placeholder="${t("جست‌وجو در این بخش", "Search this section")}"></label></div>
 <div class="empty">${icon(glyph[tab])}<h2>${label(tab)}</h2><p id="results">${t("داده‌های فضای کار در این پیش‌نمایش بارگذاری نمی‌شوند.", "Workspace data is unavailable in this preview.")}</p></div></section>`
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
  return (
    title("admin") +
    `<div class="surface stack"><h2>${t("کاربران", "Users")}</h2>${users ? users.map((u) => `<div class="auditrow split"><bdi>${safe(u.name)}</bdi><span>${u.role === "creator" ? t("سازنده", "Creator") : t("عضو", "Member")}</span></div>`).join("") : `<p class="sub">${t("فهرست حساب‌ها فقط در نشست سازنده در دسترس است.", "The account list requires a Creator session.")}</p>`}
 <h2>${t("کنترل‌های برنامه‌ریزی‌شده", "Planned controls")}</h2><p class="sub">${t("مدیریت اشتراک و مدل‌ها، گزارش هزینه، صدور کد، ثبت رویدادها و توقف اضطراری.", "Subscription and model management, cost reporting, code issuance, audit and emergency stop.")}</p></div>`
  );
}
function shell() {
  const creator = session?.role === "creator" || review;
  return `<div class="shell"><button class="scrim ${drawer ? "open" : ""}" aria-label="${t("بستن منو", "Close menu")}" data-action="menu"></button><aside class="rail glass ${drawer ? "open" : ""}">${button("menu", icon("close"), "iconbtn drawerclose")}${brand()}
 <nav class="navgroup"><small>${t("محیط شخصی", "Personal space")}</small>${["main", "voice", "workspace"].map(nav).join("")}</nav>
 <nav class="navgroup"><small>${t("حساب کاربری", "Account")}</small>${nav("plans")}${creator ? nav("admin") : ""}</nav>
 <div class="railbottom"><span class="pill">${icon("user")}${review ? previewLabel() : `<bdi>${safe(session.name)}</bdi>`}</span>${button("logout", icon("logout") + t("خروج", "Sign out"), "navbtn")}</div></aside>
 <main class="main"><header class="top"><div class="title">${button("menu", icon("menu"), "iconbtn mobilemenu")}<b>${productName()}</b></div><div class="topactions"><span class="pill"><i class="dot"></i>${previewLabel()}</span>${language()}</div></header>
 <div class="page">${{ main: home, voice, workspace: space, plans, admin }[page]()}${notice()}</div>
 <footer class="footnote"><span class="en">SHADVERSE ©</span>${attribution()}</footer></main></div>`;
}
function render() {
  document.title = productName();
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "fa" ? "rtl" : "ltr";
  app.innerHTML = page === "login" ? gate() : shell();

  for (const [action, fa, en] of [
    ["attach", "افزودن پیوست", "Attach files"],
    ["reveal", "نمایش یا پنهان کردن گذرواژه", "Show or hide password"],
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
async function api(path, body) {
  const response = await fetch("/api/" + path, {
    method: body ? "POST" : "GET",
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
    credentials: t("نام کاربری یا گذرواژه درست نیست.", "Incorrect username or password."),
    invalid: t(
      "نام کاربری باید ۳ تا ۴۸ نویسهٔ لاتین و گذرواژه دست‌کم ۱۲ نویسه باشد.",
      "Use a 3–48 character username and a password of at least 12 characters.",
    ),
    activation: t(
      "فعال‌سازی انجام نشد. کد و نام کاربری را بررسی کنید.",
      "Activation failed. Check the code and username.",
    ),
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
app.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
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
app.addEventListener("click", async (event) => {
  const control = event.target.closest("[data-action]");
  if (!control) return;
  const action = control.dataset.action;
  feedback = "";
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
  if (action === "attach") {
    app.querySelector("#file")?.click();
    return;
  }
  if (action.startsWith("demo-") && Object.hasOwn(voiceStates, action.slice(5))) {
    demoState = action.slice(5);
    render();
    app.querySelector('[data-action="' + action + '"]')?.focus({ preventScroll: true });
    return;
  }
  if (action === "activation") {
    activation = !activation;
    reveal = false;
  } else if (action === "lang") lang = lang === "fa" ? "en" : "fa";
  else if (action === "review") {
    review = true;
    page = "main";
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
  } else if (action === "mic") {
    if (!navigator.mediaDevices?.getUserMedia) {
      micState = t(
        "دسترسی به میکروفون به اتصال امن نیاز دارد.",
        "Microphone access requires a secure context.",
      );
    } else {
      control.disabled = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        micState = t(
          "میکروفون در دسترس است. بررسی پایان یافت.",
          "Microphone available. Check complete.",
        );
      } catch {
        micState = t("دسترسی به میکروفون ممکن نشد.", "Microphone access is unavailable.");
      }
    }
  } else if (action.startsWith("tab-")) {
    tab = action.slice(4);
    page = "workspace";
    drawer = false;
  } else if (action.startsWith("remove-")) files.splice(Number(action.slice(7)), 1);
  else if (["month", "year"].includes(action)) period = action;
  else if (["main", "voice", "workspace", "plans", "admin"].includes(action)) {
    if (action === "admin" && !review && session?.role !== "creator") return;
    page = action;
    drawer = false;
    users = null;
    if (page === "admin" && !review) {
      try {
        const requester = session;
        const result = await api("admin");
        if (page !== "admin" || session !== requester) return;
        users = result.users;
      } catch (err) {
        users = null;
        feedback = errorText(err.message);
      }
    }
  }
  render();
});
app.addEventListener("input", (event) => {
  if (event.target.id === "draft") draft = event.target.value;
  if (event.target.id === "search")
    app.querySelector("#results").textContent = event.target.value
      ? t("داده‌ای برای جست‌وجو در دسترس نیست.", "No workspace data available to search.")
      : t(
          "داده‌های فضای کار در این پیش‌نمایش بارگذاری نمی‌شوند.",
          "Workspace data is unavailable in this preview.",
        );
});
app.addEventListener("change", (event) => {
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
  session = user;
  page = "main";
  render();
}
if (!standalone && location.pathname !== "/review")
  api("session")
    .then(showSession)
    .catch(() => {});
render();

if (!standalone && window.isSecureContext && "serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js").catch(() => {});
