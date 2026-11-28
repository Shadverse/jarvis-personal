# SHADVERSE JARVIS | محیط خصوصی فاز ۰۴

وضعیت فعلی در [PROJECT_STATUS.md](PROJECT_STATUS.md) ثبت شده است. دستورات Ubuntu برای پوستهٔ Bash و حساب مجاز سرور هستند. ابتدا مسیرهای واقعی را روی خود سرور بررسی کنید.

## ۱. پیش‌بررسی فقط‌خواندنی

در همان حساب و با مسیر تنظیمات و نسخهٔ Node سرویس موجود اجرا کنید. دستورهای مدل و خروجی پیکربندی را در سرور نگه دارید.

```bash
openclaw --version
node --version
node --disable-warning=ExperimentalWarning -e "require('node:sqlite')"
openclaw config validate
openclaw config get gateway.bind --json
openclaw config get gateway.auth.mode --json
openclaw config get gateway.reload.mode --json
openclaw config get gateway.http.endpoints.responses.enabled --json
openclaw models status --agent main
openclaw security audit
curl --noproxy '*' -fsS http://127.0.0.1:18789/readyz
uptime
getconf _NPROCESSORS_ONLN
free -h
ss -ltn '( sport = :18789 or sport = :3404 or sport = :3443 )'
```

پیش از ادامه، اتصال درگاه را روی IPv4 loopback، حالت احراز هویت را روی `token`، فضای آزاد حافظه و پردازنده را کافی و دو پورت آزمایشی را آزاد تأیید کنید. مسیر ذخیره‌سازی رمزگذاری‌شده را با `findmnt -T /PATH/TO/ENCRYPTED/CREATOR/STORAGE` بررسی کنید. اشتراک موجود ChatGPT را برای عامل `main` و نبود مسیر جایگزین پولی را تأیید کنید. زمان و سلامت سرویس‌های موجود را برای مقایسه ثبت کنید.

