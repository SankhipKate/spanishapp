import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeFlagMaps} from './word-flags.mjs';
test('two marks are independent',()=>{const x=mergeFlagMaps({a:{fix:{enabled:true,at:2}}},{a:{repeat:{enabled:true,at:3}}});assert.equal(x.a.fix.enabled,true);assert.equal(x.a.repeat.enabled,true);});
test('newer removal beats older enabled flag',()=>{const x=mergeFlagMaps({a:{repeat:{enabled:false,at:10}}},{a:{repeat:{enabled:true,at:9}}});assert.equal(x.a.repeat.enabled,false);});
test('newer remote addition beats local removal',()=>{const x=mergeFlagMaps({a:{fix:{enabled:false,at:5}}},{a:{fix:{enabled:true,at:6}}});assert.equal(x.a.fix.enabled,true);});
test('snapshot survives remote merge',()=>{const x=mergeFlagMaps({a:{snapshot:{id:'a',ru:'слово',es:'palabra'},fix:{enabled:true,at:1}}},{a:{fix:{enabled:true,at:3}}});assert.equal(x.a.snapshot.ru,'слово');});
