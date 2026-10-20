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

    function _landscapeCrop(energy, cx, cy, opt){
      var L=0,T=0,R=0,B=0;
      if(!energy||!Array.isArray(energy.col)||!Array.isArray(energy.row)) return [L,T,R,B];
      var col=energy.col, row=energy.row;
      var W=Math.min(energy.w||col.length, col.length), H=Math.min(energy.h||row.length, row.length);
      if(!(W>10)||!(H>10)) return [L,T,R,B];
      if(typeof cx!=="number"||!isFinite(cx)) cx=0.5;
      if(typeof cy!=="number"||!isFinite(cy)) cy=0.5;
      cx=Math.max(0,Math.min(1,cx)); cy=Math.max(0,Math.min(1,cy));
      var o=opt||{};
      var STRIP=0.16, CAP=0.16, STEP=0.01, RATIO=0.42, PROBE=0.03, MINDEP=0.03; // 边带能量<中心42%才判死区；单边最多裁16%
      function avg(arr,from,to){
        var s=0,c=0,fi=Math.max(0,Math.floor(from*arr.length)),ti=Math.min(arr.length,Math.ceil(to*arr.length));
        for(var i=fi;i<ti;i++){ s+=(arr[i]||0); c++; }
        return c? s/c:0;
      }
      var cL=avg(col,0.30,0.70), cT=avg(row,0.30,0.70); // 中心带参考能量
      // 边界深度：用 3% 窄探针从边向里逐行扫，一旦探针碰到内容（屋顶/树/天际线）立即停，
      // 避免宽窗口把紧贴边缘的屋顶/树冠能量平均掉而切到主体（v11.16 修正）。
      function depth(arr,fromEdge,thr){
        var d=0,N=arr.length;
        for(var i=0;i<Math.floor(CAP*N);i++){
          var lo=fromEdge? i/ N: i/N, hi=lo+PROBE;
          var e=avg(arr,lo,Math.min(1,hi));
          if(e>=thr) break;
          d=(i+1)/N;
        }
        return d>=MINDEP?Math.min(CAP,d):0;
      }
      // 水平（左/右）：边带能量低 + 重心偏另一侧才裁
      var eL=avg(col,0,STRIP), eR=avg(col,1-STRIP,1);
      if(eL<cL*RATIO && cx>0.50){ L=depth(col,false,cL*RATIO); }
      if(eR<cL*RATIO && cx<0.50){ R=depth(col,true,cL*RATIO); }
      // 垂直（上/下）：天空/黑前景通常是大死区
      var eT=avg(row,0,STRIP), eB=avg(row,1-STRIP,1);
      if(o.v!==false){
        if(eT<cT*RATIO && cy>0.50){ T=depth(row,false,cT*RATIO); }
        if(eB<cT*RATIO && cy<0.50){ B=depth(row,true,cT*RATIO); }
      }
      // 保留窗约束：至少保留 64% 宽高，不四面齐裁
      if(1-L-R<0.66){ var k=(L+R-0.34)/Math.max(L+R,0.001); L-=L*k; R-=R*k; }
      if(1-T-B<0.66){ var k2=(T+B-0.34)/Math.max(T+B,0.001); T-=T*k2; B-=B*k2; }
      return [Math.max(0,L),Math.max(0,T),Math.max(0,R),Math.max(0,B)];
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
      // v11.16.0 绝对高彩保护：戏剧性晚霞/天空即便平滑渐变（亮度方差低、相对全图不突出），
      // 只要条带绝对显著性高且非中性（高饱和），就整块保留——避免误裁漂亮的粉紫晚霞/宝石蓝天。
      var COLOR_SAL=0.30, COLOR_SAT=0.25;
      var hasSat=!!(rod.rSat&&rod.rSat.length===h+1);
      function adj(side){
        var cur=crop[side]; if(!cur) return 0;
        var y0,y1;
        if(side===1){ y0=0; y1=Math.round(cur*h/100); }
        else { y1=h; y0=Math.round((100-cur)*h/100); }
        if(y1<=y0) return cur;
        var n=(y1-y0)*w; if(n<=0) return cur;
        var sL=rod.rL[y1]-rod.rL[y0], sL2=rod.rL2[y1]-rod.rL2[y0], sS=rod.rS[y1]-rod.rS[y0];
        var mL=sL/n, mL2=sL2/n, mS=sS/n, varL=Math.max(0,mL2-mL*mL);
        var mSat=hasSat?(rod.rSat[y1]-rod.rSat[y0])/n:0;
        var salHit=(mS>gmS*SAL_K && mS>SAL_FLOOR);
        var varHit=(varL>VAR_FLOOR);
        var colorHit=(mS>COLOR_SAL && mSat>COLOR_SAT); // 绝对高彩：鲜艳非中性
        if(colorHit) return 0;                                    // 高彩天空/晚霞：整块保留
        if(salHit&&varHit) return 0;                        // 双高：整块保留（晚霞/水面/人群）
        if(salHit||varHit) return Math.max(0,cur-REDUCE);  // 单高：轻微少裁
        return cur;
      }
      var nT=Math.min(T,adj(1)), nB=Math.min(B,adj(3));
      if(nT<0||nB<0) return crop;
      return [crop[0],nT,crop[2],nB];
    }

    function _cloudCropIntentGuard(o){
      try{
        if(!o) return null;
        var crop=o.crop, rod=o.rod, intent=String(o.intent||"").toLowerCase();
        if(!crop||crop.length!==4||!rod) return null;
        var w=rod.w,h=rod.h;
        if(!(w>2&&h>2)||!rod.rL||!rod.rL2||!rod.rS||rod.rL.length<h+1||rod.rL2.length<h+1||rod.rS.length<h+1) return null;
        var topHit=(intent==="crop_top"||intent==="crop_tb");
        var botHit=(intent==="crop_bottom"||intent==="crop_tb");
        var gN=w*h;
        var gmL=rod.rL[h]/gN, gmL2=rod.rL2[h]/gN, gmS=rod.rS[h]/gN;
        var gVar=Math.max(0,gmL2-gmL*gmL);
        var T=crop[1]||0, B=crop[3]||0;
        if(!T&&!B) return null; // 没有任何水平边被裁（纯左右/trim/none）→ 无水平条带可护
        if(!(gmS>1e-6)||!(gVar>1e-6)) return null; // 全图近乎无显著/无层次 → 不存在高价值条带
        var hasSat=!!(rod.rSat&&rod.rSat.length===h+1);
        var nT=T, nB=B, note=null;
        function bandIsValuable(isTop){
          var cur=isTop?T:B; if(!cur||cur<=0) return false;
          var y0,y1;
          if(isTop){ y0=0; y1=Math.round(cur*h/100); }
          else { y1=h; y0=Math.round((100-cur)*h/100); }
          if(y1<=y0) return false;
          var n=(y1-y0)*w; if(n<=0) return false;
          var sL=rod.rL[y1]-rod.rL[y0], sL2=rod.rL2[y1]-rod.rL2[y0], sS=rod.rS[y1]-rod.rS[y0];
          var mL=sL/n, mL2=sL2/n, mS=sS/n, varL=Math.max(0,mL2-mL*mL);
          var mSat=hasSat?(rod.rSat[y1]-rod.rSat[y0])/n:0;
          // v11.16.0 绝对高彩：鲜艳晚霞/宝石蓝天即便平滑渐变也整条保留（云端同样不得误裁戏剧性天空）
          if(mS>0.30 && mSat>0.25) return "full";
          var salMassRatio=sS/(gmS*gN); // 条带显著性质量占全图比
          // v9.6.0 绝对地板：相对门 varL>gVar*1.2 在"组间反差抬高全图方差"时会漏保晚霞；
          // 追加绝对方差地板（条带自身方差>800 即有层次）作为另一条保护路径——只多护一点、仍只少裁。
          var ABS_VAR=800;
          return (salMassRatio>0.15 && (varL>gVar*1.2 || varL>ABS_VAR)) ? "partial" : false;
        }
        var RETRACT=2;
        var _vTop=bandIsValuable(true), _vBot=bandIsValuable(false);
        // v11.16.0 收尾强化：高彩"整条保留(full)"不再被 VLM 声明的 intent 门控——
        // 只要某条水平边正在被裁、且该条带是戏剧性高彩晚霞/宝石蓝天/艳彩水面(mS>0.30且mSat>0.25)，
        // 无论 VLM 把 intent 报成 crop_right/trim 还是别的，都整条保留（宁缺毋滥，绝不切氛围）。
        // "partial"（显著性方差层次）仍按 intent 门控，尊重 VLM 的取景方向判断。
        if(_vTop==="full"){ nT=0; note="顶部为高彩天空/晚霞，保留不裁"; }
        else if(topHit && _vTop==="partial"){ nT=Math.max(0,T-RETRACT); note="顶部有高价值背景（晚霞/水面层次），已少裁 2% 保留"; }
        if(_vBot==="full"){ nB=0; note=(note?note+"；":"")+"底部为高彩水面/倒影，保留不裁"; }
        else if(botHit && _vBot==="partial"){ nB=Math.max(0,B-RETRACT); note=(note?note+"；":"")+"底部有高价值背景（倒影/地面层次），已少裁 2% 保留"; }
        if(nT===T && nB===B) return null;
        return {crop:[crop[0],nT,crop[2],nB], note:note||"已为高价值背景少裁"};
      }catch(e){ return null; }
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

    function _faceLightSplit(o){
      try{
        if(!o) return null;
        var lg=o.lumGrid, gw=o.gw, gh=o.gh, fb=o.fb;
        if(!Array.isArray(lg)||!lg.length) return null;
        if(typeof gw!=="number"||!isFinite(gw)||gw<4) return null;
        if(typeof gh!=="number"||!isFinite(gh)||gh<4) return null;
        gw=Math.round(gw); gh=Math.round(gh);
        if(lg.length<gw*gh) return null;
        if(!Array.isArray(fb)||fb.length!==4) return null;
        var fx=Math.min(1,Math.max(0,fb[0]||0)), fy=Math.min(1,Math.max(0,fb[1]||0));
        var fw=Math.min(1-fx,Math.max(0,fb[2]||0)), fh=Math.min(1-fy,Math.max(0,fb[3]||0));
        if(fw<1e-3||fh<1e-3) return null;
        var gx0=Math.floor(fx*gw), gx1=Math.ceil((fx+fw)*gw);
        var gy0=Math.floor(fy*gh), gy1=Math.ceil((fy+fh)*gh);
        gx0=Math.max(0,Math.min(gw-1,gx0)); gx1=Math.max(gx0+1,Math.min(gw,gx1));
        gy0=Math.max(0,Math.min(gh-1,gy0)); gy1=Math.max(gy0+1,Math.min(gh,gy1));
        var midX=fx+fw/2, midY=fy+fh/2;
        var l=0,r=0,t=0,b=0,mean=0,nl=0,nr=0,nt=0,nb=0,nm=0,fsum=0,gsum=0,gn=0;
        for(var gy=gy0;gy<gy1;gy++){
          for(var gx=gx0;gx<gx1;gx++){
            var v=lg[gy*gw+gx];
            if(typeof v!=="number"||!isFinite(v)) continue;
            var gxc=(gx+0.5)/gw, gyc=(gy+0.5)/gh;
            gsum+=v; gn++;
            fsum+=v; nm++;
            if(gxc<midX){ l+=v; nl++; } else { r+=v; nr++; }
            if(gyc<midY){ t+=v; nt++; } else { b+=v; nb++; }
          }
        }
        if(nm<4) return null; // 脸太小，格点不足
        return {l:nl?l/nl:0, r:nr?r/nr:0, t:nt?t/nt:0, b:nb?b/nb:0, mean:fsum/nm, frameMean:gn?gsum/gn:128};
      }catch(e){ return null; }
    }

    function _lightPosition(o){
      try{
        if(!o) return null;
        var fc=o.faceConf;
        if(typeof fc!=="number"||!isFinite(fc)||fc<0.75) return null;
        var s=o.split;
        if(!s||typeof s.l!=="number"||!isFinite(s.l)||typeof s.r!=="number"||!isFinite(s.r)
           ||typeof s.t!=="number"||!isFinite(s.t)||typeof s.b!=="number"||!isFinite(s.b)) return null;
        var minLR=Math.min(s.l,s.r), minTB=Math.min(s.t,s.b);
        if(minLR<1e-3||minTB<1e-3) return null; // 除零保护
        var ratioLR=Math.max(s.l,s.r)/minLR;
        var ratioTB=Math.max(s.t,s.b)/minTB;
        if(ratioLR>=2.6) return {key:"split",txt:"光太硬了，把人转回来一点，或给暗面补点亮"};
        if(ratioLR>=1.7 && ratioLR<2.6 && ratioTB<1.4) return {key:"side",txt:"侧光很立体，让脸再转向亮侧一点，暗颧骨下会出现小三角光"};
        if(ratioTB>1.5 && ratioLR<1.3) return {key:"toplight",txt:"头顶光太重，换到阴影里，或等日出后/日落前的柔光"};
        if(ratioLR<1.4 && ratioTB<1.4) return {key:"flat",txt:"光线太平了，让人转到窗边，光从侧前方打来更立体"};
        return null;
      }catch(e){ return null; }
    }

    function _warmLightHint(o){
      try{
        if(!o) return null;
        var wb=o.wb, mean=o.mean, sat=o.sat;
        if(typeof wb!=="number"||!isFinite(wb)||typeof mean!=="number"||!isFinite(mean)||typeof sat!=="number"||!isFinite(sat)) return null;
        if(wb>0.09 && mean>=110 && mean<=200 && sat>=0.15 && sat<=0.60) return {txt:"光线暖柔，趁这束光拍"};
        return null;
      }catch(e){ return null; }
    }

    function _windowLightHint(o){
      try{
        if(!o) return null;
        var fc=o.faceConf;
        if(typeof fc!=="number"||!isFinite(fc)||fc<0.75) return null;
        var s=o.split, ec=o.edgeColMean, mean=o.mean;
        if(!s||typeof s.mean!=="number"||!isFinite(s.mean)||s.mean<1e-3) return null;
        if(typeof ec!=="number"||!isFinite(ec)) return null;
        if(typeof mean!=="number"||!isFinite(mean)) return null;
        if(typeof s.l!=="number"||!isFinite(s.l)||typeof s.r!=="number"||!isFinite(s.r)) return null;
        var minLR=Math.min(s.l,s.r); if(minLR<1e-3) return null;
        var ratioLR=Math.max(s.l,s.r)/minLR;
        if(ratioLR<1.5||ratioLR>=2.4) return null;
        if(ec<=s.mean*1.8) return null;
        if(mean<60||mean>170) return null;
        return {txt:"窗边柔光：人离窗半米、与窗成45°，相机从暗侧拍"};
      }catch(e){ return null; }
    }

    function _lowAngleAdvice(o){
      try{
        if(!o) return null;
        var fa=o.frameAspect, pt=o.personTop, pb=o.personBottom, phr=o.personHR;
        if(typeof fa!=="number"||!isFinite(fa)||fa>=1) return null; // 竖拍
        if(typeof pt!=="number"||!isFinite(pt)||typeof pb!=="number"||!isFinite(pb)||typeof phr!=="number"||!isFinite(phr)) return null;
        if(phr>=0.85 && pt<0.08 && pb>0.90) return {txt:"拍全身：把机位放到腰部以下、微微仰一点，人更显高"};
        return null;
      }catch(e){ return null; }
    }

    function _composeDiagnosis(o){
      try{
        if(!o) return [];
        var out=[];
        function num(v){ return (typeof v==="number"&&isFinite(v))?v:null; }
        // gaze（sev2）：侧脸且脸心明显偏离视线方向三分位
        var yaw=o.yaw, faceCx=num(o.faceCx), gaze=false;
        if(yaw&&yaw.dir!==0&&faceCx!==null){
          var tx=(yaw.dir>0)?0.33:0.67;
          if(Math.abs(faceCx-tx)>0.10){
            out.push({id:"gaze",sev:2,title:"视线方向留白不足",action:"把脸朝向的一侧多留点空"});
            gaze=true;
          }
        }
        // headroom（sev1）
        var ht=num(o.headTop);
        if(ht!==null && (ht<0.04||ht>0.24)){
          out.push({id:"headroom",sev:1,title:"头顶留白不当",action:"头顶留一拳空，别贴顶也别空太多"});
        }
        // eyesY（sev1，与 gaze 同源时只留 gaze）
        var ey=num(o.eyesY);
        if(!gaze && ey!==null && (ey>0.42||ey<0.24)){
          out.push({id:"eyesY",sev:1,title:"眼睛不在上横线",action:"眼睛对上上方横线"});
        }
        // horizon（sev1）：风光类场景地平线居中
        var hr=num(o.horizonRatio);
        if(o.isLandscapeScene===true && hr!==null && Math.abs(hr-0.5)<0.03){
          out.push({id:"horizon",sev:1,title:"地平线卡在正中",action:"天好就压低、地好就抬高到三分之一线"});
        }
        // light（sev2）：split/toplight/flat
        if(o.light && (o.light.key==="split"||o.light.key==="toplight"||o.light.key==="flat") && typeof o.light.txt==="string"){
          out.push({id:"light",sev:2,title:"光线可优化",action:o.light.txt});
        }
        // orientation（sev1）
        if(o.orientation && typeof o.orientation.txt==="string"){
          out.push({id:"orientation",sev:1,title:"画幅方向",action:o.orientation.txt});
        }
        // bgsafe（sev1 提示性）：已自动保住晚霞/水面
        if(o.rodMoved===true){
          out.push({id:"bgsafe",sev:1,title:"已自动保留上方背景",action:"晚霞/水面已自动保留，无需再裁"});
        }
        // bgFace（sev1 只读提示）：背景-脸亮度分离——脸明显比背景暗且平光 → 提示
        try{
          var bgp=_lightDiagnosisPro({frameMean:num(o.frameMean),faceMean:num(o.faceMean),lightKey:(o.light&&o.light.key)||null});
          if(bgp) out.push(bgp);
        }catch(e){}
        out.sort(function(a,b){ return b.sev-a.sev; });
        return out.slice(0,3);
      }catch(e){ return []; }
    }

    function _recommendFilter(a, sig){
      var GATE={filter:null,strength:0,reason:"",rule:"GATE"};
      try{
        if(!a||typeof a!=="object"||typeof a.mean!=="number"||!isFinite(a.mean)) return GATE;
        var mean=a.mean, wb=(typeof a.wb==="number"&&isFinite(a.wb))?a.wb:0;
        var sat=(typeof a.sat==="number"&&isFinite(a.sat))?a.sat:0;
        var sharpness=(typeof a.sharpness==="number"&&isFinite(a.sharpness))?a.sharpness:0;
        var highClip=(typeof a.highClip==="number"&&isFinite(a.highClip))?a.highClip:0;
        var shadowClip=(typeof a.shadowClip==="number"&&isFinite(a.shadowClip))?a.shadowClip:0;
        var lightScore=(typeof a.lightScore==="number"&&isFinite(a.lightScore))?a.lightScore:0;
        var warmRatio=(typeof a.warmRatio==="number"&&isFinite(a.warmRatio))?a.warmRatio:0;
        var waterScore=(typeof a.waterScore==="number"&&isFinite(a.waterScore))?a.waterScore:0;
        var manmadeScore=(typeof a.manmadeScore==="number"&&isFinite(a.manmadeScore))?a.manmadeScore:0;
        var pf=_scenePrefix((sig&&typeof sig.scene==="string")?sig.scene:"", wb);
        function mkR(f,s,r,rule){ return {filter:f,strength:s,reason:pf+r,rule:rule}; }
        // G1 糊片
        if(sharpness<25) return GATE;
        // G2 曝光断层
        if(highClip>0.15||shadowClip>0.28) return GATE;
        // G3 已浓
        if(sat>0.38) return GATE;
        // G4 近纯黑
        if(mean<50) return GATE;
        var ps=(sig&&typeof sig.personScore==="number"&&isFinite(sig.personScore))?sig.personScore:0;
        var pc=(sig&&typeof sig.personCount==="number"&&isFinite(sig.personCount))?sig.personCount:0;
        var scn=(sig&&typeof sig.scene==="string")?sig.scene:null;
        var skinRatio=(typeof a.skinRatio==="number"&&isFinite(a.skinRatio))?a.skinRatio:0;
        // 人像成立（150 图实测标定）：只认 YOLO person≥0.6 硬证据——肤色启发式在风光/食物/建筑/水面图上普遍误中
        // （实测水面图 skinRatio=16% 仍被 isPersonLikely 命中），自动推滤镜宁可漏掉也不硬推。
        var isPerson=(ps>=0.6);
        // lightRatio：从 sigBox 左右半亮度比（与拍前光位同口径）
        var lr=0;
        try{
          if(Array.isArray(a.lumGrid)&&a.gridW>=4&&a.gridH>=4&&Array.isArray(a.sigBox)&&a.sigBox.length===4){
            var gw2=Math.round(a.gridW), gh2=Math.round(a.gridH), bx=a.sigBox;
            var x0=Math.max(0,Math.min(1,bx[0])), x1=Math.max(x0+1e-3,Math.min(1,bx[2]));
            var y0=Math.max(0,Math.min(1,bx[1])), y1=Math.max(y0+1e-3,Math.min(1,bx[3]));
            var gx0=Math.floor(x0*gw2), gx1=Math.ceil(x1*gw2), gy0=Math.floor(y0*gh2), gy1=Math.ceil(y1*gh2);
            var midX=(x0+x1)/2, sl=0,sr=0,nsl=0,nsr=0;
            for(var gy=gy0;gy<gy1;gy++){ for(var gx=gx0;gx<gx1;gx++){
              if(gx<0||gx>=gw2||gy<0||gy>=gh2) continue;
              var v=a.lumGrid[gy*gw2+gx];
              if(typeof v!=="number"||!isFinite(v)) continue;
              if((gx+0.5)/gw2<midX){ sl+=v; nsl++; } else { sr+=v; nsr++; }
            } }
            if(nsl&&nsr){
              var L=sl/nsl, R=sr/nsr;
              if(Math.abs(L-R)>=12){ var mn=Math.min(L,R); if(mn<1e-3){ lr=0; } else { lr=Math.max(L,R)/mn; } }
            }
          }
        }catch(e2){ lr=0; }
        // R6 夜景暖调（v9.5 候选池扩展）：暗景且暖色占比高（城市霓虹/夜市暖光）→ 暖金，压过 R1 冷提亮
        if(mean>=50&&mean<85&&lightScore>=0.30&&warmRatio>=0.45&&scn!=="food"&&scn!=="美食") return mkR("warm",75,"夜色里有暖光，暖金调更有氛围","R6");
        // R1 夜景提亮
        if(mean>=50&&mean<85&&lightScore>=0.30) return mkR("night",80,"夜景偏暗、有点光源，暗部提亮更通透","R1");
        // R2A 侧光黑白人像
        if(isPerson&&lr>=2.0&&mean>=95) return mkR("portrait-mono",60,"侧光人像明暗分明，黑白更衬光影","R2A");
        // R2B 暖调人像（wb 门槛 0.035→0.05 实测标定：普通户外暖调照片 wb≈0.03–0.05 不应推）
        if(isPerson&&wb>0.05) return mkR("portrait-warm",80,"暖光环境，肤色会更通透","R2B");
        // R2C 冷调人像（wb 门槛 -0.035→-0.05）
        if(isPerson&&wb<-0.05&&mean>=105) return mkR("portrait-cool",80,"冷调环境，肤色更清透","R2C");
        // R3 近黑白
        if(sat<0.06&&mean>=75) return mkR("mono",90,"画面本来就低饱和，黑白影调更干净","R3");
        // R5 风光清新通透（v9.5 候选池扩展）：明亮低饱和的风光/街景、非暖黄昏非人像非水面 → 160c 通透
        if(!isPerson&&(scn==="landscape"||scn==="general"||scn==="sunset"||scn==="street")&&mean>=100&&mean<=170&&sat<0.22&&warmRatio<0.30&&waterScore<=0.30&&manmadeScore<=0.50) return mkR("160c",65,"明亮干净的风光，通透一档天空更蓝","R5");
        // R4 黄昏暖景
        if(pc<=1&&warmRatio>=0.42&&wb>0.05&&mean>=85&&mean<=160&&waterScore<=0.30&&manmadeScore<=0.50&&scn!=="food"&&scn!=="美食"){
          return mkR("sunset",70,"黄昏暖景，橙金氛围更浓","R4");
        }
        return {filter:null,strength:0,reason:"",rule:"NONE"};
      }catch(e){ return GATE; }
    }

    function _confBand(s, prev){
      if(typeof s!=="number"||!isFinite(s)) return "hold";
      if(s>=0.65) return "person";
      if(s<=0.45) return "none";
      return (prev==="person"||prev==="none") ? prev : "hold";
    }

    function _medianBox(boxes){
      if(!Array.isArray(boxes)) return null;
      var xs=[],ys=[],ws=[],hs=[],cs=[];
      for(var i=0;i<boxes.length;i++){ var b=boxes[i];
        if(!b||typeof b.x!=="number"||typeof b.y!=="number"||typeof b.w!=="number"||typeof b.h!=="number") continue;
        if(!isFinite(b.x)||!isFinite(b.y)||!isFinite(b.w)||!isFinite(b.h)) continue;
        xs.push(b.x); ys.push(b.y); ws.push(b.w); hs.push(b.h); cs.push(typeof b.conf==="number"&&isFinite(b.conf)?b.conf:0);
      }
      if(xs.length<3) return null;
      function med(a){ a.sort(function(p,q){return p-q;}); return a[Math.floor(a.length/2)]; }
      return {x:med(xs),y:med(ys),w:med(ws),h:med(hs),conf:med(cs)};
    }

    function _consensusPerson(runs){
      if(!Array.isArray(runs)||!runs.length) return {person:false, score:0, box:null};
      var yes=0, boxes=[];
      for(var i=0;i<runs.length;i++){ var r=runs[i]||{};
        if(r.detected){ yes++; if(r.box&&isFinite(r.box.x)) boxes.push(r.box); }
      }
      var person;
      if(runs.length===1){ person = yes>0; }
      else { person = yes > (runs.length-yes); } // 多数决：>=半数+1 才确认
      var score=0, box=null;
      if(person){
        var sc=[];
        for(var j=0;j<runs.length;j++){ if(runs[j]&&runs[j].detected&&typeof runs[j].score==="number"&&isFinite(runs[j].score)) sc.push(runs[j].score); }
        if(sc.length){ sc.sort(function(a,b){return a-b;}); score=sc[Math.floor(sc.length/2)]; }
        if(boxes.length>=3){ box=_medianBox(boxes); }
        else if(boxes.length===1){ box=boxes[0]; }
        else if(boxes.length===2){ box={x:(boxes[0].x+boxes[1].x)/2,y:(boxes[0].y+boxes[1].y)/2,w:(boxes[0].w+boxes[1].w)/2,h:(boxes[0].h+boxes[1].h)/2,conf:(boxes[0].conf+boxes[1].conf)/2}; }
      }
      return {person:person, score:score, box:box};
    }

    function _sceneDebounce(cand, prev){
      prev = prev || {scene:null, pend:null, pc:0, held:0};
      if(cand===prev.scene){ return {scene:cand, pend:null, pc:0, held:prev.held+1, stable:true}; }
      var need = prev.held>=5 ? 5 : 3; // 已稳定>=5帧的场景反向翻转需5帧；未稳3帧即可
      if(cand===prev.pend){
        var pc=prev.pc+1;
        if(pc>=need) return {scene:cand, pend:null, pc:0, held:1, stable:false};
        return {scene:prev.scene, pend:cand, pc:pc, held:prev.held, stable:false};
      }
      return {scene:prev.scene, pend:cand, pc:1, held:prev.held, stable:false};
    }

    function _debangText(seq, prevState){
      prevState = prevState || {key:null, count:0};
      var cur = (Array.isArray(seq)&&seq.length) ? seq[seq.length-1] : null;
      var key = cur ? cur.id : null, txt = cur ? cur.txt : null;
      var st;
      if(key===prevState.key){ st={key:key, count:prevState.count+1}; }
      else { st={key:key, count:1}; }
      st.show = !!key && st.count>=3; // 连续3帧一致才显示
      st.txt = st.show ? txt : null;
      return st;
    }

    function _applyPref(rec, history){
      try{
        if(!rec||typeof rec!=="object"||!rec.filter) return rec;
        if(!Array.isArray(history)||history.length===0) return rec;
        var rule=rec.rule, scene=(typeof rec.scene==="string")?rec.scene:null;
        if(!rule) return rec;
        var rej=0, ado=0;
        for(var i=0;i<history.length;i++){
          var e=history[i]; if(!e||typeof e!=="object") continue;
          if(e.rule!==rule) continue;
          if(scene&&e.scene&&e.scene!==scene) continue;
          if(e.type==='adopt') ado++; else rej++; // 兼容 v9.3 无 type 的旧记录按推翻处理
        }
        if(rej>=3) return {filter:null,strength:0,reason:"",rule:rule+"(PREF)"};
        if(ado>=3){
          var st=(typeof rec.strength==="number"&&isFinite(rec.strength))?rec.strength:0;
          return {filter:rec.filter,strength:Math.min(100,st+10),reason:rec.reason,rule:rule+"(PREF+)"};
        }
        return rec;
      }catch(e){ return rec; }
    }

    function _lightDiagnosisPro(o){
      try{
        if(!o||typeof o.frameMean!=="number"||typeof o.faceMean!=="number"||!isFinite(o.frameMean)||!isFinite(o.faceMean)) return null;
        if(o.frameMean<=0) return null;
        var ratio=o.faceMean/o.frameMean;
        if(ratio>=0.8&&ratio<=1.25) return null; // 均匀棚拍死区不误报
        if(ratio<0.6&&(o.lightKey==="flat"||o.lightKey==null||o.lightKey===undefined)){
          return {id:"bgFace",sev:1,title:"背景比脸亮",action:"换个人站的位置，或让光先打到脸上"};
        }
        return null;
      }catch(e){ return null; }
    }

    function _gazeGuardPro(o){
      try{
        if(!o||typeof o.rNose!=="number"||!isFinite(o.rNose)) return null;
        if(typeof o.eyeSpan!=="number"||!isFinite(o.eyeSpan)||o.eyeSpan<1e-4) return null;
        var rn=o.rNose;
        // 耳距交叉校验：|log(earLR)|>0.15 且符号矛盾 → 不判方向、回退居中
        if(typeof o.earLR==="number"&&isFinite(o.earLR)&&o.earLR>1e-3){
          var lg=Math.log(o.earLR);
          if(Math.abs(lg)>0.15){
            var earDir=(lg>0)?1:-1; var noseDir=(rn>0)?1:-1;
            if(earDir!==noseDir) return null; // 符号矛盾 → 居中，不做 nose room
          }
        }
        var ar=Math.abs(rn);
        if(ar<0.05) return null;                 // 死区：轻微正面不做
        if(ar<0.10) return {dir:(rn>0)?1:-1,noseRoomRatio:1.5}; // 浅侧渐进 1.5:1
        return {dir:(rn>0)?1:-1,noseRoomRatio:2.0};             // 明显侧脸 2:1
      }catch(e){ return null; }
    }

    function _guidanceDistancePro(o){
      if(!o) return null;
      var fc=o.faceConf;
      if(typeof fc!=="number"||!isFinite(fc)||fc<0.75) return null;
      var phr=o.personHR, fhr=o.faceHR;
      if(typeof phr==="number"&&isFinite(phr)){
        if(phr<0.12) return null; // 远景小人豁免
        if(phr>0.90) return {dir:"near",txt:"再退半步，给人物周围留点空间，构图会更松弛"};
        if(phr<0.25) return {dir:"far",txt:"走近一些，人物再大一点"};
        if(phr>=0.35&&phr<=0.75) return {dir:"ok-hold",txt:"距离合适，保持一下"};
        return null;
      }
      if(typeof fhr==="number"&&isFinite(fhr)){
        if(fhr<0.04) return null;
        if(fhr>0.80) return {dir:"near",txt:"再退半步，给人物周围留点空间，构图会更松弛"};
        if(fhr<0.15) return {dir:"far",txt:"走近一些，人物再大一点"};
        return null;
      }
      return null;
    }

    function _guidanceWaistLevel(o){
      if(!o) return null;
      var fc=o.faceConf;
      if(typeof fc!=="number"||!isFinite(fc)||fc<0.75) return null;
      var phr=o.personHR, ht=o.headTop, pb=o.personBottom;
      if(typeof phr!=="number"||!isFinite(phr)||phr<0.85) return null;
      if(typeof ht!=="number"||!isFinite(ht)) return null;
      if(typeof pb!=="number"||!isFinite(pb)) return null;
      var cy=(ht+pb)/2;
      if(!isFinite(cy)) return null;
      if(cy>0.58) return {dir:"down",txt:"机位放低，与腰部齐平，人更显高"};
      if(cy<0.42) return {dir:"up",txt:"机位举高一点，别贴地仰拍"};
      return null;
    }

    function _singlePersonGate(o){
      if(!o) return null;
      var fc=o.faceCount, pc=o.personCount;
      if(typeof fc!=="number"||!isFinite(fc)||typeof pc!=="number"||!isFinite(pc)) return null;
      if(fc>=2||pc>=2) return {applicable:false,txt:"仅适用于单人构图"};
      return {applicable:true};
    }

    function _classifyComposition(o){
      if(!o) return null;
      var fc=o.faceConf;
      if(typeof fc!=="number"||!isFinite(fc)||fc<0.75) return null;
      var phr=o.personHR, fhr=o.faceHR, cx=o.personCx;
      if(typeof phr!=="number"||!isFinite(phr)) return null;
      if(typeof cx!=="number"||!isFinite(cx)) return null;
      if(phr<0.12) return null;
      if(typeof fhr==="number"&&isFinite(fhr)&&fhr<0.04) return null;
      var fcnt=o.faceCount, pcnt=o.personCount;
      if(typeof fcnt==="number"&&fcnt>=2) return null;
      if(typeof pcnt==="number"&&pcnt>=2) return null;
      var yaw=o.yawDir, earOK=o.earSpanOK;
      if((typeof yaw!=="number"||yaw===0)&&!earOK) return null;
      // 景别
      var shot=null;
      if(typeof fhr==="number"&&isFinite(fhr)&&fhr>=0.45) shot="close";
      else if(phr>=0.85 && typeof o.headTop==="number"&&o.headTop<0.08 && typeof o.personBottom==="number"&&o.personBottom>0.92) shot="full";
      else if(phr>=0.45) shot="half";
      else return null; // open 远景不判
      // 类型
      var sym=o.sym, type=null;
      if(typeof sym==="number"&&isFinite(sym)&&sym>=0.75) type="sym";
      else if(cx>=0.30&&cx<=0.42) type="thirds-left";
      else if(cx>=0.58&&cx<=0.70) type="thirds-right";
      else if(cx>=0.46&&cx<=0.54) type="center";
      else return null; // 落缝
      var cn={full:"全身",half:"半身",close:"特写"}[shot]||"";
      var tcn={"sym":"对称构图","thirds-left":"左三分法","thirds-right":"右三分法","center":"中心构图"}[type];
      return {type:type,shotSize:shot,conf:0.7,txt:tcn+"·"+cn+"构图"};
    }

    function _composeOverlay(o){
      var out={gridLines:[],protectBands:[],cropBox:null,anchors:[]};
      if(!o) return out;
      var crop=o.crop;
      if(Array.isArray(crop)&&crop.length===4&&crop.every(function(x){return typeof x==="number"&&isFinite(x);})){
        out.cropBox=[Math.max(0,Math.min(1,crop[0])),Math.max(0,Math.min(1,crop[1])),Math.max(0,Math.min(1,crop[2])),Math.max(0,Math.min(1,crop[3]))];
      }
      var g=o.grid; // thirds/center/sym
      if(g==="thirds-left"||g==="thirds-right"){ out.gridLines=["v1/3","v2/3","h1/3","h2/3"]; }
      else if(g==="center"){ out.gridLines=["center-v","center-h"]; }
      else if(g==="sym"){ out.gridLines=["sym-axis"]; }
      // 保护带（头/脚 6%，仅视觉提示）
      if(o.personBox){
        out.protectBands.push({edge:"top",pct:0.06,label:"头顶留白"});
        out.protectBands.push({edge:"bottom",pct:0.06,label:"脚不贴边"});
      }
      // 锚点：主体重心落在三分交点 ±0.04 → ✓
      var pcx=o.personCx, pcy=o.personCY;
      if(typeof pcx==="number"&&isFinite(pcx)&&typeof pcy==="number"&&isFinite(pcy)){
        var pts=[[1/3,1/3],[2/3,1/3],[1/3,2/3],[2/3,2/3]];
        for(var i=0;i<pts.length;i++){
          if(Math.abs(pcx-pts[i][0])<=0.04&&Math.abs(pcy-pts[i][1])<=0.04){
            out.anchors.push({x:pts[i][0],y:pts[i][1],label:"✓"}); break;
          }
        }
      }
      return out;
    }

    function _finalPipelinePlan(o){
      if(!o) return {crop:[0,0,0,0],filter:null,strength:0,reason:"",views:{compare:true,final:true},applyNote:""};
      var pref=o.prefRec||{};
      var f=pref.filter||null;
      var out={
        crop:Array.isArray(o.crop)&&o.crop.length===4?o.crop.slice():[0,0,0,0],
        filter:f,
        strength:f?(pref.strength||80):0,
        reason:f?(pref.reason||""):"",
        views:{compare:true,final:true},
        applyNote:f?("已自动裁切＋套「"+f+"」，点原片可一键回到原图"):"已自动裁切，无合适滤镜（宁缺毋滥），点原片可回到原图"
      };
      return out;
    }

    function _classifyMulti(o){
      if(!o||!Array.isArray(o.persons)) return null;
      var ps=o.persons.filter(function(p){return p&&typeof p.h==="number"&&isFinite(p.h)&&typeof p.cx==="number"&&isFinite(p.cx)&&(typeof p.score!=="number"||p.score>=0.5);});
      var nP=ps.length;
      if(nP<2||nP>3) return null;
      // 场景门控
      var sc=o.sceneType||o.cloudScene||"";
      if(["night","waterscape","landscape","architecture","flower","food","dessert","pet","animal"].indexOf(sc)>=0) return null;
      // 按高度降序
      ps.sort(function(a,b){return b.h-a.h;});
      var mainH=ps[0].h;
      if(mainH<0.25) return null;
      var secH=ps[1].h;
      if(secH/mainH<0.55) return null;
      // 水平间距：主/次框中心距 ≥0.12
      var gap=Math.abs(ps[0].cx-ps[1].cx);
      if(gap<0.12) return null;
      if(nP===2) return {kind:"duo",nP:nP,txt:"双人构图",conf:0.7};
      return {kind:"trio",nP:nP,txt:"三人合影",conf:0.7};
    }

    function _scenePrefix(scn, wb){
      if(scn==="portrait"||scn==="portrait_close"||(scn==="general"&&typeof wb==="number"&&wb>0)) return "阳光人像·";
      if(scn==="landscape"||scn==="waterscape"||scn==="sunset") return "户外绿意·";
      if(scn==="street") return "秋日街道·";
      if(scn==="night") return "夜景·";
      return "";
    }

    function _sceneComposeTip(o){
      if(!o) return null;
      var fc=o.faceConf;
      if(typeof fc==="number"&&isFinite(fc)&&fc<0.75) return null;
      var sc=o.sceneType||"";
      if(sc==="night") return null;
      var phr=o.personHR;
      if(typeof phr==="number"&&isFinite(phr)&&phr>0.7) return null;
      if((sc==="architecture"||sc==="landscape")&&o.hasLandmark){
        if(typeof phr==="number"&&isFinite(phr)&&phr>=0.25&&phr<=0.55
          &&typeof o.personCY==="number"&&isFinite(o.personCY)&&o.personCY>0.55){
          return {id:"landmark-split",txt:"人站下三分之一，地标放上半交点，两侧留空"};
        }
      }
      if(o.leadingLine&&(typeof o.personCount!=="number"||o.personCount===1)){
        return {id:"leading-line",txt:"顺着这根线条引导视线，人落在三分交点上"};
      }
      if(sc==="architecture"&&typeof o.sym==="number"&&isFinite(o.sym)&&o.sym>=0.7&&!o.hasSideEdge){
        return {id:"center-vs-thirds",txt:"建筑正对你，居中更稳；有侧景再用三分法"};
      }
      return null;
    }

    function _aimAlign(o){
      if(!o) return null;
      if(typeof o.faceConf==="number"&&isFinite(o.faceConf)&&o.faceConf<0.75) return null;
      if(typeof o.faceCount==="number"&&o.faceCount>1) return null;
      var cx=o.personCx, cy=o.personCY;
      if(typeof cx!=="number"||!isFinite(cx)||typeof cy!=="number"||!isFinite(cy)) return null;
      var t=o.alignTarget;
      if(!t||typeof t.x!=="number"||!isFinite(t.x)||typeof t.y!=="number"||!isFinite(t.y)) return null;
      cx=Math.min(1,Math.max(0,cx)); cy=Math.min(1,Math.max(0,cy));
      var dx=cx-t.x, dy=cy-t.y;
      if(Math.abs(dx)<0.05&&Math.abs(dy)<0.06){
        return {dir:"locked",dx:dx,dy:dy,txt:"对准了，稳住手机"};
      }
      if(dx>0.08) return {dir:"left",dx:dx,dy:dy,txt:"向左移一点，让人落在三分线上"};
      if(-dx>0.08) return {dir:"right",dx:dx,dy:dy,txt:"向右移一点，让人落在三分线上"};
      if(dy>0.10) return {dir:"up",dx:dx,dy:dy,txt:"手机举高一点，人再往上走一点"};
      if(-dy>0.10) return {dir:"down",dx:dx,dy:dy,txt:"手机放低一点，给头顶留空"};
      return null;
    }

    function _composeVariants(o){
      if(!o) return null;
      if(typeof o.faceConf==="number"&&isFinite(o.faceConf)&&o.faceConf<0.75) return null;
      if(typeof o.faceCount==="number"&&o.faceCount>1) return null;
      var sc=o.sceneType||"";
      if(sc==="night") return null;
      var phr=o.personHR;
      if(typeof phr!=="number"||!isFinite(phr)||phr<0.3||phr>0.8) return null;
      var thirds=(o.yawDir==="right")?"left":"right";
      var thirds2=(thirds==="left")?"right":"left";
      return [
        {shot:"half",thirds:thirds,txt:"半身·"+(thirds==="left"?"左三分":"右三分")},
        {shot:"seven-tenths",thirds:thirds2,txt:"七分身·"+(thirds2==="left"?"左三分":"右三分")}
      ];
    }

    function _deadZoneStrength(energy, h){
      var E_DEAD=0.12;
      var out={top:{strength:0,strip:0}, bottom:{strength:0,strip:0}};
      if(!energy || !h || energy.length<h) return out;
      // 全空白图（整体无内容）→ 不是"边条死区"，strength 置 0
      var maxE=0; for(var k=0;k<energy.length;k++){ if(energy[k]>maxE) maxE=energy[k]; }
      if(maxE<E_DEAD) return out;
      var dt=0; while(dt<h && energy[dt]<E_DEAD) dt++;
      var db=0; while(db<h && energy[h-1-db]<E_DEAD) db++;
      out.top.strength=dt/h; out.top.strip=dt/h;
      out.bottom.strength=db/h; out.bottom.strip=db/h;
      return out;
    }

    function _cropIntentFromBox(crop){
      if(!crop||crop.length!==4) return "none";
      var L=crop[0]/100,T=crop[1]/100,R=crop[2]/100,B=crop[3]/100;
      var vL=L,vT=T,vR=R,vB=B, vSum=vL+vT+vR+vB, vMax=Math.max(vL,vT,vR,vB);
      if(vSum<0.015) return "none";
      var vH=vL+vR, vV=vT+vB;
      if(vV>vH*1.6 && vT>0.01 && vB>0.01) return "crop_tb";
      if(vH>vV*1.6 && vL>0.01 && vR>0.01) return "crop_lr";
      if(vMax<0.03) return "trim";
      var map=["crop_left","crop_top","crop_right","crop_bottom"], arr=[vL,vT,vR,vB];
      return map[arr.indexOf(vMax)];
    }

    function _directionsOppose(a,b){
      if(!a||!b) return false;
      var top=["crop_top"],bot=["crop_bottom"],left=["crop_left"],right=["crop_right"];
      function has(s,x){ return s.indexOf(x)>=0; }
      return ( (has(top,a)&&has(bot,b)) || (has(bot,a)&&has(top,b)) ||
               (has(left,a)&&has(right,b)) || (has(right,a)&&has(left,b)) );
    }

    function _hardProtectionHit(L, aiData){
      try{
        var d=aiData||{};
        var flags=d.flags||{};
        if(flags.cutFace||flags.cutJoint||flags.cutObject||flags.cutHighSat) return true;
        return false;
      }catch(e){ return false; }
    }

    function _localConf(L){
      try{
        var s=L||0;
        var base=50;
        if(L && L.tier==="strong") base=80;
        else if(L && L.tier==="weak") base=62;
        else base=45;
        return Math.max(30, Math.min(95, Math.round(base)));
      }catch(e){ return 50; }
    }

    function _extractIntentLocal(a, plan){
      try{
        var p=plan||{};
        var crop=(p.crop||[0,0,0,0]).map(function(v){return Math.round(v);});
        var dz=_deadZoneStrength((a&&a.rowEnergy)||[], (a&&a.h)||0);
        var topS=dz.top.strength, botS=dz.bottom.strength;
        var maxS=Math.max(topS,botS);
        var tier = maxS>=0.5 ? "strong" : (maxS>=0.25 ? "weak" : "none");
        var direction=_cropIntentFromBox(crop);
        return {
          version:"v1117",
          deadZone:dz, tier:tier,
          topTier: topS>=0.5?"strong":(topS>=0.25?"weak":"none"),
          bottomTier: botS>=0.5?"strong":(botS>=0.25?"weak":"none"),
          direction:direction, lCrop:crop,
          rule:p.ruleKey, conf:_localConf(null), sceneType:p.sceneType,
          hardProtection:false,
          signals:{ hSym:(a&&a.hSym)||0, vSym:(a&&a.vSym)||0, mean:(a&&a.mean)||0, sat:(a&&a.sat)||0 }
        };
      }catch(e){
        return {version:"v1117",deadZone:{top:{strength:0,strip:0},bottom:{strength:0,strip:0}},tier:"none",direction:"none",lCrop:[0,0,0,0],signals:{},hardProtection:false};
      }
    }

    function _parseIntentCloud(obj, L){
      try{
        var o=obj||{};
        var keepOriginal=(o.keepOriginal===true);
        var ci=o.cropIntent||"none";
        var allow=["crop_top","crop_bottom","crop_tb","crop_left","crop_right","crop_lr","trim","none"];
        if(allow.indexOf(ci)<0) ci="none";
        // P1-5：裁/不裁置信拆分
        var decisionConf=o.decisionConf!=null?o.decisionConf:(o.conf!=null?o.conf:50);
        decisionConf=Math.max(0,Math.min(100,decisionConf));
        var cropConf, keepConf, confMissing=(o.decisionConf==null);
        if(keepOriginal){ cropConf=0; keepConf=decisionConf; }
        else { keepConf=0; cropConf=decisionConf; }
        var C={
          keepOriginal:keepOriginal, cropIntent:ci,
          cropConf:cropConf, keepConf:keepConf, confMissing:confMissing,
          hasReflection:false, symmetry:"none", flags:{},
          checklist:[]
        };
        // P1-6：hasReflection 像素否决豁免（water/底部高色带不否决）
        if(o.hasReflection===true){
          var hSym=(L&&L.signals&&L.signals.hSym)||0;
          if(hSym<0.15){
            var exempt=(L&&L.sceneType==="waterscape")||((L&&L.signals&&L.signals.bottomRod)===true);
            if(!exempt) C.hasReflection=false; else { C.hasReflection=true; }
          } else { C.hasReflection=true; }
        }
        // v11.18.0：新结构化字段枚举白名单校验
        var symAllow=["none","horizontal","vertical","both"];
        C.symmetry=(symAllow.indexOf(o.symmetry)>=0)?o.symmetry:"none";
        if(o.symmetry==="h") C.symmetry="horizontal";
        else if(o.symmetry==="v") C.symmetry="vertical";
        var atmAllow=["none","sunset_sky","blue_sky","water_reflection","neon_night","cloud_sea","clean_dead"];
        C.atmosphere=(atmAllow.indexOf(o.atmosphere)>=0)?o.atmosphere:"none";
        var csAllow=["light","medium","heavy"];
        C.cropStrength=(csAllow.indexOf(o.cropStrength)>=0)?o.cropStrength:"medium";
        // checklist 五保护项（任一 true → 仲裁器据此保守）
        var chk=o.checklist||{};
        C.checklist={
          cut_head: chk.cut_head===true, cut_limb: chk.cut_limb===true,
          cut_reflection: chk.cut_reflection===true, break_symmetry: chk.break_symmetry===true,
          cut_guiding_line: chk.cut_guiding_line===true
        };
        // 跨字段一致校验：氛围类（非 clean_dead）→ 云端强保留，抬 keepConf
        if(!keepOriginal && C.atmosphere!=="none" && C.atmosphere!=="clean_dead"){
          C.hasValueAtmosphere=true;
        }
        // 矛盾字段：cropIntent 与 keepOriginal 冲突时 keepOriginal 优先
        if(keepOriginal && ci!=="none"){ C.cropIntent="none"; }
        return C;
      }catch(e){
        return {keepOriginal:true,cropIntent:"none",cropConf:0,keepConf:50,confMissing:true,hasReflection:false,symmetry:"none",flags:{},checklist:[]};
      }
    }

    function _negotiateBox(lCrop, cCrop, aiData){
      try{
        function retain(c){ return 1-((c[0]+c[1]+c[2]+c[3])/100); }
        var lr=retain(lCrop), cr=retain(cCrop);
        if(Math.abs(lr-cr)<0.05){
          // 打平：取裁得更少者（更保守）
          var ls=lCrop[0]+lCrop[1]+lCrop[2]+lCrop[3], cs=cCrop[0]+cCrop[1]+cCrop[2]+cCrop[3];
          return {crop:(ls<=cs?lCrop:cCrop), reason:"双脑分歧折中，取保留面积大者"};
        }
        return {crop:(lr>=cr?lCrop:cCrop), reason:"双脑分歧折中，取保留面积大者"};
      }catch(e){ return {crop:lCrop, reason:"折中兜底"}; }
    }

    function _arbitrateCrop(L, C, cCrop, aiData){
      var Z=[0,0,0,0];
      function abstain(reason){ return {crop:Z, tag:"⏸", source:"abstain", reason:reason, abstained:true}; }
      function pickLocal(reason){ return {crop:(L.lCrop||Z), tag:"📷", source:"local", reason:reason, abstained:false}; }
      function pickCloud(cc,reason){ return {crop:(cc||Z), tag:"☁️", source:"cloud", reason:reason, abstained:false}; }
      function negotiate(){ var r=_negotiateBox(L.lCrop||Z, cCrop||Z, aiData); return {crop:r.crop, tag:"⚖️", source:"negotiate", reason:r.reason, abstained:false}; }
      try{
        if(!L||!C) return abstain("本地或云端意图缺失，保留原图");
        // 0) 硬保护前置（P1-4）
        if(_hardProtectionHit(L, aiData)) return abstain("硬保护命中（人脸/关节/物体/高彩），保留原图");
        var lStrong=(L.tier==="strong");
        var lWeak=(L.tier==="weak");
        var cKeep=(C.keepOriginal===true||C.cropIntent==="none"||C.cropIntent==="keep");
        var cCropB=(!cKeep);
        var opp=_directionsOppose(L.direction, C.cropIntent);
        // R1：本地强死区，云端高确认同向（cropConf>=50 且非缺失）→ 听本地
        if(lStrong && cCropB && !opp && C.cropConf>=50 && !C.confMissing) return pickLocal("本地强死区，云端同向确认");
        // R2：本地弱/无死区，云端强裁（cropConf>=60）→ 听云端框
        if(!lStrong && cCropB && C.cropConf>=60) return pickCloud(cCrop,"本地弱证据，云端强裁确认");
        // R3：本地强死区 vs 云端反对/反方向
        if(lStrong && (cKeep||opp)){
          // R3a：云端强保留（keepConf>=70，含方向相反）→ 弃权保原图（不裁可逆）
          if(C.keepConf>=70) return abstain("本地强裁 vs 云端强保留，保留原图");
          return negotiate();
        }
        // R4：双不裁
        if((L.tier==="none"||lWeak) && cKeep) return {crop:Z, tag:"⚖️", source:"agree", reason:"双不裁", abstained:false};
        // R-conf：云端返回但置信缺失 → 本地框力度减半
        if(lStrong && cCropB && C.confMissing){
          return {crop:L.lCrop.map(function(v){return Math.round(v*0.5);}), tag:"⚖️", source:"negotiate", reason:"本地强死区，云端置信缺失，力度减半", abstained:false};
        }
        // R7：本地强死区，云端低置信（非缺失）→ 本地框×0.5
        if(lStrong && cCropB && C.cropConf<50){
          return {crop:L.lCrop.map(function(v){return Math.round(v*0.5);}), tag:"⚖️", source:"negotiate", reason:"本地强死区，云端低置信，力度减半", abstained:false};
        }
        return abstain("未匹配仲裁规则，默认不裁");
      }catch(e){ return abstain("仲裁异常，保留原图"); }
    }

    function _hueInWarmBand(h,lo,hi){ if(h==null) return false; h=((h%360)+360)%360; return h>=lo||h<=hi; }

    function _sunsetWarmGuard(crop,info){
      if(!crop||!crop.length||!crop[1]) return crop;
      var b=info&&info.topBandHsv; if(!b) return crop;
      if(!_hueInWarmBand(b.h,330,30)) return crop;
      if(b.v<0.55) return crop;
      if(b.ratio<=0.40) return crop;
      return [crop[0],0,crop[2],crop[3]]; // 暖霞顶带保留：顶边不裁
    }

    function _foodMisClassGuard(crop,info){
      if(!crop||!crop.length) return crop;
      if(!info||info.sceneType!=="food") return crop;
      if(!info.bandSat||info.bandSat>=0.25) return crop;
      if(!info.hasFoodEvidence) return crop;
      return [crop[0],0,crop[2],0]; // food 弱证据：顶/底边不裁（防桌面误当死区）
    }

    function _symmetryGuard(crop,info){
      if(!crop||!crop.length) return crop;
      var s=info&&info.symEdge; if(!s) return crop;
      if(s.eRatio<0.5||s.eRatio>2.0) return crop;
      if(s.var<=8000) return crop;
      if(s.ncc<=0.60) return crop;
      // 真对称：左右不裁（保对称轴）；顶/底裁减半（倒影/建筑垂直对称也保护）
      return [0, Math.round(crop[1]*0.4), 0, Math.round(crop[3]*0.4)];
    }

    function _decloudPlan(p){
      if(!p||typeof p!=="object") return p;
      var o={}; for(var k in p){ if(Object.prototype.hasOwnProperty.call(p,k)) o[k]=p[k]; }
      o.cloud=false; delete o.cloudPending; delete o.cloudSkipped;
      return o;
    }

    function _bandSatSignal(data,w,h,frac){
      try{
        frac=frac||0.40;
        if(!data||!(data.length>=4)||!(w>1)||!(h>1)) return 0.25;
        var y1=Math.round(h*frac), n=0, s=0;
        for(var y=0;y<y1;y++){ for(var x=0;x<w;x++){
          var i=(y*w+x)*4, r=data[i]/255, g=data[i+1]/255, b=data[i+2]/255;
          var mx=Math.max(r,g,b), mn=Math.min(r,g,b);
          n++; s+=(mx>1e-6?(mx-mn)/mx:0);
        } }
        return n? s/n : 0.25;
      }catch(e){ return 0.25; }
    }

    function _symEdgeSignal(lumGrid,gw,gh,edgeCol,w,lum,h){
      try{
        if(!lumGrid||!(gw>=4)||!(gh>=2)) return {ncc:0,eRatio:1,var:0};
        var hw=Math.floor(gw/2), nP=0, sL=0, sR=0, sLL=0, sRR=0, sLR=0;
        for(var gy=0;gy<gh;gy++){ for(var gx=0;gx<hw;gx++){
          var L=lumGrid[gy*gw+gx], R=lumGrid[gy*gw+(gw-1-gx)];
          nP++; sL+=L; sR+=R; sLL+=L*L; sRR+=R*R; sLR+=L*R;
        } }
        if(!nP) return {ncc:0,eRatio:1,var:0};
        var mL=sL/nP, mR=sR/nP;
        var vL=Math.max(0,sLL/nP-mL*mL), vR=Math.max(0,sRR/nP-mR*mR);
        var cov=Math.max(0,sLR/nP-mL*mR);
        var ncc=(vL>1&&vR>1)?cov/Math.sqrt(vL*vR):0;
        var eRatio=1;
        if(edgeCol&&w>1){
          var hw2=Math.floor(w/2), eL=0, eR=0;
          for(var ex=0;ex<w;ex++){ if(ex<hw2) eL+=edgeCol[ex]; else eR+=edgeCol[ex]; }
          eRatio=eR>1e-6?eL/eR:1;
        }
        var gVar=0;
        if(lum&&w>1&&h>1){
          var hw3=Math.floor(w/2), c=0, s1=0, s2=0;
          for(var yy=0;yy<h;yy++){ for(var xx=0;xx<hw3;xx++){ var vv=lum[yy*w+xx]; c++; s1+=vv; s2+=vv*vv; } }
          gVar=c? Math.max(0,s2/c-(s1/c)*(s1/c)) : 0;
        }
        return {ncc:ncc,eRatio:eRatio,var:gVar};
      }catch(e){ return {ncc:0,eRatio:1,var:0}; }
    }

    function _foodEvidenceSignal(warmRatio,lum,w,h){
      try{
        if(!(warmRatio>=0.12)) return false;
        if(!lum||!(w>1)||!(h>1)) return false;
        var y0=Math.round(h*0.45), c=0, s1=0, s2=0;
        for(var y=y0;y<h;y++){ for(var x=0;x<w;x++){ var vv=lum[y*w+x]; c++; s1+=vv; s2+=vv*vv; } }
        if(!c) return false;
        var lv=Math.max(0,s2/c-(s1/c)*(s1/c));
        return lv>=800 && lv<=9000;
      }catch(e){ return false; }
    }

module.exports = { _deriveCrop, _smartCrop, _landscapeCrop, _classifyYaw, _gazeGuard, _edgeSnap, _rodGuard, _cloudCropIntentGuard, _jointGuard, _objectGuard, _portraitFraming, _aspectCrop, _figureGround, _yoloNMS, _estTiltDeg, _guidanceEyeLevel, _guidanceEyeOnGrid, _guidanceDistance, _guidanceOrientation, _faceLightSplit, _lightPosition, _warmLightHint, _windowLightHint, _lowAngleAdvice, _composeDiagnosis, _recommendFilter, _confBand, _medianBox, _consensusPerson, _sceneDebounce, _debangText, _applyPref, _lightDiagnosisPro, _gazeGuardPro, _guidanceDistancePro, _guidanceWaistLevel, _singlePersonGate, _classifyComposition, _composeOverlay, _finalPipelinePlan, _classifyMulti, _scenePrefix, _sceneComposeTip, _aimAlign, _composeVariants, _deadZoneStrength, _cropIntentFromBox, _directionsOppose, _hardProtectionHit, _localConf, _extractIntentLocal, _parseIntentCloud, _negotiateBox, _arbitrateCrop, _hueInWarmBand, _sunsetWarmGuard, _foodMisClassGuard, _symmetryGuard, _decloudPlan, _bandSatSignal, _symEdgeSignal, _foodEvidenceSignal };
