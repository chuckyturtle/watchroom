# 🎬 WatchRoom

Ve YouTube, Twitch y Kick sin anuncios. Crea salas inmersivas, camina por ellas y ve contenido en grupo con tus amigos.

## Características

- **YouTube, Twitch y Kick sin anuncios** — player embebido limpio
- **Búsqueda integrada** de cada plataforma
- **Sala inmersiva** — sala 2D donde puedes caminar con WASD y ver a otros usuarios en tiempo real
- **Chat en sala** — chat en vivo con todos los presentes
- **Sistema de amigos** — agrega amigos, acepta/rechaza solicitudes
- **Invitaciones a sala** — invita amigos directamente a tu sala en tiempo real
- **Perfil de usuario** — bio personalizable, color de avatar
- **Autenticación completa** — registro, login, recuperación de contraseña por correo

## Instalación

### 1. Copia y configura las variables de entorno

```bash
cp .env.example .env
```

Edita `.env` y completa:

| Variable | Descripción |
|---|---|
| `JWT_SECRET` | Cadena secreta aleatoria (ej. 64 caracteres) |
| `SMTP_USER` | Tu correo Gmail |
| `SMTP_PASS` | [Contraseña de aplicación de Gmail](https://myaccount.google.com/apppasswords) |
| `YOUTUBE_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) → YouTube Data API v3 |
| `TWITCH_CLIENT_ID` | [Twitch Dev Console](https://dev.twitch.tv/console) |
| `TWITCH_CLIENT_SECRET` | Twitch Dev Console |

> Kick no requiere API key — usa su API pública.

### 2. Instala dependencias y crea la base de datos

```bash
npm install
npm run db:setup
```

### 3. Inicia el servidor

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000)

## Estructura de páginas

| URL | Descripción |
|---|---|
| `/` | Inicio — busca en YouTube, Twitch o Kick |
| `/watch/youtube/VIDEO_ID` | Ver video de YouTube |
| `/watch/twitch/CANAL` | Ver stream de Twitch |
| `/watch/kick/CANAL` | Ver stream de Kick |
| `/room/youtube/VIDEO_ID` | Sala inmersiva para ese video |
| `/room/twitch/CANAL` | Sala inmersiva para ese canal |
| `/friends` | Lista de amigos y solicitudes |
| `/profile/USERNAME` | Perfil de usuario |
| `/login` | Iniciar sesión |
| `/register` | Crear cuenta |
| `/forgot-password` | Recuperar contraseña |

## Sala Inmersiva

- **WASD** o flechas para moverte
- **Touch + arrastrar** en móvil
- El video se reproduce en el panel izquierdo (la pantalla grande en la sala lo representa)
- El chat está a la derecha
- Invita amigos con el botón "Invitar amigos" — reciben una notificación en tiempo real
