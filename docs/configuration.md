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
- `ELEVENLABS_STT_AUDIO_FORMAT=ulaw_8000` (`pcm_16000` is available for benchmark comparison)
- `ELEVENLABS_STT_COMMIT_STRATEGY=vad`
- `ELEVENLABS_STT_CHUNK_MS=100`
- `ELEVENLABS_STT_VAD_SILENCE_SECONDS=1`
- `ELEVENLABS_STT_VAD_THRESHOLD=0.4`
- `ELEVENLABS_STT_MIN_SPEECH_MS=100`
- `ELEVENLABS_STT_MIN_SILENCE_MS=100`
- `ELEVENLABS_STT_SESSION_TIMEOUT_MS=10000`
- `ELEVENLABS_TTS_MODEL=eleven_flash_v2_5`

Scribe receives raw mono Twilio `ulaw_8000`. In `pcm_16000` benchmark mode, the provider converts that same telephone signal internally while the telephony layer remains unchanged. The runtime aggregates five typical 20 ms Twilio frames into a 100 ms Scribe chunk. Do not commit contract-test audio; use an anonymized local raw μ-law file and run `npm run verify:scribe -- <path> "reference transcript"`.

LLM:

- `LLM_PROVIDER=openai`
- `OPENAI_API_KEY`
- `OPENAI_LLM_MODEL=gpt-4o-mini`

Do not copy `.env` files or credentials from the source repositories. Configure new scoped keys through the deployment secret manager.
