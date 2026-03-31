# Famories – Projektdokumentation

Famories ist eine private Familien-Erinnerungs-App. Eltern können über einen Telegram-Bot Sprachnotizen, Fotos, Videos und Standorte aufnehmen. Die App verarbeitet diese automatisch per KI (Transkription + Zusammenfassung) und speichert sie strukturiert in einer SQLite-Datenbank. Über eine passwortgeschützte Web-App können die Erinnerungen durchsucht, gefiltert, bearbeitet und exportiert werden.

Produktiv erreichbar unter: **famories.info**

---

## Tech Stack

| Schicht | Technologie |
|---|---|
| Backend | Node.js 20, TypeScript, Express |
| Datenbank | SQLite via `better-sqlite3` (synchron, WAL-Modus) |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Telegram Bot | Telegram Bot API (Webhook, kein Polling) |
| KI – Transkription | OpenAI Whisper (`whisper-1`) |
| KI – Zusammenfassung | OpenAI GPT-4o-mini (strukturierter JSON-Output) |
| Eingabevalidierung | Zod (alle API-Eingaben) |
| Session / Auth | `express-session` mit httpOnly-Cookies |
| Scheduler | `node-cron` |
| Bildmetadaten | `exifr` (GPS-Koordinaten aus EXIF) |
| Karte | Leaflet + react-leaflet-cluster |
| Export | html2canvas (PNG-Export einzelner Karten) |

---

## Projektstruktur

