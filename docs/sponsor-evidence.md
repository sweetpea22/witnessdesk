# Sponsor execution evidence

Checked November 7, 2026 against the [official tracks](https://localhostai.nyc/tracks) and [submission instructions](https://localhostai.nyc/submitting).

| Target | Criterion | Implemented behavior | Observed result | Remaining gate |
| --- | --- | --- | --- | --- |
| Tinfoil | $500, best app deployed as a Tinfoil Container | Historical hosted baseline: private app image, public measured config v0.0.3, verified SecureClient intake and hosted inference | CLI health, encrypted API, and production Chromium text flow passed at 20:14 UTC; $230,000 comparison, citations, original demo-recipient matching, case-brief export, and reset ([deployment record](tinfoil-deployment.md)) | New public-reporter/story-packet changes still need a verified hosted release; physical-phone rehearsal, recording, event entry and judging remain. Hosted photo support is not implemented |
| Darkbloom | $500, best project running real work on Darkbloom | Public-only extraction in src/recipients/public-network.ts produces six real ProPublica profiles from twelve official bio/article sources | Live gemma-4-26b preparation refreshed and validated all 12 URLs, then produced six profiles in 10,288 ms; resulting graph has 22 nodes and 30 source-linked edges ([live report](public-reporter-live-check.md)) | Record the end-to-end demo and submit the event entry; eligibility and awards remain for judges |
| Private inference routing | Secondary $500 category | Darkbloom prepares public expertise; private case matching uses selected loopback Ollama or verified Tinfoil | Actual llama3:8b match completed in 12,985 ms, recommending Jeff Ernsthausen and Paul Kiel. Public preparation receives no private case fields | Record the routing demonstration and obtain judge assessment |
| SIE / Cognee | Additional task-offloading / shared-memory criteria | Deferred | Not implemented | Only consider after primary sponsor integrations work |

## Current public-reporter and packet proof

Darkbloom run `00183b4f-b371-4ea9-8971-6fd1623927a9` used `gemma-4-26b` with refreshed public sources. All twelve official ProPublica pages passed excerpt validation; the model selected exact source/topic associations for six professionals across US finance and corporate accountability. The cache retains the model, run ID, source-check timestamps and content hashes. Coverage region is curated metadata, not a model-proved location or graph assertion.

Private matching then used local `llama3:8b` and selected Jeff Ernsthausen and Paul Kiel for the synthetic $120,000 invoice / $350,000 payment. Every accepted match cites supporting sources belonging to that same reporter. These are relevance suggestions, not claims of willingness to receive a tip or verified identity.

The actual browser flow passed in **20.3 seconds**, including recipient selection, editable story-packet review, Markdown and JSON downloads, and a SHA-256 check against the exact edited Markdown. The synthetic exports omitted Cindy's alias, intake context, submission ID, receipt time, and access capabilities. The JSON manifest still preserves original evidence when the Markdown is edited. There is no automatic anonymity or redaction; source text can identify its contributor. Email and onward delivery are outside the current scope.

See [the execution report](public-reporter-live-check.md) for evidence paths and reproduction, and [the source manifest](reporter-sources.md) for all six people and twelve URLs. No reporter was contacted. This is a curated single-newsroom sample, not a comprehensive network.

## Earlier synthetic baseline

Ollama `llama3:8b` actually processed the six synthetic portfolio articles on this computer. Run `cc04b6fd-7c7d-4faa-a4b7-ccb22893467b` started 2026-11-07T18:43:28.495Z and finished 18:43:49.409Z. It produced three validated profiles, 19 graph nodes, and 16 source-linked edges. This earlier local preprocessing run was subsequently replaced in fixtures/prepared-demo.json by the validated Darkbloom run documented in [the live report](darkbloom-live-check.md).

The model selects source-derived sentence/topic candidates under a constrained JSON schema. All quotations are validated against the attributed article; each profile needs both supplied articles. Unknown IDs, invented quotes, unsupported specialties, and failed runs cannot acquire a successful provider badge.

Browser testing exercised a separate phone context, encrypted submission of Cindy's payment, an intentionally lost response, safe retry without another card, actual local analysis, and source inspection. The invoice is $120,000; the payment is $350,000; application arithmetic produces the $230,000 difference. The model supplies questions and recipient choice, not the arithmetic.

## Deployment references

- [Tinfoil Container quickstart](https://docs.tinfoil.sh/containers/quickstart): config/release evidence must be public; application image may remain private.
- [Verified browser/client requests](https://docs.tinfoil.sh/containers/connecting): use the expected enclave URL and config repository.
- [Darkbloom API console](https://console.darkbloom.dev/api-console): base https://api.darkbloom.dev/v1 and POST /chat/completions. Choose an available model through authenticated /models.

Set server credentials only in .env or the deployment secret store. Never put credentials into the client, screenshots, git, or execution manifests. Live execution demonstrates the integration; it does not guarantee bounty eligibility or an award.
