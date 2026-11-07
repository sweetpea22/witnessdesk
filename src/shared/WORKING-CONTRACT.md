# Shared implementation contract

Phone: Cindy submits payment PAY-882 showing USD 350,000 sent against Invoice INV204 for USD 120,000 of Greenpoint shoreline water-pollution response work. Difference USD 230,000. Canonical invoice/payment records live in fixtures/greenpoint-invoice.json and fixtures/greenpoint-payment.json; the PDF generators and desk use these same records. Legacy INV-204 is accepted for earlier demo photos. Invoice is stored desk context; there is no approved change-order fixture. The case and documents are fictional; the separately prepared public reporter profiles describe real professionals.

Root owns src/shared, src/server, package files, app scaffold and global styles. Agent A owns src/contributor. Agent B owns src/desk. Agent C owns src/recipients and fixtures. Never edit another lane or package.json without root coordination.

App components: ContributorApp default export from src/contributor/ContributorApp.tsx, DeskApp default export from src/desk/DeskApp.tsx. Each imports its own CSS. Shared api exports ensureDeskSession, readDesk, submitTip, retryAnalysis, resetDesk, prepareRecipients, getProviderStatus, contributorUrl. Types are contracts.ts. Status and sponsor claims must use actual backend fields.

Recipient server exports in src/recipients/index.ts: getRecipientProfiles(): RecipientProfile[], getRecipientGraph(): RecipientGraph, getPreparationReport(): PreparationReport, prepareRecipientProfiles(options?: {provider?: 'ollama'|'darkbloom'|'fixture'}): Promise<PreparationReport>. Local model ingestion and graph construction must retain real source IDs and exact quote provenance. Public fixture pipeline only. Root will call these from API. Use Ollama installed llama3:8b as initial local provider. Darkbloom adapter ready if credentials supplied; never label Ollama as Darkbloom. No confidential tips in preparation. Export matchRecipients(text:string,limit?:number): string[] with explicit local deterministic scoring until model enhancement.

Design: warm ivory #f8f6f1, dark ink #292820, rust accent #c45835, muted sage #71806a. Editorial serif headings (Georgia), clean system sans body. Functional, legible, calm investigative tool. No external font dependency. Lucide icons available. Use recipient provenance as major desk panel. Mobile has discreet workflow and clear disclosure.

All fixtures are clearly fictional, no fake live verification or security badges. Local-demo protects intake encryption where available but is not a deployed Tinfoil Container. Root handles transport and displays true state.