```
/
├── src/                          # Backend (Node.js/Express)
│   ├── index.ts                  # Einstiegspunkt: Express-Server, CORS, Session, Graceful Shutdown
│   ├── types.ts                  # Alle TypeScript-Interfaces (MemoryEntry, MediaAttachment, etc.)
│   ├── config/
│   │   ├── env.ts                # Env-Validierung beim Start (wirft bei fehlenden Pflicht-Variablen)
│   │   ├── children.ts           # Bekannte Kindernamen + resolveChildName() + getChildrenInfo()
│   │   ├── speakers.ts           # SPEAKERS: Chat-ID → Sprechername
│   │   └── allowedChats.ts       # ALLOWED_CHAT_IDS (aus Env), isChatAllowed()
│   ├── bot/
│   │   ├── telegramWebhook.ts    # Haupt-Webhook-Handler: Verarbeitung aller Nachrichtentypen + Befehle
│   │   └── telegramService.ts    # Telegram-API-Wrapper: sendMessage, downloadFile, extract*()
│   ├── api/
│   │   ├── memoriesApi.ts        # REST-API: GET/POST/PUT/DELETE /api/memories + Foto-Upload
│   │   ├── authApi.ts            # POST /login, POST /logout, GET /status + requireAuth()-Middleware
│   │   └── validation.ts         # Zod-Schemas + validateBody/validateQuery/validateParams Middlewares
│   ├── db/
│   │   ├── client.ts             # SQLite-Singleton (getDatabase / closeDatabase)
│   │   ├── migrate.ts            # Migrations-Runner
│   │   ├── migrations/           # 001–006 (Schema, Users, Location+Favorite, Indexes, People, Koordinaten)
│   │   └── repositories/
│   │       ├── memoryRepository.ts   # CRUD, search, findByDateRange, findDistinct*, findLast()
│   │       ├── mediaRepository.ts    # CRUD media_attachments, findByMemoryId, findByMemoryIds
│   │       └── userRepository.ts     # CRUD telegram_users
│   ├── services/
│   │   ├── transcriptionService.ts   # Whisper-API-Call mit Detail-Prompt
│   │   ├── summarizationService.ts   # GPT-4o-mini: summarize() + createWeeklySummary()
│   │   ├── exifService.ts            # GPS + Datum aus Foto-EXIF extrahieren
│   │   ├── reminderService.ts        # Cron täglich 20:00: Reminder wenn heute keine Memory
│   │   ├── fileCleanupService.ts     # Stündlich: verwaiste Dateien in uploads/ entfernen
│   │   └── telegramSetupService.ts   # Bot-Befehle + Beschreibung bei Telegram registrieren
│   ├── prompts/
│   │   ├── summarizeMemory.prompt.md # Haupt-KI-Prompt: Transkript → JSON
│   │   └── weeklySummary.prompt.md   # KI-Prompt: Wochenrückblick
│   └── jobs/
│       └── weeklySummaryJob.ts       # Wochenzusammenfassung erstellen und versenden
├── web/                          # Frontend (eigenes package.json + Vite-Build)
│   ├── src/
│   │   ├── main.tsx              # React-Einstiegspunkt
│   │   ├── App.tsx               # Auth-Gate: Status prüfen → LoginScreen oder HomeScreen
│   │   ├── index.css             # CSS Custom Properties, Glassmorphism, Animationen (~1200 Zeilen)
│   │   ├── types/index.ts        # Memory-Interface, FAMILY_MEMBERS (mit Farben), CATEGORIES, LOCATIONS
│   │   ├── api/memoriesApi.ts    # fetch-Wrapper für alle API-Calls + URL-Transformation
│   │   └── components/
│   │       ├── HomeScreen.tsx         # Hauptseite: Filter, Grid, Timeline, Lightbox, AudioPlayer, Speaker-Filter
│   │       ├── LoginScreen.tsx        # Passwort-Eingabe
│   │       ├── MapView.tsx            # Leaflet-Karte mit Clustering und Popups
│   │       ├── HorizontalTimeline.tsx # Timeline-Layout (in HomeScreen eingebunden)
│   │       ├── IdentityPicker.tsx     # Familienmitglied nach Login auswählen (localStorage)
│   │       ├── LocationAutocomplete.tsx # Nominatim-Suche für Orte
│   │       ├── CreateMemoryModal.tsx  # Modal: Text, Fotos, Audio-Upload, Sprachnotiz, Speaker-Picker
│   │       ├── VoiceRecorder.tsx      # Browser-Aufnahme mit "Mit Audio speichern" Toggle
│   │       ├── AudioPlayer.tsx        # Play/Pause-Player mit Zeitanzeige und Speaker-Label (🎙️)
│   │       ├── MemoryCard.tsx    # (Dead Code – tree-shaken)
│   │       ├── CardGrid.tsx      # (Dead Code – tree-shaken)
│   │       ├── FilterBar.tsx     # (Dead Code – tree-shaken)
│   │       └── index.ts          # Re-exports
│   └── dist/                     # Gebautes Frontend (im Git, wird von Express serviert)
├── uploads/                      # Permanente Mediadateien (Fotos, Audio, Video) – NICHT im Git
├── data/                         # SQLite-Datenbankdatei – NICHT im Git
└── temp/                         # Temporäre Audio-Dateien für Transkription
```

**Wichtig:** `web/dist/` ist im Git-Repository eingecheckt. Nach Änderungen am Frontend muss `cd web && npm run build` ausgeführt und das neue `dist/` committed werden – sonst sieht die Produktionsseite nichts von den Änderungen.

---

## Datenbankschema

### `memory_entries` – Haupttabelle

