import type {RecipientProfile,Submission} from '../shared/contracts';
import {analyzeTip} from './analysis';
import {ApiError} from './store';

// A repeated click or lost reply must not start another paid request.
// Keep the first analysis available even when hosted review fails.
export async function runTinfoilReview(submission:Submission,profiles:RecipientProfile[],analyze=analyzeTip):Promise<void>{
 if(submission.tinfoilReview?.state==='analyzing'||submission.tinfoilReview?.state==='ready')return;
 if(submission.state!=='ready'||!submission.analysis)throw new ApiError(409,'Wait for the initial analysis before requesting a Tinfoil review.');
 submission.tinfoilReview={state:'analyzing'};
 try{
  const analysis=await analyze(submission.tip,profiles,'tinfoil');
  if(analysis.provider!=='tinfoil'||!analysis.verification?.securityVerified)throw new Error('Verified Tinfoil review required.');
  submission.tinfoilReview={state:'ready',analysis};
 }catch{
  // Provider errors can include request details. Do not expose them to the UI.
  submission.tinfoilReview={state:'failed',error:'Tinfoil review could not complete securely. Your original analysis is still available. Retry the review.'};
 }
}
