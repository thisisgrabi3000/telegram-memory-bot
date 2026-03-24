# Famories - Codebase Reference

> Telegram Memory Bot + Web-App. Familienerinnerungen per Sprachnachricht, Foto und Text speichern und in einer Web-App ansehen.

## Tech Stack

| Layer | Technologie |
|-------|------------|
| Backend | Node.js + Express + TypeScript |
| Database | SQLite (better-sqlite3, WAL-Modus) |
| AI | OpenAI Whisper (Transkription) + GPT-4o-mini (Zusammenfassung) |
| Bot | Telegram Bot API (Webhook) |
| Frontend | React 18 + Vite + Tailwind CSS 4 + Leaflet |
| Auth | SHA256-Token (Passwort + Salt) |

## Projektstruktur

```
/
├── src/                          # Backend
│   ├── index.ts                  # Express-Server, CORS, Startup, Graceful Shutdown
│   ├── types/index.ts            # Alle TypeScript-Interfaces (MemoryEntry, etc.)
│   ├── config/
│   │   ├── env.ts                # Env-Validierung (TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, etc.)
│   │   ├── children.ts           # CHILDREN, FAMILY_MEMBERS, LOCATIONS + resolveChildName()
│   │   ├── speakers.ts           # SPEAKERS (Chat-ID→Person), PERSONS, Transkript-Analyse
│   │   └── allowedChats.ts       # ALLOWED_CHAT_IDS aus Env, isChatAllowed()
│   ├── bot/
│   │   ├── telegramWebhook.ts    # POST /webhook/telegram - Hauptlogik (Voice, Photo, Commands)
│   │   └── telegramService.ts    # Telegram API-Wrapper (sendMessage, download, extract*)
│   ├── api/
│   │   ├── memoriesApi.ts        # REST API: GET/POST/PUT/DELETE /api/memories + Auth-Middleware
│   │   ├── authApi.ts            # POST /api/auth/login|verify, GET /api/auth/status + requireAuth()
│   │   └── validation.ts         # Zod-Schemas + Middleware-Factories (validateBody/Query/Params)
│   ├── db/
│   │   ├── client.ts             # SQLite Singleton (getDatabase/closeDatabase)
│   │   ├── migrate.ts            # Migration-Runner (standalone: tsx src/db/migrate.ts)
│   │   ├── index.ts              # Re-exports
│   │   ├── repositories/
│   │   │   ├── memoryRepository.ts  # CRUD + findLast(chatId?), search, findByWeek, etc.
│   │   │   ├── mediaRepository.ts   # CRUD für media_attachments
│   │   │   └── userRepository.ts    # telegram_users CRUD
│   │   └── migrations/           # 001-006 (Schema, Users, Location, Indexes, People, Coords)
│   ├── services/
│   │   ├── transcriptionService.ts   # Whisper API mit Detail-Prompt (Füllwörter, Lachen)
│   │   ├── summarizationService.ts   # GPT-4o-mini: summarize() + createWeeklySummary()
│   │   ├── exifService.ts            # EXIF-GPS + Datum aus Bildern (ExifReader)
│   │   ├── reminderService.ts        # Cron 20:00 Berlin: Reminder wenn heute keine Memory
│   │   ├── fileCleanupService.ts     # Stündlich: temp/-Dateien > 2h löschen
│   │   └── telegramSetupService.ts   # Bot-Befehle + Menü bei Telegram registrieren
│   ├── prompts/
│   │   ├── summarizeMemory.prompt.md # Prompt: Transkript → JSON (child_name, people, categories, tags)
│   │   └── weeklySummary.prompt.md   # Prompt: Einträge → Highlights, Themes, Summary
│   └── jobs/
│       └── weeklySummaryJob.ts       # (Nicht aktiv genutzt)
├── web/                          # Frontend (eigenes package.json)
│   ├── src/
│   │   ├── main.tsx              # React Entry
│   │   ├── App.tsx               # Auth-Check, Loading States, Error State → HomeScreen
│   │   ├── index.css             # CSS Variables, Glassmorphism, Animationen (~1200 Zeilen)
│   │   ├── types/index.ts        # Memory Interface, FAMILY_MEMBERS (mit Farben), CATEGORIES, LOCATIONS
│   │   ├── api/memoriesApi.ts    # fetch-Wrapper mit Auth-Header + URL-Transform
│   │   └── components/
│   │       ├── HomeScreen.tsx    # Hauptseite: Filter, Feed (Aktuelles + Fotos), Map-Tab (~850 Zeilen)
│   │       ├── MapView.tsx       # Leaflet-Karte mit Marker-Clustering + Swipe-Carousel in Popups
│   │       ├── MemoryCard.tsx    # Einzelne Erinnerungskarte (Fotos, Edit, Delete, Export, Lightbox)
│   │       ├── FilterBar.tsx     # Family-Members + Kategorien-Filter (wird in HomeScreen inline gemacht)
│   │       ├── Header.tsx        # Logo-Header (wird nicht direkt verwendet, Header ist in HomeScreen)
│   │       ├── LoginScreen.tsx   # Passwort-Login
│   │       ├── CreateMemoryModal.tsx  # Modal: Neue Erinnerung erstellen (Text, Person, Ort, Datum)
│   │       ├── ExportCard.tsx    # Erinnerung als Bild exportieren (html2canvas)
│   │       ├── CardGrid.tsx      # Grid-Layout für MemoryCards
│   │       ├── TimelineView.tsx  # Timeline-Layout für Erinnerungen
│   │       ├── EmptyState.tsx    # Leerer Zustand
│   │       └── index.ts          # Re-exports
│   └── package.json              # React 18, Leaflet, react-leaflet-cluster, date-fns, lucide-react
├── data/                         # SQLite DB (memory.db)
├── uploads/                      # Permanente Dateien (Fotos, Audio)
├── temp/                         # Temporäre Audio-Dateien (für Transkription)
├── package.json                  # Backend deps
└── tsconfig.json                 # TypeScript Config
```

