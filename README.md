# Localpoast — Witness Desk

Phone-to-laptop whistleblowing demo. Cindy's organization received an invoice for **$120,000** but sent **$350,000**. The desk surfaces the **$230,000** difference with source passages, recommends relevant reporters from public reporting sources, and lets the operator prepare a reviewed story packet for one selected reporter.

Cindy's case documents and the original three demo recipients are fictional. The public reporter network contains six real ProPublica journalism professionals in US finance and corporate-accountability cohorts, backed by twelve official sources. They are not enrolled in Poast. This prototype does not establish source anonymity, recipient identity, or geographic presence.

## Development

```sh
nvm use
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173/preview for phone and desk together, /desk for the laptop, and pair a real phone using the desk QR and an HTTPS origin.

For an actual phone, run `cloudflared tunnel --url http://localhost:5173`, put its HTTPS URL in `PUBLIC_ORIGIN` in `.env`, and restart the dev server. On the laptop choose **Connect a phone**, then scan the QR. The app strips the sender capability from the visible URL and keeps it in the phone tab's session storage. A direct `/contribute` visit asks for pairing. `/preview` deliberately pairs its simulated phone to its own desk.

Paste or photograph Cindy's fictional payment record, review, and submit. The desk already holds invoice INV-204 for $120,000. Submitted payment PAY-882 is $350,000. The app parses that narrow fixture format and computes the $230,000 difference; the local model proposes follow-up questions and chooses a source-backed recipient. Changing the payment amount changes the result. Ambiguous or unlinked amounts produce insufficient evidence. Photo capture/upload and local vision interpretation are now available; text remains an editable fallback.

Ollama must be running with `llama3:8b` (or change `OLLAMA_MODEL` to another installed model). Both local analysis and local graph preparation require a loopback Ollama endpoint. `ANALYSIS_PROVIDER=ollama` keeps tips local. Choose `tinfoil` explicitly and configure `TINFOIL_API_KEY` to use confidential hosted inference. A key does not deploy the app into a Container.

With a configured Tinfoil key, the desk also offers **Review with Tinfoil** after the initial analysis. This is an explicit additional request: reviewed evidence text, contributor context, the seeded invoice, and recipient expertise go to Tinfoil; the image is not sent. The SDK verifies the inference enclave before sending the prompt. The result retains its verification metadata, model, questions, and recipient recommendation separately from the initial local result. Repeated clicks reuse the review, and verification/provider failures leave the local findings available. This verifies the inference service, not deployment of this app as a Tinfoil Container.

The recipient network defaults to **Public reporters**. Choose a cohort, inspect the official sources, and use **Refresh public sources** to fetch the twelve allowlisted pages and check their excerpts. **Prepare with Darkbloom** extracts source-backed coverage from the reviewed public snapshot; **Prepare locally** uses Ollama. Unsupported quotes, sources, and topics fail validation. A failed refresh preserves the prior profiles with their original provenance and does not claim a successful refresh.

For an analyzed case, **Find matches locally** sends the private evidence and the prepared public profiles only to loopback Ollama. On the hosted desk, the explicit action is **Find matches with Tinfoil**. Each match stores its own profile snapshot, explanation, and supporting source IDs. The public preparation API has no private-tip input. Darkbloom is the preparation provider, not the local inference engine. Cognee is not integrated.

The refreshed Darkbloom cache contains six profiles produced from twelve public sources; a live local matching run selected Jeff Ernsthausen and Paul Kiel for Cindy's synthetic case. The graph has 22 nodes and 30 source-linked edges. Coverage region remains curated profile metadata; the graph makes no geographic-presence claim. This small single-newsroom seed is not a comprehensive directory or proof of interest in the story. See [public-source provenance and limitations](docs/reporter-sources.md) and [the live execution report](docs/public-reporter-live-check.md). The original fictional corpus remains available under **Demo reporters** for repeatable baseline checks; [its source-to-graph flow](src/recipients/README.md) is documented separately.

## Finish with a story packet

1. Analyze the submitted payment and find public reporter matches.
2. Open **Prepare story packet**, choose one matched reporter, and prepare the draft. It includes the original invoice and reviewed payment text, literal record dates, the amount comparison, open questions, that reporter's supporting sources, and processing provenance.
3. Edit the preview and check **I reviewed this story packet.** Editing again clears that confirmation.
4. Choose **Download story packet** for the reviewed Markdown and **Download evidence manifest** for the accompanying JSON. Both files stay on the operator's computer. No email or other onward delivery is implemented.

