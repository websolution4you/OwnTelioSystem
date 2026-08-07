# Own Telio System

A clean, provider-neutral realtime voice system for Telio.

It replaces the managed ElevenLabs Agent layer with separately priced components:

- Twilio bidirectional Media Streams
- standalone realtime STT (initial adapter: ElevenLabs Scribe)
- Telio-owned conversation orchestration and tools
- selectable LLM
- standalone streaming TTS (initial adapter: ElevenLabs Flash)
- the existing Telio web booking database/calendar, not Google Calendar

## Status

Foundation/prototype. It starts in fully mocked mode and must pass provider contract, integration, latency, noisy-audio and security tests before production use.

## Quick start

1. Install Node.js 20 or newer.
2. Run `npm install`.
3. Create `.env` from the variable list in `docs/configuration.md`.
4. Keep all providers set to `mock` initially.
5. Run `npm run dev`.
6. Check `/health/live`, `/health/ready` and `/health/providers`.

## Commands

- `npm run dev` – local watch mode
- `npm run typecheck` – strict TypeScript validation
- `npm test` – unit tests
- `npm run build` – production compilation
- `npm start` – run compiled server
- `npm run verify:scribe -- <raw-ulaw-file> "reference text"` – live Scribe contract and accuracy test
- `npm run verify:tts -- "test text"` – live standalone TTS contract test
- `npm run verify:tts-barge-in` – live TTS cancellation test

## Health checks

- `/health/live` only confirms that the process is alive; use it for platform liveness checks.
- `/health/ready` verifies database readiness when a database is configured.
- `/health/providers` performs non-audio provider permission checks and caches results for five minutes. It returns only safe status codes and never provider response bodies, credentials, tokens or resource identifiers. Do not use it as an aggressive polling endpoint.

## Documentation

- `docs/architecture.md`
- `docs/configuration.md`
- `docs/roadmap.md`

## Security

Never commit secrets. Twilio signature checking is mandatory in production. Booking writes are validated, idempotent and protected by transaction-level court locks.
