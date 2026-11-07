# Localpoast — Witness Desk

Phone-to-laptop whistleblowing demo. Cindy's organization received an invoice for **$120,000** but sent **$350,000**. The desk surfaces the **$230,000** difference with source passages and recommends a reporter from a private, source-backed recipient graph.

All initial people, publications, and documents are fictional. This prototype does not establish source anonymity or geographic presence.

## Development

```sh
nvm use
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173/preview for phone and desk together, /desk for the laptop, and pair a real phone using the desk QR and an HTTPS origin.

For an actual phone, run `cloudflared tunnel --url http://localhost:5173`, put its HTTPS URL in `PUBLIC_ORIGIN` in `.env`, and restart the dev server. On the laptop choose **Connect a phone**, then scan the QR. The app strips the sender capability from the visible URL and keeps it in the phone tab's session storage. A direct `/contribute` visit asks for pairing. `/preview` deliberately pairs its simulated phone to its own desk.

Load Cindy's fictional payment record, review, and submit. The desk already holds invoice INV-204 for $120,000. Submitted payment PAY-882 is $350,000. The app parses that narrow fixture format and computes the $230,000 difference; the local model proposes follow-up questions and chooses a source-backed recipient. Changing the payment amount changes the result. Ambiguous or unlinked amounts produce insufficient evidence. Photo capture/upload and local vision interpretation are now available; text remains an editable fallback.

Ollama must be running with `llama3:8b` (or change `OLLAMA_MODEL` to another installed model). Both local analysis and local graph preparation require a loopback Ollama endpoint. `ANALYSIS_PROVIDER=ollama` keeps tips local. Choose `tinfoil` explicitly and configure `TINFOIL_API_KEY` to use confidential hosted inference. A key does not deploy the app into a Container.

The local recipient pipeline reads articles in fixtures, asks a local Ollama model to extract expertise with exact supporting quotes, validates the quotations, then constructs recipient/article/topic/region relationships. Open the recipient graph to inspect its sources. Darkbloom is a separate adapter; Ollama execution is never labeled as Darkbloom use.

Read [the complete source-to-graph flow](src/recipients/README.md). The checked-in preparation cache is the output of an actual local model run over six fictional articles. The network view can rerun preparation. It displays provider, model, run time, and sources. Private matching uses those validated profiles; the tip is never an input to public-corpus preparation.

## Photo and vision flow

1. Choose **Take a photo** or **Choose photo**. The browser prepares a JPEG copy with a maximum edge of 1800 pixels and removes original file metadata. Unsupported formats can be exported as JPEG or a screenshot.
2. Tap **Describe photo**. An encrypted request sends the resized image to this laptop's `qwen2.5vl:3b` model. This is a separate, explicit processing step before submission; it does not run on the phone.
3. Review the factual image description, uncertainty notes, and extracted document text. Edit the text before submitting. For scene photographs with no readable text, explicitly choose **Use description as evidence** or write what you observed.
4. Confirm the submission. The desk receives the model output separately from the reviewed text. **View submitted photo** loads the image through reader-only encrypted access; routine desk polling carries no image bodies.

Install the vision model with `ollama pull qwen2.5vl:3b`; override it with `OLLAMA_VISION_MODEL`. Photograph [the sample payment document](http://localhost:5173/demo-payment.html) from the paired phone to try Cindy's scenario. Local vision does not use a sponsor API. Text analysis still uses `ANALYSIS_PROVIDER` independently.

Photos are decoded and re-encoded again server-side. No photo, filename, or original EXIF metadata is written to disk. Unsubmitted photo access expires after 15 minutes; submitted images remain in the process until reset/restart or session expiry. Removing a phone preview does not recall an image already sent for interpretation. Model descriptions and transcriptions are unverified; the amount comparison uses the text the contributor approved.

## Verification

```sh
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite needs running Ollama and exercises actual inference, independent phone/desk browser contexts, encrypted request bodies, a dropped receipt and idempotent retry, source inspection, changed payment amounts, preview pairing, a real image-to-description run, and reader-only image access. Screenshots are saved locally under ignored `artifacts/qa-phone-flow/`.

The Dockerfile builds a standalone app serving the frontend and API on port 3001. `docker build -t localpoast:demo .` builds for the host architecture. Tinfoil deployment requires a supported image architecture, registry digest, measured config release, and actual instance verification; a local Docker build is not that deployment.

## Privacy boundary

In local-demo mode OpenPGP encrypts request bodies to an ephemeral desk key and response bodies to each browser's ephemeral reply key. The local backend and intended desk reader see plaintext. The HTTPS app delivery and supplied public key remain trusted. This does not hide network metadata, prove geographic presence, or independently verify a publication. No attestation is claimed for local mode.

Reader and sender capabilities are separate; sender access cannot read or reset the desk. Evidence and analysis stay in process memory. Reset removes that session and rotates access; restart loses all sessions. It is not forensic erasure. Drafts remain in browser memory and are not auto-saved across page reloads. There is no onward delivery to a journalist.

## Sponsor readiness

Tinfoil Container deployment and live sponsor API connections require user credentials. Local development is explicitly labeled. The Tinfoil bounty requires actual Container deployment; a local demo alone does not meet that criterion.

See [sponsor execution evidence and remaining gates](docs/sponsor-evidence.md). The [event submission instructions](https://localhostai.nyc/submitting) require a public repository and two-minute video by 5 PM. This repository is currently private as requested; publication, collaborator invitations, and event submission have not been performed.

Never commit .env, API keys, private tip logs, or runtime data. The repository stays private until the user authorizes a visibility change.
