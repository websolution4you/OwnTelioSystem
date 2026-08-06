# Roadmap

## Phase 0 — foundation (current)

- provider-neutral contracts
- Twilio webhook and Media Stream gateway
- standalone STT/TTS adapters
- LLM tool loop
- Telio booking repository and tools
- idempotency and transaction locking
- mock mode, Docker and baseline tests

## Phase 1 — contract validation

- verify ElevenLabs Scribe and TTS protocols against current official APIs
- record STT/TTS first-byte and end-of-turn latency
- add reconnect, timeout and provider circuit-breaker behavior
- add deterministic test-call harness with stored, anonymized audio fixtures

## Phase 2 — NTC parity

- import exact opening hours, court inventory, duration and advance-booking policies
- caller lookup in `booking_users`
- upcoming booking lookup and secure cancellation confirmation
- WhatsApp confirmation adapter
- call persistence and transcript retention policy
- parity test matrix against production `ntc_test`

## Phase 3 — natural conversation

- adaptive endpointing for short/long Slovak utterances
- echo-resistant barge-in
- streaming LLM text into sentence-safe TTS chunks
- interruption-aware conversation history
- pre-generated greeting and rare latency fillers

## Phase 4 — production hardening

- load and soak tests for concurrent calls
- cost ledger per call: telephony, STT seconds, LLM tokens and TTS characters
- dashboards and alerts
- provider failover
- GDPR, security and threat-model review
- canary traffic with managed ElevenLabs Agent fallback

## Acceptance targets

- p50 response audio start below 900 ms after final user turn
- p95 below 1.5 seconds for turns without external tools
- no duplicate bookings under concurrent-create tests
- 100% confirmation only after committed database write
- successful interruption/clear in noisy and speakerphone scenarios
- exact booking visibility in the existing Telio web calendar