## Datenbank-Schema

### memory_entries (Haupttabelle)
```sql
id                INTEGER PRIMARY KEY AUTOINCREMENT
created_at        TEXT DEFAULT datetime('now')
source_date       TEXT NOT NULL              -- YYYY-MM-DD
child_name        TEXT                       -- Hauptperson der Erinnerung (oder null)
source_type       TEXT NOT NULL DEFAULT 'voice'  -- 'voice' | 'photo' | 'text' | 'web'
source_message_id INTEGER NOT NULL
telegram_chat_id  INTEGER NOT NULL
raw_transcript    TEXT                       -- Originaltext / Transkript
cleaned_summary   TEXT                       -- Bereinigter Text (Namen korrigiert)
categories        TEXT                       -- JSON-Array: ["Familie", "Freizeit"]
tags              TEXT                       -- JSON-Array: ["Spielplatz", "Lachen"]
people            TEXT DEFAULT '[]'          -- JSON-Array: ["Junis", "Papa", "Eva"]
importance_score  INTEGER                    -- 1-5
transcript_status TEXT NOT NULL DEFAULT 'pending'   -- pending | completed | failed
processing_status TEXT NOT NULL DEFAULT 'pending'   -- pending | summarized | failed
error_message     TEXT
recorded_by       TEXT                       -- "Mama", "Papa" etc.
location          TEXT                       -- "Hamburg", "Zuhause" etc.
is_favorite       INTEGER DEFAULT 0          -- 0 | 1
latitude          REAL                       -- GPS
longitude         REAL                       -- GPS
```

### media_attachments
```sql
id                INTEGER PRIMARY KEY AUTOINCREMENT
memory_entry_id   INTEGER NOT NULL REFERENCES memory_entries(id) ON DELETE CASCADE
media_type        TEXT NOT NULL              -- 'photo' | 'audio' | 'video'
telegram_file_id  TEXT NOT NULL
local_path        TEXT                       -- Dateiname in uploads/
created_at        TEXT DEFAULT datetime('now')
```

### telegram_users
```sql
id                INTEGER PRIMARY KEY AUTOINCREMENT
telegram_chat_id  INTEGER NOT NULL UNIQUE
display_name      TEXT NOT NULL              -- "Mama", "Papa" etc.
created_at        TEXT DEFAULT datetime('now')
```

### Indexes
- `idx_memory_entries_source_date` (source_date)
- `idx_memory_entries_chat_id` (telegram_chat_id)
- `idx_memory_entries_favorite` (is_favorite)
- `idx_memory_entries_coordinates` (latitude, longitude)
- `idx_memory_entries_processing` (processing_status)
- `idx_telegram_users_chat_id` (telegram_chat_id)

## API Endpunkte

