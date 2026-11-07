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

## Container readiness: deployment not established

Only presence was checked; credential values and configuration addresses were not recorded.

| Prerequisite | Observed presence |
| --- | --- |
| `TINFOIL_API_KEY` | Present; inference request succeeded |
| `TINFOIL_ADMIN_KEY` | Absent |
| `TINFOIL_CONTAINER_URL` | Absent |
| `TINFOIL_CONFIG_REPO` | Absent |
| `tinfoil` CLI executable on the child process PATH | Absent; CLI authentication not verified |
| Repository Dockerfile | Present |
| Repository-root Tinfoil or enclave config candidate | None found |
| Workflow directory | Present; existing `check.yml` only |

No Container was created or deployed, and no repository or configuration was published. This successful inference request does **not** demonstrate the Container deployment required by the Tinfoil track described in [sponsor execution evidence](sponsor-evidence.md). Containers-enabled organization access, deployment configuration, a live instance, and a verified application request remain unverified.

## Darkbloom: model access works, execution rejected

At 19:09:38 UTC the authenticated model listing succeeded (HTTP 200), including `gemma-4-26b`. A real fixed-corpus preparation request using that model was rejected with HTTP 402 before any successful extraction. Check the account's execution access or credits. The app retained its previously validated Ollama profiles; no Darkbloom success was recorded. Run ID: `140264ed-c0dc-436d-96fc-4c21faa34612`.

## Local photo interpretation: successful

The image-to-description browser flow used installed `qwen2.5vl:3b` through Ollama. It extracted the $350,000 payment from a rendered synthetic document in 31.2 seconds. The contributor edited the text, submitted over encrypted transport, and the authorized desk opened the photo. Sender credentials were rejected for image reads. Application arithmetic on the reviewed text showed the $230,000 difference. This local vision run is not a Tinfoil or Darkbloom execution.
