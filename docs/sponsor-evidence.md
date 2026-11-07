# Sponsor execution evidence

Checked November 7, 2026 against the [official tracks](https://localhostai.nyc/tracks) and [submission instructions](https://localhostai.nyc/submitting).

| Target | Criterion | Implemented behavior | Observed result | Remaining gate |
| --- | --- | --- | --- | --- |
| Tinfoil | $500, best app deployed as a Tinfoil Container | SDK inference adapter in src/server/analysis.ts; SecureClient branch in src/shared/api.ts; standalone Dockerfile | Production frontend and local Docker image build successfully; no Tinfoil request executed | API key, Containers-enabled org/admin, measured public config release, registry image, live instance and verified browser request |
| Darkbloom | $500, best project running real work on Darkbloom | Fixed-corpus extraction adapter in src/recipients/index.ts against documented chat-completions API | Adapter code and provenance tests pass; no live Darkbloom request executed | Key, available model, successful extraction run consumed by live recommendation |
| Private inference routing | Secondary $500 category | Private tips use selected Ollama/Tinfoil path; portfolio preparation is separate | Real local inference exercised; tip absent from preparation input | Sponsor routing demonstration and judge assessment |
| SIE / Cognee | Additional task-offloading / shared-memory criteria | Deferred | Not implemented | Only consider after primary sponsor integrations work |

## Completed local proof

Ollama `llama3:8b` actually processed the six synthetic portfolio articles on this computer. Run `cc04b6fd-7c7d-4faa-a4b7-ccb22893467b` started 2026-11-07T18:43:28.495Z and finished 18:43:49.409Z. It produced three validated profiles, 19 graph nodes, and 16 source-linked edges. The corpus hash and exact outputs are in fixtures/prepared-demo.json. This is cached local preprocessing, not Darkbloom execution.

The model selects source-derived sentence/topic candidates under a constrained JSON schema. All quotations are validated against the attributed article; each profile needs both supplied articles. Unknown IDs, invented quotes, unsupported specialties, and failed runs cannot acquire a successful provider badge.

Browser testing exercised a separate phone context, encrypted submission of Cindy's payment, an intentionally lost response, safe retry without another card, actual local analysis, and source inspection. The invoice is $120,000; the payment is $350,000; application arithmetic produces the $230,000 difference. The model supplies questions and recipient choice, not the arithmetic.

## Deployment references

- [Tinfoil Container quickstart](https://docs.tinfoil.sh/containers/quickstart): config/release evidence must be public; application image may remain private.
- [Verified browser/client requests](https://docs.tinfoil.sh/containers/connecting): use the expected enclave URL and config repository.
- [Darkbloom API console](https://console.darkbloom.dev/api-console): base https://api.darkbloom.dev/v1 and POST /chat/completions. Choose an available model through authenticated /models.

Set server credentials only in .env or the deployment secret store. Never put credentials into the client, screenshots, git, or execution manifests. Do not mark either sponsor criterion complete before its live execution is verified.
