"""Local release guards, not a replacement for Tinfoil's canonical validation."""
import pathlib
import re
import sys
import yaml

def require(condition, message):
    if not condition:
        raise ValueError(message)

def validate(path):
    raw = pathlib.Path(path).read_text()
    # Comments may describe replacement markers; values may not retain them.
    data = yaml.safe_load(raw)
    require("REPLACE_" not in str(data), "Resolve every REPLACE_ value before release.")
    # 0.14.9 includes private-registry auth fix tinfoilsh/cvmimage#372.
    require(data["cvm-version"] == "0.14.9", "Review a CVM version change against current official docs.")
    require(data["cpus"] == 2 and data["memory"] == 8192, "Candidate expects 2 CPUs and 8192 MB.")
    require(not data.get("gpus") and not data.get("volumes"), "This candidate has no GPU or persistent disk.")
    require(len(data["containers"]) == 1, "Review additional workloads separately.")
    app = data["containers"][0]
    image = re.fullmatch(r"ghcr\.io/([a-z0-9][a-z0-9-]*)/localpoast@sha256:([0-9a-f]{64})", app["image"])
    require(image is not None, "Image must be a GHCR localpoast image pinned to a real SHA256 digest.")
    require(image.group(2) != "0" * 64, "An all-zero image digest is not a build result.")
    env = {}
    require(app["env"].count("DOMAIN") == 1, "Pass Tinfoil's injected DOMAIN through by name.")
    for entry in app["env"]:
        if entry == "DOMAIN":
            continue
        require(isinstance(entry, dict) and len(entry) == 1, "Use explicit measured environment settings.")
        env.update(entry)
    repo = env.get("TINFOIL_CONFIG_REPO", "")
    require(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*/[A-Za-z0-9_.-]+", repo) is not None, "Use a resolved owner/repo for the public config.")
    require(repo.lower() != image.group(1) + "/localpoast", "The private source repo must not become the config repo.")
    require(env.get("PORT") == "3001" and env.get("ANALYSIS_PROVIDER") == "tinfoil", "Use port 3001 and Tinfoil analysis.")
    require(not any("KEY" in name or name == "DOMAIN" or name.startswith("OLLAMA_") for name in env), "Keys, reserved DOMAIN, and remote Ollama overrides do not belong in measured env.")
    require(set(app["secrets"]) == {"TINFOIL_API_KEY", "DARKBLOOM_API_KEY"}, "Only the two runtime inference keys are declared.")
    require(app.get("read_only") is True and app.get("user") == "1000:1000", "Keep a read-only, non-root runtime.")
    require(set(app["tmpfs"]) == {"/tmp", "/home/node/.tinfoil"}, "Keep scratch mounts bounded and in memory.")
    require(app.get("entrypoint") == ["/bin/sh", "-ec"], "Preserve the DOMAIN-derived launch wrapper.")
    require('TINFOIL_CONTAINER_URL="https://$DOMAIN"' in app["command"][0], "Derive the self URL from Tinfoil DOMAIN.")
    require(data["networks"] == {"outbound": {"egress": "open"}} and app["networks"] == ["outbound"], "Review outbound policy changes explicitly.")
    require(data["shim"] == {"upstream-container": "localpoast", "upstream-port": 3001, "paths": ["/*"]}, "Shim must route the web app to port 3001.")
    require("healthcheck" in app, "A process start alone does not prove application readiness.")
    return data

if __name__ == "__main__":
    try:
        validate(sys.argv[1] if len(sys.argv) > 1 else "tinfoil-config.yml")
    except (ValueError, KeyError, TypeError, yaml.YAMLError) as error:
        print("Config validation failed: " + str(error), file=sys.stderr)
        sys.exit(1)
    print("Local configuration guards passed. Registry access and Tinfoil deployment validation remain required.")
