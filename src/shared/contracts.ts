import invoiceFixture from '../../fixtures/greenpoint-invoice.json';
import paymentFixture from '../../fixtures/greenpoint-payment.json';

export type SubmissionState='received'|'analyzing'|'ready'|'failed';
export type Tip={contributorAlias:string;evidenceText:string;contextNote?:string;photoId?:string};
export type PhotoDescription={id:string;description:string;extractedText:string;uncertainties:string[];provider:'ollama';model:string;durationMs:number};
export type DeskSession={sessionId:string;readerSecret:string;senderCapability:string};
export type Receipt={submissionId:string;receivedAt:string;state:'received'};
export type Citation={documentId:string;title:string;quote:string};
export type InferenceVerification={securityVerified:true;verifiedAt:string;configRepo:string;enclaveHost:string;releaseDigest:string;codeFingerprint:string;enclaveFingerprint:string};
export type Analysis={kind:'possible_overpayment'|'no_supported_discrepancy'|'insufficient_evidence';summary:string;invoiceAmount:number|null;paymentAmount:number|null;difference:number|null;citations:Citation[];openQuestions:string[];recipientIds:string[];provider:'tinfoil'|'ollama'|'deterministic-demo';model:string;durationMs:number;verification?:InferenceVerification};
export type TinfoilReview={state:'analyzing'|'ready'|'failed';analysis?:Analysis;error?:string};
export type Submission={id:string;tip:Tip;receivedAt:string;state:SubmissionState;analysis?:Analysis;error?:string;photo?:PhotoDescription;tinfoilReview?:TinfoilReview;reporterMatch?:ReporterMatchRun};
export type RecipientSource={id:string;title:string;text:string;url?:string;kind:'fictional-demo'|'public-web';retrievedAt?:string;contentHash?:string;sourceType?:'bio'|'article'|'contact';relation?:'about-reporter'|'by-reporter'|'newsroom-channel'};
export type RecipientProfile={id:string;name:string;publication:string;role:string;region:string;specialties:string[];bio:string;sources:RecipientSource[];supportingCitations:Citation[];preparationProvider:string;preparationRunId:string;cohortIds?:string[];publicContact?:{url:string;scope:'individual'|'newsroom';sourceId:string}|null};
export type GraphNode={id:string;label:string;type:'recipient'|'article'|'topic'|'region'};
export type GraphEdge={source:string;target:string;label:string;sourceDocumentId?:string};
export type RecipientGraph={nodes:GraphNode[];edges:GraphEdge[]};
export type PreparationReport={state:'not_started'|'working'|'ready'|'failed';provider:string;model:string;startedAt?:string;completedAt?:string;error?:string;runId?:string;sourceCount:number;profileCount:number;sourceMode?:'curated-snapshot'|'refreshed';corpusHash?:string;sourceChecks?:Array<{sourceId:string;url:string;status:'snapshot'|'validated'|'failed';retrievedAt:string;contentHash:string;error?:string}>};
export type ProviderStatus={mode:'local-demo'|'tinfoil-container';analysisProvider:string;analysisModel:string;tinfoilConfigured:boolean;darkbloomConfigured:boolean;ollamaAvailable:boolean;publicOrigin:string;preparation:PreparationReport};
export type ReporterCohort={id:string;label:string;description:string};
export type ReporterMatch={recipientId:string;reason:string;sourceIds:string[]};
export type ReporterMatchRun={state:'matching'|'ready'|'failed';cohortIds:string[];provider:'ollama'|'tinfoil';model?:string;durationMs?:number;matches?:ReporterMatch[];profiles?:RecipientProfile[];preparationRunId?:string;verification?:InferenceVerification;error?:string};
export type ReporterNetwork={cohorts:ReporterCohort[];profiles:RecipientProfile[];graph:RecipientGraph;preparation:PreparationReport};
export type DeskSnapshot={submissions:Submission[];recipients:RecipientProfile[];graph:RecipientGraph;status:ProviderStatus;reporterNetwork?:ReporterNetwork};
export const DEMO_ALIAS='Cindy';
export const DEMO_INVOICE=invoiceFixture;
export const DEMO_PAYMENT=paymentFixture;
const invoiceNumber=(amount:number)=>amount.toLocaleString('en-US',{maximumFractionDigits:2});
export const INVOICE_TEXT=[
 `INVOICE ${DEMO_INVOICE.invoiceId}`,
 `Supplier: ${DEMO_INVOICE.supplier}`,
 `Supplier service: ${DEMO_INVOICE.supplierService}`,
 `Client: ${DEMO_INVOICE.client}`,
 `Project: ${DEMO_INVOICE.project}`,
 `Location: ${DEMO_INVOICE.location}`,
 `Work area: ${DEMO_INVOICE.workArea}`,
 `Contract: ${DEMO_INVOICE.contract}`,
 `Date: ${DEMO_INVOICE.date}`,
 `Due date: ${DEMO_INVOICE.dueDate}`,
 `Service period: ${DEMO_INVOICE.servicePeriod}`,
 'Itemized charges:',
 ...DEMO_INVOICE.items.map((item,index)=>`${index+1}. ${item.description}: ${item.quantity} ${item.unit} at ${DEMO_INVOICE.currency} ${invoiceNumber(item.rate)} = ${DEMO_INVOICE.currency} ${invoiceNumber(item.quantity*item.rate)}\n   ${item.detail}`),
 `Amount due: ${DEMO_INVOICE.currency} ${invoiceNumber(DEMO_INVOICE.amountDue)}`,
 `Scope: ${DEMO_INVOICE.scope}`,
 `Terms: ${DEMO_INVOICE.terms}`,
 `Closeout: ${DEMO_INVOICE.closeout}`,
 DEMO_INVOICE.disclaimer,
].join('\n');
export const DEMO_EVIDENCE=[
 `PAYMENT CONFIRMATION ${DEMO_PAYMENT.paymentId}`,
 `Record type: ${DEMO_PAYMENT.recordType}`,
 `Beneficiary: ${DEMO_INVOICE.supplier}`,
 `Payer: ${DEMO_INVOICE.client}`,
 `Project: ${DEMO_INVOICE.project}`,
 `Location: ${DEMO_INVOICE.location}`,
 `Work area: ${DEMO_INVOICE.workArea}`,
 `Invoice reference: ${DEMO_PAYMENT.invoiceReference}`,
 `Contract: ${DEMO_PAYMENT.contract}`,
 `Date sent: ${DEMO_PAYMENT.dateSent}`,
 `Amount sent: ${DEMO_PAYMENT.currency} ${invoiceNumber(DEMO_PAYMENT.amountSent)}`,
 `Status: ${DEMO_PAYMENT.status}`,
 DEMO_PAYMENT.disclaimer,
].join('\n');
export const DEMO_CONTEXT=`I am Cindy, reviewing the Greenpoint water-pollution cleanup records for ${DEMO_INVOICE.project}. ${DEMO_INVOICE.supplier} invoiced $${invoiceNumber(DEMO_INVOICE.amountDue)}, but the payment record shows $${invoiceNumber(DEMO_PAYMENT.amountSent)} sent. I could not find an approved written change order in the records available to me. This is my unverified context, not proof that no change order exists.`;
