# publicomtools

Driftverktyg för KTH Bibliotekets publika datorer ([publicom](https://github.com/kth-biblioteket/publicom)).
Körs på `https://apps.lib.kth.se/publicomtools`.

- **Heartbeat** (`POST /publicomtools/api/heartbeat`): varje dator skickar sin status var 5:e minut
  (`heartbeat.sh` och `heartbeat.timer` i publicom).
- **Statussida** (`/publicomtools`): alla datorer med status grön/gul/röd, uppdateras var 30:e sekund.
  Detaljsida per dator med de senaste rapporterna. Kräver KTH-inloggning och att e-postadressen finns i `ADMIN_EMAILS`.
- **Inloggningsskärm för gästdatorerna** (`/publicomtools/guest`): ersätter Electron-appen på datorer med
  `LOGIN_UI=web` (se publicoms README). Kontrollerar kontot mot almatools, bokar datorn i bookingsystem-api
  och avslutar bokningen vid utloggning.

Status:
| Färg | Betyder |
|---|---|
| Grön | Datorn rapporterar och allt ser bra ut |
| Gul | Datorn rapporterar, men gästsessionen körs inte, en tjänst har kraschat, disken är nästan full eller en omstart väntar |
| Röd | Ingen rapport på 15 minuter |

Historiken sparas i 30 dagar.

## Uppbyggnad
Samma upplägg som bookingtools: Next.js, Prisma och Postgres i Docker, bakom Traefik på `apps-net`.
KTH-inloggningen sköts av `librarytools-auth` (`/mrbs/login`). Appen verifierar bara dess token och
sparar inloggningen i en egen signerad cookie. Det finns ingen användartabell.

Datorerna autentiserar sig med en gemensam token (`PUBLICOM_DEVICE_TOKEN`) i headern `Authorization: Bearer`.

### Gästinloggningen
| Anrop | Vem | Vad |
|---|---|---|
| `POST /api/device/login-ticket` | datorn (root, token) | Ny inloggningsskärm: engångsbiljett, och `loginPath` som Chromium öppnar |
| `GET /guest/start?ticket=` | Chromium | Flyttar biljetten till en HttpOnly-cookie och visar `/guest` |
| `/guest` (server action) | gästen | almalogin, avslutar föregående bokning (drop-in), skapar ny bokning med användarens token |
| `GET /api/device/session?ticket=` | datorn (root, token) | `pending`, eller `active` med bokningen i samma format som Electron-appen gav |
| `POST /api/device/session/end` | datorn (root, token) | Avslutar bokningen med `BOOKING_API_KEY` |

Bara SHA-256 av biljetten sparas (`GuestLogin`). En biljett gäller i 24 timmar och bara för en inloggning. En ny
biljett för samma dator gör den förra ogiltig. Raderna tas bort efter 30 dagar.

## Lokal utveckling
Kopiera `.env.example` till `.env` och `publicomtools.env.example` till `publicomtools.env`, och fyll i.
Sätt `DEV_AUTH_BYPASS=true` i `publicomtools.env` för att slippa KTH-inloggning lokalt
(fungerar bara med `NODE_ENV=development`, aldrig i produktionsimagen).

```bash
docker compose -f docker-compose-dev.yml up -d
```

Appen finns på http://localhost:3002 och databasen på port 5435. Inloggningsskärmen använder mock-API:et för Alma
och bokningssystemet (`publicom-vm-test/mock-api.js`, port 8765), som containern når på `host.docker.internal`.
Test-VM:ar i UTM når appen på `http://10.0.2.2:3002/api/heartbeat` (se `config/hosts/test-ref.env` i publicom).

Skicka en test-heartbeat:
```bash
curl -X POST -H "Authorization: Bearer <PUBLICOM_DEVICE_TOKEN>" -H "Content-Type: application/json" \
  -d '{"clientVersion":1,"host":"demo","hostname":"demo","uptimeSeconds":60,"guestService":"active"}' \
  http://localhost:3002/api/heartbeat
```

Ändra databasschemat (`prisma/schema.prisma`) och skapa en migrering:
```bash
docker exec -it publicomtools npx prisma migrate dev --name <namn>
```

## Driftsättning
Push till `main` bygger en image till `ghcr.io/kth-biblioteket/publicomtools` och driftsätter på
`apps.lib.kth.se` via webhook. Push till `ref` gör samma sak på `apps-ref.lib.kth.se`.
Migreringar körs automatiskt när containern startar.

Första gången, på servern:
1. Repo-secrets i GitHub: `DEPLOY_TOKEN` och `WEBHOOK_SECRET` (samma som för de andra apparna).
2. Webhook-mottagaren på `api.lib.kth.se` måste känna till publicomtools.
3. Lägg `docker-compose.yml`, `.env` och `publicomtools.env` i en katalog för appen.
   - `KTH_AUTH_JWKS_URL=http://librarytools-auth:3000/mrbs/.well-known/jwks.json`
   - `PUBLICOM_DEVICE_TOKEN` och `SESSION_SECRET`: `openssl rand -hex 32`
   - `BOOKING_API_KEY`: skrivnyckeln till bookingsystem-api (samma som datorerna har i `.secrets` i dag)
   - `ADMIN_EMAILS`: de som ska se statussidan
4. `docker compose up -d`

Slå sedan på heartbeat på datorerna genom att lägga in samma `PUBLICOM_DEVICE_TOKEN` i deras
`/usr/local/bin/secrets/.secrets` (se publicoms README).

## Senare
- Stanzalistan för öppna gästdatorer (`/api/stanzas`), så att datorerna slipper GitHub-tokenen.
- Larm (e-post eller Teams) när en dator slutar rapportera.
- En egen token per dator, så att en dator inte kan rapportera i en annans namn.