پیکربندی مؤثر Nginx را خصوصی با `sudo nginx -T` بررسی کنید. اگر هر مسیر عمومی، درخواست‌های API سازگاری مثل `/v1/responses`، `/v1/models` و `/v1/embeddings` را به درگاه یا یک پراکسی فراگیر می‌فرستد، کار را متوقف کنید. وجود Basic Auth به‌تنهایی خصوصی بودن آن مسیر را ثابت نمی‌کند. سیاست مؤثر ابزارها و فرمان‌های داخلی عامل `main` باید دسترسی به اعتبارها، دستورات مدیریتی و ابزارهای پرخطر را محدود کند. API با اعتبار مشترک، درخواست را با اختیار مالک اجرا می‌کند. صرف خودداری مدل در یک پیام برای این پذیرش کافی نیست. [مستندات OpenResponses](https://docs.openclaw.ai/gateway/openresponses-http-api)

اگر API خاموش است، **فقط پس از مجوز صریح خالق** و تأیید بارگذاری زنده در نسخه و حالت فعال روی همان سرور، این بخش را اجرا کنید. در نسخه یا حالتی که تغییر به راه‌اندازی مجدد منجر می‌شود، این فاز مسدود می‌ماند.

```bash
# قبل از اجرا، مقدار قبلی دقیق را ثبت کنید: false یا unset.
patch=$(mktemp)
printf '%s\n' '{"gateway":{"http":{"endpoints":{"responses":{"enabled":true}}}}}' > "$patch"
openclaw config patch --file "$patch" --dry-run
rm -f -- "$patch"
# پس از بازبینی نتیجهٔ dry-run و تأیید بارگذاری زنده
openclaw config set gateway.http.endpoints.responses.enabled true --strict-json
curl --noproxy '*' -fsS http://127.0.0.1:18789/readyz
```

نسخه‌های جدید OpenClaw تغییر این مسیر را روی درخواست بعدی اعمال می‌کنند. رفتار نسخهٔ نصب‌شده و حالت فعلی بارگذاری را جداگانه تأیید کنید. پاسخ بدون اعتبارِ مسیر API باید درخواست را رد کند. درخواست تهی زیر فقط برای بررسی پذیرش است و پیام مدل ندارد. [بارگذاری زندهٔ تنظیمات](https://docs.openclaw.ai/gateway/configuration/hot-reload)

```bash
curl --noproxy '*' -sS -o /dev/null -w '%{http_code}\n' \
  -H 'Content-Type: application/json' --data '{}' http://127.0.0.1:18789/v1/responses
# انتظار 401. هر پاسخ دیگر نیاز به بررسی دارد. آزمون مکالمه را شروع نکنید.
```

## ۲. اجرای موقت برنامه و HTTPS روی loopback

از ریشهٔ checkout موجود اجرا کنید. وابستگی ساخت باید از قبل آماده باشد. مسیر نمونه را با مسیر مطلق و رمزگذاری‌شدهٔ خالق عوض کنید. پورت‌های زیر فقط روی loopback هستند. Nginx آزمایشی پردازش مستقل دارد و تنظیمات Nginx اصلی را بارگیری نمی‌کند.

```bash
set -eo pipefail
umask 077
reviewed=${JARVIS_REVIEWED_COMMIT:?Set this to the full reviewed commit SHA}
product=deploy/shadverse/product
git cat-file -e "$reviewed^{commit}" || git fetch --no-tags origin feature/shadverse-product-recovery
esbuild_package=$(cd "$product" && node -p 'require.resolve("esbuild/package.json")')
encrypted_root=/PATH/TO/ENCRYPTED/CREATOR/STORAGE
stage=$(mktemp -d "$encrypted_root/jarvis-phase04.XXXXXX")
install -d -m 700 "$stage"/{state,node_modules,nginx-client,nginx-proxy}
git archive "$reviewed:$product" auth.mjs build.mjs gateway.mjs manage.mjs memory.mjs models.mjs server.mjs web | tar -x -C "$stage"
ln -s "$(dirname "$esbuild_package")" "$stage/node_modules/esbuild"
node "$stage/build.mjs"

export JARVIS_STATE="$stage/state"
export JARVIS_GATEWAY_CREATOR=phase04-creator
export JARVIS_GATEWAY_TOKEN_FILE="$stage/gateway.token"
export JARVIS_GATEWAY_PORT=18789
export JARVIS_ORIGIN=https://jarvis-stage.localhost:3443
export PORT=3404

read -rsp 'New staging password (at least 12 characters): ' phase04_password
printf '\n'
printf '%s' "$phase04_password" | node "$stage/manage.mjs" creator "$JARVIS_GATEWAY_CREATOR"
unset phase04_password
read -rsp 'Existing Gateway token from the approved server-side source: ' phase04_token
printf '\n'
printf '%s' "$phase04_token" > "$JARVIS_GATEWAY_TOKEN_FILE"
unset phase04_token

# Expected status: ready_for_live_review. Sends no model prompt.
node "$stage/manage.mjs" check-gateway

openssl req -x509 -newkey rsa:2048 -nodes -days 2 -sha256 \
  -subj '/CN=jarvis-stage.localhost' -addext 'subjectAltName=DNS:jarvis-stage.localhost' \
  -keyout "$stage/stage.key" -out "$stage/stage.crt"

cat > "$stage/nginx.conf" <<NGINX
worker_processes 1;
pid "$stage/nginx.pid";
error_log "$stage/nginx-error.log";
events { worker_connections 64; }
http {
    access_log off;
    client_body_temp_path "$stage/nginx-client";
    proxy_temp_path "$stage/nginx-proxy";
    server {
        listen 127.0.0.1:3443 ssl;
        server_name jarvis-stage.localhost;
        ssl_certificate "$stage/stage.crt";
        ssl_certificate_key "$stage/stage.key";
        auth_basic off;
        client_max_body_size 24k;
        location / {
            proxy_pass http://127.0.0.1:3404;
            proxy_set_header Host \$http_host;
            proxy_set_header Authorization "";
            proxy_read_timeout 130s;
        }
    }
}
NGINX

nginx_bin=$(command -v nginx || command -v /usr/sbin/nginx)
"$nginx_bin" -t -p "$stage/" -c "$stage/nginx.conf"
nohup node "$stage/server.mjs" > "$stage/app.log" 2>&1 &
echo "$!" > "$stage/app.pid"
"$nginx_bin" -p "$stage/" -c "$stage/nginx.conf"
printf '%s\n' "$stage"
ss -ltn '( sport = :18789 or sport = :3404 or sport = :3443 )'
```

روی رایانهٔ خالق، نشانی SSH تأییدشده و مسیر مرحلهٔ قبل را جایگزین کنید. فقط گواهی عمومی را منتقل کنید. کلید TLS و اعتبار درگاه در سرور می‌مانند. تونل فقط به ورودی آزمایشی وصل می‌شود.

```bash
scp CREATOR@SSH_HOST:/ABSOLUTE_STAGE_PATH/stage.crt ./stage.crt
ssh -N -o ExitOnForwardFailure=yes -L 127.0.0.1:3443:127.0.0.1:3443 CREATOR@SSH_HOST
```

در پوستهٔ دوم، TLS و نبود چالش Basic را بررسی کنید. برای مرورگر، کلید عمومی همان گواهی را در یک پروفایل جداگانهٔ Chromium پین کنید. اعتبارسنجی سراسری TLS را غیرفعال نکنید. فرمان Chromium نمونه برای Bash است و گزینه‌ها در ویندوز نیز به Chrome یا Edge قابل ارسال‌اند.

```bash
curl --noproxy '*' --cacert ./stage.crt \
  --resolve jarvis-stage.localhost:3443:127.0.0.1 -sS -D - -o /dev/null \
  https://jarvis-stage.localhost:3443/
pin=$(openssl x509 -in ./stage.crt -pubkey -noout | openssl pkey -pubin -outform DER | openssl dgst -sha256 -binary | openssl base64 -A)
chromium --user-data-dir="$(mktemp -d)" --ignore-certificate-errors-spki-list="$pin" \
  --host-resolver-rules='MAP jarvis-stage.localhost 127.0.0.1' https://jarvis-stage.localhost:3443/
```

## ۳. پذیرش با دو پیام واقعی

1. عنوان فارسی، فقط یک فرم ورود و نبود هر دو درخواست Basic و توکن درگاه را بررسی کنید. پیش از ورود، `GET /api/session` باید `401` بدهد. در مرورگر، درخواست مستقیم `GET /v1/responses` باید `404` بدهد.
2. با کاربر خالق آزمایشی وارد شوید. فقط این دو پیام کوتاه را از خود رابط بفرستید. پیام اول «در همین گفت‌وگو کد باران-۴۲ را برای پیام بعد در نظر بگیر و فقط بگو آماده‌ام. چیزی در حافظهٔ دائمی ذخیره نکن.» پیام دوم «کد همین گفت‌وگو چه بود؟» پاسخ دوم باید «باران-۴۲» باشد. دو پیام را ثبت کنید و به سقف سه درخواست پایبند بمانید.
3. با `JARVIS_STATE="$stage/state" node "$stage/manage.mjs" invite` یک کد خصوصی برای عضو آزمایشی بسازید. با فعال‌سازی عضو و ورود در یک پروفایل جدید، بررسی کنید که `POST /api/chat` با نشست و CSRF خود عضو، `403` بدهد. با درخواست بدون نشست، `401` لازم است. خروج خالق و رد نشست پس از خروج را بررسی کنید.
4. تب Network را محلی بررسی کنید. مرورگر باید فقط به مبدأ برنامه و مسیرهای برنامه مراجعه کند. پاسخ‌ها، هدرها و URLها را برای نبود اعتبارهای درگاه و ارائه‌دهنده بررسی کنید. گزارش خام، کوکی یا اعتبارها را صادر نکنید. در پایان، `uptime`، `free -h`، سلامت اولیهٔ سرویس‌ها و `ps -p "$(cat "$stage/app.pid"),$(cat "$stage/nginx.pid")" -o pid,pcpu,rss,etime` را با خط مبنا مقایسه کنید.

## ۴. بازگشت

تونل SSH را ببندید. در همان پوستهٔ سرور، ابتدا پراکسی آزمایشی و سپس فرایند آزمایشی Node را متوقف کنید. اگر از پوستهٔ دیگری استفاده می‌کنید، ابتدا مسیر `stage` و هویت PID را بررسی کنید.

```bash
"$nginx_bin" -s quit -p "$stage/" -c "$stage/nginx.conf"
kill -TERM "$(cat "$stage/app.pid")"
rm -f -- "$stage/gateway.token" "$stage/stage.key"
```

اگر در همین فاز API را روشن کردید، فقط همان پرچم را به مقدار قبلی بازگردانید. برای مقدار قبلی `false` از `openclaw config set gateway.http.endpoints.responses.enabled false --strict-json` و برای مقدار قبلی ناموجود از `openclaw config unset gateway.http.endpoints.responses.enabled` استفاده کنید. سپس `openclaw config validate`، سلامت درگاه و وضعیت پورت‌ها را بررسی کنید. پایگاه داده و تنظیمات سرویس اصلی را دست‌نخورده نگه دارید.

SHADVERSE ©
