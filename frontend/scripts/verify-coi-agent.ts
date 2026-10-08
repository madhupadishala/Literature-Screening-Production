import assert from 'node:assert/strict';
import { normalizeCountry, resolveCandidates, runCOI } from '../lib/ai/coi/coi-agent';
import type { AIProvider } from '../lib/ai/ai-types';
async function main(){
const segments=[{id:'s',text:'Rash began in Singapore. Reporter in Australia. Rash began in India.',locator:'page 1'}];
const c={patientId:'p',eventId:'rash',country:'Singapore',role:'event' as const,segmentId:'s',quote:'Rash began in Singapore.',basis:'explicit' as const,rationale:'onset'};
assert.equal(normalizeCountry('India'),'IN');assert.equal(normalizeCountry('Atlantis'),null);
assert.equal(resolveCandidates([c],segments,['rash']).decisions[0].countryCode,'SG');
assert.equal(resolveCandidates([{...c,role:'reporter'}],segments,['rash']).decisions[0].status,'unknown');
assert.equal(resolveCandidates([{...c,quote:'invented'}],segments,['rash']).decisions[0].status,'unknown');
assert.equal(resolveCandidates([c,{...c,country:'India',quote:'Rash began in India.'}],segments,['rash']).decisions[0].status,'conflicting');
const provider:AIProvider={provider:'openai',complete:async()=>({provider:'openai',model:'controlled-test-double',content:JSON.stringify({candidates:[c],eventIds:['rash'],incomplete:false}),latencyMs:1,generatedAt:new Date().toISOString(),requestId:'test',attempts:1})};
const r=await runCOI(segments,provider,'test');assert.equal(r.automaticRelease,false);assert.equal(r.decisions[0].countryCode,'SG');
await assert.rejects(runCOI(segments,{...provider,complete:async()=>{throw new Error('provider unavailable');}},'test'));
console.log('COI: country normalization, role separation, evidence, conflict, graph and failure checks passed');

}
main().catch(error=>{console.error(error);process.exitCode=1;});
