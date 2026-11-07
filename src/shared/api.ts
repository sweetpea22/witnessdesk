import type {DeskSession,DeskSnapshot,Tip,Receipt,PreparationReport,ProviderStatus,PhotoDescription} from './contracts';
type Bootstrap={mode:'local-demo'|'tinfoil-container';publicKey?:string;enclaveURL?:string;configRepo?:string};
let bootstrap:Promise<Bootstrap>|undefined;
let replyKeys:Promise<{privateKey:string;publicKey:string}>|undefined;
let secureClient:Promise<any>|undefined;
const storageKey='witness-desk.session.v1';
async function getBootstrap(){return bootstrap??=fetch('/api/bootstrap').then(async r=>{if(!r.ok)throw new Error('Desk is unavailable. Try again.');return r.json();});}
export async function secureJson<T>(path:string,body:unknown,retried=false):Promise<T>{
  const config=await getBootstrap();
  if(config.mode==='tinfoil-container'){
    secureClient??=(async()=>{const {SecureClient}=await import('tinfoil');const client=new SecureClient({enclaveURL:config.enclaveURL!,configRepo:config.configRepo!});await client.ready();return client;})();
    const client=await secureClient;
    const r=await client.fetch(new URL(path,config.enclaveURL!).href,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json();if(!r.ok)throw new Error(data.error??'Request failed');return data as T;
  }
  if(!window.isSecureContext)throw new Error('Open the HTTPS phone link to use encrypted intake.');
  const pgp=await import('openpgp');
  replyKeys??=pgp.generateKey({type:'curve25519',userIDs:[{name:'Ephemeral browser reply key'}],format:'armored'});
  const keys=await replyKeys;
  const key=await pgp.readKey({armoredKey:config.publicKey!});
  const ciphertext=await pgp.encrypt({message:await pgp.createMessage({text:JSON.stringify({path,body,replyPublicKey:keys.publicKey})}),encryptionKeys:key,format:'armored'});
  const response=await fetch('/api/secure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ciphertext})});
  const envelope=await response.json();
  if(response.status===400&&!retried){bootstrap=undefined;return secureJson<T>(path,body,true);}
  if(!response.ok||!envelope.ciphertext)throw new Error(envelope.error??'Encrypted request failed.');
  const decoded=await pgp.decrypt({message:await pgp.readMessage({armoredMessage:envelope.ciphertext}),decryptionKeys:await pgp.readPrivateKey({armoredKey:keys.privateKey}),format:'utf8'});
  const result=JSON.parse(decoded.data as string);
  if(!result.ok)throw Object.assign(new Error(result.error??'Request failed.'),{code:result.code});
  return result.data as T;
}
let sessionPromise:Promise<DeskSession>|undefined;
export function ensureDeskSession():Promise<DeskSession>{
 return sessionPromise??=(async()=>{const cached=localStorage.getItem(storageKey);if(cached){let parsed:DeskSession|undefined;try{parsed=JSON.parse(cached);}catch{localStorage.removeItem(storageKey);}if(parsed){try{await readDesk(parsed);return parsed;}catch(e){if((e as {code?:number}).code!==410&&(e as {code?:number}).code!==403)throw e;localStorage.removeItem(storageKey);}}}
 const readerSecret=crypto.randomUUID()+crypto.randomUUID();
 const created=await secureJson<Omit<DeskSession,'readerSecret'>>('/api/sessions',{readerSecret});
 const session={...created,readerSecret};localStorage.setItem(storageKey,JSON.stringify(session));return session;
 })().catch(e=>{sessionPromise=undefined;throw e;});
}
export function readDesk(session:DeskSession){return secureJson<DeskSnapshot>('/api/desk/read',{sessionId:session.sessionId,readerSecret:session.readerSecret});}
export function submitTip(sessionId:string,senderCapability:string,submissionId:string,tip:Tip){return secureJson<Receipt>('/api/submit',{sessionId,senderCapability,submissionId,tip});}
export function describePhoto(sessionId:string,senderCapability:string,requestId:string,dataUrl:string){return secureJson<PhotoDescription>('/api/photo/describe',{sessionId,senderCapability,requestId,dataUrl});}
export function readPhoto(session:DeskSession,photoId:string){return secureJson<{dataUrl:string}>('/api/desk/photo',{sessionId:session.sessionId,readerSecret:session.readerSecret,photoId});}
export function retryAnalysis(session:DeskSession,id:string){return secureJson<{ok:boolean}>('/api/desk/retry',{sessionId:session.sessionId,readerSecret:session.readerSecret,submissionId:id});}
export async function resetDesk(session:DeskSession){const readerSecret=crypto.randomUUID()+crypto.randomUUID();const created=await secureJson<Omit<DeskSession,'readerSecret'>>('/api/desk/reset',{sessionId:session.sessionId,readerSecret:session.readerSecret,newReaderSecret:readerSecret});const next={...created,readerSecret};localStorage.setItem(storageKey,JSON.stringify(next));sessionPromise=Promise.resolve(next);return next;}
export function prepareRecipients(session:DeskSession,provider:'ollama'|'darkbloom'|'fixture'='ollama'){return secureJson<PreparationReport>('/api/desk/prepare',{sessionId:session.sessionId,readerSecret:session.readerSecret,provider});}
let currentOrigin='';
export async function getProviderStatus():Promise<ProviderStatus>{const r=await fetch('/api/status');if(!r.ok)throw new Error('Desk is unavailable');const status=await r.json();currentOrigin=status.publicOrigin||window.location.origin;return status;}
export function contributorUrl(session:DeskSession){return `${currentOrigin||window.location.origin}/contribute#session=${encodeURIComponent(session.sessionId)}&sender=${encodeURIComponent(session.senderCapability)}`;}