| Spalte | Typ | Beschreibung |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `created_at` | TEXT | Erstellungszeitpunkt UTC (datetime('now')) |
| `source_date` | TEXT | Datum des Erlebnisses (YYYY-MM-DD) |
| `child_name` | TEXT | Hauptperson der Erinnerung: "Junis", "Noah" oder null |
| `source_type` | TEXT | `voice` / `photo` / `video` / `text` / `web` |
| `source_message_id` | INTEGER | Telegram Message-ID (0 bei Web-Einträgen) |
| `telegram_chat_id` | INTEGER | Absender-Chat-ID (0 bei Web-Einträgen) |
| `raw_transcript` | TEXT | Originaltext / Whisper-Transkript |
| `cleaned_summary` | TEXT | KI-bereinigter Text (Namen normalisiert) |
| `categories` | TEXT | JSON-Array, z.B. `["Familie","Gesundheit"]` |
| `tags` | TEXT | JSON-Array mit Schlagwörtern |
| `people` | TEXT | JSON-Array der explizit genannten Familienmitglieder |
| `importance_score` | INTEGER | 1–5 (KI-Bewertung) |
| `is_favorite` | INTEGER | 0 oder 1 |
| `location` | TEXT | Ortsname, z.B. "Zuhause", "Spielplatz" |
| `latitude` / `longitude` | REAL | GPS-Koordinaten (aus Foto-EXIF oder Standortnachricht) |
| `recorded_by` | TEXT | Name des Aufzeichnenden, z.B. "Mama" |
| `transcript_status` | TEXT | `pending` / `completed` / `failed` |
| `processing_status` | TEXT | `pending` / `completed` / `failed` |
| `error_message` | TEXT | Fehlermeldung bei gescheiterter Verarbeitung |

### `media_attachments` – Mediadateien

| Spalte | Beschreibung |
|---|---|
| `id` | Auto-increment PK |
| `memory_entry_id` | FK → memory_entries (ON DELETE CASCADE) |
| `media_type` | `photo` / `audio` / `video` |
| `telegram_file_id` | Telegram-interner Dateischlüssel (Web-Uploads: `web_<filename>`) |
| `local_path` | Dateiname in `uploads/` |
| `voice_speaker` | Sprecher-Name für Audio-Anhänge (z.B. "Junis"), nullable (Migration 007) |

### `telegram_users` – Registrierte Nutzer

| Spalte | Beschreibung |
|---|---|
| `telegram_chat_id` | Primärschlüssel (UNIQUE) |
| `display_name` | Zugewiesener Sprechername, z.B. "Mama" |

### `weekly_summaries` – Wochenzusammenfassungen

Speichert KI-generierte Wochenrückblicke mit `highlights`, `themes` und `weekly_summary` (JSON-Arrays / Text).

### `migrations` – Migrationsprotokoll

Verfolgt welche Migrationen bereits angewendet wurden.

### Migrations-Übersicht

| # | Name | Inhalt |
|---|---|---|
| 001 | initial_schema | Basistabellen: memory_entries, media_attachments, weekly_summaries, migrations |
| 002 | telegram_users | telegram_users Tabelle |
| 003 | add_location_favorite | location, is_favorite Spalten in memory_entries |
| 004 | add_performance_indexes | Indexes auf source_date, chat_id, is_favorite, processing_status |
| 005 | add_people_field | people JSON-Array in memory_entries |
| 006 | add_coordinates | latitude, longitude in memory_entries |
| 007 | add_voice_speaker | voice_speaker TEXT NULL in media_attachments |

### Indexes

- `source_date`, `telegram_chat_id`, `is_favorite`, `latitude/longitude`, `processing_status`

---

## API-Endpunkte

Alle `/api/*`-Endpunkte (außer `/api/auth/*`) sind durch `requireAuth` geschützt.

### Auth (`/api/auth`)

| Method | Pfad | Body / Response |
|---|---|---|
| `POST` | `/api/auth/login` | `{password}` → Session wird erstellt |
| `POST` | `/api/auth/logout` | Session wird zerstört |
| `GET` | `/api/auth/status` | `{passwordRequired: bool, authenticated: bool}` |

### Erinnerungen

