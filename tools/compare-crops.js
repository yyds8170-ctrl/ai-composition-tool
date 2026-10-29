const fs=require("fs");
function parse(log){
  const lines=fs.readFileSync(log,"utf8").split("\n").filter(l=>/\.jpg \.\.\./.test(l));
  const m={};
  for(const l of lines){
    const name=l.match(/^\s*([a-z0-9_]+\.jpg)/)[1];
    const crop=l.match(/crop=(\[[0-9,]+\])/)[1];
    const scene=l.match(/scene=([a-z_]+)/)[1];
    const pc=l.includes("pc=Y");
    m[name]={crop,scene,pc};
  }
  return m;
}
const before=parse(process.argv[2]||"tools/regress_before.log");
const after=parse(process.argv[3]||"tools/regress_after2.log");
let changed=0;
for(const name in after){
  const b=before[name], a=after[name];
  if(!b) continue;
  if(b.crop!==a.crop){changed++;console.log(name+" "+b.crop+" -> "+a.crop+" ("+b.scene+"->"+a.scene+")");}
}
console.log("\n裁切变化图数:",changed);
console.log("pc=Y  before:",Object.values(before).filter(x=>x.pc).length," after:",Object.values(after).filter(x=>x.pc).length);
