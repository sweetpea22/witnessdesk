# Tinfoil Container deployment candidate

Prepared 2026-11-07. The private AMD64 image has been built and published to private GHCR. Nothing has been deployed to Tinfoil or copied into a public repository. These files are a reviewable candidate for a **text-only enclave demo**; the existing phone photo demonstration continues on the laptop.

The successful [private image build](https://github.com/sweetpea22/localpoast/actions/runs/42407644582) used source commit `76c1df7ccce1eccfc15f7c69985c626a2e7c8bbe`. The image is `ghcr.io/sweetpea22/localpoast@sha256:a444a506749aac00571e0ab2f88c0f8d82f670ce3a54ebbf7f9791b6db19c4e5` with tag `v0.0.1`. GitHub's package API confirms visibility `private`. The candidate config pins that exact digest and proposes the separate public repository `sweetpea22/localpoast-tinfoil-config`.

## Files and visibility

| Artifact | Intended destination |
| --- | --- |
| `deploy/tinfoil/private-source/build-image.yml` | Private localpoast repository, `.github/workflows/build-image.yml` |
| `deploy/tinfoil/public-config/tinfoil-config.yml` | Root of a separate, approved public config repository |
| Public-config `validate-config.py`, `requirements.txt` | Same public config repository |
| Public-config `.github/workflows/tinfoil-release*.yml` | Same public config repository; keep both phases |

The application source stays private, and its image stays private in GHCR. Only the config, image digest, validator, and release evidence become public. Public config is required for this documented workflow; it does not require publishing application source. [Private-image documentation](https://docs.tinfoil.sh/containers/private-images)

## Current access result

The official CLI **0.19.20** was downloaded to `/tmp/localpoast-tinfoil-cli-0.19.20/tinfoil` without administrator access. Its Darwin ARM64 archive SHA256 matched GitHub's release metadata:

`e4ba2274d5b37d22f0b12990361fc6d091a4d3ad0a118c09e801e146079385a0`

After the administration key was replaced, a fresh authenticated read-only check succeeded: `whoami` now reports **organization context**, and container listing returns zero instances. The check parsed the current `TINFOIL_ADMIN_KEY` directly from the project's `.env`, removed `TINFOIL_API_KEY` from the child environment, and used an empty alternate saved-login path. This excludes accidentally using the inference key or an old saved login. No key or account identifier was printed or passed as a command-line argument.

Organization authentication is confirmed. These responses did not report an explicit Containers subscription or deployment-capacity entitlement; successful listing alone does not establish either. The remaining gates are Containers entitlement/capacity, approval for the separate public config repository and publishing/deployment actions, a real private AMD64 image digest, registry pull credentials and runtime secrets, then the measured release and a verified request. No publication or deployment was attempted. [Admin-key instructions](https://docs.tinfoil.sh/admin/get-admin-key), [CLI authentication](https://docs.tinfoil.sh/containers/cli#authenticating)

A further read-only setup check reports **Tier 1**, with **0 of 5 containers** and **0 of 32 GB storage** in use. GHCR registry credentials are **not configured**; the registry-status query succeeds. There are no existing Tinfoil projects, and the available-host query returns an empty list. The current CLI has no repository-list command, so GitHub App authorization for the proposed public config repository is not established by these checks. Connect that repository after its creation. Quota headroom does not confirm an active Containers subscription or reserve a host for deployment. [Infrastructure-limit reference](https://docs.tinfoil.sh/admin/admin-api#infrastructure-limits)

The CLI does not automatically read this project's `.env`. It gives `TINFOIL_ADMIN_KEY` precedence over inference credentials and saved login. The session's check used an explicitly controlled child environment. For an interactive login, remove inherited credential overrides from that CLI invocation and use its prompt; do not paste credentials into shell arguments.

## What this candidate runs

The application listens on **0.0.0.0:3001**, serves the built web app, and exposes `/health`. The candidate routes that port through the shim, requires a real AMD64 image digest, and requests the platform minimum **2 CPUs / 8192 MB**. There is no GPU, model download, or persistent disk. [Configuration reference](https://docs.tinfoil.sh/containers/configuration)

The root filesystem remains read-only. Bounded tmpfs mounts provide 128 MB at `/tmp` for runtime scratch and 1 MB at `/home/node/.tinfoil` for the SDK's ephemeral cache-scoping key. The image runs as UID/GID 1000. Recipient preparation still works in memory when its optional fixture-cache write is rejected. Sessions, submissions, photos, and runtime graph changes disappear on restart; this is not durable evidence storage. Readiness is checked with Node's existing `fetch`, so the image needs no curl package. [Runtime defaults](https://docs.tinfoil.sh/containers/config-runtime)

Tinfoil injects its reserved `DOMAIN` variable. The measured shell entrypoint derives `TINFOIL_CONTAINER_URL` and `PUBLIC_ORIGIN` from it before launching the unchanged application. It refuses an empty or malformed domain. The public config supplies the separate config-repository name. Never define your own `DOMAIN`. [Environment documentation](https://docs.tinfoil.sh/containers/secrets-and-env-vars)

`ANALYSIS_PROVIDER=tinfoil` sends submitted text through the app's existing Tinfoil SDK adapter. Darkbloom receives only the synthetic portfolio corpus. This candidate explicitly permits **outbound public-network access**: the installed SDK contacts `atc.tinfoil.sh` and discovers a verified router hostname, while Darkbloom uses `api.darkbloom.dev`. This is not a hostname-restricted network. A narrower policy requires capturing the complete verified SDK endpoint set, including redirects, and retesting; wildcard allowlist entries are unsupported. [Networking reference](https://docs.tinfoil.sh/containers/config-networking)

The browser's existing `SecureClient` uses the enclave URL and config repo before sending app requests. The initial web-page/bootstrap delivery is still ordinary HTTPS; this candidate does not claim independently verified browser code delivery. Confirm a real attested request before treating the Container mode badge as execution evidence. [Connecting documentation](https://docs.tinfoil.sh/containers/connecting)

## Photo limitation and bounded demo plan

The current photo adapter only calls Ollama on loopback. The Docker image includes neither Ollama nor `qwen2.5vl:3b`; loopback inside the enclave cannot reach the laptop. The photo action will therefore fail there. Changing `OLLAMA_URL` to a remote service is rejected by the current adapter and would not make that service local.

For this checkpoint, demonstrate the real photo → local vision → reviewed text flow on the laptop. Demonstrate the enclave separately using Cindy's supplied text record, Tinfoil text analysis, and the cached/live Darkbloom recipient graph. Do not present the enclave candidate as a working hosted photo demo. Before offering the full hosted flow, implement and test a deliberate confidential vision adapter or a properly provisioned in-enclave model runtime, and make the UI describe its actual execution location. That application work is outside these deployment artifacts.

## Build and release after account setup and public-config approval

1. Confirm organization context, Containers entitlement, and capacity. The user's private-repository instruction means the **separate public config repository** needs explicit approval before publication. Private build preparation can continue within the authorized implementation work.
2. Copy the candidate image workflow into the private source repository and review/commit it. Its manual job uses `GITHUB_TOKEN` with `packages: write`; the local OAuth token's missing `write:packages` scope does not require putting a broad token in the image. It refuses a public source repository or an existing non-private package, builds `linux/amd64`, and reports the digest. GHCR defaults new packages to private; verify the package's actual visibility before proceeding. [GitHub registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)
3. Run the reviewed private image workflow:

   ```sh
   gh workflow run build-image.yml --repo APPROVED_OWNER/localpoast -f version=v0.0.1
   gh run list --repo APPROVED_OWNER/localpoast --workflow build-image.yml
   ```

4. The candidate now contains the actual image owner/digest and proposed public config `owner/repo`. For subsequent builds, update those values explicitly. Install its pinned validation dependency in an isolated environment and run its guards; unresolved placeholders are rejected:

   ```sh
   python3 -m venv /tmp/localpoast-tinfoil-validation
   /tmp/localpoast-tinfoil-validation/bin/python -m pip install -r deploy/tinfoil/public-config/requirements.txt
   /tmp/localpoast-tinfoil-validation/bin/python deploy/tinfoil/public-config/validate-config.py deploy/tinfoil/public-config/tinfoil-config.yml
   ```

5. After public-repository approval, copy **only** the public-config files into a fresh directory and initialize an independent Git repository there. Never run a public-repository creation command using the private source checkout or a nested directory that still belongs to its Git history:

   ```sh
   LOCALPOAST_CONFIG_REPO='APPROVED_OWNER/localpoast-tinfoil-config'
   LOCALPOAST_CONFIG_DIR="$(mktemp -d)"
   cp deploy/tinfoil/public-config/tinfoil-config.yml deploy/tinfoil/public-config/validate-config.py deploy/tinfoil/public-config/requirements.txt "$LOCALPOAST_CONFIG_DIR/"
   mkdir -p "$LOCALPOAST_CONFIG_DIR/.github/workflows"
   cp deploy/tinfoil/public-config/.github/workflows/tinfoil-release.yml deploy/tinfoil/public-config/.github/workflows/tinfoil-release-publish.yml "$LOCALPOAST_CONFIG_DIR/.github/workflows/"
   git -C "$LOCALPOAST_CONFIG_DIR" init --initial-branch=main
   git -C "$LOCALPOAST_CONFIG_DIR" add .
   git -C "$LOCALPOAST_CONFIG_DIR" commit -m "Configure private localpoast image for Tinfoil"
   gh repo create "$LOCALPOAST_CONFIG_REPO" --public --source "$LOCALPOAST_CONFIG_DIR" --remote origin --push
   ```

6. Connect the Tinfoil GitHub App to that public config repository. In the intended organization's **Registry Credentials**, configure GHCR with a dedicated classic PAT having `read:packages` and access to this private package; authorize organization SSO if required. This pull token belongs in the registry-credentials screen, not the public config, application image, or runtime secret list.
7. Create project-scoped `TINFOIL_API_KEY` and `DARKBLOOM_API_KEY` through the dashboard or `tinfoil repo secret create OWNER/CONFIG_REPO NAME --value-file /protected/file`. Use protected files or secret-manager stdin; never literal values in command history. Managed secret delivery is visible to Tinfoil infrastructure during deployment. Do not inject the administration key into the runtime container. The existing `.dockerignore` excludes `.env` and `.env.*`.
8. Publish the reviewed config release, wait for **both** release workflows and the actual GitHub release, then create the instance with debug mode off:

   ```sh
   tinfoil repo build run "$LOCALPOAST_CONFIG_REPO" --version v0.0.1
   tinfoil repo build status "$LOCALPOAST_CONFIG_REPO" --version v0.0.1
   tinfoil repo build info "$LOCALPOAST_CONFIG_REPO"
   tinfoil container create localpoast --repo "$LOCALPOAST_CONFIG_REPO" --tag v0.0.1 --mark-latest=false
   tinfoil container get localpoast
   ```

9. Copy the actual instance hostname and verify `/health` against the exact released tag. Then run the browser text-submission flow and inspect actual Tinfoil/Darkbloom provider results:

   ```sh
   LOCALPOAST_ENCLAVE_HOST='ACTUAL_HOST_FROM_CONTAINER_GET'
   tinfoil http get -e "$LOCALPOAST_ENCLAVE_HOST" -r "$LOCALPOAST_CONFIG_REPO@v0.0.1" "https://$LOCALPOAST_ENCLAVE_HOST/health"
   ```

Building an image, creating a tag, and deploying an instance are distinct operations. A queued workflow is not a measured release. Plain curl establishes reachability only. Stop the demo instance when finished; stopping loses its in-memory evidence. [Quickstart](https://docs.tinfoil.sh/containers/quickstart), [Image-build instructions](https://docs.tinfoil.sh/containers/building-images)

## Provenance and validation scope

The public release workflows were adapted from official template commit `bae2dd20dd17d5fd7708783ab84e5da296c061cf`. The CVM version is the template's `0.14.7`. Every referenced action SHA was resolved against its official GitHub repository: checkout `8e8c483…`, buildx `4d04d5d…`, registry login `4907a6d…`, build/push `bcafcac…`, and Tinfoil measurement `beba429…`. Full pins are in the workflows. [Official template](https://github.com/tinfoilsh/tinfoil-containers-template/tree/bae2dd20dd17d5fd7708783ab84e5da296c061cf)

Local guards check placeholder resolution, image-digest syntax, separate config identity, runtime parameters, secret names, and the port/network arrangement. They do not prove registry pull authorization, org quota, real digest existence, enclave launch, or attestation. The official measured-release/deployment checks and a real verified request remain required.
