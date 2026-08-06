# Configuration

Create a local `.env` file. Never commit it.

## Core

- `NODE_ENV`: `development`, `test` or `production`
- `PORT`: HTTP port, default `3000`
- `PUBLIC_BASE_URL`: public HTTPS base URL used by Twilio
- `LOG_LEVEL`: structured log level
- `DRY_RUN`: keep `true` until external-provider tests are intentional

## Twilio

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_VALIDATE_SIGNATURES=true`

## Telio database

- `DATABASE_URL`: server-only Postgres connection string
- `TELIO_TENANT_ID`: tenant UUID used by the Telio booking calendar
- `TELIO_TIME_ZONE=Europe/Bratislava`

## Providers

Safe local defaults:

- `STT_PROVIDER=mock`
- `LLM_PROVIDER=mock`
- `TTS_PROVIDER=mock`

Standalone ElevenLabs APIs:

- `STT_PROVIDER=elevenlabs`
- `TTS_PROVIDER=elevenlabs`
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `ELEVENLABS_STT_MODEL=scribe_v2_realtime`
- `ELEVENLABS_TTS_MODEL=eleven_flash_v2_5`

LLM:

- `LLM_PROVIDER=openai`
- `OPENAI_API_KEY`
- `OPENAI_LLM_MODEL=gpt-4o-mini`

Do not copy `.env` files or credentials from the source repositories. Configure new scoped keys through the deployment secret manager.