| Method | Pfad | Beschreibung |
|---|---|---|
| `GET` | `/api/memories` | Alle Erinnerungen. Query: `child`, `category`, `location`, `favorites=true`, `search`, `limit` (1–1000, Standard 100) |
| `GET` | `/api/memories/:id` | Einzelne Erinnerung mit Mediadateien |
| `POST` | `/api/memories` | Neue Erinnerung aus Web (`{text, child_name?, location?, source_date?, people?}`) → löst KI aus |
| `PUT` | `/api/memories/:id` | Text bearbeiten (`{cleaned_summary}`) |
| `DELETE` | `/api/memories/:id` | Löscht Eintrag + alle zugehörigen Medien |
| `POST` | `/api/memories/:id/favorite` | Favorit setzen/toggeln (`{is_favorite?}`) |
| `POST` | `/api/memories/:id/photos` | Fotos hochladen (Multipart, max. 10 Dateien à 50 MB, nur `image/*`) |
| `POST` | `/api/memories/:id/audio` | Gespeicherte Audiodatei anhängen (`{filename, voice_speaker?}`) → `writeLimiter` |
| `DELETE` | `/api/memories/:id/photos/:photoId` | Einzelnes Foto löschen |
| `PATCH` | `/api/memories/:id/date` | Datum einer Erinnerung ändern (`{source_date}`) |
| `PATCH` | `/api/memories/:id/person` | Kind-Name ändern (`{child_name}`) |
| `GET` | `/api/children` | Distinct Kindernamen aus DB |
| `GET` | `/api/locations` | Distinct Orte aus DB |

### Transkription & Audio

| Method | Pfad | Beschreibung |
|---|---|---|
| `POST` | `/api/transcribe` | Whisper-Transkription. Multipart: `audio` (Datei) + optionales `saveFile=true`. Wenn `saveFile=true`: Datei bleibt in `uploads/`, Response enthält `{ text, savedFilename }`. Ohne Flag: Datei wird nach Transkription gelöscht. `aiLimiter` (20/h). |

### Sonstiges

| Pfad | Beschreibung |
|---|---|
| `GET /health` | Health-Check (kein Auth nötig) |
| `POST /webhook/telegram` | Telegram-Webhook-Eingang |
| `GET /uploads/:datei` | Statische Mediadateien |
| `GET /*` | SPA-Fallback → `web/dist/index.html` |

### API-Antwortformat

```json
{ "success": true, "data": { ... }, "count": 42 }
{ "success": false, "error": "Fehlermeldung" }
```

---

## Telegram Bot

### Verarbeitete Nachrichtentypen

| Typ | Ablauf |
|---|---|
| **Sprachnachricht** | Download → Whisper-Transkription → Bestätigungs-Buttons → GPT-4o-mini → DB |
| **Text** | Direkt als Rohtext → GPT-4o-mini → DB |
| **Foto** | Download → EXIF extrahieren → Zuordnung zu letztem Eintrag oder neuer Eintrag |
| **Video-Notiz** (Kreis-Video) | Download → `media_attachment` anlegen |
| **Standort** | GPS + Ortsname → an letzten Eintrag des Tages anhängen |

### Bot-Befehle

| Befehl | Funktion |
|---|---|
| `/start` | Nutzer registrieren (Familienmitglied auswählen) oder Willkommensnachricht |
| `/record` | Aufnahme-Anleitung senden |
| `/woche` | KI-generierten Wochenrückblick (alle Einträge der letzten 7 Tage) anfordern |
| `/letzte` | Letzte summarized Erinnerung(en) anzeigen |
| `/delete` | Letzten eigenen Eintrag löschen (mit Bestätigung) |
| `/werbinich` | Eigene Chat-ID und registrierten Sprechernamen anzeigen |

### Sicherheit im Bot

- **Chat-ID-Whitelist**: `ALLOWED_CHAT_IDS` aus `.env` – Nachrichten von nicht erlaubten Chats werden still ignoriert
- **Webhook-Secret**: Optionales `TELEGRAM_WEBHOOK_SECRET` – Telegram sendet es im `X-Telegram-Bot-Api-Secret-Token`-Header; der Bot prüft es

### In-Memory-State (geht bei Restart verloren)

- `pendingTranscriptions` Map: Offene Bestätigungs-Dialoge nach Transkription
- `chatLocations` Map: Zuletzt gemeldeter Standort pro Chat-ID

