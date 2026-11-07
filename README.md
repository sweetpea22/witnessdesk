# Witness Desk

A private evidence desk for whistleblowers and journalists. A contributor photographs a document on their phone; the desk helps a journalist check the evidence, find relevant reporters, and prepare a story packet.

## The scenario

Cindy reviews a fictional water-pollution cleanup on Greenpoint's Newtown Creek waterfront. Harbor Works invoices **$120,000**, but the payment record shows **$350,000 sent**. The desk identifies the **$230,000 difference** and asks whether an approved change order explains it. A discrepancy is a lead, not proof of corruption.

[Invoice INV204](public/demo-invoice.pdf) · [Payment PAY-882](public/demo-payment.pdf)

## How it works

1. Photograph the payment slip, review the extracted text, and submit it through encrypted intake.
2. Compare it with the invoice. Code calculates the difference; the model proposes reporting questions.
3. Match the evidence privately against reporter profiles built from public sources.
4. Select a reporter and download a reviewed Markdown story packet plus a JSON evidence manifest with citations and processing provenance.

## Providers and models

| Provider | Model | Role |
| --- | --- | --- |
| Ollama, on the laptop | `qwen2.5vl:3b` | Photo description and OCR |
| Ollama, on the laptop | `llama3:8b` | Reporting questions and private reporter matching |
| Darkbloom | `gemma-4-26b` | Extract coverage and exact supporting quotes from public reporter bios and articles |
| Tinfoil | `llama3-3-70b` | Verified confidential inference for evidence review and hosted reporter matching |

Darkbloom receives only public material, never the tip. The initial network contains six ProPublica journalism professionals and twelve sources. Tinfoil's SDK verifies the inference enclave before sending prompts; the hosted app also runs in a verified Tinfoil Container.

## Technical tradeoffs

- Local models keep photos on the laptop but depend on its hardware. Hosted Tinfoil inference needs a network connection; photo processing currently remains local.
- Exact source quotes make recommendations inspectable. This small curated graph establishes relevance, not recipient identity or willingness to accept a tip.
- Encryption and attestation do not guarantee source anonymity or evidence truth. Sessions live in memory; the exported manifest preserves original evidence even after the Markdown is edited.

The Greenpoint PDFs and scenario are available in the local build. The [hosted text demo](https://localpoast.janedoe.containers.tinfoil.dev/desk) predates that scenario update. All case documents are fictional; no reporter is contacted automatically.

## Run locally

Use Node 24, Ollama with the two local models above, and credentials in [`.env`](.env.example):

```sh
npm install
cp .env.example .env
npm run dev
```

Open [the desk](http://localhost:5173/desk). Pair a phone through **Connect a phone** using an HTTPS origin configured in `PUBLIC_ORIGIN`.
