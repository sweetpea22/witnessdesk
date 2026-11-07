# Witness Desk

A private evidence desk for whistleblowers and journalists. Contributors photograph records on their phones; journalists review the evidence, find relevant reporters, and prepare a story packet.

## The demo

Cindy finds a **$120,000 invoice** for a fictional Greenpoint water-pollution cleanup, but the payment record shows **$350,000 sent**. The desk identifies the **$230,000 difference** and asks whether an approved change order explains it.

Photo → reviewed OCR → encrypted submission → cited comparison → reporter match → downloadable story packet.

The packet contains the records, reporting questions, recipient fit, citations, and processing provenance. Code calculates the amounts; models suggest questions and matches. Nothing is sent automatically.

[Invoice INV204](public/demo-invoice.pdf) · [Payment PAY-882](public/demo-payment.pdf)

## How we use the models

| Provider | Model | Purpose |
| --- | --- | --- |
| Local Ollama | `qwen2.5vl:3b` | Photo description and OCR |
| Local Ollama | `llama3:8b` | Reporting questions and private reporter matching |
| Darkbloom | `gemma-4-26b` | Public reporter profiles with exact source quotes |
| Tinfoil | `llama3-3-70b` | Confidential evidence review and hosted matching |

Darkbloom receives public bios and articles, never private tips. The first network has six ProPublica journalism professionals and twelve sources. Private matching runs locally or through Tinfoil. Tinfoil's SDK verifies the inference enclave before sending prompts; the hosted app also runs in a verified Tinfoil Container.

## Technical tradeoffs

- Local inference keeps photos on the laptop but depends on its hardware. Tinfoil adds verified remote compute and a network dependency; photos currently remain local.
- A small, curated graph makes source checking practical. It shows reporting relevance, not verified identity or willingness to receive a tip.
- Encryption does not guarantee anonymity, and a payment discrepancy does not prove corruption. Sessions are temporary. The JSON manifest retains original evidence even after the Markdown is edited.

Use the [local desk](http://localhost:5173/desk) for the Greenpoint photo demo. The [hosted text demo](https://localpoast.janedoe.containers.tinfoil.dev/desk) predates these new PDF fixtures. All case records are fictional.