---

## KI-Pipeline

### Schritt 1 – Transkription (nur Sprachnotizen)

- Telegram-Audio wird temporär in `temp/` gespeichert
- OpenAI Whisper (`whisper-1`) transkribiert die Datei (Sprache: Deutsch)
- Ergebnis wird als `raw_transcript` in der DB gespeichert

### Schritt 2 – Zusammenfassung (alle Textquellen)

GPT-4o-mini erhält das Transkript + den `summarizeMemory.prompt.md`-Prompt und gibt strukturiertes JSON zurück:

```json
{
  "child_name": "Junis",
  "people": ["Junis", "Oma Eva"],
  "cleaned_summary": "Vollständiger bereinigter Originaltext...",
  "categories": ["Gesundheit", "Familie"],
  "tags": ["Ergotherapie", "Therapie"],
  "importance_score": 3
}
```

Das Ergebnis wird validiert (`validateResult()`), Kategorien gegen eine Allowlist geprüft, Personennamen normalisiert, und dann in der DB gespeichert.

### Prompt-Regeln (summarizeMemory)

1. Text vollständig zurückgeben – nur bekannte Spitznamen normalisieren (z.B. "Jonas" → "Junis")
2. Nur explizit genannte Personen in `people` eintragen – keine Schlussfolgerungen
3. Kategorien aus fester Liste (9 Optionen)
4. Wichtigkeit 1–5 (1 = Alltag, 3 = normaler Moment, 5 = Meilenstein)

### Bekannte Familienmitglieder (KI-Normalisierung)

| Kanonischer Name | Aliases |
|---|---|
| Junis | Juno, Jonas (ACHTUNG: Jonas gibt es nicht – immer Junis!), Younes |
| Noah | Noa |
| Mama | Leni, Lensi |
| Papa | Grabi, Michel |
| Opa Frank | Opa (wenn nicht anders spezifiziert) |
| Oma Eva | Oma (wenn nicht anders spezifiziert) |
| Moma | – |
| Opa Peter | Peter |
| Bowie | – (Katze) |

---

## Sicherheit

### Authentifizierung (Web-App)

- **Passwortschutz** via `WEB_PASSWORD`-Env-Variable (optional – ohne Variable läuft alles offen)
- **Session-basiert** via `express-session`:
  - Cookie: `httpOnly: true`, `secure: true` in Production, `sameSite: 'none'` in Production
  - Session-Laufzeit: 30 Tage
  - Session-Secret: `SESSION_SECRET` aus Env-Variable
- `requireAuth`-Middleware schützt alle `/api/*`-Endpunkte global (außer `/api/auth/*`)

### Rate Limiting

| Limiter | Grenze | Gilt für |
|---|---|---|
| Standard | 100 Requests / 15 min | Alle API-Endpunkte |
| Write | 50 Requests / 15 min | PUT, DELETE, POST /favorite, POST /photos |
| AI | 20 Requests / Stunde | POST /memories (löst KI-Verarbeitung aus) |

### Eingabevalidierung (Zod)

- Alle API-Request-Bodies, Query-Parameter und URL-Parameter werden mit Zod-Schemas geprüft
- Textlängen begrenzt: max. 10.000 Zeichen (Inhalte), 200 (Suche), 100 (Namen)
- Datumsformat strikt: `YYYY-MM-DD`
- `limit`-Parameter geclampt auf 1–1000
- Bei Validierungsfehler: HTTP 400 mit Fehlermeldung

### CORS

Nur diese Origins erlaubt:
- `http://localhost:5173` / `5174` / `5175` / `3000` (Development)
- `https://famories.info` / `https://www.famories.info` (Production)
- `credentials: true` (für Cookies nötig)

### Datei-Uploads (Multer)

- Max. 20 MB pro Datei
- Nur `image/*`-MIME-Types akzeptiert
- Dateinamen server-seitig generiert: `web_<timestamp>_<random>.<ext>`

