# Live sponsor check

Checked 2026-11-07 at 19:08:25 UTC using synthetic demonstration records only.

## Tinfoil inference: successful

The existing `analyzeTip` implementation completed a real hosted inference request through `TinfoilAI` in SDK **1.4.0**, running under Node **24.22.2**. Its default `SecureClient` verification path was used; no verification bypass was configured. The SDK automatically waits for verification before its chat request. A separate attestation artifact was not captured by this check.

| Measurement | Observed result |
| --- | --- |
| Provider | `tinfoil` |
| Model | `llama3-3-70b` |
| Application request duration | 3,166 ms |
| Result | Successful request and application validation |
| Supported invoice / payment | $120,000 / $350,000 |
| Application-calculated difference | $230,000 |
| Finding kind | `possible_overpayment` |
| Supporting citations | 2 |
| Model-generated investigation questions | 3 |
| Valid recipient selections | 1 |

The model supplied investigation questions and a recipient selection. Amount extraction, arithmetic, and source citations came from the application. This result is a supported discrepancy for investigation, not a finding of wrongdoing.

The smoke loaded credentials from the local environment and forced `ANALYSIS_PROVIDER=tinfoil` only inside an isolated child process. It did not change the live server configuration. No credentials, complete prompts, response text, or raw provider errors were printed or saved.

## In-app verified review and case export: successful

On November 7 at 2:36 PM America/New_York, the browser flow submitted Cindy's synthetic evidence, completed local analysis, and explicitly requested **Review with Tinfoil** from the desk. This completed in 2,255 ms using `llama3-3-70b`. The SDK verification document reported `securityVerified: true`, config repository `tinfoilsh/confidential-model-router`, enclave `router-0.tinfoil.sh`, and release digest `95e49018369d59594468ed5af698631ba011937d3859fcbad21207eb0b0f9007`; its code and enclave fingerprints matched. Verification completed before the prompt was sent.

The review retained the $230,000 application-calculated difference and selected `maya-chen` from the Darkbloom-prepared profiles. Original local findings remained unchanged. The browser downloaded a Markdown brief with exact evidence quotes, recipient provenance, and verification metadata. It excluded sender/reader capabilities and image bytes. Sender credentials and plaintext requests were rejected for the review endpoint. The expired-session reconnect flow also passed.

Sanitized metadata, a screenshot, and the synthetic brief are retained locally in ignored `artifacts/qa-tinfoil-review/`. This attests the hosted inference service, not a Container deployment of Localpoast.

## Container deployment: verified

At 20:14 UTC on November 7, config release **v0.0.3** passed the live Container checks at [the hosted preview](https://localpoast.janedoe.containers.tinfoil.dev/preview). The application repo and GHCR image remain private; the separate config repo is public with user approval. CVM 0.14.9 resolves the upstream registry credential bug, and the config passes Tinfoil's assigned DOMAIN into the app. Debug mode is off and confidential computing is enabled.

The CLI verified the exact release and received a healthy response. The Node SDK reported `securityVerified: true` for `sweetpea22/localpoast-tinfoil-config`, release digest `db08ed432a9ad74872c0f411f43dfb8dec63608709656c13c2239493094b72a5`, matching code/enclave fingerprints, and an attested HPKE key. It then submitted Cindy's synthetic payment over encrypted transport. Tinfoil inference used `llama3-3-70b` in 2,982 ms and supplied its own verified document. The result retained the $120,000 invoice, $350,000 payment, $230,000 difference, exact source citations, and Maya's recommendation from three Darkbloom-prepared profiles (19 graph nodes, 20 source-linked edges). Sender credentials could not read the desk; reset invalidated the old session.

A separate production Chromium run passed phone review/send/receipt, desk analysis, both source inspectors, Maya's source-backed profile, brief download with verification metadata, and reset. No provider stubs, TLS exceptions, or attestation bypasses were used. Sanitized artifacts remain local in ignored `artifacts/container-verification/` and `artifacts/container-browser/`. See [deployment details and repeatable commands](tinfoil-deployment.md).

This hosted flow currently supports text. Photo interpretation still runs through local Ollama on the laptop; the hosted image does not contain that model. Physical-phone interaction with the hosted URL and event submission remain outstanding.

## Darkbloom: successful after credits were added

A real fixed-corpus preparation run with `gemma-4-26b` succeeded in 3,605 ms at 19:18:16 UTC. Six articles produced three validated profiles, 19 nodes, and 20 edges. The running desk loaded the output and selected Maya for Cindy's $230,000 discrepancy. See [the execution report](darkbloom-live-check.md). The earlier HTTP 402 account issue is resolved.

## Local photo interpretation: successful

The image-to-description browser flow used installed `qwen2.5vl:3b` through Ollama. It extracted the $350,000 payment from a rendered synthetic document in 31.2 seconds. The contributor edited the text, submitted over encrypted transport, and the authorized desk opened the photo. Sender credentials were rejected for image reads. Application arithmetic on the reviewed text showed the $230,000 difference. This local vision run is not a Tinfoil or Darkbloom execution.
