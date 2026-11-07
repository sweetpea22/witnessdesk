# Darkbloom live integration check

**Passed on 2026-11-07 after account credits were added.** The existing recipient preparation adapter completed an authenticated Darkbloom request and accepted its output through the existing strict source validators. No application source or credential files were changed for this check.

| Field | Observed value |
| --- | --- |
| Provider | Darkbloom |
| Model | `gemma-4-26b` |
| API route | `https://api.darkbloom.dev/v1/chat/completions` |
| Preparation run | `7d6c6560-b30d-4eb9-9b49-f418c03cda37` |
| Started | `2026-11-07T19:18:12.700Z` |
| Completed | `2026-11-07T19:18:16.304Z` |
| Measured elapsed time | 3,605 ms |
| Final state | `ready` |
| Inputs | Six locally stored synthetic portfolio articles |
| Outputs | Three recipient profiles; 19 graph nodes; 20 graph edges |
| Cache written | `fixtures/prepared-demo.json` |

Each profile retained evidence from both of its supplied articles. Validation required known recipient and source IDs, the supplied region, allowed specialties, exact quotations from that recipient’s own articles, and specialty labels literally supported by their quoted text. The first request passed; no schema relaxation or module modification was needed.

| Recipient ID | Validated specialties | Distinct supporting citations |
| --- | ---: | ---: |
| `maya-chen` | 3 | 2 |
| `luis-rivera` | 2 | 2 |
| `priya-shah` | 3 | 2 |

The check loaded credentials with `dotenv` in a separate process and called `prepareRecipientProfiles({ provider: 'darkbloom' })`. Missing base/model settings received process-local defaults of `https://api.darkbloom.dev/v1` and `gemma-4-26b`. Credentials, prompts, and response text were excluded from this report. No confidential tip, photo, private matching query, or local GPU workload was involved.

The [official Darkbloom API console](https://console.darkbloom.dev/api-console) documents this authenticated, OpenAI-compatible route and non-streaming responses. This result establishes successful API execution and source validation; hardware attestation was not evaluated.

The running desk was subsequently reloaded with this cache. An encrypted browser submission of Cindy's synthetic payment produced the $230,000 difference and selected `maya-chen` from these Darkbloom-prepared profiles. The live snapshot reported the same run ID, three profiles, and 20 graph edges. Screenshot evidence is kept locally in ignored `artifacts/desk-darkbloom-live.png`. Cached output remains labeled with its recorded provider and preparation time.