---

## Automatisierungen (Hintergrund-Jobs)

### Täglicher Reminder (20:00 Uhr, Europe/Berlin)

- Prüft ob heute bereits eine Erinnerung in der DB ist
- Falls nicht: sendet sanfte Telegram-Nachricht an alle konfigurierten Chats
- Kein Reminder wenn heute schon etwas gespeichert wurde

### Stündlicher File-Cleanup

- `temp/`: Dateien älter als 2 Stunden werden gelöscht
- `uploads/`: `voice_*`-Dateien älter als 24 Stunden werden gelöscht (verwaiste Transkriptions-Uploads, die nie einer Erinnerung zugeordnet wurden)
- Fotos und andere Uploads werden nicht automatisch gelöscht

### Wöchentliche Zusammenfassung

- Auf Anfrage per `/woche`-Befehl oder automatisch
- GPT-4o-mini fasst alle Einträge der letzten 7 Tage zusammen
- Output: `highlights` (Array), `themes` (Array), `weekly_summary` (Text)

---

## Web-App (Frontend)

### Architektur

- **SPA** (Single Page Application) – React, kein Server-Side Rendering
- `App.tsx` prüft beim Start `/api/auth/status` → zeigt `LoginScreen` oder `HomeScreen`
- `HomeScreen.tsx` ist die zentrale Komponente (~1300 Zeilen) und enthält die gesamte Hauptlogik

### Ansichten (HomeScreen)

| Tab | Beschreibung |
|---|---|
| **Grid** | Kachelansicht mit Fotos, Kategorien, Personen-Badges, Bearbeitungs- und Lösch-Funktion |
| **Timeline** | Chronologische Listenansicht nach Datum gruppiert |
| **Karte** | Leaflet-Karte mit GPS-Pins, Marker-Clustering, Popup-Carousel pro Standort |

### Filter und Suche

- **Kind**: Junis / Noah / alle
- **Kategorie**: 9 Optionen (Gesundheit, Schule, Familie, Freunde, Freizeit, Sport, Emotion, Entwicklung, Besonderes)
- **Ort**: Zuhause, Oma & Opa, Kita, Spielplatz, Urlaub, Unterwegs
- **Personen**: Filter nach beliebigem Familienmitglied
- **Nur Favoriten**: Stern-Filter
- **Volltextsuche**: Durchsucht `cleaned_summary`, `tags`, `categories` (serverseitig)

### Weitere Web-Funktionen

- **Neue Erinnerung erstellen**: Modal mit Freitext, optionalem Kindname, Datum, Ort, Personen → KI-Zusammenfassung wird ausgelöst
- **Audio hochladen**: `.m4a/.mp3/.ogg/.opus/.wav/.aac/.webm` → Whisper-Transkription → Text füllt Modal, Datei wird gespeichert
- **Sprachnotiz mit Audio speichern**: Toggle "Mit Audio speichern" → Browser-Aufnahme wird ebenfalls als Datei gespeichert
- **Speaker-Picker**: Wessen Stimme ist das? → Family-Member-Buttons + "Mehrere" (erscheint wenn Audio vorhanden)
- **AudioPlayer**: Play/Pause, Fortschrittszeit, Speaker-Label (🎙️ Name) auf jeder Erinnerungskarte
- **Speaker-Filter**: Filter-Chips nach Sprecher in der Hauptansicht (nur sichtbar wenn Erinnerungen mit Speaker-Tags vorhanden)
- **Text bearbeiten**: Inline-Editing per Klick auf den Text
- **Datum & Person ändern**: PATCH-Endpoints, editierbar aus der Karte
- **Favorit toggeln**: Stern-Icon pro Erinnerung
- **Fotos hochladen**: direkt in eine bestehende Erinnerung
- **Foto löschen**: einzelnes Foto aus einer Erinnerung entfernen
- **Bild-Lightbox**: Vollbild via React Portal (kein Stacking-Context-Problem), natürliches Seitenverhältnis, Swipe-Navigation
- **Identity Picker**: Familienmitglied nach Login auswählen (gespeichert in localStorage als `famories_identity`)
- **PNG-Export**: Einzelne Erinnerungen als Bild exportieren (html2canvas)

