# DiagNXT CareLink — Offline AI for Care Continuity

Mobile-first PWA prototype (World Bank Small AI for Development hackathon). Helps a frontline health worker keep a patient moving through referral and follow-up when connectivity is unreliable. A **local, rule-based Small AI** structures free-text input, finds missing / unresolved / contradictory information for the current care state, and suggests **one** next action. The worker decides.

**Not** diagnosis, treatment advice, autonomous messaging, or a cloud LLM. No network calls in the core workflow.

## Run
```bash
npm install
npm test            # engine + parser unit tests
npm run demo        # build + serve at http://localhost:4173 (service worker active)
npm run dev         # dev server (no service worker)
npm run audio       # regenerate bundled EN/HI voice clips (macOS only)
```
**Phone demo:** service workers need HTTPS (or localhost). Deploy `dist/` (Netlify Drop / Vercel / GitHub Pages), open once online, "Add to Home Screen", then switch to Airplane Mode. Look for **Ready for offline** in the status bar.

## Demo script (≈3 min)
1. Open app online → "Ready for offline". Home ranks 5 synthetic cases by Small AI priority.
2. Switch on Airplane Mode (or Sync & settings → *Simulate offline*). Reload — still works.
3. **New patient** → tap *English* example → **Understand**. See the "Care continuity gap detected" preview → Save.
4. Case view → **CareLink Intelligence**: care state, Known/Unknown/Missing, suggested action + why. Tap **Listen** (bundled voice, works offline). Switch to हिंदी.
5. **Take this action** → record "Contacted the facility" → case shows *Pending sync*.
6. Role switch → **Facility**: inbox does *not* show the referral yet (not synced).
7. Back online → **Sync now** → Facility inbox shows it → Accept + Schedule.
8. Frontline → Sync → care state becomes *Appointment scheduled*, next action changes, timeline shows facility actions. Facility "Mark completed" with a follow-up plan → worker records outcome → loop closed.

## Architecture
- `src/intelligence/` — `parser.ts` (EN/Hinglish/Devanagari free text → draft case), `facts.ts` (merge worker + facility facts with provenance), `engine.ts` (`analyze()` — pure function: derived care state, gaps, contradictions, action, priority), `priority.ts`.
- `src/db/` — IndexedDB (`idb`); every frontline write is marked `pending` and queued in the outbox.
- `src/sync/remote.ts` — **simulated server** (IndexedDB stores). The only file to replace with a real API. Ownership rule: frontline owns patient/referral/`worker.*`, facility owns `facility.*` → no conflict resolution needed.
- `src/i18n/` — `en.ts` / `hi.ts`; add a language by adding a dictionary.
- `src/voice/` + `public/audio/` — bundled clips; browser TTS only as fallback.

## Known limitations / hand-off for Chitrank
- Intelligence is **demo rule-based logic**; swap `analyze()` / `parseFreeText()` for an on-device model behind the same signatures.
- Voice **input** (mic) uses the browser Web Speech API and needs internet; offline dictation is future work.
- Sync is explicit and simulated on one device; no background sync, auth or encryption-at-rest yet.
- **Hindi strings are machine-drafted — have a native speaker review before the pitch.**
- Hindi audio generated with macOS voice "Lekha"; quality varies on dynamic reason text (falls back to device TTS).
