import storage from "./storage.ts";
import Defaults from "../components/Global/Defaults.ts";

// Available languages
export const AVAILABLE_LANGUAGES = {
  en: "English",
  // Add more languages as they become available in Crowdin
  // es: "Español",
  // fr: "Français",
  // de: "Deutsch",
  // ja: "日本語",
  // pt: "Português",
  // ru: "Русский",
  // it: "Italiano",
  // ko: "한국어",
  // nl: "Nederlands",
};

let currentTranslations: any = null;
let currentLanguage: string = "en";

/**
 * Get Spotify's current language
 */
export function getSpotifyLanguage(): string {
  try {
    // Try to get Spotify's language from the HTML lang attribute
    const htmlLang = document.documentElement.lang;
    if (htmlLang) {
      // Extract just the language code (e.g., "en" from "en-US")
      const langCode = htmlLang.split("-")[0].toLowerCase();
      if (AVAILABLE_LANGUAGES[langCode as keyof typeof AVAILABLE_LANGUAGES]) {
        return langCode;
      }
    }

    // Try to get from Spicetify locale
    if ((Spicetify as any)?.Locale?.getLocale) {
      const locale = (Spicetify as any).Locale.getLocale();
      if (locale) {
        const langCode = locale.split("_")[0].toLowerCase();
        if (AVAILABLE_LANGUAGES[langCode as keyof typeof AVAILABLE_LANGUAGES]) {
          return langCode;
        }
      }
    }

    // Fallback to browser language
    const browserLang = navigator.language.split("-")[0].toLowerCase();
    if (AVAILABLE_LANGUAGES[browserLang as keyof typeof AVAILABLE_LANGUAGES]) {
      return browserLang;
    }
  } catch (error) {
    console.error("Error detecting Spotify language:", error);
  }

  return "en"; // Default fallback
}

/**
 * Load translation file for a specific language
 */
async function loadTranslations(lang: string): Promise<any> {
  try {
    // In production, this would load from the built locales
    // For now, we'll dynamically import the JSON file
    const translations = await import(`../../locales/${lang}.json`);
    return translations.default || translations;
  } catch (error) {
    console.warn(`Failed to load translations for language: ${lang}, falling back to English`, error);
    if (lang !== "en") {
      // Fallback to English if language file doesn't exist
      const enTranslations = await import(`../../locales/en.json`);
      return enTranslations.default || enTranslations;
    }
    throw error;
  }
}

/**
 * Initialize the translation system
 */
export async function initI18n(): Promise<void> {
  const autoLanguage = storage.get("autoLanguage") !== "false"; // Default to true
  let targetLang = "en";

  if (autoLanguage) {
    targetLang = getSpotifyLanguage();
  } else {
    // Get manually selected language
    const savedLang = storage.get("language");
    if (savedLang && AVAILABLE_LANGUAGES[savedLang as keyof typeof AVAILABLE_LANGUAGES]) {
      targetLang = savedLang;
    }
  }

  currentLanguage = targetLang;
  currentTranslations = await loadTranslations(targetLang);
}

/**
 * Get current language code
 */
export function getCurrentLanguage(): string {
  return currentLanguage;
}

/**
 * Change the current language
 */
export async function setLanguage(lang: string): Promise<void> {
  if (AVAILABLE_LANGUAGES[lang as keyof typeof AVAILABLE_LANGUAGES]) {
    currentLanguage = lang;
    currentTranslations = await loadTranslations(lang);
    storage.set("language", lang);
  }
}

/**
 * Translate a key with optional interpolation
 * @param key - Translation key in dot notation (e.g., "update.title")
 * @param params - Optional parameters for interpolation
 */
export function t(key: string, params?: Record<string, any>): string {
  if (!currentTranslations) {
    console.warn("Translations not loaded, initializing with English");
    return key;
  }

  const keys = key.split(".");
  let value: any = currentTranslations;

  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      console.warn(`Translation key not found: ${key}`);
      return key;
    }
  }

  if (typeof value !== "string") {
    console.warn(`Translation key is not a string: ${key}`);
    return key;
  }

  // Simple interpolation: replace {{key}} with params[key]
  if (params) {
    return value.replace(/\{\{(\w+)\}\}/g, (match: string, paramKey: string) => {
      return params[paramKey] !== undefined ? String(params[paramKey]) : match;
    });
  }

  return value;
}

/**
 * Check if translations are loaded
 */
export function isI18nReady(): boolean {
  return currentTranslations !== null;
}

// Initialize on module load
initI18n().catch((error) => {
  console.error("Failed to initialize translations:", error);
  // Set a default empty object to prevent crashes
  currentTranslations = {};
});