The manifest preserves the original evidence and provenance separately from the edited Markdown, and includes a SHA-256 hash of the exact reviewed Markdown. Removing a detail from the preview does **not** remove it from the manifest's original evidence. Inspect both files before sharing. The hash checks file consistency; it does not establish evidence truth, recipient identity, or an attestation.

The packet does not automatically add the contributor alias, intake context, receipt time, submission ID, session credentials, or photo bytes. The synthetic browser check confirmed Cindy's name and private intake metadata were absent. This is not automatic anonymization or redaction: exact evidence text, model output, operator edits, and optional photo analysis can still identify a source. Photo analysis is opt-in and labeled unverified.

The older **Download case brief** remains available as a secondary summary with source quotes, amounts, model provenance, and recipient supporting sources. It includes completed Tinfoil verification metadata when available; use the story-packet flow to select a public reporter and review the final artifact.

## Photo and vision flow

1. Choose **Take a photo** or **Choose photo**. The browser prepares a JPEG copy with a maximum edge of 1800 pixels and removes original file metadata. Unsupported formats can be exported as JPEG or a screenshot.
2. Tap **Describe on laptop**. An encrypted request sends the resized image to this laptop's `qwen2.5vl:3b` model. This is a separate, explicit processing step before submission; it does not run on the phone.
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

The browser suite needs running Ollama; the Tinfoil flow also requires a valid `TINFOIL_API_KEY`. It exercises actual inference, independent phone/desk browser contexts, encrypted request bodies, a dropped receipt and idempotent retry, source inspection, changed payment amounts, preview pairing, a real image-to-description run, reader-only image access, verified Tinfoil review, and reconnecting an expired desk. The public-reporter flow checks actual local matching, recipient selection, editing, both story-packet downloads, their SHA-256 binding, and omission of private intake metadata. Run that flow with `npx playwright test public-reporters-flow.spec.ts`, or the Tinfoil flow with `npx playwright test tinfoil-flow.spec.ts`. Screenshots are saved locally under ignored `artifacts/qa-phone-flow/`.

The Dockerfile builds a standalone app serving the frontend and API on port 3001. `docker build -t localpoast:demo .` builds for the host architecture. Tinfoil deployment requires a supported image architecture, registry digest, measured config release, and actual instance verification; a local Docker build is not that deployment.

## Privacy boundary

In local-demo mode OpenPGP encrypts request bodies to an ephemeral desk key and response bodies to each browser's ephemeral reply key. The local backend and intended desk reader see plaintext. The HTTPS app delivery and supplied public key remain trusted. This does not hide network metadata, prove geographic presence, or independently verify a publication. The local intake is not attested; the optional hosted Tinfoil review verifies its own inference service separately.

Reader and sender capabilities are separate; sender access cannot read or reset the desk. Evidence and analysis stay in process memory. Reset removes that session and rotates access; restart loses all sessions. It is not forensic erasure. Drafts remain in browser memory and are not auto-saved across page reloads. There is no onward delivery to a journalist.

## Sponsor readiness

The [hosted phone and desk preview](https://localpoast.janedoe.containers.tinfoil.dev/preview) runs public config release **v0.0.4** and private app image **v0.0.2**, verified on November 7 at 20:57 UTC. CLI and SDK checks verified the app enclave. All 18 production browser checks passed, including Cindy's $230,000 discrepancy, verified Tinfoil matching within the selected finance cohort, Jeff Ernsthausen's two supporting sources, reviewed Markdown and JSON downloads with a matching hash, omission of intake credentials, and session reset. The manifest warning and original-evidence preview were also checked. [Deployment and verification details](docs/tinfoil-deployment.md) record the exact commits, image digest, reports, and repeatable checks. Hosted intake supports text; photo interpretation still runs on the local laptop. A physical phone on the hosted URL has not yet been checked.

See [sponsor execution evidence and remaining gates](docs/sponsor-evidence.md). The [event submission instructions](https://localhostai.nyc/submitting) require a public repository and two-minute video by 5 PM. This repository is currently private as requested; publication, collaborator invitations, and event submission have not been performed.

Never commit .env, API keys, private tip logs, or runtime data. The repository stays private until the user authorizes a visibility change.
