# Testing Translation System

After the PR is merged, here's what happens:

## ✅ What Users Will See

**Exactly the same UI** - All text will be in English because:
- The system loads `en.json` by default
- All English strings are properly defined
- The `t()` function returns the English text

## 🧪 Testing Checklist

Before merging, test these areas:

### Settings Panel
- [ ] All setting labels display correctly
- [ ] Dropdowns show translated options
- [ ] "Automatic Language" toggle works
- [ ] "Select Language" dropdown appears
- [ ] Changing language reloads the app

### Update Dialog
- [ ] "Your Spicy Lyrics version is outdated" shows
- [ ] Update button says "Update"
- [ ] Success message after update

### Notifications
- [ ] Cache clearing notifications appear
- [ ] TTML upload/parse notifications work
- [ ] Error messages display properly

### TTML Profile
- [ ] Profile modal opens with "TTML Profile" title
- [ ] "Makes" and "Uploads" columns appear
- [ ] "Listen" button on songs
- [ ] Tooltips say "View TTML Profile"

## 🌍 For Future Languages

When translators add new language files (e.g., `es.json`):
1. Place file in `/locales/es.json`
2. Add to `AVAILABLE_LANGUAGES` in [i18n.ts](../src/utils/i18n.ts):
   ```typescript
   export const AVAILABLE_LANGUAGES = {
     en: "English",
     es: "Español",  // Add this
     // ... more languages
   };
   ```
3. Users will see it in the language dropdown
4. Automatic language detection will work if Spotify is in that language

## 🔧 How to Add More Languages

Edit [src/utils/i18n.ts](../src/utils/i18n.ts):
```typescript
export const AVAILABLE_LANGUAGES = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  ja: "日本語",
  pt: "Português",
  // Add more as translation files become available
};
```

Uncomment the languages in the code once their JSON files exist in `/locales/`.
