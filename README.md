# المكتبة الشاملة

تطبيق أندرويد (`com.alboheth.assistant`): سراج وكتب علم التعبير ونظمه وكتب الفراسة وقواعد التعبير.

**التنزيل المباشر لأول مرة:** [آخر إصدار](../../releases/latest/download/almaktaba.apk)
(قبل أول نشر آلي: [الإصدار الحالي](https://raw.githubusercontent.com/AliHasan122519/Search/main/apk/almaktaba.apk))

## التحديث التلقائي لكل المستخدمين
1. عدّل أي شيء في المصدر (`src/` أو `content/` …) وارفعه إلى الفرع `main`.
2. يشغّل GitHub آليًا ملف `.github/workflows/release.yml`: يبني APK ويوقّعه برقم إصدار أعلى تلقائيًا، وينشره في **Releases**، ويكتب رابطه في `content/manifest.json`.
3. كل مستخدم يفتح التطبيق (أو يرجع إليه) يجد الإصدار الجديد، فينزّله التطبيق بصمت ويثبّته عند خروجه منه.

لا حاجة إلى أي خطوة يدوية بعد الإعداد التالي.

## الإعداد (مرة واحدة)
في المستودع: **Settings ‹ Secrets and variables ‹ Actions** أضف السرّين:
- `ANDROID_KEYSTORE_BASE64`: مفتاح التوقيع بصيغة base64
- `ANDROID_KEYSTORE_PASSWORD`: كلمة مروره

(القيمتان في ملف `github-secrets.txt` الذي سُلِّم لصاحب المستودع. لا تُرفعا إلى المستودع.)
ثم من تبويب **Actions** شغّل «بناء ونشر التطبيق» يدويًا (Run workflow) لأول إصدار آلي.

يجب أن يبقى مفتاح التوقيع نفسه دائمًا، وإلا لن يقبل أندرويد التحديث فوق النسخة المثبّتة.

## الموقع (Netlify) يتحدّث مع كل رفع
ملف `netlify.toml` يضبط البناء (`npm run build` ثم نشر `dist`). اربط الموقع بهذا المستودع مرة واحدة:
**Netlify › Site configuration › Build & deploy › Continuous deployment › Link repository** واختر الفرع `main`.
بعدها كل رفع يغيّر `src` أو `public` أو `content` يُبنى وينشر وحده، ولا يُعاد البناء لرفع ملف APK فقط.
(بديل مجاني: Actions › «نشر الموقع على GitHub Pages» بعد تفعيل Pages.)

## ما يصل إلى من
- **تطبيق أندرويد:** يصل التحديث عند فتح المستخدمين التطبيق (يبنيه `release.yml` أو يُنشر يدويًا بـ `scripts/publish_update.mjs`).
- **الموقع:** يصل بعد البناء الآلي أعلاه.

## للمطوّر
```bash
npm ci
npm run dev        # للتجربة
npm run build      # موقع ثابت في dist
```
ملاحظات التصميم في `ASSISTANT_NOTES.md`.