### Auth (kein Auth-Header nötig)
| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/auth/status` | Ob Passwort-Schutz aktiv ist |
| POST | `/api/auth/login` | `{password}` → `{token}` |
| POST | `/api/auth/verify` | `{token}` → `{valid: bool}` |

### Memories (Bearer-Token im Authorization-Header, wenn WEB_PASSWORD gesetzt)
| Method | Route | Beschreibung |
|--------|-------|-------------|
| GET | `/api/memories?child=&category=&location=&favorites=true&search=&limit=100` | Alle (nur summarized) |
| GET | `/api/memories/:id` | Einzelne Memory mit Attachments |
| POST | `/api/memories` | Neue Memory aus Web `{text, child_name?, location?, source_date?}` |
| PUT | `/api/memories/:id` | Text updaten `{cleaned_summary}` |
| DELETE | `/api/memories/:id` | Löscht Memory + Medien |
| POST | `/api/memories/:id/favorite` | Toggle Favorit `{is_favorite?}` |
| GET | `/api/children` | Distinct child_names |
| GET | `/api/locations` | Distinct locations |

### Webhook
| Method | Route | Beschreibung |
|--------|-------|-------------|
| POST | `/webhook/telegram` | Telegram Updates empfangen |
| GET | `/webhook/telegram` | Health Check |

### Rate Limits
- Standard: 100 req / 15 min
- Write-Ops: 50 req / 15 min
- AI-Ops (POST /memories): 20 req / h

## Telegram Bot - Flow

### Sprachnachricht
1. Voice Message empfangen → DB-Eintrag (pending)
2. Audio temporär nach `temp/` herunterladen
3. Whisper-Transkription (mit Detail-Prompt für Füllwörter)
4. Buttons anzeigen: [Speichern] [Mit Audio] [Bearbeiten]
5. Bei "Speichern": GPT-4o-mini Zusammenfassung → DB update (summarized)
6. Bei "Mit Audio": Audio nach `uploads/` verschieben + media_attachment erstellen
7. Bei "Bearbeiten": Warten auf korrigierten Text → dann wie Speichern

### Foto
1. Foto/Document empfangen → nach `uploads/` herunterladen
2. EXIF extrahieren (nur bei Datei-Upload, nicht komprimiertes Foto)
3. Wenn letzte Memory < 5 min: Foto dem letzten Eintrag zuordnen
4. Sonst: Neuen Eintrag erstellen mit EXIF-Datum/GPS
5. Bei komprimiertem Foto ohne EXIF: Tipp anzeigen (als Datei senden)

### Standort
1. Location Message empfangen → Reverse Geocode (Nominatim)
2. Im Chat-Speicher hinterlegen (für nächste Memory)
3. Wenn letzte Memory < 10 min ohne Ort: Standort nachtragen

### Befehle
- `/start` - Registrierung (Familienmitglied auswählen) oder Willkommen
- `/record` - Anleitung zum Aufnehmen
- `/letzte` - Letzte 5 summarized Entries
- `/woche` - Wochenzusammenfassung via GPT-4o-mini
- `/delete` - Letzten eigenen Eintrag löschen (mit Bestätigung)
- `/werbinich` - Chat-ID + Registrierungsstatus

## Web Frontend - Aufbau

### App.tsx
- Auth-Check: `/api/auth/status` → Token-Verify → LoginScreen oder HomeScreen
- Token: 30 Tage gültig, in localStorage (`famories_auth_token`)
- Share-Link: `?token=...` in URL für Oma & Opa

### HomeScreen.tsx (Hauptkomponente, ~850 Zeilen)
- **Tabs**: Feed | Karte
- **Filter**: Person (Dropdown), Ort (Dropdown), Zeitraum (24h/7d/30d/Jahr/Custom), Favoriten, Suche
- **Feed**: Zwei Spalten - "Aktuelles" (Text-Nachrichten) links, "Fotos" (Grid) rechts
- **Inline-Edit**: Text direkt bearbeiten
- **Inline-Delete**: Mit Bestätigung
- **Accessibility**: Schriftgröße (normal/large/xlarge), High Contrast, in localStorage gespeichert

### MapView.tsx
- Leaflet + react-leaflet-cluster für Marker-Gruppierung
- Memories mit gleichen Koordinaten (~100m) werden gruppiert
- Popup: Swipe-Carousel mit Pfeilen + Dot-Indikatoren
- Zeigt Foto, Datum, Person, Summary, Ort pro Item

### MemoryCard.tsx
- Photo-Grid (1-4 Fotos, Lightbox bei Klick)
- Datum, Sterne (importance), Kind-Badge, Kategorien, Tags
- Edit-Mode, Delete-Confirm, Export (html2canvas)

## Familienmitglieder (Config)

| Name | Aliases | Rolle |
|------|---------|-------|
| Junis | Juno, Jonas, Younes | Kind |
| Noah | Fieti | Kind |
| Mama | Leni, Lensi | Mutter |
| Papa | Grabi, Michel | Vater |
| Frank | Opa Frank | Opa (mütterl.) |
| Eva | Oma Eva, Oma | Oma (mütterl.) |
| Moma | - | Oma (väterl.) |
| Opa Peter | Peter | Opa (väterl.) |
| Bowie | - | Katze |

**Achtung**: Diese Daten sind an 4 Stellen definiert:
- `src/config/children.ts` (CHILDREN, FAMILY_MEMBERS, LOCATIONS)
- `src/config/speakers.ts` (SPEAKERS mit Chat-IDs, PERSONS)
- `src/bot/telegramWebhook.ts` (FAMILY_MEMBERS für Registrierung)
- `web/src/types/index.ts` (FAMILY_MEMBERS mit Farben, LOCATIONS)

## Kategorien
Gesundheit, Schule, Familie, Freunde, Freizeit, Sport, Emotion, Entwicklung, Besonderes

## Env-Variablen

| Variable | Required | Default | Beschreibung |
|----------|----------|---------|-------------|
| TELEGRAM_BOT_TOKEN | Ja | - | Bot-Token von @BotFather |
| OPENAI_API_KEY | Ja | - | Für Whisper + GPT-4o-mini |
| PORT | Nein | 3000 | Server-Port |
| DATABASE_PATH | Nein | ./data/memory.db | SQLite-Pfad |
| WEB_PASSWORD | Nein | - | Wenn gesetzt: Passwort-Schutz für Web + API |
| WEBHOOK_URL | Nein | - | Telegram Webhook URL |
| ALLOWED_TELEGRAM_CHAT_IDS | Nein | - | Kommasepariert, leer = alle erlaubt |
| GEMINI_API_KEY | Nein | - | Nicht aktiv genutzt |

## Wichtige Patterns

### Pendende Transkriptionen
`pendingTranscriptions` Map in `telegramWebhook.ts` - lebt nur im RAM. Bei Restart gehen offene Transkriptionen verloren.

### Chat-Standorte
`chatLocations` Map - speichert letzten Standort pro Chat-ID, wird bei nächster Memory automatisch angewendet. Nur im RAM.

### Foto-Zuordnung
Fotos werden dem letzten Eintrag des gleichen Chats zugeordnet, wenn < 5 Minuten alt. Sonst neuer Eintrag.

### Standort-Zuordnung
Standort wird dem letzten Eintrag des gleichen Chats zugeordnet, wenn < 10 Minuten alt und noch kein Standort.

### EXIF
Nur bei Bildern die als Datei (nicht komprimiert) gesendet werden. Telegram-komprimierte Fotos verlieren EXIF. Extension-Check: .jpg, .jpeg, .tiff, .heic.

### Auth-Flow
1. Frontend prüft `/api/auth/status` → `passwordRequired`
2. Wenn ja: Token aus localStorage oder URL-Parameter `?token=`
3. Token = SHA256(password + 'famories-salt')
4. API-Middleware `requireAuth`: Bearer-Token im Authorization-Header
5. Wenn kein WEB_PASSWORD gesetzt: alles offen

## Scripts

```bash
# Backend
npm run dev          # tsx watch src/index.ts
npm run build        # tsc
npm run start        # node dist/index.js
npm run migrate      # tsx src/db/migrate.ts
npm run test         # vitest

# Frontend (cd web/)
npm run dev          # vite dev (port 5173)
npm run build        # tsc + vite build
```

## Bekannte Limitierungen

1. **Speaker Chat-IDs**: Alle auf 0 in `speakers.ts` - müssen mit echten IDs befüllt werden
2. **In-Memory State**: `pendingTranscriptions` und `chatLocations` überleben keinen Restart
3. **Rate-Limiting pro IP**: Hinter NAT teilen sich alle ein Limit
4. **Keine Pagination**: API gibt bis zu 1000 Einträge auf einmal zurück
5. **Token im URL**: Share-Link enthält Token als Query-Parameter (Browser-History, Logs)
6. **Duplizierte Configs**: Familienmitglieder an 4 Stellen definiert
