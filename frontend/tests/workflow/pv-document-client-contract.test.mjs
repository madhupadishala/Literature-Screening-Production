import test from "node:test";
import assert from "node:assert/strict";
import {availablePvDocumentTransitions, isPvDocumentApproval} from "../../lib/nexus/pv-document-client-contract.ts";
test("PV document lifecycle follows existing governed service",()=>{
 assert.deepEqual(availablePvDocumentTransitions("DRAFT"),["DRAFT","REVIEWED"]);
 assert.deepEqual(availablePvDocumentTransitions("IN_REVIEW"),["REVIEWED","APPROVED"]);
 assert.deepEqual(availablePvDocumentTransitions("APPROVED"),["EFFECTIVE","RETIRED"]);
 assert.deepEqual(availablePvDocumentTransitions("EFFECTIVE"),["RETIRED"]);
 assert.deepEqual(availablePvDocumentTransitions("RETIRED"),[]);
 assert.deepEqual(availablePvDocumentTransitions("UNRECOGNIZED"),[]);
});
test("PV effective and retirement transitions require approval permission",()=>{
 assert.equal(isPvDocumentApproval("DRAFT"),false);
 assert.equal(isPvDocumentApproval("REVIEWED"),false);
 for(const status of ["APPROVED","EFFECTIVE","RETIRED"])assert.equal(isPvDocumentApproval(status),true);
});
