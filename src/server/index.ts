import 'dotenv/config';
import express from 'express';
import {existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {generateKey,readPrivateKey,readKey,readMessage,decrypt,createMessage,encrypt} from 'openpgp';
import {z} from 'zod';
import {DeskStore,ApiError} from './store';
import {analyzeTip,analysisProvider} from './analysis';
import {getRecipientProfiles,getRecipientGraph,getPreparationReport,prepareRecipientProfiles} from '../recipients/index';
import type {Submission,ProviderStatus} from '../shared/contracts';
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'300kb'}));
app.use((_req,res,next)=>{res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');next();});
const store=new DeskStore();
const mode=process.env.TINFOIL_CONTAINER_URL&&process.env.TINFOIL_CONFIG_REPO?'tinfoil-container':'local-demo';
const keys=await generateKey({type:'curve25519',userIDs:[{name:'Witness Desk ephemeral intake'}],format:'armored'});
const privateKey=await readPrivateKey({armoredKey:keys.privateKey});
const tipSchema=z.object({contributorAlias:z.string().max(80).default('Cindy'),evidenceText:z.string().min(1).max(8000),contextNote:z.string().max(2000).optional()});
const auth=z.object({sessionId:z.string().min(1),readerSecret:z.string().min(1)});
let ollamaAvailable=false;
async function status():Promise<ProviderStatus>{return {mode,analysisProvider:analysisProvider(),analysisModel:analysisProvider()==='tinfoil'?(process.env.TINFOIL_MODEL||'llama3-3-70b'):(process.env.OLLAMA_MODEL||'llama3:8b'),tinfoilConfigured:!!process.env.TINFOIL_API_KEY,darkbloomConfigured:!!process.env.DARKBLOOM_API_KEY,ollamaAvailable,publicOrigin:process.env.PUBLIC_ORIGIN||'',preparation:getPreparationReport()};}
async function runAnalysis(submission:Submission){if(submission.state==='analyzing')return;submission.state='analyzing';delete submission.error;try{submission.analysis=await analyzeTip(submission.tip,getRecipientProfiles());submission.state='ready';}catch(e){submission.state='failed';submission.error=e instanceof z.ZodError?'Model output could not be validated. Please retry.':e instanceof Error&&e.name==='TimeoutError'?'The local model timed out. Please retry.':e instanceof Error?e.message.slice(0,200):'Analysis failed.';}}
async function handle(route:string,raw:unknown){
 if(route==='/api/sessions'){const p=z.object({readerSecret:z.string().min(40)}).parse(raw);return store.create(p.readerSecret);}
 if(route==='/api/submit'){const p=z.object({sessionId:z.string(),senderCapability:z.string(),submissionId:z.string().uuid(),tip:tipSchema}).parse(raw);const result=store.submit(p.sessionId,p.senderCapability,p.submissionId,p.tip);if(result.isNew)void runAnalysis(result.submission);return result.receipt;}
 const p=auth.passthrough().parse(raw);const session=store.authorize(p.sessionId,p.readerSecret,'reader');
 if(route==='/api/desk/read')return {submissions:[...session.submissions.values()].reverse(),recipients:getRecipientProfiles(),graph:getRecipientGraph(),status:await status()};
 if(route==='/api/desk/reset'){const next=z.object({newReaderSecret:z.string().min(40)}).parse(raw);return store.reset(p.sessionId,p.readerSecret,next.newReaderSecret);}
 if(route==='/api/desk/retry'){const request=z.object({submissionId:z.string()}).parse(raw);const row=session.submissions.get(request.submissionId);if(!row)throw new ApiError(404,'Submission not found.');if(row.state==='failed')void runAnalysis(row);return {ok:true};}
 if(route==='/api/desk/prepare'){const request=z.object({provider:z.enum(['ollama','darkbloom','fixture']).default('ollama')}).parse(raw);if(getPreparationReport().state!=='working')void prepareRecipientProfiles({provider:request.provider}).catch(()=>{});return getPreparationReport();}
 throw new ApiError(404,'Unknown operation.');
}
app.get('/api/bootstrap',(_req,res)=>res.json(mode==='tinfoil-container'?{mode,enclaveURL:process.env.TINFOIL_CONTAINER_URL,configRepo:process.env.TINFOIL_CONFIG_REPO}:{mode,publicKey:keys.publicKey}));
app.get('/api/status',async(_req,res)=>res.json(await status()));
app.get('/health',(_req,res)=>res.json({ok:true}));
app.post('/api/secure',async(req,res)=>{let replyPublicKey:string|undefined;try{if(mode!=='local-demo')throw new ApiError(404,'Use the attested Container transport.');const envelope=z.object({ciphertext:z.string().max(250000)}).parse(req.body);const decoded=await decrypt({message:await readMessage({armoredMessage:envelope.ciphertext}),decryptionKeys:privateKey,format:'utf8'});const payload=z.object({path:z.string(),body:z.unknown(),replyPublicKey:z.string()}).parse(JSON.parse(decoded.data as string));replyPublicKey=payload.replyPublicKey;let result:unknown;try{result={ok:true,data:await handle(payload.path,payload.body)};}catch(e){result={ok:false,error:e instanceof z.ZodError?'Invalid request.':e instanceof ApiError?e.message:'The request could not be completed.',code:e instanceof ApiError?e.status:400};}const ciphertext=await encrypt({message:await createMessage({text:JSON.stringify(result)}),encryptionKeys:await readKey({armoredKey:replyPublicKey}),format:'armored'});res.json({ciphertext});}catch{res.status(400).json({error:'Encrypted request could not be opened. Refresh the page and try again.'});}});
app.post(['/api/sessions','/api/submit','/api/desk/read','/api/desk/retry','/api/desk/reset','/api/desk/prepare'],async(req,res)=>{if(mode!=='tinfoil-container'){res.status(403).json({error:'Encrypted transport required.'});return;}try{res.json(await handle(req.path,req.body));}catch(e){res.status(e instanceof ApiError?e.status:400).json({error:e instanceof ApiError?e.message:'Invalid request.'});}});
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../dist');
if(existsSync(dist)){app.use(express.static(dist));app.get('/{*path}',(_req,res)=>res.sendFile(path.join(dist,'index.html')));}
const port=Number(process.env.PORT||3001);app.listen(port,'0.0.0.0',()=>{console.log(`Witness Desk backend ready on port ${port} (${mode})`);});
fetch(`${process.env.OLLAMA_URL||'http://127.0.0.1:11434'}/api/tags`,{signal:AbortSignal.timeout(2000)}).then(r=>{ollamaAvailable=r.ok;}).catch(()=>{});
