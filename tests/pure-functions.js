/* 本文件由 tools/extract-pure.js 从 index.html 自动生成，请勿手改。 */

    function _deriveCrop(base,mode){
      var b=(base&&base.length===4)?base:[0,0,0,0];
      var k=mode==="tight"?1.32:(mode==="loose"?0.55:1);
      // 保留区面积下限：沿 base 形状等比缩放，使 loose/standard/tight 三档严格单调。
      // 旧实现按 ×0.9 离散回退且在面积判断里提前 clamp，步长过大时会让紧凑档裁得比
      // 标准档还少（对称 base≈20、或单方向极端裁切时出现）。
      // 连续目标面积取 0.36：四边 round 各最多让保留边损失约 1（两端各 +0.5），最坏
      // 出现在一个方向几乎无裁、另一方向被裁到约 36 时，round 后面积 ≈ 0.3465（200 万次
      // 枚举实测最低 0.3471），严格保证 round 后 ≥0.34；取 0.348 余量不足（实测会掉到
      // 0.336）。MINA 只在极端大裁切时多保留一点点，正常场景面积本就达标、不触发。
      var MINA=0.36;
      function areaZ(z){
        var c=b.map(function(v){ return Math.max(0,v*z); });
        return (100-c[0]-c[2])*(100-c[1]-c[3])/10000;
      }
      var z=k;
      if(areaZ(k)<MINA){
        var x=Math.max(0,b[0])+Math.max(0,b[2]), y=Math.max(0,b[1])+Math.max(0,b[3]);
        if(x<=0&&y<=0){ z=1; }
        else if(x<=0){ z=100*(1-MINA)/y; }
        else if(y<=0){ z=100*(1-MINA)/x; }
        else{
          // (100-xz)(100-yz)=MINA*10000 → xy z² − 100(x+y) z +(10000−MINA*10000)=0
          var A=x*y, B=-100*(x+y), C=10000-MINA*10000, disc=B*B-4*A*C;
          z=disc<0?1:(-B-Math.sqrt(disc))/(2*A);
        }
        z=Math.min(k,z);
      }
      return b.map(function(v){ return Math.max(0,Math.min(45,Math.round(v*z))); });
    }

    function _smartCrop(cx,cy,opt){
      var L=0,T=0,R=0,B=0;
      var o=opt||{};
      var MIN=0.13, CAPX=0.18, CAPY=0.15, tL=0.375, tR=0.625, tT=0.375, tB=0.625;
      if(typeof cx!=="number"||!isFinite(cx)) cx=0.5;
      if(typeof cy!=="number"||!isFinite(cy)) cy=0.5;
      cx=Math.max(0,Math.min(1,cx)); cy=Math.max(0,Math.min(1,cy));
      if(cx<tL){ var r=1-cx/tL; if(r>=MIN) R=Math.min(CAPX,r); }             // 偏左→裁右
      else if(cx>tR){ var l=(cx-tR)/(1-tR); if(l>=MIN) L=Math.min(CAPX,l); } // 偏右→裁左
      if(o.vCrop!==false){
        if(cy<tT){ var b=1-cy/tT; if(b>=MIN) B=Math.min(CAPY,b); }           // 偏上→裁下
        else if(cy>tB){ var t=(cy-tB)/(1-tB); if(t>=MIN) T=Math.min(CAPY,t); } // 偏下→裁上
      }
      return [L,T,R,B];
    }

    function _classifyYaw(lm){
      if(!Array.isArray(lm)||lm.length<3) return {state:'none',dir:0,r:0};
      var e0=lm[0],e1=lm[1],nose=lm[2];
      if(!e0||!e1||!nose||typeof e0.x!=="number"||typeof e1.x!=="number"||typeof nose.x!=="number") return {state:'none',dir:0,r:0};
      var emid=(e0.x+e1.x)/2;
      var espan=Math.abs(e0.x-e1.x);
      if(!(espan>1e-4)) return {state:'none',dir:0,r:0};   // 纯侧面两眼投影重叠，鼻眼比失效
      var rNose=(nose.x-emid)/espan;
      var dir=0;
      if(lm[4]&&lm[5]&&typeof lm[4].x==="number"&&typeof lm[5].x==="number"){
        var dR=Math.abs(nose.x-lm[4].x), dL=Math.abs(nose.x-lm[5].x);
        var rEar=Math.log((dR+1e-6)/(dL+1e-6));
        if(Math.abs(rEar)>1e-6){ dir=(Math.sign(rNose)===Math.sign(rEar))?Math.sign(rNose):0; } // 两法符号矛盾→不判
        else { dir=Math.sign(rNose); }
      } else { dir=Math.sign(rNose); }
      var ar=Math.abs(rNose);
      if(ar<0.10) return {state:'frontal',dir:0,r:rNose};
      if(dir===0) return {state:ar<0.35?'three-quarter':'profile',dir:0,r:rNose}; // 朝向不可信→不做 nose room
      return {state:ar<0.35?'three-quarter':'profile',dir:dir,r:rNose};
    }

    function _gazeGuard(crop,info){
      if(!crop||crop.length!==4||!info) return crop;
      if(info.isCloseUp===true) return crop;
      if(info.faceCount!==1) return crop;
      var yaw=info.yaw;
      if(!yaw||yaw.dir===0||yaw.state==='frontal'||yaw.state==='none') return crop;
      var tx=yaw.dir>0?0.33:0.67;
      var fx=(typeof info.faceCx==="number"&&isFinite(info.faceCx))?info.faceCx:0.5;
      fx=Math.max(0,Math.min(1,fx));
      var L0=crop[0]/100,T0=crop[1]/100,R0=crop[2]/100,B0=crop[3]/100;
      var W0=Math.max(0.01,1-L0-R0);
      var fxNow=(fx-L0)/W0;
      if(yaw.dir>0){ if(fxNow<=tx+0.03) return crop; } else { if(fxNow>=tx-0.03) return crop; } // 已满足则不裁
      var CAP=0.15,WMIN=0.62,nL=L0,nR=R0;
      if(yaw.dir>0){
        var Ln=(fx-tx+tx*R0)/(1-tx);
        if(!(Ln>L0)||(Ln-L0)<0.04) return crop;
        if(Ln-L0>CAP) return crop;
        nL=Ln;
      }else{
        var Rn=1-L0-(fx-L0)/tx;
        if(!(Rn>R0)||(Rn-R0)<0.04) return crop;
        if(Rn-R0>CAP) return crop;
        nR=Rn;
      }
      var pl=(typeof info.pl==="number"&&isFinite(info.pl))?info.pl:fx-0.06;
      var pr=(typeof info.pr==="number"&&isFinite(info.pr))?info.pr:fx+0.06;
      var wl=nL,wr=1-nR;
      if(pl<wl-0.02||pr>wr+0.02) return crop;
      if(typeof info.fl==="number"&&typeof info.fr==="number"){
        if(info.fl<wl-0.01||info.fr>wr+0.01) return crop;
      }
      if(1-nL-nR<WMIN) return crop;
      var oL=Math.floor(nL*100),oR=Math.floor(nR*100);
      var fW=1-oL/100-oR/100;
      if(fW<WMIN) return crop;
      if(oL/100>pl-0.02||oR/100>1-pr-0.02) return crop;
      if(typeof info.fl==="number"&&typeof info.fr==="number"){
        if(oL/100>info.fl-0.01||oR/100>1-info.fr-0.01) return crop;
      }
      var fxn=(fx-oL/100)/Math.max(0.01,1-oL/100-oR/100);
      if(yaw.dir>0){ if(!(fxn<fxNow-0.03)) return crop; } else { if(!(fxn>fxNow+0.03)) return crop; }
      if(oL+oR-(crop[0]+crop[2])<4) return crop;
      return [oL,crop[1],oR,crop[3]]; // 只改水平单侧；T/B 原样保留，不与竖幅/宽幅通道冲突
    }

    function _edgeSnap(crop,energy,info){
      // v8.7.0 边缘能量吸附：只对【已决定裁切】的边，在目标位 ±5% 内把刀缝微移到最低能量（最干净）的列/行，
      // 让刀缝避开主体轮廓/强边缘/关节，藏进旁边的空白或平滑区。保守原则——只允许“少裁”（刀向画面外移动、
      // 远离主体，保留窗只增不减），绝不新增裁切边（L=0 不动）、绝不外扩多裁；主体/脸安全带、窗宽/高/面积硬限不达标，
      // 或邻域没有“明显更干净且本身能量不高”的间隙时原样返回（宁缺毋滥）。裁切量一律 floor（只少裁）。
      // crop=[L,T,R,B] 百分比整数（保留窗=左L/上T/右R/下B）；energy={col:[..],row:[..],w,h}（列/行归一化能量 0~1）。
      if(!crop||crop.length!==4||!energy||!Array.isArray(energy.col)||!Array.isArray(energy.row)) return crop;
      var L=crop[0],T=crop[1],R=crop[2],B=crop[3];
      if(!(L||T||R||B)) return crop;
      var colArr=energy.col,rowArr=energy.row;
      var W=Math.min(energy.w||colArr.length, colArr.length), H=Math.min(energy.h||rowArr.length, rowArr.length);
      if(!(W>2)||!(H>2)) return crop; // 空/过短能量图无法定位，原样返回
      info=info||{};
      var SNAP=0.05, GAIN=0.10, ECLEAN=0.50, WMIN=0.62, HMIN=0.62, AREA=0.50, PAD=0.02, FPAD=0.01;
      function ok(nL,nT,nR,nB){
        var wl=nL/100,wt=nT/100,wr=1-nR/100,wb=1-nB/100;
        if(wr-wl<WMIN||wb-wt<HMIN) return false;
        if((wr-wl)*(wb-wt)<AREA) return false;
        if(wr<=wl||wb<=wt) return false;
        if(typeof info.pl==="number"&&wl>info.pl-PAD) return false;
        if(typeof info.pr==="number"&&wr<info.pr+PAD) return false;
        if(typeof info.pt==="number"&&wt>info.pt-PAD) return false;
        if(typeof info.pb==="number"&&wb<info.pb+PAD) return false;
        if(typeof info.fl==="number"&&wl>info.fl-FPAD) return false;
        if(typeof info.fr==="number"&&wr<info.fr+FPAD) return false;
        if(typeof info.ft==="number"&&wt>info.ft-FPAD) return false;
        if(typeof info.fb==="number"&&wb<info.fb+FPAD) return false;
        return true;
      }
      // side: 0 左 / 1 上 / 2 右 / 3 下；只朝“少裁”方向（刀位向画面外移动）搜索
      function move(side){
        var isCol=(side===0||side===2);
        var arr=isCol?colArr:rowArr;
        var N=isCol?W:H;
        var cur=(side===0?L:side===1?T:side===2?R:B);
        if(!(cur>0)) return cur;
        var curPos=(side===0?L/100:side===1?T/100:side===2?1-R/100:1-B/100);
        var curIdx=Math.round(curPos*N);
        if(curIdx<0)curIdx=0; if(curIdx>N-1)curIdx=N-1;
        var curE=arr[curIdx]||0;
        var half=Math.round(SNAP*N);
        var dMin=(side===0||side===1)?-half:0;
        var dMax=(side===0||side===1)?0:half;
        var bestI=curIdx,bestE=curE;
        for(var d=dMin;d<=dMax;d++){
          if(d===0) continue;
          var idx=curIdx+d; if(idx<0||idx>=N) continue;
          var e=arr[idx]; if(e>=bestE) continue;
          var nL=L,nT=T,nR=R,nB=B;
          // 用整数运算消浮点（右/下从边缘数列数）；idx 已限在少裁方向，配合下方“只少裁”双保险
          if(side===0)nL=Math.round(idx*100/N);
          else if(side===2)nR=Math.round((N-idx)*100/N);
          else if(side===1)nT=Math.round(idx*100/N);
          else nB=Math.round((N-idx)*100/N);
          if(nL>L||nT>T||nR>R||nB>B) continue; // 双保险：只少裁
          if(!ok(nL,nT,nR,nB)) continue;
          bestI=idx;bestE=e;
        }
        if(bestI===curIdx||!(curE-bestE>=GAIN)||!(bestE<ECLEAN)) return cur;
        var out;
        if(side===0)out=Math.round(bestI*100/N);
        else if(side===2)out=Math.round((N-bestI)*100/N);
        else if(side===1)out=Math.round(bestI*100/N);
        else out=Math.round((N-bestI)*100/N);
        return Math.max(0,out);
      }
      var nL=L>0?move(0):L,nT=T>0?move(1):T,nR=R>0?move(2):R,nB=B>0?move(3):B;
      if(nL>L||nT>T||nR>R||nB>B) return crop;
      if(!ok(nL,nT,nR,nB)) return crop;
      return [nL,nT,nR,nB];
    }

    function _rodGuard(crop,rod,info){
      if(!crop||crop.length!==4||!rod) return crop;
      var T=crop[1],B=crop[3];
      if(!(T||B)) return crop;
      var w=rod.w,h=rod.h;
      if(!(w>2&&h>2)||!rod.rL||!rod.rL2||!rod.rS||rod.rL.length<h+1||rod.rL2.length<h+1||rod.rS.length<h+1) return crop;
      var gN=w*h;
      var gmL=rod.rL[h]/gN, gmL2=rod.rL2[h]/gN, gmS=rod.rS[h]/gN;
      var gVar=Math.max(0,gmL2-gmL*gmL);
      // 宁缺毋滥：显著性=密度高于全图均值 30% 且绝对值过 0.10；信息量=条带内部亮度方差过绝对地板（云/水面层次 std≈35→方差≈1200）。
      // 信息量不用"相对全图均值"：晚霞+暗地面的组间亮度差会抬高全图方差，反而让真正有层次的晚霞过不了；绝对地板更稳。
      var SAL_K=1.30, SAL_FLOOR=0.10, VAR_FLOOR=1200, REDUCE=2;
      function adj(side){
        var cur=crop[side]; if(!cur) return 0;
        var y0,y1;
        if(side===1){ y0=0; y1=Math.round(cur*h/100); }
        else { y1=h; y0=Math.round((100-cur)*h/100); }
        if(y1<=y0) return cur;
        var n=(y1-y0)*w; if(n<=0) return cur;
        var sL=rod.rL[y1]-rod.rL[y0], sL2=rod.rL2[y1]-rod.rL2[y0], sS=rod.rS[y1]-rod.rS[y0];
        var mL=sL/n, mL2=sL2/n, mS=sS/n, varL=Math.max(0,mL2-mL*mL);
        var salHit=(mS>gmS*SAL_K && mS>SAL_FLOOR);
        var varHit=(varL>VAR_FLOOR);
        if(salHit&&varHit) return 0;                        // 双高：整块保留（晚霞/水面/人群）
        if(salHit||varHit) return Math.max(0,cur-REDUCE);  // 单高：轻微少裁
        return cur;
      }
      var nT=Math.min(T,adj(1)), nB=Math.min(B,adj(3));
      if(nT<0||nB<0) return crop;
      return [crop[0],nT,crop[2],nB];
    }

    function _jointGuard(crop, pose, isPort){
      if(!isPort || !crop || crop.length!==4 || !(crop[0]||crop[1]||crop[2]||crop[3])) return crop;
      if(!pose || pose.length<29) return crop;
      var TOL=2.5, MOVE=5.0;
      function ky(i){ return (pose[i] && pose[i].visibility>0.5 && pose[i].y>0 && pose[i].y<1)?pose[i].y*100:null; }
      function kx(i){ return (pose[i] && pose[i].visibility>0.5 && pose[i].x>0 && pose[i].x<1)?pose[i].x*100:null; }
      var c=crop.slice();
      var bb=100-c[3]; // 下沿位置：避开髋23/24、膝25/26、踝27/28
      [23,24,25,26,27,28].forEach(function(i){ var y=ky(i); if(y!==null && Math.abs(bb-y)<=TOL){ var t=Math.min(99,y+TOL+1); var d=t-bb; if(d>0 && d<=MOVE) c[3]=Math.max(0,Math.round(100-t)); } });
      var tt=c[1]; // 上沿位置：避开肩11/12、肘13/14、腕15/16
      [11,12,13,14,15,16].forEach(function(i){ var y=ky(i); if(y!==null && Math.abs(tt-y)<=TOL){ var t=Math.max(1,y-TOL-1); var d=tt-t; if(d>0 && d<=MOVE) c[1]=Math.max(0,Math.round(t)); } });
      var ll=c[0]; // 左沿位置：仅管靠画面左侧的手（x<35，避免误伤躯干前的手）
      [15,13].forEach(function(i){ var x=kx(i); if(x!==null && x<35 && Math.abs(ll-x)<=TOL){ var t=Math.max(1,x-TOL-1); var d=ll-t; if(d>0 && d<=MOVE) c[0]=Math.max(0,Math.round(t)); } });
      var rr=100-c[2]; // 右沿位置：仅管靠画面右侧的手（x>65）
      [16,14].forEach(function(i){ var x=kx(i); if(x!==null && x>65 && Math.abs(rr-x)<=TOL){ var t=Math.min(99,x+TOL+1); var d=t-rr; if(d>0 && d<=MOVE) c[2]=Math.max(0,Math.round(100-t)); } });
      return c.map(function(v){ return Math.max(0,Math.min(50,v)); });
    }

    function _objectGuard(crop, boxes){
      var _OBJ_GUARD_BG={"dining table":1,"couch":1,"bed":1,"chair":1,"tv":1,"sink":1,"refrigerator":1,"oven":1,"microwave":1,"toaster":1};
      if(!crop || crop.length!==4 || !(crop[0]||crop[1]||crop[2]||crop[3])) return crop;
      if(!boxes || !boxes.length) return crop;
      var TOL=1.0, MOVE=5.0, MINAREA=0.02, CONF=0.40;
      var c=crop.slice();
      var cand=[];
      for(var i=0;i<boxes.length;i++){
        var o=boxes[i];
        if(!o || !o.b || o.b.length!==4) continue;
        if(o.class==="person" || _OBJ_GUARD_BG[o.class]) continue;
        if(typeof o.score==="number" && o.score<CONF) continue;
        var bx1=Math.max(0,o.b[0]*100), by1=Math.max(0,o.b[1]*100),
            bx2=Math.min(100,o.b[2]*100), by2=Math.min(100,o.b[3]*100);
        if(!(bx2>bx1 && by2>by1)) continue;
        var area=((bx2-bx1)*(by2-by1))/10000;
        if(area<MINAREA) continue;
        cand.push({bx1:bx1,by1:by1,bx2:bx2,by2:by2,area:area});
      }
      cand.sort(function(p,q){ return q.area-p.area; });
      cand=cand.slice(0,2);
      var oL=c[0],oT=c[1],oR=c[2],oB=c[3];
      var nl=oL,nt=oT,nr=oR,nb=oB;
      for(var k=0;k<cand.length;k++){
        var m=cand[k];
        var L=oL,T=oT,Rr=100-oR,Bb=100-oB;
        var ovx=Math.min(Rr,m.bx2)-Math.max(L,m.bx1);
        var ovy=Math.min(Bb,m.by2)-Math.max(T,m.by1);
        if(ovx<=0||ovy<=0) continue; // 与保留区无重叠（物体本就在构图外），不护
        if(m.bx1<L && m.bx2>L) nl=Math.min(nl,Math.round(m.bx1-TOL));            // 左边缘切穿
        if(m.bx2>Rr && m.bx1<Rr) nr=Math.min(nr,Math.round(100-m.bx2-TOL));      // 右边缘切穿
        if(m.by1<T && m.by2>T) nt=Math.min(nt,Math.round(m.by1-TOL));            // 上边缘切穿
        if(m.by2>Bb && m.by1<Bb) nb=Math.min(nb,Math.round(100-m.by2-TOL));      // 下边缘切穿
      }
      // 只减不增（各边值只允许变小=保留区扩大），单边累计移动≤MOVE
      c[0]=Math.max(oL-MOVE, Math.min(nl,oL));
      c[1]=Math.max(oT-MOVE, Math.min(nt,oT));
      c[2]=Math.max(oR-MOVE, Math.min(nr,oR));
      c[3]=Math.max(oB-MOVE, Math.min(nb,oB));
      return c.map(function(v){ return Math.max(0,Math.min(50,Math.round(v))); });
    }

    function _portraitFraming(crop, info){
      if(!crop || crop.length!==4 || !info) return crop;
      var pl=info.pl, pt=info.pt, pr=info.pr, pb=info.pb, ph=info.ph, aspect=info.aspect;
      if(!(info.isPerson===true || info.isPort===true)) return crop;
      if(info.isCloseUp===true) return crop;                 // 特写保持完整（与 needCrop 一致）
      if(typeof pt!=='number' || !isFinite(pt) || typeof pb!=='number' || !isFinite(pb)) return crop;
      if(typeof aspect!=='number' || !isFinite(aspect) || aspect>=0.92) return crop; // 仅竖幅
      if(typeof ph!=='number' || !isFinite(ph) || ph<=0) ph=Math.max(0,pb-pt);
      if(!(ph>=0.34 && ph<0.72)) return crop;                // 半身 0.50-0.72 / 七分 0.34-0.50；全身人太小不硬裁
      if(!(pr>pl)){ pl=0.35; pr=0.65; }
      var T0=crop[1]/100, B0=crop[3]/100, H0=Math.max(0.01,1-T0-B0);
      var half = ph>=0.50;                                   // 半身 vs 七分
      var eyeK  = half?0.10:0.08;                            // 眼睛在人体框顶下方约 10%/8%
      var eyeAbs= pt + eyeK*ph;
      var eyeNow=(eyeAbs-T0)/H0;
      var hrNow =(pt-T0)/H0;
      if(!(eyeNow>0.42 && hrNow>0.28)) return crop;          // 双触发：眼睛明显偏低且头顶留白过大，否则不动
      var eyeT=0.33, headMin=0.05, bodyKeep=half?0.05:0.06, HMIN=0.60;
      // 垂直方向：眼位锚定上三分，同时顶部不切头、底部容纳人体到正确切位（H 取各硬约束所需最大值）
      var H=Math.max((pb+bodyKeep-eyeAbs)/(1-eyeT), (eyeK*ph+headMin)/eyeT, HMIN);
      // 放不下就放弃（绝不靠缩小 H 去硬塞，否则会切到身体/腿）：顶边不得<0、底边不得>1
      if(H>eyeAbs/eyeT) return crop;
      if(H>(1-eyeAbs)/(1-eyeT)) return crop;
      var T=eyeAbs-eyeT*H;
      var B=1-T-H;
      if(T<0 || B<0 || T>pt-headMin) return crop;
      if(T+H < pb+bodyKeep-1e-9) return crop;             // 二次确认：不切身体/腿
      // 3:4 竖幅，水平方向以人物中心居中，宽度按目标画幅换算（W 为相对原片宽度的归一化保留比例）
      var W=H*0.75/aspect;
      // 必须足够宽以完整容纳人体（左右各留 3%），不够就只扩不缩（减少左右裁切）
      var Wmin=(pr-pl)+0.06;
      if(W<Wmin) W=Wmin;
      if(W>1) W=1;
      var cx=(pl+pr)/2;
      // L 的可行区间：保证左边不切(L≤pl-0.03)、右边不切(R=1-L-W≤1-pr-0.03 ⇒ L≥pr+0.03-W)
      var Llo=pr+0.03-W, Lhi=pl-0.03;
      var L=Math.max(0,Math.min(1-W, cx-W/2));
      if(L<Llo) L=Llo; if(L>Lhi) L=Lhi;
      L=Math.max(0,Math.min(1-W,L));
      var R=1-L-W;
      if(R<0) return crop;
      if(L>pl-0.03+1e-9 || R>1-pr-0.03+1e-9) return crop;   // 仍切人体，放弃
      if(H*W<0.36) return crop;                              // 保留面积下限
      // 输出统一向下取整（Math.floor）：四边裁量只小不大，保留区只大不小，取整不会切到任何硬保护对象
      var oL=Math.floor(L*100), oT=Math.floor(T*100), oR=Math.floor(R*100), oB=Math.floor(B*100);
      // 取整后最终硬校验（任一不满足都放弃，宁缺毋滥）
      var fH=1-oT/100-oB/100, fW=1-oL/100-oR/100;
      if(fH<0.60 || fH*fW<0.36) return crop;
      if(oT/100 > pt-0.04) return crop;
      if(oB/100 > 1-(pb+bodyKeep)) return crop;
      if(oL/100 > pl-0.03 || oR/100 > 1-pr-0.03) return crop;
      var tot=oL+oT+oR+oB;
      if(tot<5) return crop;
      var newEye=(eyeAbs-oT/100)/Math.max(0.01,fH);
      if(!(newEye<eyeNow-0.06)) return crop;                 // 眼睛必须明显上移才算改善
      if((pt-oT/100)/fH<0.04) return crop;                   // 头顶至少留 4%
      return [oL, oT, oR, oB].map(function(v){ return Math.max(0,Math.min(60,v)); });
    }

    function _aspectCrop(crop, info){
      if(!crop||crop.length!==4||!info) return crop;
      var scene=info.scene, aspect=info.aspect;
      if(scene!=="waterscape"&&scene!=="landscape"&&scene!=="night"&&scene!=="architecture") return crop;
      if(typeof aspect!=="number"||!isFinite(aspect)||aspect<1.45||aspect>2.1) return crop; // 仅横拍且不过度极端
      if(info.isPerson===true) return crop;                       // 有人物交人像通道，不做宽幅
      if(info.tiltConf>=40&&typeof info.tiltDeg==="number"&&isFinite(info.tiltDeg)&&Math.abs(info.tiltDeg)>3) return crop; // 明显倾斜先找平
      var FA=16/9, H, W;
      if(aspect<=FA){ W=1; H=aspect/FA; } else { H=1; W=FA/aspect; } // 原片偏窄→裁上下；原片更宽→裁左右
      if(H<0.80||W<0.85) return crop;                            // 双保险：不允许裁掉过多
      var all=[];
      (info.boxes||[]).forEach(function(o){
        var b=o&&o.b; if(!b||b.length!==4) return;
        var x1=Math.max(0,Math.min(1,b[0])),y1=Math.max(0,Math.min(1,b[1])),x2=Math.max(0,Math.min(1,b[2])),y2=Math.max(0,Math.min(1,b[3]));
        if(x2-x1<=0||y2-y1<=0) return;
        if((x2-x1)*(y2-y1)<0.01) return;
        all.push([x1,y1,x2,y2]);
      });
      var loc=all.slice().sort(function(a,b){return (b[2]-b[0])*(b[3]-b[1])-(a[2]-a[0])*(a[3]-a[1]);}).slice(0,8)
        .filter(function(b){return (b[2]-b[0])*(b[3]-b[1])>=0.015;});
      var T=0,L=0;
      if(H<1){ // 裁上下
        var lo=0,hi=1-H;
        if(loc.length){
          var yLo=Math.min.apply(null,loc.map(function(b){return b[1];}))-0.02, yHi=Math.max.apply(null,loc.map(function(b){return b[3];}))+0.02;
          yLo=Math.max(0,yLo); yHi=Math.min(1,yHi);
          lo=Math.max(0,yHi-H); hi=Math.min(1-H,yLo);
        }
        if(lo>hi+1e-9) return crop;                            // 主体垂直方向装不下，放弃
        var T0;
        if(info.horizonOk===true&&typeof info.ratio==="number"&&info.ratio>0.1&&info.ratio<0.9){ T0=info.ratio*(1-H); }
        else { var cy=(typeof info.cy==="number"&&isFinite(info.cy))?info.cy:0.5; T0=cy-0.5*H; }
        T=Math.max(lo,Math.min(hi,T0));
      }
      if(W<1){ // 裁左右
        var llo=0,lhi=1-W;
        if(loc.length){
          var xLo=Math.min.apply(null,loc.map(function(b){return b[0];}))-0.02, xHi=Math.max.apply(null,loc.map(function(b){return b[2];}))+0.02;
          xLo=Math.max(0,xLo); xHi=Math.min(1,xHi);
          llo=Math.max(0,xHi-W); lhi=Math.min(1-W,xLo);
        }
        if(llo>lhi+1e-9) return crop;                          // 主体水平方向装不下，放弃
        var cx=(typeof info.cx==="number"&&isFinite(info.cx))?info.cx:0.5;
        L=Math.max(llo,Math.min(lhi,cx-0.5*W));
      }
      var B=1-T-H, R=1-L-W;
      if(T<0||B<0||L<0||R<0||H*W<0.78) return crop;
      var oL=Math.floor(L*100),oT=Math.floor(T*100),oR=Math.floor(R*100),oB=Math.floor(B*100); // 四边 floor：只扩不缩
      var fH=1-oT/100-oB/100, fW=1-oL/100-oR/100;
      if(fH<0.80||fW<0.85||fH*fW<0.78) return crop;
      if(Math.abs(aspect*fW/fH-FA)>0.08) return crop;          // 裁后宽高比必须确实接近 16:9
      for(var i=0;i<all.length;i++){ var b=all[i];            // 最终硬校验：任何≥1% 主体都不被切
        if(oT/100>b[1]-0.01+1e-9) return crop;
        if(oB/100>1-b[3]-0.01+1e-9) return crop;
        if(oL/100>b[0]-0.01+1e-9) return crop;
        if(oR/100>1-b[2]-0.01+1e-9) return crop;
      }
      if(oL+oT+oR+oB<5) return crop;
      return [oL,oT,oR,oB].map(function(v){return Math.max(0,Math.min(60,v));});
    }

    function _figureGround(faceLum,bgLum){
      if(typeof faceLum!=='number'||!isFinite(faceLum)||typeof bgLum!=='number'||!isFinite(bgLum)) return null;
      var d=bgLum-faceLum;
      if(d>=44 && bgLum>=150) return "⚠ 背景比脸亮很多（逆光/身后是亮窗亮墙），脸容易拍黑、亮背景抢走视线：换个角度让暗背景在身后，或把脸转向光源";
      if(d>=30 && bgLum>=140) return "💡 背景略亮于脸：略微移动让暗一点的背景在身后，或把脸转向光，人物更突出";
      return null;
    }

    function _yoloNMS(b,s,thr){
      if(!b.length) return [];
      var order=s.map(function(v,i){return i;}).sort(function(a,bb){return s[bb]-s[a];}), keep=[];
      while(order.length){
        var i=order.shift(); keep.push(i);
        order=order.filter(function(j){
          var x1=Math.max(b[i][0],b[j][0]), y1=Math.max(b[i][1],b[j][1]);
          var x2=Math.min(b[i][2],b[j][2]), y2=Math.min(b[i][3],b[j][3]);
          var inter=Math.max(0,x2-x1)*Math.max(0,y2-y1);
          var ai=(b[i][2]-b[i][0])*(b[i][3]-b[i][1]), aj=(b[j][2]-b[j][0])*(b[j][3]-b[j][1]);
          return inter/(ai+aj-inter+1e-9)<=thr;
        });
      }
      return keep;
    }

        function _estTiltDeg(_gx,_gy,_gm,_w,_h,_th){
          try{
            var bins=new Array(36); for(var bi=0;bi<36;bi++) bins[bi]=0;
            var n=0;
            var _th2=_th*1.67; // v8.0.6: 只统计强边缘（≈中位数×2.5），滤掉渐变/弱纹理干扰，集中度更真实
            for(var ti=0;ti<_w*_h;ti++){
              if(_gm[ti]<=_th2) continue;
              var ax=_gx[ti], ay=_gy[ti];
              // 近水平边缘：梯度接近竖直（|gy|>>|gx|），|atan2-90|<=35°
              var aD=Math.atan2(ay,ax)*180/Math.PI; if(aD<0) aD+=180;
              if(aD<55||aD>125) continue;
              bins[((aD/5)|0)%36]++; n++;
            }
            if(n<Math.max(40,_w*_h*0.006)) return {deg:0,conf:0}; // 水平结构不足
            // 主箱+邻箱加权平均 -> 主角度（v8.0.6: 用真实角度均值替代箱中心插值，消除±2.5°箱内量化误差）
            var mi=0; for(var bi2=1;bi2<36;bi2++){ if(bins[bi2]>bins[mi]) mi=bi2; }
            var m0=bins[mi], mL=bins[(mi+35)%36], mR=bins[(mi+1)%36];
            var _lo=(mi*5-2.5+180)%180, _hi=(mi*5+7.5)%180; // 主箱±相邻箱覆盖角区
            var sumAng=0, cntA=0;
            for(var ti2=0;ti2<_w*_h;ti2++){
              if(_gm[ti2]<=_th2) continue;
              var ax2=_gx[ti2], ay2=_gy[ti2];
              var a2=Math.atan2(ay2,ax2)*180/Math.PI; if(a2<0) a2+=180;
              if(a2<_lo||a2>_hi) continue;
              sumAng+=a2; cntA++;
            }
            var mainAng=cntA>0?sumAng/cntA:(mi+0.5)*5; // 主角度（0..180）
            // 角度集中度：主箱+邻箱 占全部近水平边缘的比例
            var conc=(m0+mL+mR)/Math.max(1,n);
            var deg=mainAng-90;                     // -35..35
            if(deg<-10||deg>10) return {deg:0,conf:0}; // 超限视为不可靠（斜得太离谱多半是纹理噪声）
            return {deg:Math.round(deg*10)/10, conf:Math.round(conc*100)};
          }catch(e){ return {deg:0,conf:0}; }
        }

    function _guidanceEyeLevel(o){
      if(!o) return null;
      var fc=o.faceConf, ht=o.headTop, fhr=o.faceHR, ey=o.eyesY;
      if(typeof fc!=="number"||!isFinite(fc)||fc<0.75) return null;
      if(typeof ht!=="number"||!isFinite(ht)) return null;
      if(typeof fhr==="number"&&isFinite(fhr)&&fhr<0.04) return null; // 远景小人不当主体
      var hasEyes=(typeof ey==="number"&&isFinite(ey));
      if(ht<0.045) return {dir:"down",txt:"机位偏高了，把手机放低到和对方眼睛同高"};
      if(ht>0.24 && (!hasEyes || ey>0.40)) return {dir:"up",txt:"机位偏低了，把手机举高一点，与眼睛平齐"};
      return null;
    }

    function _guidanceEyeOnGrid(o){
      if(!o) return null;
      var fc=o.faceConf, ey=o.eyesY;
      if(typeof fc!=="number"||!isFinite(fc)||fc<0.75) return null;
      if(typeof ey!=="number"||!isFinite(ey)) return null; // 任意一眼点缺失→不报
      if(ey>0.42) return {eyesY:ey,txt:"把眼睛对上上方那条横线"};
      if(ey<0.24) return {eyesY:ey,txt:"眼睛稍放低到横线上"};
      return null;
    }

    function _guidanceDistance(o){
      if(!o) return null;
      var fc=o.faceConf, phr=o.personHR, fhr=o.faceHR;
      if(typeof fc!=="number"||!isFinite(fc)||fc<0.75) return null;
      if(typeof phr==="number"&&isFinite(phr)){
        if(phr<0.28) return {dir:"near",txt:"走近两步，让人大一点"};
        if(phr>0.85) return {dir:"far",txt:"后退半步，人别顶到边"};
        return null;
      }
      if(typeof fhr==="number"&&isFinite(fhr)){
        if(fhr<0.04) return null; // 远景小人豁免
        if(fhr<0.18) return {dir:"near",txt:"走近两步，让人大一点"};
        if(fhr>0.78) return {dir:"far",txt:"后退半步，人别顶到边"};
        return null;
      }
      return null;
    }

    function _guidanceOrientation(o){
      if(!o) return null;
      var fc=o.faceCount, pa=o.personAspect, fa=o.frameAspect, st=o.sceneType;
      if(typeof pa!=="number"||!isFinite(pa)||pa<=0) return null;
      if(typeof fa!=="number"||!isFinite(fa)) return null;
      if(typeof fc!=="number"||!isFinite(fc)) return null;
      if(fc===1 && pa>1.35 && fa>1.2) return {rec:"portrait",txt:"竖持手机，竖拍人像更合身"};
      var wide=(st==="waterscape"||st==="landscape"||st==="architecture");
      if((fc>=3 || wide) && fa<0.85) return {rec:"landscape",txt:"横持手机，横拍更合适"};
      return null;
    }

module.exports = { _deriveCrop, _smartCrop, _classifyYaw, _gazeGuard, _edgeSnap, _rodGuard, _jointGuard, _objectGuard, _portraitFraming, _aspectCrop, _figureGround, _yoloNMS, _estTiltDeg, _guidanceEyeLevel, _guidanceEyeOnGrid, _guidanceDistance, _guidanceOrientation };
