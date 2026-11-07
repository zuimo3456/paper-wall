// A true 3D intersection check, not a projected overlap/back-face test.
const sub=(a,b)=>[a.x-b.x,a.y-b.y,a.z-b.z];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function hits(p,q,a,b,c){
  const d=sub(q,p),e1=sub(b,a),e2=sub(c,a),h=cross(d,e2),det=dot(e1,h);if(Math.abs(det)<1e-8)return false;
  const inv=1/det,s=sub(p,a),u=dot(s,h)*inv;if(u<1e-5||u>1-1e-5)return false;
  const r=cross(s,e1),v=dot(d,r)*inv;if(v<1e-5||u+v>1-1e-5)return false;
  const t=dot(e2,r)*inv;return t>1e-5&&t<1-1e-5;
}
export function intersections(cloth,stopAt=Infinity){
  const triangles=[];for(let i=0;i<cloth.triangles.length;i+=3){const ids=Array.from(cloth.triangles.slice(i,i+3)),p=ids.map(j=>cloth.nodes[j]);triangles.push({ids,p,min:[Math.min(...p.map(p=>p.x)),Math.min(...p.map(p=>p.y)),Math.min(...p.map(p=>p.z))],max:[Math.max(...p.map(p=>p.x)),Math.max(...p.map(p=>p.y)),Math.max(...p.map(p=>p.z))]});}
  let count=0;for(let i=0;i<triangles.length;i++)for(let j=i+1;j<triangles.length;j++){
    const a=triangles[i],b=triangles[j];if(a.ids.some(id=>b.ids.includes(id))||a.min.some((v,k)=>v>b.max[k]+1e-6)||b.min.some((v,k)=>v>a.max[k]+1e-6))continue;
    const hit=a.p.some((p,k)=>hits(p,a.p[(k+1)%3],...b.p))||b.p.some((p,k)=>hits(p,b.p[(k+1)%3],...a.p));if(hit&&++count>=stopAt)return count;
  }return count;
}
