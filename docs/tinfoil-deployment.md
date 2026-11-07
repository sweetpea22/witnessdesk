# Tinfoil Container deployment

Updated 2026-11-07. The application source and AMD64 GHCR image are private. The user approved the separate [public configuration repository](https://github.com/sweetpea22/localpoast-tinfoil-config), which now contains only configuration, validation, release workflows, and documentation with independent Git history. This deployment supports a **text-only enclave demo**; the working phone photo demonstration continues on the laptop.

The successful [private image build](https://github.com/sweetpea22/localpoast/actions/runs/42413183148) used source commit `864debdf17d1c0b6c33e3fabb3be80854c9d0412`. The image is `ghcr.io/sweetpea22/localpoast@sha256:36bf4172389cd9320cdba1a1bf7ad7231aa2357ba76e2cd5c2794da516090e72` with tag `v0.0.2`. GitHub's package API confirms visibility `private`. Both config copies pin that exact digest and identify the separate public repository `sweetpea22/localpoast-tinfoil-config`. Public config commit `336017aa5dbaa78d9734ec10b199112ef60ea329` produced [release v0.0.4](https://github.com/sweetpea22/localpoast-tinfoil-config/releases/tag/v0.0.4) through [publication run 42413328054](https://github.com/sweetpea22/localpoast-tinfoil-config/actions/runs/42413328054).

**Verified deployment: PASS, November 7 at 20:57 UTC.** Config **v0.0.4** has been running since `20:56:57Z` at [the hosted preview](https://localpoast.janedoe.containers.tinfoil.dev/preview). Debug mode is off and confidential computing is enabled. The CLI verified the exact release before receiving `{"ok":true}` from `/health`. The Node SDK verified the app enclave and completed encrypted submission, sender-read rejection, cited amount comparison, verified Tinfoil inference, original demo-profile provenance, and session reset.

Production Chromium passed **all 18 checks** at `20:57:33.146Z`, including the selected finance cohort's actual Tinfoil reporter match, Jeff Ernsthausen's two exact supporting sources, editable story-packet review, Markdown and JSON downloads with a matching SHA-256, the manifest warning and original-evidence preview, omission of intake identity/auth data, and reset. No packet was sent onward. This verifies the hosted text flow; a physical phone on this URL, demo video, and event submission have not yet been checked.

The app verification reports release digest `fe12be0c8fe9e6821ee07106177f97f53591e458f90a3a418f480374b012d9af`, matching code/enclave fingerprints, and an attested HPKE key. Original inference used `llama3-3-70b` in **3,379 ms**. Sanitized evidence is retained in ignored local files:

- `artifacts/container-verification/verify-2026-11-07T20-57-12-844Z-25ca4940.json`: SDK attestation, encrypted API, and inference checks.
- `artifacts/container-browser/2026-11-07T20-57-12-471Z-39d6912e/result.json`: all 18 browser checks; screenshots and downloaded story artifacts are in the same directory.

## Files and visibility

| Artifact | Destination |
| --- | --- |
| `deploy/tinfoil/private-source/build-image.yml` | Private localpoast repository, `.github/workflows/build-image.yml` |
| `deploy/tinfoil/public-config/tinfoil-config.yml` | Public config repository root |
| Public-config `validate-config.py`, `requirements.txt` | Same public config repository |
| Public-config `.github/workflows/tinfoil-release*.yml` | Same public config repository; keep both phases |

The application source stays private, and its image stays private in GHCR. Only the config, image digest, validator, and release evidence become public. Public config is required for this documented workflow; it does not require publishing application source. [Private-image documentation](https://docs.tinfoil.sh/containers/private-images)

## Current deployment checkpoint

The official CLI **0.19.20** was downloaded to `/tmp/localpoast-tinfoil-cli-0.19.20/tinfoil` without administrator access. Its Darwin ARM64 archive SHA256 matched GitHub's release metadata:

`e4ba2274d5b37d22f0b12990361fc6d091a4d3ad0a118c09e801e146079385a0`

Organization-admin authentication works. Project-scoped `TINFOIL_API_KEY` and `DARKBLOOM_API_KEY` are configured. A dedicated classic GHCR token with `read:packages` was checked and stored in the organization's Registry Credentials. Authenticated GHCR tag and digest requests returned HTTP 200, and Tinfoil deployment validation returned `valid: true`. An actual local Docker pull of the exact private image and a read-only startup smoke check succeeded.

Both measured-release workflows succeeded for [config v0.0.1](https://github.com/sweetpea22/localpoast-tinfoil-config/releases/tag/v0.0.1). The first two enclave boots passed CPU attestation and certificate setup but failed at the private-image pull because of the upstream runtime defect below. These were not credential-validation or capacity failures.

Both config copies and the local validator require **CVM 0.14.9**. Historically, config release `v0.0.2` fixed the private-image pull; the next startup check exposed a missing `DOMAIN` pass-through. Public config commit `00604cd` corrected it, and the [v0.0.3 measured-publication workflow](https://github.com/sweetpea22/localpoast-tinfoil-config/actions/runs/42409857727) succeeded. A local differential test confirmed that omitting the value caused exit code 1 and passing it produced a healthy app. Current config **v0.0.4** preserves both fixes and updates the image to include public-reporter matching and reviewed story packets.

The CLI does not automatically read this project's `.env`. Session commands parse its current `TINFOIL_ADMIN_KEY` into a child environment, remove `TINFOIL_API_KEY` from that child, and set `TINFOIL_CONFIG=/tmp/localpoast-empty-tinfoil-context.json` to exclude an old saved login. Never print credentials or pass literal values in command-line arguments. The administration key is never injected into the runtime image. [CLI authentication](https://docs.tinfoil.sh/containers/cli#authenticating)

## Private-registry boot failure and correction

CVM `0.14.7` writes registry credentials to `/mnt/ramdisk/private/docker-config` in the boot process. Its separate container-manager process instead reads the default Docker config directory, because it does not inherit the boot process's `DOCKER_CONFIG` change. It consequently attempts an anonymous pull. A successful `registry-auth` boot stage does not establish credential use by that process or pull authorization. This matches the observed failure despite working GHCR credentials. [Official fix, PR #372](https://github.com/tinfoilsh/cvmimage/pull/372)

The correction is **CVM 0.14.9**, a new measured config release, and redeployment of the same private image digest with the existing credentials. GitHub ancestry checks confirmed `0.14.9` contains fix commit `5cbe07152949366bf103128b12a3aa0c44f92c3c`; `0.14.8` does not. The official template has a [matching version-bump PR](https://github.com/tinfoilsh/tinfoil-containers-template/pull/70). No image publication, credential rotation, or attestation bypass is needed. The [0.14.9 release manifest](https://github.com/tinfoilsh/cvmimage/releases/tag/v0.14.9) gives root measurement `a2a8956743ae4a9d56f6f4c0634685a74c54fb238c2bc674a30507b1b4c08827`.

## Runtime and limits

The application listens on **0.0.0.0:3001**, serves the built web app, and exposes `/health`. The config routes that port through the shim, requires a real AMD64 image digest, and requests the platform minimum **2 CPUs / 8192 MB**. There is no GPU, model download, or persistent disk. [Configuration reference](https://docs.tinfoil.sh/containers/configuration)

The root filesystem remains read-only. Bounded tmpfs mounts provide 128 MB at `/tmp` for runtime scratch and 1 MB at `/home/node/.tinfoil` for the SDK's ephemeral cache-scoping key. The image runs as UID/GID 1000. Recipient preparation still works in memory when its optional fixture-cache write is rejected. Sessions, submissions, photos, and runtime graph changes disappear on restart; this is not durable evidence storage. Readiness is checked with Node's existing `fetch`, so the image needs no curl package. [Runtime defaults](https://docs.tinfoil.sh/containers/config-runtime)

Tinfoil supplies its reserved `DOMAIN` value in external configuration. The container must explicitly request it with the bare string `- DOMAIN` in its `env` list; this passes through the platform value without defining a literal override. CVM 0.14.9 only copies requested names, as shown in its [environment-building implementation](https://github.com/tinfoilsh/cvmimage/blob/v0.14.9/tinfoil/internal/containers/containers.go#L714). The measured shell entrypoint derives `TINFOIL_CONTAINER_URL` and `PUBLIC_ORIGIN` from it before launching the unchanged application. It refuses an empty or malformed domain. The public config supplies the separate config-repository name. Never supply a custom literal value for `DOMAIN`. [Environment documentation](https://docs.tinfoil.sh/containers/secrets-and-env-vars)

`ANALYSIS_PROVIDER=tinfoil` sends submitted text through the app's existing Tinfoil SDK adapter. Hosted public-reporter matching also uses verified Tinfoil inference. Darkbloom receives only the public reporter source corpus or the separate synthetic demo portfolios; it does not receive private case evidence. The config explicitly permits **outbound public-network access**: the installed SDK contacts `atc.tinfoil.sh` and discovers a verified router hostname, while Darkbloom uses `api.darkbloom.dev` and source refresh fetches allowlisted official newsroom pages. This is not a hostname-restricted network. A narrower policy requires capturing the complete verified SDK endpoint set, including redirects, and retesting; wildcard allowlist entries are unsupported. [Networking reference](https://docs.tinfoil.sh/containers/config-networking)

The browser's existing `SecureClient` uses the enclave URL and config repo before sending app requests. The initial web-page/bootstrap delivery is still ordinary HTTPS; this deployment does not claim independently verified browser code delivery. Confirm a real attested request before treating the Container mode badge as execution evidence. [Connecting documentation](https://docs.tinfoil.sh/containers/connecting)

## Photo limitation and bounded demo plan

The current photo adapter only calls Ollama on loopback. The Docker image includes neither Ollama nor `qwen2.5vl:3b`; loopback inside the enclave cannot reach the laptop. The photo action will therefore fail there. Changing `OLLAMA_URL` to a remote service is rejected by the current adapter and would not make that service local.

For this checkpoint, demonstrate the real photo → local vision → reviewed text flow on the laptop. Demonstrate the enclave using Cindy's supplied text record, Tinfoil text analysis and reporter matching, the Darkbloom-prepared public network, and the reviewed story packet. Do not present the enclave as a working hosted photo demo. Before offering the full hosted flow, implement and test a deliberate confidential vision adapter or a properly provisioned in-enclave model runtime, and make the UI describe its actual execution location. That application work is outside these deployment artifacts.

## Repeatable release and verification commands

Run authenticated CLI commands with the controlled credential environment described above. Keep source and image private, and use the existing public config repository. Its creation and publication are already approved and complete.

For a future image version, dispatch the private build with a new unused version. Its workflow uses `GITHUB_TOKEN` with `packages: write`; confirm that the package remains private and record the resulting digest:

```sh
gh workflow run build-image.yml --repo sweetpea22/localpoast -f version=NEW_IMAGE_VERSION
gh run list --repo sweetpea22/localpoast --workflow build-image.yml
```

Update the measured config's exact digest when the image changes. Validate locally, then commit the same reviewed config changes to the separate public config repository:

```sh
python3 -m venv /tmp/localpoast-tinfoil-validation
/tmp/localpoast-tinfoil-validation/bin/python -m pip install -r deploy/tinfoil/public-config/requirements.txt
/tmp/localpoast-tinfoil-validation/bin/python deploy/tinfoil/public-config/validate-config.py deploy/tinfoil/public-config/tinfoil-config.yml
```

The dedicated GHCR pull token belongs in the organization's Registry Credentials, not the public config, application image, or runtime secret list. Runtime delivery is limited to project-scoped `TINFOIL_API_KEY` and `DARKBLOOM_API_KEY`. To update secrets, use the dashboard or `tinfoil repo secret set OWNER/CONFIG_REPO NAME --value-file /protected/file`; never literal secret arguments. Managed secret delivery is visible to Tinfoil infrastructure during deployment. `.dockerignore` excludes `.env` and `.env.*`. [Secrets documentation](https://docs.tinfoil.sh/containers/secrets-and-env-vars)

For a future config release, replace `NEW_CONFIG_VERSION` with a new unused version and wait for both release workflows and the actual GitHub release. **v0.0.4 is already running; do not republish it.**

```sh
LOCALPOAST_CONFIG_REPO='sweetpea22/localpoast-tinfoil-config'
tinfoil repo build run "$LOCALPOAST_CONFIG_REPO" --version NEW_CONFIG_VERSION
tinfoil repo build status "$LOCALPOAST_CONFIG_REPO" --version NEW_CONFIG_VERSION
tinfoil repo build info "$LOCALPOAST_CONFIG_REPO"
```

After reviewing and confirming the new GitHub release, update the existing running instance with debug mode off:

```sh
tinfoil container update localpoast --tag NEW_CONFIG_VERSION --debug=false --mark-latest=false
tinfoil container get localpoast
```

Copy the actual instance hostname from `container get`, verify `/health` against that exact released tag, then exercise the browser text-submission and story-packet flow. To recheck the current deployment, use `v0.0.4` in place of `NEW_CONFIG_VERSION`:

```sh
LOCALPOAST_ENCLAVE_HOST='ACTUAL_HOST_FROM_CONTAINER_GET'
tinfoil http get -e "$LOCALPOAST_ENCLAVE_HOST" -r "$LOCALPOAST_CONFIG_REPO@NEW_CONFIG_VERSION" "https://$LOCALPOAST_ENCLAVE_HOST/health"
```

Plain curl establishes reachability only. Stop the demo instance when finished; stopping loses its in-memory evidence. [Quickstart](https://docs.tinfoil.sh/containers/quickstart), [Image-build instructions](https://docs.tinfoil.sh/containers/building-images)

## Provenance and validation scope

The public release workflows were adapted from official template commit `bae2dd20dd17d5fd7708783ab84e5da296c061cf`, with CVM upgraded to `0.14.9` for the verified registry fix. Every referenced action SHA was resolved against its official GitHub repository: checkout `8e8c483…`, buildx `4d04d5d…`, registry login `4907a6d…`, build/push `bcafcac…`, and Tinfoil measurement `beba429…`. Full pins are in the workflows. [Official template](https://github.com/tinfoilsh/tinfoil-containers-template/tree/bae2dd20dd17d5fd7708783ab84e5da296c061cf)

Local guards check placeholders, digest syntax, separate config identity, runtime parameters, secret names, and port/network arrangement. Private registry pulls, read-only startup, enclave deployment, verified API requests, and the production browser text flow all passed. Reproduce the two live checks under Node 24.22.2:

```sh
node --import tsx scripts/verify-container.ts --enclave-url https://localpoast.janedoe.containers.tinfoil.dev --config-repo sweetpea22/localpoast-tinfoil-config
node --import tsx scripts/verify-container-browser.ts --enclave-url https://localpoast.janedoe.containers.tinfoil.dev --config-repo sweetpea22/localpoast-tinfoil-config
```
