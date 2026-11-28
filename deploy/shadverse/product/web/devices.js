export function createDevicesUI({
  api,
  root,
  render,
  active,
  user,
  safe,
  button,
  t,
  onAuth,
  show,
}) {
  let data = null,
    selected = null;
  const expiry = (ms) => new Intl.DateTimeFormat(undefined, { dateStyle: "short" }).format(ms);
  const labels = () => ({
    device_missing: t("مجوز دستگاه در دسترس نیست.", "Device permission is unavailable."),
    device_unavailable: t("خواندن دستگاه در دسترس نیست.", "Device inventory is unavailable."),
    device_invalid: t(
      "شناسه، حساب، نام و مدت معتبر وارد کنید.",
      "Enter a valid ID, account, label and duration.",
    ),
    device_limit: t(
      "این دستگاه به حساب دیگری اختصاص یافته یا ظرفیت پر است.",
      "The device belongs to another account or the grant limit has been reached.",
    ),
  });
  function view() {
    if (!user()) return "";
    return `<section class="surface stack"><h2>${t("دستگاه‌های مجاز", "Authorized devices")}</h2>
      ${button("device-refresh", t("بررسی دستگاه‌ها", "Check devices"))}
      ${data && !data.available ? `<p>${t("اتصال فهرست دستگاه‌ها در دسترس نیست.", "The inventory connection is unavailable.")}</p>` : ""}
      ${
        data?.grants
          .map((row) => {
            const node = data.nodes.find(({ id }) => id === row.id);
            return `<div class="work-row"><bdi>${safe(row.label)} · ${safe(expiry(row.expires))}</bdi>
          ${node ? `<span>${node.connected ? t("متصل", "Connected") : t("آفلاین", "Offline")}</span>` : ""}
          ${
            row.accepted
              ? button("device-describe-" + row.id, t("جزئیات", "Details"), "outline", !node)
              : button("device-accept-" + row.id, t("اجازهٔ خواندن", "Allow inventory reading"))
          }
          ${button("device-decline-" + row.id, t("لغو دسترسی", "Revoke access"))}
        </div>`;
          })
          .join("") ?? ""
      }
      ${selected ? `<output><bdi>${safe(selected.label)} · ${safe(selected.platform ?? "—")} · ${safe(selected.version ?? "—")}</bdi></output>` : ""}
      </section>`;
  }
  function admin() {
    if (!user()?.deviceAdmin) return "";
    return `<section class="surface stack"><h2>${t("مجوز خواندن دستگاه", "Device inventory grants")}</h2>
    <div class="controls">
      <label class="field"><input id="device-account" aria-label="${t("حساب مقصد", "Target account")}" maxlength="48"></label>
      <label class="field"><input id="device-id" aria-label="${t("شناسهٔ دستگاه", "Node ID")}" maxlength="128"></label>
      <label class="field"><input id="device-label" aria-label="${t("نام دستگاه", "Device label")}" maxlength="100"></label>
      <label>${t("روز اعتبار", "Days valid")} <input id="device-days" type="number" value="7" min="1" max="30"></label>
      ${button("device-grant", t("پیشنهاد مجوز", "Offer grant"))}
      ${button("device-revoke", t("پس‌گرفتن مجوز", "Revoke grant"))}
    </div></section>`;
  }
  async function handle(action, control) {
    const requester = user();
    control.disabled = true;
    try {
      const command = /^(accept|decline|describe)-([A-Za-z0-9_-]+)$/u.exec(action);
      if (active() === "monitor" && (action === "refresh" || command)) {
        if (command?.[1] === "describe") {
          const result = await api("devices?id=" + encodeURIComponent(command[2]));
          if (user() === requester) selected = result.node;
        } else {
          if (command) await api("devices", { operation: command[1], id: command[2] });
          const result = await api("devices");
          if (user() === requester) {
            data = result;
            selected = null;
          }
        }
      } else if (
        active() === "admin" &&
        requester.deviceAdmin &&
        ["grant", "revoke"].includes(action)
      ) {
        const value = (name) => root.querySelector("#device-" + name).value.trim();
        await api("devices", {
          operation: action,
          account: value("account"),
          id: value("id"),
          ...(action === "grant" ? { label: value("label"), days: Number(value("days")) } : {}),
        });
        if (user() === requester) show(t("مجوز به‌روز شد.", "Grant updated."));
      }
    } catch (error) {
      if (user() !== requester) return;
      if (error.message === "auth") return onAuth();
      selected = null;
      show(labels()[error.message] ?? labels().device_unavailable);
    } finally {
      if (user() === requester && ["monitor", "admin"].includes(active())) render();
    }
  }
  return {
    view,
    admin,
    handle,
    clear() {
      data = null;
      selected = null;
    },
  };
}
