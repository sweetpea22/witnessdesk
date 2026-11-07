import {test} from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {PhotoStore,normalizePhoto} from '../src/server/vision';
import {DeskStore,ApiError} from '../src/server/store';

const jpg=async()=> 'data:image/jpeg;base64,'+(await sharp({create:{width:32,height:48,channels:3,background:'#ffffff'}}).withMetadata({orientation:6}).jpeg().toBuffer()).toString('base64');
const result={description:'A payment record.',extractedText:'Amount sent: USD 350,000',uncertainties:[],provider:'ollama' as const,model:'test-vision',durationMs:1};
test('photo normalization strips metadata and rejects a forged image',async()=>{
 const clean=await normalizePhoto(await jpg());const meta=await sharp(Buffer.from(clean.split(',')[1],'base64')).metadata();
 assert.equal(meta.format,'jpeg');assert.equal(meta.exif,undefined);assert.equal(meta.orientation,undefined);
 await assert.rejects(()=>normalizePhoto('data:image/jpeg;base64,aGVsbG8='),/could not be read/);
 await assert.rejects(()=>normalizePhoto('https://example.com/image.jpg'),/readable photo/);
});
test('photo retry is deduplicated and desk cannot see an unsubmitted draft',async()=>{
 let calls=0;const photos=new PhotoStore(async()=>{calls++;return result;});const data=await jpg();
 const first=photos.describePhoto('desk-a','photo-id',data);
 const retry=photos.describePhoto('desk-a','photo-id',data);assert.equal(first,retry);
 await first;assert.equal(calls,1);
 assert.throws(()=>photos.image('desk-a','photo-id'),/not found/);
 assert.throws(()=>photos.result('desk-b','photo-id'),/not found/);
 assert.throws(()=>photos.describePhoto('desk-a','photo-id',data+'x'),e=>e instanceof ApiError&&e.status===409);
 photos.claim('desk-a','photo-id');assert.match(photos.image('desk-a','photo-id').dataUrl,/^data:image\/jpeg;base64,/);
 photos.reset('desk-a');assert.throws(()=>photos.image('desk-a','photo-id'),/not found/);
});
test('failed vision request can retry without relabeling a failure as success',async()=>{
 let calls=0;const photos=new PhotoStore(async()=>{if(++calls===1)throw new Error('unavailable');return result;});const data=await jpg();
 await assert.rejects(photos.describePhoto('desk-a','one',data),/unavailable/);
 const retry=await photos.describePhoto('desk-a','one',data);assert.equal(calls,2);assert.equal(retry.provider,'ollama');
});
test('replacing a photo under the same submission ID conflicts',()=>{
 const store=new DeskStore();const desk=store.create('r'.repeat(64));
 const tip={contributorAlias:'Cindy',evidenceText:'reviewed text',photoId:'photo-a'};
 store.submit(desk.sessionId,desk.senderCapability,'one',tip);
 assert.throws(()=>store.submit(desk.sessionId,desk.senderCapability,'one',{...tip,photoId:'photo-b'}),e=>e instanceof ApiError&&e.status===409);
});
