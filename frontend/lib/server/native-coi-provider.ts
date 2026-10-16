import type {AIProvider, AICompletionRequest, AICompletionResponse} from '../ai/ai-types';

// Colocated Ollama only. No public API fallback and no remote source transfer.
export function createApprovedNativeCOIProvider(): AIProvider {
  const model=process.env.NEXUS_NATIVE_OLLAMA_MODEL;
  const endpoint=process.env.NEXUS_NATIVE_OLLAMA_ENDPOINT ?? 'http://127.0.0.1:11434';
  const url=new URL(endpoint);
  if (!model?.trim() || url.protocol!=='http:' ||
      !['127.0.0.1','localhost','[::1]','ollama'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash ||
      url.pathname!=='/') {
    throw new Error('Approved local Ollama model/loopback endpoint required');
  }
  return {
    provider:'ollama',
    async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
      const started=Date.now();
      const controller=new AbortController();
      const timeout=setTimeout(()=>controller.abort(),15000);
      try {
        const response=await fetch(new URL('/api/chat',endpoint),{
          method:'POST',redirect:'error',signal:controller.signal,
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({model,stream:false,format:'json',
            messages:[{role:'system',content:request.systemPrompt??''},
                      {role:'user',content:request.userPrompt}],
            options:{temperature:0,num_predict:Math.min(request.maxTokens??2048,6000)}})
        });
        if(!response.ok) throw new Error('Approved local provider unavailable');
        const output=await response.json() as Record<string,unknown>;
        const message=output.message as Record<string,unknown> | undefined;
        if(typeof message?.content!=='string') throw new Error('Invalid model output');
        return {provider:'ollama',model,content:message.content,finishReason:'stop',
          latencyMs:Date.now()-started,generatedAt:new Date().toISOString(),
          requestId:request.requestId??'native-local',attempts:1};
      } catch {
        throw new Error('Approved local provider unavailable');
      } finally {clearTimeout(timeout);}
    }
  };
}