### Design

- Glassmorphism-Design mit CSS Custom Properties (`--color-*`, `--glass-*`, `--shadow-*`)
- Jedes Familienmitglied hat eine feste Farbe (z.B. Junis = Blau #1e40af, Noah = Grün #425532)
- Responsive, Mobile First
- Animationen via CSS Keyframes (`animate-fade-in-scale`, `animate-fade-in`, usw.)

---

## Umgebungsvariablen

| Variable | Pflicht | Beschreibung |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Ja | Token von @BotFather |
| `OPENAI_API_KEY` | Ja | Für Whisper + GPT-4o-mini |
| `SESSION_SECRET` | Ja | Zufälliger String für Session-Verschlüsselung |
| `DATABASE_PATH` | Nein | SQLite-Dateipfad (Standard: `./data/memories.db`) |
| `PORT` | Nein | Server-Port (Standard: 3000) |
| `NODE_ENV` | Nein | `production` aktiviert sichere Cookies |
| `WEB_PASSWORD` | Nein | Passwort für Web-App (ohne Variable: offen) |
| `TELEGRAM_WEBHOOK_SECRET` | Nein | Webhook-Validierungs-Token |
| `ALLOWED_CHAT_IDS` | Nein | Komma-getrennte Telegram-Chat-IDs (leer = alle erlaubt) |

---

## Deployment & Build

```bash
# Backend starten
npm run dev          # Entwicklung (tsx watch)
npm start            # Produktion (node dist/index.js)
npm run build        # TypeScript kompilieren
npm run migrate      # Datenbankmigrationen ausführen

# Frontend bauen (muss nach jeder Änderung an web/src/ gemacht werden!)
cd web && npm run build   # → schreibt nach web/dist/
# Danach: git add web/dist/ && git commit
```

**Request-Flow:**

```
Browser  → HTTPS GET/POST /api/*          → Express → requireAuth → API-Handler → SQLite
Browser  → HTTPS GET /*                   → Express → web/dist/index.html (SPA)
Telegram → HTTPS POST /webhook/telegram   → Express → Bot-Handler → SQLite + OpenAI
Cron     → täglich 20:00                  → reminderService → Telegram-API
```

---

## Bekannte Eigenheiten

- **`web/dist/` im Git**: Änderungen am Frontend brauchen `cd web && npm run build` + Commit
- **In-Memory-State**: `pendingTranscriptions` und `chatLocations` gehen bei Server-Restart verloren
- **Dead Code**: `MemoryCard.tsx`, `CardGrid.tsx`, `FilterBar.tsx` werden nicht importiert und vom Build tree-shaken
- **Familienmitglieder an mehreren Stellen**: Definiert in `src/config/children.ts`, `src/config/speakers.ts`, `src/bot/telegramWebhook.ts` und `web/src/types/index.ts` (mit Farben für UI)
- **Keine Pagination**: API gibt bis zu 1000 Einträge auf einmal zurück
- **Rate-Limiting pro IP**: Hinter NAT teilen sich alle Nutzer ein Limit
- **Speaker-Filter nur Client-seitig**: Der `?voice_speaker=` Query-Param in `GET /api/memories` existiert (server-seitig implementiert), wird aber vom Frontend nicht genutzt — der Filter läuft client-seitig über geladene Daten
- **Audio-Upload Flow**: Datei → `POST /api/transcribe?saveFile=true` → `savedFilename` → Memory erstellen → `POST /api/memories/:id/audio` mit `{filename, voice_speaker}`. Orphaned `voice_*` Dateien werden nach 24h automatisch gelöscht.
