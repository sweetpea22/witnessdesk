# Localpoast — Witness Desk

Phone-to-laptop whistleblowing demo. Cindy's organization received an invoice for **$120,000** but sent **$350,000**. The desk surfaces the **$230,000** difference with source passages and recommends a reporter from a private, source-backed recipient graph.

All initial people, publications, and documents are fictional. This prototype does not establish source anonymity or geographic presence.

## Development

```sh
npm install
cp .env.example .env
npm run dev
```

Open http://localhost:5173/preview for phone and desk together, /desk for the laptop, and pair a real phone using the desk QR and an HTTPS origin.

The local recipient pipeline reads articles in fixtures, asks a local Ollama model to extract expertise with exact supporting quotes, validates the quotations, then constructs recipient/article/topic/region relationships. Open the recipient graph to inspect its sources. Darkbloom is a separate adapter; Ollama execution is never labeled as Darkbloom use.

## Sponsor readiness

Tinfoil Container deployment and live sponsor API connections require user credentials. Local development is explicitly labeled. The Tinfoil bounty requires actual Container deployment; a local demo alone does not meet that criterion.

Never commit .env, API keys, private tip logs, or runtime data. The repository stays private until the user authorizes a visibility change.
