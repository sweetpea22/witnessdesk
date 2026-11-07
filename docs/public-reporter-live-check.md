# Public reporter and story-packet live check

Observed on **November 7, 2026** with Cindy's fictional case: an invoice for $120,000 and a payment for $350,000. The application computes the $230,000 difference; that difference alone does not establish wrongdoing.

| Stage | Actual execution | Result |
| --- | --- | --- |
| Public profile preparation | Darkbloom `gemma-4-26b`; run `00183b4f-b371-4ea9-8971-6fd1623927a9`; observed elapsed 10,288 ms | Twelve of twelve official source URLs refreshed and validated; six real ProPublica profiles prepared |
| Source graph | Validated public extraction | 22 nodes and 30 source-linked edges; no geography nodes or geographic-presence claims |
| Private case matching | Local Ollama `llama3:8b`; 12,985 ms | Jeff Ernsthausen and Paul Kiel recommended with citations to their own supporting sources |
| Browser task flow | Actual local inference and browser downloads; passed in 20.3 s | Selected-recipient packet, editable review, Markdown and JSON downloads, matching SHA-256, and omission of private intake metadata verified |
| Hosted story-packet flow | Config v0.0.4, private app image v0.0.2; actual Tinfoil `llama3-3-70b` matching | All 18 production browser checks passed at 20:57:33 UTC; finance-cohort match, Jeff Ernsthausen selected, two supporting sources, reviewed downloads/hash, original-evidence warning, intake/auth omissions, and reset |

Preparation began at `2026-11-07T20:38:26.505Z` and completed at `2026-11-07T20:38:36.777Z`; the elapsed figure above includes caller overhead. The checked cache is [prepared-public-reporters.json](../fixtures/prepared-public-reporters.json). It records `state: ready`, `provider: darkbloom`, `sourceMode: refreshed`, and a validated check for every source. The [seed provenance](reporter-sources.md) lists the six people, two cohorts, and twelve official URLs.

Public preparation sends only curated public profile/source fields. Refreshing checks that each stored excerpt remains on its allowlisted page. The model selects supplied topics and exact excerpts; validation rejects invented quotations, unknown topics and sources, and cross-person attribution. This is constrained source extraction, not autonomous reporting or a full-web discovery system. Private payment evidence is supplied separately to the selected local or confidential matching provider; it is not sent to Darkbloom.

The accepted match retains its own profile snapshot and preparation run ID. The story packet uses only the operator-selected matched reporter and that match's cited public sources. The browser check verified the original invoice and payment text, literal record dates, $230,000 comparison, source quotations and URLs, and preparation/matching provenance. It edited the preview, confirmed review, downloaded both files, and verified that the JSON's `markdownSha256` matched the exact downloaded Markdown.

The synthetic exports did not contain Cindy's alias, the intake context, receipt time, submission ID, or access capabilities. This is field omission, not automatic redaction or anonymity. Original evidence and optional unverified photo analysis can contain identifying details. The manifest preserves original evidence even when the operator edits or removes passages from the Markdown; review both files before sharing. A hash binds the recorded Markdown bytes, not evidence truth, identity, or an enclave attestation. No photo bytes are embedded, and no email or onward delivery occurs.

The implementation and assertions are in [public-network.ts](../src/recipients/public-network.ts), [reporter-match.ts](../src/server/reporter-match.ts), [story-packet.ts](../src/desk/story-packet.ts), and [public-reporters-flow.spec.ts](../tests/public-reporters-flow.spec.ts). Re-run the browser check with the local app and Ollama available:

```sh
npx playwright test public-reporters-flow.spec.ts
```

The browser run consumes the validated Darkbloom cache; it does not itself repeat paid public preparation. It performs a new local match, so model wording, selected order, and timings may vary. Its Playwright attachments include `public-story-result.json`, the reviewed Markdown, the evidence manifest, and screenshots; they use only synthetic case data.

The hosted result is recorded in `artifacts/container-browser/2026-11-07T20-57-12-471Z-39d6912e/result.json`, with the reviewed Markdown, JSON manifest, and screenshots beside it. The separate SDK report `artifacts/container-verification/verify-2026-11-07T20-57-12-844Z-25ca4940.json` verifies the app enclave, encrypted API, and original Tinfoil inference. These ignored local reports contain synthetic evidence only. [The deployment record](tinfoil-deployment.md) pins the exact source, image, public config, and release digest. The browser check uses production HTTPS without TLS exceptions; it does not independently attest initial web-page delivery.

The six profiles come from one newsroom and include an editor as well as reporters. They are not enrolled in Poast, and public coverage does not establish availability, sensitive-tip consent, trust, or verified identity. Nobody was contacted. Hosted text intake and packet preparation passed; hosted photo interpretation is not implemented. Physical-phone hosted rehearsal, the demo video, and event submission remain unchecked.
