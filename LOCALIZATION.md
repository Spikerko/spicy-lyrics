# Localization Guide for Spicy Lyrics

This project uses Crowdin for managing translations. All English source strings are located in `/locales/en.json`.

## File Structure

```
locales/
  └── en.json          # Source English strings
```

## Translation Categories

The `en.json` file contains the following categories:

### 1. **update**
Update dialog and notification strings
- Version information
- Update prompts
- Discord invitation

### 2. **settings**
All settings panel text
- **devSettings**: Developer settings section
- **general**: General user settings section

### 3. **notifications**
System notifications and toast messages
- Success messages
- Error messages
- Info messages

### 4. **ttmlProfile**
TTML Profile modal interface
- Profile display text
- Song list labels
- Attribution text

### 5. **common**
Reusable common strings across the application

## How to Add New Strings

When adding new user-facing text to the codebase:

1. Add the English string to `/locales/en.json` in the appropriate category
2. Use a descriptive key in camelCase
3. Reference the key in your code (implementation will need to import the translation system)

## Crowdin Integration

### Setup Steps

1. **Create a Crowdin project** at [crowdin.com](https://crowdin.com)
2. **Configure the project** to use JSON format
3. **Set the source file** as `/locales/en.json`
4. **Configure translation file paths** as `/locales/{language_code}.json`

### Recommended Crowdin Configuration

The `crowdin.yml` file in the root of the project is already configured:

```yaml
project_id: "your-project-id"  # Replace with your Crowdin project ID
api_token_env: "CROWDIN_TOKEN" # Reads token from environment variable
preserve_hierarchy: true

files:
  - source: /locales/en.json
    translation: /locales/%two_letters_code%.json
```

**Security Notes:**
- ✅ **Project ID**: Safe to commit - it's just an identifier
- ❌ **API Token**: NEVER commit! Always use environment variables
- The config uses `api_token_env` to read the token securely from environment

**Setting up the API Token:**

For local development:
```bash
# Windows PowerShell
$env:CROWDIN_TOKEN="your-api-token-here"

# Windows CMD
set CROWDIN_TOKEN=your-api-token-here

# Linux/Mac
export CROWDIN_TOKEN="your-api-token-here"
```

For GitHub Actions (recommended for CI/CD):
1. Go to GitHub repository → Settings → Secrets and variables → Actions
2. Add a new secret named `CROWDIN_TOKEN`
3. Paste your Crowdin API token
4. GitHub Actions can now use it securely

### Supported Languages (Example)

You can configure Crowdin to support multiple languages:
- Spanish (es.json)
- French (fr.json)
- German (de.json)
- Japanese (ja.json)
- Chinese Simplified (zh-CN.json)
- Portuguese (pt.json)
- Russian (ru.json)
- Italian (it.json)
- Korean (ko.json)
- Dutch (nl.json)

## Implementation Notes

To use these translations in your code, you'll need to:

1. **Create a translation utility** that loads the appropriate language file
2. **Import and use the translation function** throughout your codebase
3. **Replace hardcoded strings** with translation keys

Example implementation pattern:
```typescript
// Translation utility (to be created)
import translations from '../locales/en.json';

function t(key: string): string {
  const keys = key.split('.');
  let value = translations;
  for (const k of keys) {
    value = value[k];
  }
  return value || key;
}

// Usage in code
ShowNotification(t('notifications.lyricsApplied'), 'success');
```

## Contributing Translations

Contributors can:
1. Join the Crowdin project (link to be added)
2. Select their language
3. Translate strings directly in the Crowdin interface
4. Translations will be automatically synced back to the repository

## Notes

- All keys use camelCase convention
- Keep translations concise and clear
- Maintain the same tone and style across languages
- Test translations in the UI to ensure they fit properly
- Some strings contain HTML or formatting - preserve these in translations
