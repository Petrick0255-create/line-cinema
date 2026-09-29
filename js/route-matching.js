// Minimize added-ink cost while keeping the requested starting endpoint.
// Small junction sets use exact matching, including the free final endpoint.
// Larger sets compare several complete plans and improve pairings with 2-opt.
export function matchEndpoints(odd,origin,cost,rank){
  if(odd.length<=2)return{pairs:[],cost:0,method:'exact',baselineCost:0};
  const nodes=odd.filter(v=>v!==origin),memoCost=new Map();
  const weight=(a,b)=>{const key=a<b?`${a}:${b}`:`${b}:${a}`;if(!memoCost.has(key))memoCost.set(key,cost(a,b));return memoCost.get(key);};
  const score=pairs=>pairs.reduce((n,[a,b])=>n+weight(a,b),0);
  const greedy=end=>{const remaining=nodes.filter(v=>v!==end).sort((a,b)=>rank(a)-rank(b)||a-b),pairs=[];while(remaining.length){const a=remaining.shift();let best=0;for(let i=1;i<remaining.length;i++)if(weight(a,remaining[i])<weight(a,remaining[best]))best=i;pairs.push([a,remaining.splice(best,1)[0]]);}return pairs;};
  const far=nodes.reduce((a,b)=>rank(a)>rank(b)?a:b),baseline=greedy(far),baselineCost=score(baseline);
  if(odd.length<=18){
    const ids=[...nodes,-1],count=ids.length,full=(1<<count)-1,memo=new Map([[0,0]]),choice=new Map();
    const link=(i,j)=>ids[i]===-1||ids[j]===-1?0:weight(ids[i],ids[j]);
    function solve(mask){if(memo.has(mask))return memo.get(mask);let i=0;while(!(mask&(1<<i)))i++;const rest=mask^(1<<i);let best=Infinity,at=-1;for(let j=i+1;j<count;j++)if(rest&(1<<j)){const value=link(i,j)+solve(rest^(1<<j));if(value<best){best=value;at=j;}}memo.set(mask,best);choice.set(mask,[i,at]);return best;}
    const total=solve(full),pairs=[];let mask=full;while(mask){const[i,j]=choice.get(mask);if(ids[i]!==-1&&ids[j]!==-1)pairs.push([ids[i],ids[j]]);mask^=(1<<i)|(1<<j);}return{pairs,cost:total,method:'exact',baselineCost};
  }
  const expensive=nodes.map(a=>({a,d:Math.min(...nodes.filter(b=>b!==a).map(b=>weight(a,b)))})).sort((a,b)=>b.d-a.d);
  const ends=[...new Set([far,...expensive.slice(0,3).map(x=>x.a)])];let best={pairs:baseline,cost:baselineCost};
  for(const end of ends){const pairs=greedy(end);for(let pass=0;pass<6;pass++){let changed=false;for(let i=0;i<pairs.length;i++)for(let j=i+1;j<pairs.length;j++){const[a,b]=pairs[i],[c,d]=pairs[j],old=weight(a,b)+weight(c,d),ac=weight(a,c)+weight(b,d),ad=weight(a,d)+weight(b,c);if(Math.min(ac,ad)<old-1e-7){pairs[i]=[a,ac<ad?c:d];pairs[j]=[b,ac<ad?d:c];changed=true;}}if(!changed)break;}const total=score(pairs);if(total<best.cost)best={pairs,cost:total};}
  return{...best,method:'multi-start-2opt',baselineCost};
}
