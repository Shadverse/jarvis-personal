export function createBootstrapUI({
  api,
  root,
  t,
  safe,
  button,
  render,
  user,
  active,
  onAuth,
  show,
}) {
  let draft = "",
    revision = null,
    busy = false;
  return {
    clear() {
      draft = "";
      revision = null;
      busy = false;
    },
    input(value) {
      draft = value;
    },
    view() {
      if (!user()?.bootstrap) return "";
      return `<section class="surface stack"><h2>SHADVERSE CREATOR BOOTSTRAP</h2>
        ${button("bootstrap-load", t("بارگیری بسته", "Load package"), "outline", busy)}
        ${
          revision === null
            ? ""
            : `<p>${t("نسخهٔ ذخیره‌شده", "Stored revision")} · ${revision}</p>
          <label class="field document-preview"><textarea id="bootstrap-json" rows="12" dir="ltr"
            aria-label="${t("بستهٔ JSON", "Package JSON")}" maxlength="125000">${safe(draft)}</textarea></label>
          <div class="controls">
            ${button("bootstrap-import", t("انتخاب فایل JSON", "Choose JSON file"), "outline", busy)}
            <input id="bootstrap-file" type="file" accept=".json,application/json" hidden>
            ${button("bootstrap-save", t("جایگزینی بسته", "Replace package"), "outline", busy)}
            <a class="outline" href="/api/creator/bootstrap?export=1">${t("دریافت بسته", "Export package")}</a>
          </div>`
        }</section>`;
    },
    async import(file) {
      const requester = user();
      if (!file || !requester || !active()) return;
      if (file.size > 125000) {
        show(t("فایل بزرگ‌تر از سقف است.", "The file exceeds the size limit."));
        render();
        return;
      }
      try {
        const text = await file.text();
        JSON.parse(text);
        if (user() === requester && active()) {
          draft = text;
          render();
        }
      } catch {
        if (user() === requester && active()) {
          show(t("فایل JSON معتبر نیست.", "Invalid JSON file."));
          render();
        }
      }
    },
    async handle(action) {
      const requester = user();
      if (!requester?.bootstrap || !active() || busy) return;
      if (action === "import") {
        root.querySelector("#bootstrap-file")?.click();
        return;
      }
      let body;
      if (action === "save") {
        if (
          revision === null ||
          !confirm(t("بستهٔ کنونی جایگزین شود؟", "Replace the current package?"))
        )
          return;
        try {
          body = { revision, package: JSON.parse(draft) };
        } catch {
          show(t("بستهٔ JSON معتبر نیست.", "Invalid package JSON."));
          render();
          return;
        }
      } else if (action !== "load") return;
      busy = true;
      render();
      try {
        const result = await api("creator/bootstrap", body);
        if (user() !== requester || !active()) return;
        revision = result.revision;
        draft = JSON.stringify(result.package, null, 2);
        if (body) show(t("بسته ذخیره شد.", "Package saved."));
      } catch (error) {
        if (user() !== requester || !active()) return;
        if (error.message === "auth") return onAuth();
        show(
          error.message === "bootstrap_conflict"
            ? t(
                "نسخه تغییر کرده است. ابتدا بسته را دوباره بارگیری کنید.",
                "The revision changed. Reload the package before replacing it.",
              )
            : t("بسته با الگو یا حد مجاز سازگار نیست.", "The package was rejected by validation."),
        );
      } finally {
        if (user() === requester && active()) {
          busy = false;
          render();
        }
      }
    },
  };
}
