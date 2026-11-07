# Tinfoil Container deployment

Updated 2026-11-07. The application source and AMD64 GHCR image are private. The user approved the separate [public configuration repository](https://github.com/sweetpea22/localpoast-tinfoil-config), which now contains only configuration, validation, release workflows, and documentation with independent Git history. This deployment supports a **text-only enclave demo**; the working phone photo demonstration continues on the laptop.

The successful [private image build](https://github.com/sweetpea22/localpoast/actions/runs/42407644582) used source commit `76c1df7ccce1eccfc15f7c69985c626a2e7c8bbe`. The image is `ghcr.io/sweetpea22/localpoast@sha256:a444a506749aac00571e0ab2f88c0f8d82f670ce3a54ebbf7f9791b6db19c4e5` with tag `v0.0.1`. GitHub's package API confirms visibility `private`. Both config copies pin that exact digest and identify the separate public repository `sweetpea22/localpoast-tinfoil-config`.

**Verified deployment: PASS, November 7 at 20:14 UTC.** [Config v0.0.3](https://github.com/sweetpea22/localpoast-tinfoil-config/releases/tag/v0.0.3) is running at [the hosted preview](https://localpoast.janedoe.containers.tinfoil.dev/preview). Debug mode is off and confidential computing is enabled. The CLI verified the exact release before receiving `{"ok":true}` from `/health`. The Node SDK then verified the app enclave and completed encrypted submission, sender-read rejection, cited amount comparison, verified Tinfoil inference, Darkbloom graph validation, and session reset. A separate production Chromium flow passed review/send, source inspectors, Maya's profile, case-brief download, and reset.

The app verification reports release digest `db08ed432a9ad74872c0f411f43dfb8dec63608709656c13c2239493094b72a5`, matching code/enclave fingerprints, and an attested HPKE key. Inference used `llama3-3-70b` in 2,982 ms. Sanitized reports and screenshots are retained locally under ignored `artifacts/container-verification/` and `artifacts/container-browser/`. This verifies a browser-based text flow; a physical phone on this hosted URL has not yet been checked.

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

Both config copies and the local validator require **CVM 0.14.9**. Config release `v0.0.2` fixed the private-image pull; the next startup check exposed a missing `DOMAIN` pass-through. Public config commit `00604cd` corrected it, and the [v0.0.3 measured-publication workflow](https://github.com/sweetpea22/localpoast-tinfoil-config/actions/runs/42409857727) succeeded. A local differential test confirmed that omitting the value caused exit code 1 and passing it produced a healthy app. The corrected enclave passed every boot stage and the live checks described above.

The CLI does not automatically read this project's `.env`. Session commands parse its current `TINFOIL_ADMIN_KEY` into a child environment, remove `TINFOIL_API_KEY` from that child, and set `TINFOIL_CONFIG=/tmp/localpoast-empty-tinfoil-context.json` to exclude an old saved login. Never print credentials or pass literal values in command-line arguments. The administration key is never injected into the runtime image. [CLI authentication](https://docs.tinfoil.sh/containers/cli#authenticating)

## Private-registry boot failure and correction

CVM `0.14.7` writes registry credentials to `/mnt/ramdisk/private/docker-config` in the boot process. Its separate container-manager process instead reads the default Docker config directory, because it does not inherit the boot process's `DOCKER_CONFIG` change. It consequently attempts an anonymous pull. A successful `registry-auth` boot stage does not establish credential use by that process or pull authorization. This matches the observed failure despite working GHCR credentials. [Official fix, PR #372](https://github.com/tinfoilsh/cvmimage/pull/372)

The correction is **CVM 0.14.9**, a new measured config release, and redeployment of the same private image digest with the existing credentials. GitHub ancestry checks confirmed `0.14.9` contains fix commit `5cbe07152949366bf103128b12a3aa0c44f92c3c`; `0.14.8` does not. The official template has a [matching version-bump PR](https://github.com/tinfoilsh/tinfoil-containers-template/pull/70). No image publication, credential rotation, or attestation bypass is needed. The [0.14.9 release manifest](https://github.com/tinfoilsh/cvmimage/releases/tag/v0.14.9) gives root measurement `a2a8956743ae4a9d56f6f4c0634685a74c54fb238c2bc674a30507b1b4c08827`.

## Runtime and limits

The application listens on **0.0.0.0:3001**, serves the built web app, and exposes `/health`. The config routes that port through the shim, requires a real AMD64 image digest, and requests the platform minimum **2 CPUs / 8192 MB**. There is no GPU, model download, or persistent disk. [Configuration reference](https://docs.tinfoil.sh/containers/configuration)

The root filesystem remains read-only. Bounded tmpfs mounts provide 128 MB at `/tmp` for runtime scratch and 1 MB at `/home/node/.tinfoil` for the SDK's ephemeral cache-scoping key. The image runs as UID/GID 1000. Recipient preparation still works in memory when its optional fixture-cache write is rejected. Sessions, submissions, photos, and runtime graph changes disappear on restart; this is not durable evidence storage. Readiness is checked with Node's existing `fetch`, so the image needs no curl package. [Runtime defaults](https://docs.tinfoil.sh/containers/config-runtime)

Tinfoil supplies its reserved `DOMAIN` value in external configuration. The container must explicitly request it with the bare string `- DOMAIN` in its `env` list; this passes through the platform value without defining a literal override. CVM 0.14.9 only copies requested names, as shown in its [environment-building implementation](https://github.com/tinfoilsh/cvmimage/blob/v0.14.9/tinfoil/internal/containers/containers.go#L714). The measured shell entrypoint derives `TINFOIL_CONTAINER_URL` and `PUBLIC_ORIGIN` from it before launching the unchanged application. It refuses an empty or malformed domain. The public config supplies the separate config-repository name. Never supply a custom literal value for `DOMAIN`. [Environment documentation](https://docs.tinfoil.sh/containers/secrets-and-env-vars)

`ANALYSIS_PROVIDER=tinfoil` sends submitted text through the app's existing Tinfoil SDK adapter. Darkbloom receives only the synthetic portfolio corpus. The config explicitly permits **outbound public-network access**: the installed SDK contacts `atc.tinfoil.sh` and discovers a verified router hostname, while Darkbloom uses `api.darkbloom.dev`. This is not a hostname-restricted network. A narrower policy requires capturing the complete verified SDK endpoint set, including redirects, and retesting; wildcard allowlist entries are unsupported. [Networking reference](https://docs.tinfoil.sh/containers/config-networking)

The browser's existing `SecureClient` uses the enclave URL and config repo before sending app requests. The initial web-page/bootstrap delivery is still ordinary HTTPS; this deployment does not claim independently verified browser code delivery. Confirm a real attested request before treating the Container mode badge as execution evidence. [Connecting documentation](https://docs.tinfoil.sh/containers/connecting)

## Photo limitation and bounded demo plan

The current photo adapter only calls Ollama on loopback. The Docker image includes neither Ollama nor `qwen2.5vl:3b`; loopback inside the enclave cannot reach the laptop. The photo action will therefore fail there. Changing `OLLAMA_URL` to a remote service is rejected by the current adapter and would not make that service local.

For this checkpoint, demonstrate the real photo → local vision → reviewed text flow on the laptop. Demonstrate the enclave separately using Cindy's supplied text record, Tinfoil text analysis, and the cached/live Darkbloom recipient graph. Do not present the enclave as a working hosted photo demo. Before offering the full hosted flow, implement and test a deliberate confidential vision adapter or a properly provisioned in-enclave model runtime, and make the UI describe its actual execution location. That application work is outside these deployment artifacts.

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

For a future config release, use a new unused version and wait for both release workflows and the actual GitHub release. `v0.0.3` is already dispatched; do not dispatch it again:

```sh
LOCALPOAST_CONFIG_REPO='sweetpea22/localpoast-tinfoil-config'
tinfoil repo build run "$LOCALPOAST_CONFIG_REPO" --version NEW_CONFIG_VERSION
tinfoil repo build status "$LOCALPOAST_CONFIG_REPO" --version NEW_CONFIG_VERSION
tinfoil repo build info "$LOCALPOAST_CONFIG_REPO"
```

After confirming the actual GitHub release for corrected config `v0.0.3`, deploy the existing failed instance with debug mode off. For later changes to a running instance, use `container update` instead of `container deploy`:

```sh
tinfoil container deploy localpoast --tag v0.0.3 --debug=false --mark-latest=false
tinfoil container get localpoast
```

Copy the actual instance hostname from `container get`, verify `/health` against the exact released tag, then exercise the browser text-submission flow and inspect its actual provider results:

```sh
LOCALPOAST_ENCLAVE_HOST='ACTUAL_HOST_FROM_CONTAINER_GET'
tinfoil http get -e "$LOCALPOAST_ENCLAVE_HOST" -r "$LOCALPOAST_CONFIG_REPO@v0.0.3" "https://$LOCALPOAST_ENCLAVE_HOST/health"
```

Plain curl establishes reachability only. Stop the demo instance when finished; stopping loses its in-memory evidence. [Quickstart](https://docs.tinfoil.sh/containers/quickstart), [Image-build instructions](https://docs.tinfoil.sh/containers/building-images)

## Provenance and validation scope

The public release workflows were adapted from official template commit `bae2dd20dd17d5fd7708783ab84e5da296c061cf`, with CVM upgraded to `0.14.9` for the verified registry fix. Every referenced action SHA was resolved against its official GitHub repository: checkout `8e8c483…`, buildx `4d04d5d…`, registry login `4907a6d…`, build/push `bcafcac…`, and Tinfoil measurement `beba429…`. Full pins are in the workflows. [Official template](https://github.com/tinfoilsh/tinfoil-containers-template/tree/bae2dd20dd17d5fd7708783ab84e5da296c061cf)

Local guards check placeholders, digest syntax, separate config identity, runtime parameters, secret names, and port/network arrangement. Private registry pulls, read-only startup, enclave deployment, verified API requests, and the production browser text flow all passed. Reproduce the two live checks under Node 24.22.2:

```sh
node --import tsx scripts/verify-container.ts --enclave-url https://localpoast.janedoe.containers.tinfoil.dev --config-repo sweetpea22/localpoast-tinfoil-config
node --import tsx scripts/verify-container-browser.ts --enclave-url https://localpoast.janedoe.containers.tinfoil.dev --config-repo sweetpea22/localpoast-tinfoil-config
```
