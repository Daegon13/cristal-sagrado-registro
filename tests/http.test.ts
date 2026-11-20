import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { sameOrigin } from '../lib/http.ts';
test('mutaciones requieren Origin del mismo host y protocolo',()=>{
 assert.equal(sameOrigin(new Request('https://registro.example/api/data',{headers:{origin:'https://registro.example'}})),true);
 assert.equal(sameOrigin(new Request('https://registro.example/api/data',{headers:{origin:'https://otro.example'}})),false);
 assert.equal(sameOrigin(new Request('https://registro.example/api/data',{headers:{origin:'http://registro.example'}})),false);
 assert.equal(sameOrigin(new Request('https://registro.example/api/data')),false);
});
