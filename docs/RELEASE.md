# نسخة الإطلاق: النشر والتحقق والتراجع

## مفتاح الإطلاق (واحد للموقع كله)
يُضبط وقت البناء بمتغير `LAUNCH`:

| | بدون `LAUNCH` (الوضع الحالي) | `LAUNCH=1` |
|---|---|---|
| شريط «نسخة تجريبية» | يظهر | يختفي |
| `<meta name="robots">` | noindex, nofollow | محذوف |
| `robots.txt` | `Disallow: /` | `Allow: /` |

- **GitHub Pages:** Settings → Secrets and variables → Actions → Variables → `LAUNCH` = `1`، ثم Actions → Deploy GitHub Pages → Run workflow.
- **Netlify:** Site settings → Environment variables → `LAUNCH` = `1` و`SITE_URL` = عنوان الموقع النهائي مع `/` في آخره، ثم Deploy.
- `SITE_URL` يُستخدم لصورة معاينة الروابط (`og.jpg`). الافتراضي: عنوان GitHub Pages.

## Netlify + mowajeh.online (المعتمد)
1. Netlify → Add new site → Import from Git → GitHub → `4wy2/muwajjah-app` → فرع `main`. الإعدادات تُقرأ من `netlify.toml` (البناء، Node 22، `LAUNCH=1`، `SITE_URL`، توجيه الصفحات الداخلية).
2. جرّب الرابط المؤقت `*.netlify.app`: صفحة «قيد التجهيز» للزائر، وفتح رابط جامعة مباشرة يعمل.
3. Domain management → Add domain → `mowajeh.online` (+ `www`). سجلات DNS عند المزود: `A @ 75.2.60.5` و`CNAME www <الموقع>.netlify.app`، أو Netlify DNS إن كان الدومين عليه أصلًا. HTTPS يتفعّل تلقائيًا.
4. Supabase → Authentication → URL Configuration: Site URL `https://mowajeh.online`، وأضف `https://mowajeh.online/**` و`https://<الموقع>.netlify.app/**`.
5. قفل الموقع وفتحه: لوحة الإدارة → «بلس والوصول» → أول بطاقة.

## الاستضافة
- **الحالية:** GitHub Pages (`.github/workflows/pages.yml`). كل دفع إلى `main` ينشر تلقائيًا. الصفحات الداخلية تعمل عبر `404.html` (نسخة من `index.html`)، لكن الخادم يرجع رمز 404 للزاحف عند فتح رابط داخلي مباشرة. لا يؤثر على الطالب، لكنه يضعف الأرشفة.
- **عند الإطلاق على الدومين:** Netlify جاهز (`netlify.toml`: build `npm run build`، publish `dist`، Node 22، إعادة توجيه SPA بحالة 200). أو Cloudflare Pages بنفس الأوامر وملف `public/_redirects`.

## Supabase عند نقل الدومين
Authentication → URL Configuration:
1. Site URL = الدومين الجديد.
2. Redirect URLs: أضف `https://<الدومين>/**` (أبقِ رابط GitHub Pages لين يكتمل النقل).
3. Google Cloud Console: لا يتغير Callback (هو عنوان Supabase نفسه).

## التحقق بعد النشر (5 دقائق)
1. الرئيسية تفتح، وفيها 27 جامعة، والبحث بالاسم والمدينة يعمل.
2. افتح رابط جامعة مباشرة ثم حدّث الصفحة.
3. سجّل دخول بقوقل، احفظ جامعة في المفضلة، سجّل خروج ثم دخول: المفضلة باقية.
4. من نافذة خاصة: لا تظهر المقارنة، ولا أي ذكر لبلس أو سعر.
5. `/robots.txt` يطابق حالة مفتاح الإطلاق.
6. لوحة الإدارة: افتح جامعة، «معاينة قبل النشر» تفتح صفحة الطالب.

## التراجع
- **الواجهة:** `git revert <commit الدمج>` ثم ادفع إلى `main`، أو من Actions أعد تشغيل نشر نسخة سابقة. الملفات القديمة تبقى متاحة للصفحات المفتوحة.
- **قاعدة البيانات:** التراجع عن الواجهة لا يرجع البيانات. لكل migration ملف `_rollback.sql`. نسخ احتياطية لتعديلات 2026-11-10 في `backup.universities_20261110` و`backup.programs_20261110`، وأوامر الاسترجاع في آخر `database/009_data_fixes.sql`.
- migration 009 متوافقة مع الواجهة القديمة باستثناء أن ملصق السكن لا يظهر فيها للقيم الجديدة.

## Migrations
| الملف | الحالة |
|---|---|
| 005–009 | مطبقة على الإنتاج |
| 010_revoke_anon_admin_rpc | **جاهزة وغير مطبقة.** تمنع الزوار من استدعاء دوال الإدارة (الدوال نفسها ترفض غير المالك أصلًا، هذي طبقة حماية إضافية). مختبرة على قاعدة معزولة. |
