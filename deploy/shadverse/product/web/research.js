export function createResearchUI({
  api,
  active,
  available,
  button,
  onAuth,
  render,
  root,
  safe,
  t,
}) {
  let query = "",
    sources = [],
    details = new Map(),
    checkedAt = null,
    feedback = "",
    controller = null;
  function close() {
    controller?.abort();
    controller = null;
    query = "";
    sources = [];
    details.clear();
    checkedAt = null;
    feedback = "";
  }
  function view() {
    const busy = controller !== null;
    const enabled = available();
    return `<section class="surface stack" aria-labelledby="research-title" aria-busy="${busy}">
      <h1 id="research-title">${t("پژوهش جارویس", "JARVIS Research")}</h1>
      ${
        enabled
          ? `<label class="field"><input id="research-query" dir="auto" maxlength="300"
        value="${safe(query)}" aria-label="${t("عبارت جست‌وجو", "Search query")}"></label>
      <div class="controls">${button("research-search", t("جست‌وجوی وب", "Search the web"), "outline", busy)}
        ${busy ? button("research-stop", t("توقف", "Stop")) : ""}</div>`
          : `<p>${t("جست‌وجوی بیرونی در انتظار مجوز است.", "External search is awaiting authorization.")}</p>`
      }
      ${checkedAt ? `<p class="sub">${t("زمان بازیابی", "Retrieved")} · ${safe(new Date(checkedAt).toLocaleString())}</p>` : ""}
      ${sources
        .map((source, index) => {
          const read = details.get(source.id);
          return `<section class="stack">
          <h3><a href="${safe(read?.url ?? source.url)}" target="_blank" rel="noopener noreferrer"><bdi>${index + 1}. ${safe(read?.title ?? source.title)}</bdi></a></h3>
          ${source.published ? `<p><bdi>${safe(source.published)}</bdi></p>` : ""}
          <p><bdi>${safe(read?.excerpt ?? source.excerpt)}</bdi></p>
          ${read?.truncated ? `<p>${t("خواندن صفحه محدود شده است.", "The page excerpt is truncated.")}</p>` : ""}
          ${read ? "" : button("research-read-" + source.id, t("خواندن صفحه", "Read page"), "outline", busy)}
        </section>`;
        })
        .join("")}
      <p role="status">${safe(feedback)}</p>
    </section>`;
  }
  async function handle(action) {
    if (action === "stop") {
      controller?.abort();
      controller = null;
      render();
      return;
    }
    if (controller || !available()) return;
    const operation = action === "search" ? "search" : "read";
    const id = action.startsWith("read-") ? action.slice(5) : null;
    const message = query.trim();
    if (operation === "search" && !message) {
      root.querySelector("#research-query")?.focus();
      return;
    }
    if (operation === "read" && !sources.some((item) => item.id === id)) return;
    const current = new AbortController();
    controller = current;
    feedback = "";
    if (operation === "search") {
      sources = [];
      details.clear();
      checkedAt = null;
    }
    render();
    try {
      const result = await api(
        "research",
        operation === "search" ? { operation, query: message } : { operation, id },
        current.signal,
      );
      if (controller !== current || !active()) return;
      if (operation === "search") {
        sources = result.sources;
        checkedAt = result.checkedAt;
        details.clear();
        if (!sources.length) feedback = t("منبعی پیدا نشد.", "No sources found.");
      } else details.set(id, result.source);
    } catch (error) {
      if (controller !== current || !active()) return;
      if (error.message === "auth") return onAuth();
      if (error.message === "research_source")
        feedback = t(
          "مهلت منابع پایان یافته است. دوباره جست‌وجو کنید.",
          "Sources expired. Search again.",
        );
      else feedback = t("دریافت منبع ممکن نشد.", "The source could not be retrieved.");
    } finally {
      if (controller === current) {
        controller = null;
        if (active()) render();
      }
    }
  }
  return {
    close,
    view,
    handle,
    input(value) {
      query = value;
    },
  };
}
