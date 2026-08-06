# Own Telio System architecture

## Goal

Replace the managed ElevenLabs Conversational AI Agent with a provider-neutral Telio voice engine while keeping Twilio telephony and the existing Telio booking database/calendar.

## Runtime flow

1. Twilio calls `POST /twilio/incoming`.
2. The API validates the Twilio signature and returns TwiML with a bidirectional Media Stream.
3. `VoiceCallSession` owns all state for one call.
4. Twilio G.711 µ-law 8 kHz audio is converted to PCM 16 kHz and streamed to standalone STT.
5. A final transcript is sent to `ConversationEngine`.
6. The LLM can call deterministic Telio booking tools.
7. Final text is streamed through standalone TTS and converted back to Twilio µ-law.
8. User speech during thinking/TTS aborts the current response and clears Twilio's playback buffer.

## Boundaries

- `telephony`: Twilio-only transport.
- `voice`: provider-neutral call lifecycle, audio and turn-taking.
- `providers`: replaceable STT, LLM and TTS adapters.
- `agent`: prompt, conversation loop and tool orchestration.
- `domain/bookings`: Telio calendar rules and persistence.
- `db`: database connectivity only.

## Source-system compatibility

The booking adapter targets the same core structures used by `telio-web`:

- `bookings.tenant_id`
- `bookings.user_id`
- `bookings.customer_name`
- `bookings.customer_phone`
- `bookings.start_at` / `end_at`
- `bookings.status`
- `bookings.court_id`
- JSON metadata in `bookings.notes` with `courtId` and `source: voice-assistant`

Google Calendar is not part of this architecture.

## Safety invariants

- The LLM never writes directly to the database.
- A booking is announced as confirmed only after `create_booking` succeeds.
- Write tools validate structured input.
- Booking creation uses a per-tenant/per-court transaction lock.
- Every create operation carries an idempotency key.
- Cancel operations require both booking ID and caller phone.
- Secrets and phone numbers are redacted from logs.
- Database migrations are never auto-applied at startup.

## Current maturity

This repository is a professional foundation, not a production declaration. Before live traffic:

- verify the current ElevenLabs Scribe realtime wire protocol with a contract test;
- add Twilio WebSocket origin/auth hardening;
- persist call records/transcripts and usage metrics;
- implement business hours, slot rules and exact NTC policies;
- add integration and load tests;
- benchmark latency, noisy audio, echo and barge-in;
- perform GDPR/retention and security review.
