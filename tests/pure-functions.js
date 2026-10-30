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
      // v13.2.3 诊断：GATE 也要说清是哪道闸门（不弹横幅，但 QA/设置页能看到原因）
      function _gate(why){ return {filter:null,strength:0,reason:String(why||""),rule:"GATE"}; }
      try{
        if(!a||typeof a!=="object"||typeof a.mean!=="number"||!isFinite(a.mean)) return GATE;
        var mean=a.mean, wb=(typeof a.wb==="number"&&isFinite(a.wb))?a.wb:0;
        var sat=(typeof a.sat==="number"&&isFinite(a.sat))?a.sat:0;
        var sharpness=(typeof a.sharpness==="number"&&isFinite(a.sharpness))?a.sharpness:0;
        var contrast=(typeof a.contrast==="number"&&isFinite(a.contrast))?a.contrast:0;
        var highClip=(typeof a.highClip==="number"&&isFinite(a.highClip))?a.highClip:0;
        var shadowClip=(typeof a.shadowClip==="number"&&isFinite(a.shadowClip))?a.shadowClip:0;
        var lightScore=(typeof a.lightScore==="number"&&isFinite(a.lightScore))?a.lightScore:0;
        var warmRatio=(typeof a.warmRatio==="number"&&isFinite(a.warmRatio))?a.warmRatio:0;
        var waterScore=(typeof a.waterScore==="number"&&isFinite(a.waterScore))?a.waterScore:0;
        var manmadeScore=(typeof a.manmadeScore==="number"&&isFinite(a.manmadeScore))?a.manmadeScore:0;
        var pf=_scenePrefix((sig&&typeof sig.scene==="string")?sig.scene:"", wb);
        // v13.2：光影几何提前算——它既是候选池白名单的依据，也是“高光断层”闸门对明暗作品的例外依据。
        var _lgF=null; try{ _lgF=_lightGeometry(a); }catch(e){}
        // “明暗作品”两类：① 低照度且有层次（lowKey）；② 接近黑白但反差大（去色后只剩光影）。
        var _shadowWork=!!(_lgF&&_lgF.ok&&(_lgF.lowKey||(sat<=0.06&&contrast>=55)));
        // 暗调美食/晚霞不是“光影作品”：v13.1 的 P1-3 结论是暗调美食要暖要亮，晚霞要保留蓝橙过渡。
        // 它们不参与白名单，也不享受高光放宽（否则会把“提亮”放到本来就快爆的高光上）。
        var _scnE=(sig&&typeof sig.scene==="string")?sig.scene:null;
        var _atmE=(sig&&typeof sig.atmosphere==="string")?sig.atmosphere:null;
        var _foodSceneEarly=(_scnE==="food"||_scnE==="美食");
        var _shadowExcluded=_foodSceneEarly||_atmE==="sunset_sky"||_scnE==="sunset";
        // G1-G5 硬闸门（安全底线不松；v13.0.0 对“暗但有层次”的场景放行轻度 night 滤镜）
        if(sharpness<25) return _gate("糊片"); // 糊片
        if(highClip>0.15){
          // 明暗作品本就允许高光“过一点”（光束/亮窗是主体），白名单四档都不抬亮部；
          // 但 24% 以上仍视为断层，宁可不推。
          if(!_shadowWork||_shadowExcluded||highClip>0.24) return _gate("高光断层"); // 高光断层
        }
        if(highClip>0.12 && shadowClip>0.35) return _gate("逆光剪影"); // 逆光剪影：保留蓝橙过渡，不自动加色
        if(shadowClip>0.28){
          // 暗部很大但画面有明确亮部/对比（如地下通道的光束）→ 允许温和提亮；死黑平坦画面仍拦截
          // v13.2：明暗作品只要“亮区成块 + 反差足够”就放行（实测 ls10 均值39.99 被 >=40 卡掉 0.01）
          var _darkLayered=(mean>=40 && contrast>=45) || (_shadowWork && contrast>=45 && _lgF.litRatio>=0.12);
          if(!_darkLayered) return _gate("暗部死黑且平");
        }
        // v13.2.3：低照度/明暗作品的白名单四档本来就不加饱和（只降/去色），
        // 不能因为霓虹夜景 sat 高就一刀切沉默；只有非光影作品才拦“明亮且过饱和/极端过饱和”。
        var _shadowSafe=_shadowWork && !_shadowExcluded;
        if(sat>0.52 && mean>=80 && !_shadowSafe) return _gate("明亮且过饱和"); // 明亮且已浓，避免“塑料感”
        if(sat>0.72 && !_shadowSafe) return _gate("极端过饱和"); // 极端过饱和
        if(mean<38){
          // 近纯黑：没有可辨认的亮区结构才判死；有亮区（≥12%）的暗调作品仍可给“不抬黑位”的四档
          if(!(_shadowWork && contrast>=45 && _lgF.litRatio>=0.12)) return _gate("近纯黑");
        }
        if(mean<48 && contrast<35) return _gate("暗且平"); // 暗且平，提亮只会发灰
        var ps=(sig&&typeof sig.personScore==="number"&&isFinite(sig.personScore))?sig.personScore:0;
        var pc=(sig&&typeof sig.personCount==="number"&&isFinite(sig.personCount))?sig.personCount:0;
        var scn=(sig&&typeof sig.scene==="string")?sig.scene:null;
        var atm=(sig&&typeof sig.atmosphere==="string")?sig.atmosphere:null;
        // v12.26.0: 云端 VLM 的 scene/atmosphere 是语义证据，优先于纯像素阈值；
        // v12.28.0: 假人像防御——云端说 portrait，但本地没有人脸/肤色/人体证据时，不按人像推滤镜。
        var _scnPort=(scn==="portrait"||scn==="portrait_close");
        var _portEvidence=(ps>=0.35)||(pc>0)||(a.faceAvailable===true)||(typeof a.skinRatio==="number"&&a.skinRatio>=0.04)||(a.isPersonLikely===true);
        var isPerson=(ps>=0.6)||(_scnPort&&_portEvidence);

        // === 场景感知候选打分（v12.28.0：云端语义 + 本地像素双证据）===
        // 场景判定
        var scene="general";
        // v13.1.0：暗调美食不再被误判成夜景（外部审计 P1-3）。只在"有真实食物证据（下半区暖色团块 +
        // 亮度方差像一盘菜）+ 画面偏暗 + 暖色不在天空带"时才判食物，避免把晚霞暖调整片误当美食。
        var _topWarm=(a.topBandHsv&&typeof a.topBandHsv.ratio==="number")?a.topBandHsv.ratio:0;
        var _foodLike=(a.hasFoodEvidence===true)&&mean<115&&!(_topWarm>0.3);
        if(isPerson) scene="portrait";
        else if(scn==="food"||scn==="美食"||_foodLike) scene="food";
        else if(scn==="night"||(mean<85&&lightScore>=0.3)) scene="night";
        // v13.2.1：暖木桌/砖墙也会 warmRatio≥0.42，不能单凭暖色就判晚霞。
        // 建筑/街拍/美食/人像这些“语义场景”需要云端 atmosphere=sunset_sky 才走日落池。
        else if(atm==="sunset_sky"||(warmRatio>=0.42&&wb>0.05&&mean>=85&&mean<=160&&!/^(architecture|street|food|portrait|portrait_close)$/.test(scn||""))) scene="sunset";
        else if(scn==="waterscape"||atm==="water_reflection"||waterScore>=0.4) scene="water";
        else if(scn==="architecture") scene="architecture";
        else if(scn==="street") scene="street";
        else if(scn==="animal") scene="animal";
        else if(scn==="landscape") scene="outdoor";

        // 候选滤镜池（按场景）
        var POOLS={
          portrait:["portra","ektar","portrait-warm","portrait-cool","portrait-mono","japan","provia"],
          food:["portra","warm","sunset","c200","hk"],
          night:["night","cyber","teal","chrome","cool"],
          sunset:["sunset","teal","warm","cine","hk"],
          water:["160c","velvia","cool","provia","natural"],
          architecture:["chrome","classic","mono-warm","provia","cool"],
          street:["chrome","classic","hk","cool","provia"],
          animal:["natural","portra","provia","warm","japan"],
          outdoor:["velvia","160c","provia","chrome","fade"],
          general:["natural","provia","morandi","fade","classic"]
        };
        var pool=POOLS[scene]||POOLS.general;
        // v13.2：低照度/光影作品用白名单硬覆盖（不是扣分）。研究结论：提亮会爆高光、抬黑位会毁氛围、
        // 人像胶片(portra)本身抬黑位，与 low-key 结构相反。判据见 _lightGeometry + docs/research/v13.2-light-shadow.md
        if(_shadowWork && !_shadowExcluded){
          // 排序按证据：① 明确冷光源（冷水面/夜景且 wb<-0.02）才优先冷银；
          // ② 接近黑白的明暗作品优先银盐（去色只剩几何）；③ 其余优先“保真暗调”（最安全）。
          // 饱和霓虹夜景优先“保真暗调”，不要被冷银去色（colorful 夜景把颜色当主体）
          var _cold=(wb<-0.02)&&sat<=0.55&&(scn==="night"||scn==="waterscape"||scene==="night"||scene==="water");
          if(_cold) pool=["lowkey-cool","lowkey-mono","lowkey-keep","lowkey-amber"];
          else if(sat<=0.06) pool=["lowkey-mono","lowkey-keep","lowkey-amber","lowkey-cool"];
          else pool=["lowkey-keep","lowkey-mono","lowkey-amber","lowkey-cool"];
        }
        // v13.6.0：黑白硬闸门（证据驱动，不只扣分）。色彩即主体的场景——美食/晚霞/暖调/人像肤色——
        // 一律把黑白/冷银从候选池剔除，绝不让 mono 靠“低饱和加分”翻盘（修 sky_5 美食被推 mono）。
        var _monoKeys=["mono","mono-warm","silver","portrait-mono","lowkey-mono","lowkey-cool"];
        var _warmSubject=(scene==="food"||scene==="sunset"||warmRatio>0.4||isPerson);
        if(_warmSubject){
          pool=pool.filter(function(f){ return _monoKeys.indexOf(f)<0; });
        }
        // v13.6.0：低饱和中性画面（建筑/街拍/通用纹理）才补黑白候选；concat 改为去重 push，避免同一键重复打分。
        if(sat<0.06 && !_warmSubject && (scene==="architecture"||scene==="street"||scene==="general")){
          ["mono","mono-warm","chrome"].forEach(function(f){ if(pool.indexOf(f)<0) pool.push(f); });
        }

        // 打分函数：每个候选 0-100 分
        function scoreFilter(f){
          var s=0;
          // 基础分：场景匹配
          if(pool.indexOf(f)>=0) s+=30;
          // 低饱和画面推高饱和，高饱和画面推低饱和/中性
          if(sat<0.15&&["velvia","160c","ektar","sunset","cyber","vivid"].indexOf(f)>=0) s+=20;
          if(sat>0.25&&["morandi","fade","classic","japan","provia"].indexOf(f)>=0) s+=15;
          // 暖调画面推暖色，冷调推冷色
          if(wb>0.03&&["warm","sunset","portra","portrait-warm","c200","hk"].indexOf(f)>=0) s+=15;
          if(wb<-0.03&&["cool","chrome","classic","160c","portrait-cool"].indexOf(f)>=0) s+=15;
          // 暗画面推提亮/霓虹（食物除外：暗调美食要暖要亮，不要夜景冷调）
          if(mean<90&&["night","cyber","teal"].indexOf(f)>=0) s+=(_foodLike?-25:20);
          if(mean<90&&["morandi","fade","japan"].indexOf(f)>=0) s-=10;
          // 人像推肤色友好
          if(isPerson&&["portra","ektar","portrait-warm","portrait-cool","portrait-mono","japan"].indexOf(f)>=0) s+=15;
          // 食物推暖食欲色
          if(scene==="food"&&["portra","warm","sunset","c200","hk"].indexOf(f)>=0) s+=15;
          // 风光推通透
          if(scene==="outdoor"||scene==="water"){
            if(["velvia","160c","provia"].indexOf(f)>=0) s+=15;
            if(["hk","cyber","vivid"].indexOf(f)>=0) s-=15;
          }
          // 街拍/建筑推纪实黑白冷调
          if(scene==="architecture"||scene==="street"||scn==="street"){
            if(["chrome","classic","mono-warm","provia","cool"].indexOf(f)>=0) s+=10;
          }
          if(scene==="street"&&["chrome","classic","hk"].indexOf(f)>=0) s+=8;
          // 极低饱和加黑白分：仅限建筑/街拍/通用，且非food/sunset/人像
          if(sat<0.06 && (scene==="architecture"||scene==="street"||scene==="general") &&
             scene!=="food" && scene!=="sunset" && !isPerson &&
             ["mono","mono-warm","chrome"].indexOf(f)>=0) s+=25;
          // 色彩即主体：food/sunset/暖色调 黑白直接负分
          if((scene==="food"||scene==="sunset"||warmRatio>0.4) && ["mono","mono-warm"].indexOf(f)>=0) s-=30;
          // 普通人像不推黑白（侧光强对比例外）
          if(isPerson && scene==="portrait" && ["mono","mono-warm"].indexOf(f)>=0) s-=20;
          return s;
        }

        // 给所有候选打分并排序
        var scored=pool.map(function(f){
          return {filter:f,score:scoreFilter(f)};
        }).sort(function(a,b){return b.score-a.score;});

        // 取 top1，分数太低（<30）不推
        var top=scored[0];
        if(!top||top.score<30) return {filter:null,strength:0,reason:"",rule:"NONE"};

        // 强度：分数越高强度越大
        var strength=Math.min(80,Math.max(50,top.score));
        // 理由
        var reasons={
          "portra":"暖调人像，肤色通透",
          "ektar":"高饱和暖调，人像利器",
          "portrait-warm":"暖光环境，肤色更通透",
          "portrait-cool":"冷调环境，肤色更清透",
          "portrait-mono":"侧光人像，黑白衬光影",
          "japan":"清新低饱和日系",
          "provia":"中性还原，自然通透",
          "velvia":"浓郁色彩，红蓝对撞",
          "160c":"通透蓝天，风光利器",
          "night":"夜景提亮，暗部通透",
          "cyber":"霓虹夜景，都市感",
          "teal":"青橙分流，电影感",
          "sunset":"橙金落日，暖意氛围",
          "warm":"暖金色调，氛围浓郁",
          "chrome":"高反差纪实，硬朗线条",
          "classic":"冷峻低饱和，几何线条",
          "mono-warm":"暖调黑白，复古质感",
          "mono":"经典黑白，影调干净",
          "morandi":"低饱和高级灰",
          "fade":"褪色做旧，怀旧感",
          "c200":"柔和胶片绿调",
          "hk":"港风霓虹，高饱和",
          "cool":"清冷干净，适合夜景",
          "natural":"轻度增强，忠实还原",
          "lowkey-keep":"低照度保真：只降 1.5% 曝光，不抬黑位",
          "lowkey-mono":"高反差黑白：去色，让明暗几何成为主体",
          "lowkey-amber":"逆光琥珀：暖高光，不抬黑位",
          "lowkey-cool":"冷银单色：冷水/荧光灯分离"
        };
        // v13.2：每条推荐都带数字依据（用户要求“说不出依据就不推”）。光影作品额外标明亮区/对角。
        var _ev="（均值"+Math.round(mean)+((_lgF&&_lgF.ok)?("·亮区"+Math.round(_lgF.litRatio*100)+"%·对角"+Math.round(_lgF.diagRatio*100)+"%"):"")+"）";
        var _pre=_shadowSafe?"光影作品·":pf;
        var _rt=reasons[top.filter]||"场景适配";
        // 同一款 Portra 用在美食上，理由不该还写“人像”
        if(scene==="food"&&["portra","warm","sunset","c200","hk"].indexOf(top.filter)>=0) _rt="暖调胶片，食物更有食欲";
        return {filter:top.filter,strength:strength,reason:_pre+_rt+_ev,rule:"SCORE"};
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
          if(e.type==='adopt') ado++; else if(e.type!=='revert') rej++; // revert=只是换回原片，不参与“本场景沉默”
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
      if(scn==="portrait"||scn==="portrait_close") return "阳光人像·";
      if(scn==="general") return (typeof wb==="number"&&wb>0.03)?"暖调场景·":((typeof wb==="number"&&wb<-0.03)?"冷调场景·":"通用场景·");
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

    function _contentGuard(mean, sat, edgeDensity){
      try{
        if(!(mean>=0)) return false;
        if(mean<25) return true; // 极暗图（夜景氛围）不裁
        if(sat<0.03 && edgeDensity<0.02) return true; // 纯色/灰图不裁
        if(edgeDensity>0.35 && sat<0.08) return true; // 截图/UI不裁
        return false;
      }catch(e){ return false; }
    }

    function _isRealPortrait(a){
      try{
        if(!a) return false;
        // bodyRatio 是最稳的真/假人像分界：真人/真脸占比≥~0.12；路人小点/海报点仅~0.01
        var br=(typeof a.bodyRatio==="number"&&isFinite(a.bodyRatio))?a.bodyRatio:0;
        var pb=_personBoxOf(a);
        if(pb){ var pa=Math.max(0,pb[2]-pb[0])*Math.max(0,pb[3]-pb[1]); if(pa>=0.06) return true; } // COCO 真人框占比≥6%即真·人像
        // 真脸：必须占比够大且搭配够大的主体；孤立的小脸（时代广场海报脸、远处路人）不算
        if(a.faceAvailable===true && br>=0.10){
          var _fb=null;
          if(Array.isArray(a.faceBoxes)&&a.faceBoxes.length&&a.faceBoxes[0]&&a.faceBoxes[0].length===4) _fb=a.faceBoxes[0];
          else if(Array.isArray(a.faceBBox)&&a.faceBBox.length===4) _fb=a.faceBBox;
          if(_fb){ var _fa=Math.max(0,_fb[2]-_fb[0])*Math.max(0,_fb[3]-_fb[1]); if(_fa>=0.03) return true; }
          else if(pb){ /* 已有 person 框，上面已判 */ }
          else return false; // 无框脸 = 海报/广告牌/远处误检
        }
        if(a.isPerson===true && (typeof a.personScore==="number"&&a.personScore>=0.60) && br>=0.12 && (typeof a.skinRatio==="number"&&a.skinRatio>=0.10)) return true;
        return false;
      }catch(e){ return false; }
    }

    function _realEdgeDensity(a){
      try{
        var ee=a.edgeEnergy||{}, col=ee.col||[], row=ee.row||[];
        function avg(arr){ if(!arr||!arr.length) return 0; var s=0; for(var i=0;i<arr.length;i++) s+=(arr[i]||0); return s/arr.length; }
        return (avg(col)+avg(row))/2;
      }catch(e){ return 0; }
    }

    function _gridStdCV(a){
      try{
        var g=a.lumGrid, gw=a.gridW, gh=a.gridH;
        if(!g||!gw||!gh||g.length<gw*gh) return 0.9; // 无网格：按"有内容"处理，不误拦
        var N=gw*gh, s=0;
        for(var i=0;i<N;i++) s+=g[i];
        var m=s/N, v=0;
        for(var j=0;j<N;j++){ var d=g[j]-m; v+=d*d; }
        var sd=Math.sqrt(v/N);
        return sd/(Math.abs(m)+8);
      }catch(e){ return 0.9; }
    }

    function _realContentGuard(a){
      try{
        if(!a) return false;
        var mean=(typeof a.mean==="number")?a.mean:128;
        var sat=(typeof a.sat==="number")?a.sat:0.2;
        var ed=_realEdgeDensity(a);
        if(mean<24){ if(_gridStdCV(a)<0.22) return true; } // 均匀死黑才拦
        if(sat<0.03 && ed<0.02){
          var lg=null; try{ lg=_lightGeometry(a); }catch(e){}
          if(!(lg&&lg.ok&&(lg.litRatio>=0.06||lg.diagRatio>=0.35))) return true; // 纯灰/纯色才拦
        }
        // UI 截图：必须极高边缘密度（满屏文字/色块）且极低饱和——低饱和纪实/黑白照不算 UI
        if(ed>0.50 && sat<0.04) return true;
        return false;
      }catch(e){ return false; }
    }

    function _bandDead(a,crop){
      try{
        var ee=a.edgeEnergy||{}, col=ee.col||[], row=ee.row||[];
        var L=crop[0]/100,T=crop[1]/100,R=crop[2]/100,B=crop[3]/100;
        function avg(arr,f0,f1){
          if(!arr||!arr.length) return 0;
          var i0=Math.floor(f0*arr.length), i1=Math.ceil(f1*arr.length), s=0,n=0;
          for(var i=Math.max(0,i0);i<Math.min(arr.length,i1);i++){ s+=(arr[i]||0); n++; }
          return n?s/n:0;
        }
        var cE=col.length?avg(col,0.3,0.7):0.3, rE=row.length?avg(row,0.3,0.7):0.3;
        var ratios=[];
        if(L>0.015) ratios.push(avg(col,0,L)/(cE+0.03));
        if(R>0.015) ratios.push(avg(col,1-R,1)/(cE+0.03));
        if(T>0.015) ratios.push(avg(row,0,T)/(rE+0.03));
        if(B>0.015) ratios.push(avg(row,1-B,1)/(rE+0.03));
        if(!ratios.length) return 0;
        var clean=ratios.map(function(r){ return Math.max(0,1-r*1.8); });
        var s=0; for(var k=0;k<clean.length;k++) s+=clean[k];
        return s/clean.length;
      }catch(e){ return 0; }
    }

    function _thirdsFitScore(cx, cy){
      try{
        if(!(cx>=0)||!(cy>=0)) return 0.5;
        var dx=Math.min(Math.abs(cx-1/3),Math.abs(cx-2/3));
        var dy=Math.min(Math.abs(cy-1/3),Math.abs(cy-2/3));
        var dist=Math.sqrt(dx*dx+dy*dy);
        return Math.max(0, 1-dist/0.5); // 距中心0.5归一化为0
      }catch(e){ return 0.5; }
    }

    function aestheticScore(contrast, sat, edgeDensity, thirdsFit, goldenRatioFit){
      try{
        var s=0;
        s+=Math.min(1,Math.max(0,(contrast||0.3)))*20; // 对比度
        s+=Math.min(1,Math.max(0,(sat||0.2)))*15; // 饱和度和谐
        s+=Math.min(1,Math.max(1-(edgeDensity||0.1)))*20; // 边缘密度适中
        s+=Math.min(1,Math.max(0,(thirdsFit||0.5)))*25; // 三分法贴合
        s+=Math.min(1,Math.max(0,(goldenRatioFit||0.5)))*20; // 黄金分割
        return Math.round(s);
      }catch(e){ return 50; }
    }

    function _cloudCropGuard(crop, a, scene){
      try{
        if(!crop||crop.length!==4) return crop;
        var c=crop.map(function(v){ return Math.max(0,Math.min(50,Math.round(v))); });
        var sum=c[0]+c[1]+c[2]+c[3];
        if(!sum) return c;
        var sc=String(scene||"");
        if(/portrait/.test(sc)){
          c=c.map(function(v){ return Math.min(10,v); });
        }else if(sc==="animal"){
          // 动物轮廓/耳朵/尾巴最脆：单边≤8%、四边≤25%，比美食更保守
          c=c.map(function(v){ return Math.min(8,v); });
          sum=c[0]+c[1]+c[2]+c[3];
          if(sum>25){ var ka=25/sum; c=c.map(function(v){ return Math.round(v*ka); }); }
          while((c[0]+c[1]+c[2]+c[3])>25){ var mia=0; for(var ia=1;ia<4;ia++){ if(c[ia]>c[mia]) mia=ia; } c[mia]--; }
        }else if(sc==="food"){
          c=c.map(function(v){ return Math.min(12,v); });
          sum=c[0]+c[1]+c[2]+c[3];
          if(sum>35){ var k=35/sum; c=c.map(function(v){ return Math.round(v*k); }); }
          while((c[0]+c[1]+c[2]+c[3])>35){ var mi=0; for(var i=1;i<4;i++){ if(c[i]>c[mi]) mi=i; } c[mi]--; }
        }else{
          c=c.map(function(v){ return Math.min(15,v); });
          sum=c[0]+c[1]+c[2]+c[3];
          if(sum>40){ var k2=40/sum; c=c.map(function(v){ return Math.round(v*k2); }); }
          while((c[0]+c[1]+c[2]+c[3])>40){ var mi2=0; for(var j=1;j<4;j++){ if(c[j]>c[mi2]) mi2=j; } c[mi2]--; }
        }
        if(a&&Array.isArray(a.allBoxes)&&a.allBoxes.length){
          try{ c=_objectGuard(c,a.allBoxes); }catch(e){}
        }
        if(a&&a.sigBox&&a.sigBox.length===4){
          var b=a.sigBox;
          var bw=Math.max(0.001,b[2]-b[0]), bh=Math.max(0.001,b[3]-b[1]);
          var l=c[0]/100,t=c[1]/100,r=c[2]/100,bb=c[3]/100;
          var ow=Math.max(0,Math.min(b[2],1-r)-Math.max(b[0],l));
          var oh=Math.max(0,Math.min(b[3],1-bb)-Math.max(b[1],t));
          if((ow*oh)/(bw*bh)<0.75) return [0,0,0,0];
        }
        return c;
      }catch(e){ return crop; }
    }

    function _personBoxOf(a){
      try{
        if(!a) return null;
        var c=a.cocoPersonBox;
        if(c&&typeof c.l==="number"&&typeof c.t==="number"&&typeof c.r==="number"&&typeof c.b==="number"){
          if(c.r-c.l>0.03&&c.b-c.t>0.03) return [Math.max(0,c.l),Math.max(0,c.t),Math.min(1,c.r),Math.min(1,c.b)];
        }
        if(typeof a.personLeft==="number"&&typeof a.headTop==="number"&&typeof a.personRight==="number"){
          var pb=[a.personLeft,a.headTop,a.personRight,(typeof a.personBottom==="number"?a.personBottom:0.98)];
          if(pb[2]-pb[0]>0.03&&pb[3]-pb[1]>0.03) return [Math.max(0,pb[0]),Math.max(0,pb[1]),Math.min(1,pb[2]),Math.min(1,pb[3])];
        }
        if(Array.isArray(a.allBoxes)){
          var best=null,ba=0;
          for(var i=0;i<a.allBoxes.length;i++){
            var o=a.allBoxes[i], b=o&&o.b;
            if(!b||b.length!==4||o.class!=="person") continue;
            if(o.score!==undefined&&o.score<0.40) continue;
            var ar=Math.max(0,b[2]-b[0])*Math.max(0,b[3]-b[1]);
            if(ar>ba){ ba=ar; best=b; }
          }
          if(best) return [Math.max(0,best[0]),Math.max(0,best[1]),Math.min(1,best[2]),Math.min(1,best[3])];
        }
      }catch(e){}
      return null;
    }

    function _proactiveComposition(a, plan){
      try{
        if(!a||!plan) return null;
        var sc=plan.sceneType||"general";
        if(/portrait/.test(sc) && _isRealPortrait(a)) return null; // v13.6.0：只挡真·人像；假人像按底层场景主动构图
        // v13.6.0：动物特写且主体已填满画面（bodyRatio≥0.55，如猫/犬特写贴耳须爪）不硬裁——裁切易脆；
        // 美食不在此列（食物无关节脆件，仍可主动收紧）。
        if(/animal/.test(sc) && (typeof a.bodyRatio==="number"&&isFinite(a.bodyRatio)&&a.bodyRatio>=0.55)) return null;
        // v13.1.0：先过主体证据闸门——糊片/纯色/截图/占位图/找不到主体时一律不主动裁
        try{ if(!_subjectEvidence(a,plan).ok) return null; }catch(e){}
        if(plan.crop && (plan.crop[0]+plan.crop[1]+plan.crop[2]+plan.crop[3])>0) return null;
        // 极暗/纯色/截图类仍然不折腾（v13.6.0：真·近黑/纯灰/UI 才拦，暗调有光影放行）
        try{ if(typeof _realContentGuard==="function" && _realContentGuard(a)) return null; }catch(e){}
        var ar=(typeof a.frameAspect==="number"&&isFinite(a.frameAspect)&&a.frameAspect>0.2&&a.frameAspect<5)?a.frameAspect:1;
        var box=(a.sigBox&&a.sigBox.length===4)?a.sigBox:[0.25,0.25,0.75,0.75];
        // v13.6.0：sigBox 把整框框住时（暗墙/地下通道），用质心+占比合成小框；
        // 但主体已占满画面（bodyRatio 大，如猫特写）时不收缩——那是真主体贴边，收缩会切耳须爪。
        var _sbw=box[2]-box[0], _sbh=box[3]-box[1];
        var _br=(typeof a.bodyRatio==="number")?a.bodyRatio:0.20;
        if((_sbw*_sbh>0.70||_sbw>0.80||_sbh>0.80) && _br<0.45){
          var _ss=Math.max(0.18,Math.min(0.60,Math.sqrt(Math.max(0.03,_br))));
          box=[Math.max(0,(typeof a.cx==="number"?a.cx:0.5)-_ss/2),Math.max(0,(typeof a.cy==="number"?a.cy:0.5)-_ss/2),
               Math.min(1,(typeof a.cx==="number"?a.cx:0.5)+_ss/2),Math.min(1,(typeof a.cy==="number"?a.cy:0.5)+_ss/2)];
        }
        var cx=(typeof a.cx==="number"&&isFinite(a.cx))?a.cx:0.5;
        var cy=(typeof a.cy==="number"&&isFinite(a.cy))?a.cy:0.5;
        var cands=[];
        // v12.28.0 P0：人景共存——检出人物时不再整张不裁，而是保留人物安全边、裁对侧/上下空白
        var pb=_personBoxOf(a);
        if(pb){
          var safe=[];
          function pushSafe(l,t,r,b,tag,reason,score){
            l=Math.max(0,Math.min(0.15,l)); t=Math.max(0,Math.min(0.15,t));
            r=Math.max(0,Math.min(0.15,r)); b=Math.max(0,Math.min(0.15,b));
            var area=(1-l-r)*(1-t-b);
            if(area<0.72||l+r+t+b<0.03) return;
            // 人物框四周至少留 3%，绝不切人
            if(pb[0]<l+0.03||pb[1]<t+0.03||pb[2]>1-r-0.03||pb[3]>1-b-0.03) return;
            safe.push({crop:[Math.round(l*100),Math.round(t*100),Math.round(r*100),Math.round(b*100)],tag:tag,reason:reason,score:score,area:area});
          }
          // A. 保留人物，按 4:5/16:9 收紧上下；若人物贴顶/贴底则改裁另一侧
          var tarP=ar<1?0.8:16/9;
          if(Math.abs(tarP-ar)>0.02){
            var chP=1-ar/tarP;
            var topRatioP=(a.topBandHsv&&typeof a.topBandHsv.ratio==="number")?a.topBandHsv.ratio:0;
            var tP=chP*0.5,bP=chP*0.5;
            if(tP>0.02 && (topRatioP>0.25 || (typeof a.blueWater==="number"&&a.blueWater>0.55))){ bP+=tP; tP=0; }
            var tagP=(Math.abs(tarP-0.8)<0.01)?"4:5":(Math.abs(tarP-16/9)<0.01?"16:9":"");
            if(tagP){
              pushSafe(0,tP,0,bP,"人景构图 "+tagP,"保留人物，裁掉上方/下方空白，画面更紧凑",0.76);
              // 人物偏下→只裁上；偏上→只裁下
              if(pb[3]>0.72) pushSafe(0,chP,0,0,"人景构图 "+tagP,"保留人物脚部，裁掉顶部空白",0.72);
              else if(pb[1]<0.28) pushSafe(0,0,0,chP,"人景构图 "+tagP,"保留人物头顶，裁掉底部空白",0.72);
            }
          }
          // B. 裁人物对侧空白（人物在左裁右，人物在右裁左；居中时选边缘能量更低的一侧）
          if(!(typeof a.sym==="number"&&a.sym>0.42)){
            var cutP=0.09, pcx=(pb[0]+pb[2])/2;
            var sideP=pcx<0.5?"right":"left";
            if(Math.abs(pcx-0.5)<0.06){
              var colP=a.edgeEnergy&&a.edgeEnergy.col;
              if(colP&&colP.length>20){
                var avgP=function(from,to){var s=0,c=0,fi=Math.max(0,Math.floor(from*colP.length)),ti=Math.min(colP.length,Math.ceil(to*colP.length));for(var i=fi;i<ti;i++){s+=(colP[i]||0);c++;}return c?s/c:0;};
                var eLP=avgP(0,0.12),eRP=avgP(0.88,1);
                sideP=eLP<=eRP?"right":"left";
              }
            }
            if(sideP==="right") pushSafe(0,0,cutP,0,"人景构图 侧裁","保留人物，裁掉右侧空白，街道更紧凑",0.70);
            else pushSafe(cutP,0,0,0,"人景构图 侧裁","保留人物，裁掉左侧空白，街道更紧凑",0.70);
          }
          if(!safe.length) return null;
          safe.sort(function(x,y){ return y.score-x.score; });
          return safe[0];
        }
        function push(l,t,r,b,tag,reason,score,minOv,minArea){
          l=Math.max(0,Math.min(0.15,l)); t=Math.max(0,Math.min(0.15,t));
          r=Math.max(0,Math.min(0.15,r)); b=Math.max(0,Math.min(0.15,b));
          var area=(1-l-r)*(1-t-b);
          if(area<(minArea||0.72)) return;
          if(l+r+t+b<0.03) return;
          // 主体核心必须留在裁切框内；允许裁掉主体外接框边缘最多 20%（sigBox 常含背景，过严会永远不触发）
          var _bw=Math.max(0.001,box[2]-box[0]), _bh=Math.max(0.001,box[3]-box[1]);
          var _ow=Math.max(0,Math.min(box[2],1-r)-Math.max(box[0],l));
          var _oh=Math.max(0,Math.min(box[3],1-b)-Math.max(box[1],t));
          var _ov=(_ow*_oh)/(_bw*_bh);
          if(_ov<(minOv||0.80)) return;
          if(cx<l+0.03||cx>1-r-0.03||cy<t+0.03||cy>1-b-0.03) return;
          // 氛围保护：顶部是晚霞/蓝天彩带时，不主动裁顶（v13.6.0：阈值收紧到 0.45，弱暖色不再一律 veto）
          var topWarm=(a.topBandHsv&&typeof a.topBandHsv.ratio==="number")?a.topBandHsv.ratio:0;
          if(t>0.04 && (topWarm>0.45 || (typeof a.blueWater==="number"&&a.blueWater>0.65))) return;
          // 对称保护：强对称不主动单边裁（v13.6.0：从 0.42 收紧到 0.50，弱对称允许轻收）
          if((l+r)>0.02 && typeof a.sym==="number" && a.sym>0.50) return;
          cands.push({crop:[Math.round(l*100),Math.round(t*100),Math.round(r*100),Math.round(b*100)],tag:tag,reason:reason,score:score,area:area});
        }
        // A. 社交画幅候选：竖图 3:4→4:5；横图 3:2→16:9；方图不硬改
        var tar=ar;
        if(ar<1){
          // 竖幅普通图（含美食）优先 4:5 社交画幅；人像已在上面排除
          tar=0.8;
        }else if(ar>1){
          if(sc==="food") tar=(ar>1.40?4/3:1); // 3:2 美食→4:3；4:3 美食→1:1 方图
          else if(ar>=1.45 && /landscape|waterscape|night|architecture|street|general/.test(sc)) tar=16/9;
          else if(ar>=1.10) tar=4/3; // 5:4 / 4:3 轻收上下即可，不硬拉到 16:9
          else tar=1;
        }
        if(Math.abs(tar-ar)>0.02){
          var l=0,t=0,r=0,b=0;
          if(tar<ar){ // 目标更窄：裁宽
            var cw=1-tar/ar;
            l=cw*0.5; r=cw*0.5;
            var sx=(0.5-cx)*cw*0.5;
            if(sx>0){ r+=sx; l-=sx; } else { l+=sx; r-=sx; }
          }else{ // 目标更高/更宽：裁高
            var ch=1-ar/tar;
            t=ch*0.5; b=ch*0.5;
            var sy=(0.5-cy)*ch*0.5;
            if(sy>0){ b+=sy; t-=sy; } else { t+=sy; b-=sy; }
            // 顶部是晚霞/蓝天彩带时，把高度裁切全部让给底部，保住天空氛围
            var _topRatio=(a.topBandHsv&&typeof a.topBandHsv.ratio==="number")?a.topBandHsv.ratio:0;
            if(t>0.02 && (_topRatio>0.25 || (typeof a.blueWater==="number"&&a.blueWater>0.55))){ b+=t; t=0; }
          }
          var tagTxt=(Math.abs(tar-0.8)<0.01)?"4:5":(Math.abs(tar-16/9)<0.01?"16:9":(Math.abs(tar-1)<0.01?"1:1":"4:3"));
          // 动物/美食主体轮廓更脆，画幅候选要求更高重叠；风光/街景允许裁掉少量天空/地面。
          // 横图 4:3→16:9 是标准电影画幅，保留面积可放宽到 72%（竖图仍 78%，避免把 9:16 裁太狠）。
          var _minOv=/animal|food/.test(sc)?0.84:0.78;
          var _minArea=(sc==="food")?0.72:((ar>1 && /landscape|waterscape|night|architecture|street|general/.test(sc))?0.68:0.72);
          push(l,t,r,b,"社交画幅 "+tagTxt,"裁成 "+tagTxt+" 更紧凑，主体占比更高，适合发朋友圈/小红书",0.66,_minOv,_minArea);
        }
        // B. 引导线/中心偏移候选：主体居中且一侧是低信息边带时，单边裁 8-12%，让消失点离开正中心
        var lead=(typeof a.diagStrength==="number"&&a.diagStrength>0.30)||(typeof a.rowGap==="number"&&a.rowGap>25);
        if(lead && cx>0.38 && cx<0.62){
          var col=a.edgeEnergy&&a.edgeEnergy.col;
          if(col&&col.length>20){
            var avg=function(from,to){ var s=0,c=0,fi=Math.max(0,Math.floor(from*col.length)),ti=Math.min(col.length,Math.ceil(to*col.length)); for(var i=fi;i<ti;i++){ s+=(col[i]||0); c++; } return c?s/c:0; };
            var eL=avg(0,0.12), eR=avg(0.88,1), eC=avg(0.30,0.70);
            var cut=0.10;
            if(eL<=eR && eL<eC*0.75){ push(cut,0,0,0,"引导线构图","裁掉左侧低信息边带，让道路/线条的消失点离开正中心，画面更有动势",0.62); }
            else if(eR<eL && eR<eC*0.75){ push(0,0,cut,0,"引导线构图","裁掉右侧低信息边带，让道路/线条的消失点离开正中心，画面更有动势",0.62); }
          }
        }
        // C. 轻量兜底：普通场景没有更强候选时，给 4:5/16:9 的轻度上下收紧；
        // 只裁 ≤18% 高度、保留 ≥80% 面积，晚霞/蓝天顶部让给底部，避免"好多图完全不裁"。
        if(!cands.length && !/animal|food/.test(sc) && tar>ar){
          var chF=1-ar/tar;
          if(chF>0.02 && chF<=0.26){
            var tF=chF*0.5,bF=chF*0.5;
            var topF=(a.topBandHsv&&typeof a.topBandHsv.ratio==="number")?a.topBandHsv.ratio:0;
            if(tF>0.02 && (topF>0.25 || (typeof a.blueWater==="number"&&a.blueWater>0.55))){ bF+=tF; tF=0; }
            var tagF=(Math.abs(tar-0.8)<0.01)?"4:5":(Math.abs(tar-16/9)<0.01?"16:9":"社交画幅");
            // 4:3→16:9 是标准电影画幅（25% 高裁切），保留面积 75%；仅用于非动物/非美食普通场景
            push(0,tF,0,bF,tagF,"轻度收紧上下，保留主体与氛围，画面更紧凑",0.58,0.60,0.70);
          }
        }
        // D. v13.6.0 默认兜底：只要任一侧有可判定的低信息死区边带（能量比 <0.6），且 push 的主体/质心/人物校验都过，
        //    就主动裁掉死边收成更紧凑的构图，而不是返回 null 摆烂。push 内部已硬校验不切主体。
        if(!cands.length && !/animal|food/.test(sc)){
          var ee=a.edgeEnergy||{}, col=ee.col||[], row=ee.row||[];
          function _avgD(arr,f0,f1){ if(!arr||!arr.length) return 0; var i0=Math.floor(f0*arr.length),i1=Math.ceil(f1*arr.length),s=0,n=0; for(var i=Math.max(0,i0);i<Math.min(arr.length,i1);i++){s+=(arr[i]||0);n++;} return n?s/n:0; }
          var cC=col.length?_avgD(col,0.3,0.7):0.3, rC=row.length?_avgD(row,0.3,0.7):0.3;
          var dl=_avgD(col,0,0.14)/(cC+0.03), dr=_avgD(col,0.86,1)/(cC+0.03);
          var dt=_avgD(row,0,0.14)/(rC+0.03), db=_avgD(row,0.86,1)/(rC+0.03);
          var cutL=(dl<0.55)?0.09:0, cutR=(dr<0.55)?0.09:0, cutT=(dt<0.55)?0.09:0, cutB=(db<0.55)?0.09:0;
          if(cutL+cutR>=cutT+cutB && cutL+cutR>0.02){
            // 顶部是晚霞/蓝天时不裁顶（这里主要走左右，保留底部逻辑）
            push(cutL,0,cutR,0,"去死边构图","裁掉低信息侧边死区，主体更集中",0.55,0.72,0.70);
          }else if(cutT+cutB>0.02){
            var _topD=(a.topBandHsv&&typeof a.topBandHsv.ratio==="number")?a.topBandHsv.ratio:0;
            if(cutT>0 && (_topD>0.45 || (typeof a.blueWater==="number"&&a.blueWater>0.65))){ cutB=Math.min(0.15,cutT+cutB); cutT=0; }
            push(0,cutT,0,cutB,"去死边构图","裁掉空天/空地面死区，画面更紧凑",0.55,0.72,0.70);
          }
        }
        if(!cands.length) return null;
        cands.sort(function(x,y){ return y.score-x.score; });
        return cands[0];
      }catch(e){ return null; }
    }

    function _balanceCrop(a, plan){
      try{
        if(!a||!plan||plan.noCrop) return null;
        var sc=plan.sceneType||"general";
        if(!(sc==="general"||sc==="street"||sc==="night")) return null;
        var ar=(typeof a.frameAspect==="number"&&isFinite(a.frameAspect))?a.frameAspect:0;
        if(!(ar>0.25&&ar<1)) return null;
        var c=plan.crop; if(!c||c.length!==4) return null;
        var L=c[0]/100,T=c[1]/100,R=c[2]/100,B=c[3]/100;
        var sideSum=L+R;
        if(sideSum<0.12 || T+B>0.03) return null;
        var side=(R>=L)?"R":"L";
        var oldSide=(side==="R")?R:L;
        var newSide=Math.max(0.05,Math.min(0.10,oldSide*0.55));
        var nL=L,nR=R;
        if(side==="R") nR=newSide; else nL=newSide;
        var w=1-nL-nR;
        var target=0.8; // 4:5 竖幅
        var h=ar*w/target;
        if(!(h>0.80&&h<=1)) return null;
        var b=1-h;
        if(b<=0.02 || b>0.24) return null;
        // 顶部不裁（保护天空/晚霞），全部让给底部
        var bottomEdge=1-b;
        var cx=(typeof a.cx==="number"&&isFinite(a.cx))?a.cx:0.5;
        var cy=(typeof a.cy==="number"&&isFinite(a.cy))?a.cy:0.5;
        // 显著框常把整张高对比画面都框住（地下通道 sigBox=[0,0,1,1]），此时用主体质心+占比合成一个小框，
        // 避免“任何裁切都被判切主体”。只有真正新增的边才要求安全边距；比当前裁得更少的边不再重复设限。
        var box=(a.sigBox&&a.sigBox.length===4)?a.sigBox.slice():[0.25,0.25,0.75,0.75];
        var _bw=box[2]-box[0], _bh=box[3]-box[1];
        if(_bw*_bh>0.70 || _bw>0.80 || _bh>0.80){
          var _s=Math.max(0.18,Math.min(0.60,Math.sqrt(Math.max(0.03,a.bodyRatio||0.20))));
          box=[Math.max(0,cx-_s/2),Math.max(0,cy-_s/2),Math.min(1,cx+_s/2),Math.min(1,cy+_s/2)];
        }
        var ml=0.04, mr=0.04, mb=0.04;
        if(nL>L+0.002 && box[0]<nL+ml) return null;
        if(nR>R+0.002 && box[2]>1-nR-mr) return null;
        if(b>B+0.002 && box[3]>bottomEdge-mb) return null;
        if(cx<nL+0.02||cx>1-nR-0.02||cy>bottomEdge-0.02) return null;
        // 人物硬保护：候选框只要切到任何可信人物就放弃
        var pb=_personBoxOf(a);
        if(pb && ((nL>L+0.002&&pb[0]<nL+0.04)||(nR>R+0.002&&pb[2]>1-nR-0.04)||(b>B+0.002&&pb[3]>bottomEdge-0.04))) return null;
        var cand=[Math.round(nL*100),0,Math.round(nR*100),Math.round(b*100)];
        try{
          if(a.allBoxes&&a.allBoxes.length){
            var g=_objectGuard(cand,a.allBoxes);
            if(JSON.stringify(g)!==JSON.stringify(cand)) return null;
          }
        }catch(e){}
        // 画幅/面积校验
        var real=ar*w/(1-b);
        if(Math.abs(real-0.8)>0.012) return null;
        if(w*(1-b)<0.72) return null;
        return cand;
      }catch(e){ return null; }
    }

    function _cropQualityScore(a, crop, noCrop){
      try{
        if(!a) return 0;
        var c=(noCrop||!crop)?[0,0,0,0]:crop;
        var L=c[0]/100,T=c[1]/100,R=c[2]/100,B=c[3]/100;
        if(L<0||T<0||R<0||B<0||L+R>=1||T+B>=1) return -1;
        var ar=(typeof a.frameAspect==="number"&&isFinite(a.frameAspect))?a.frameAspect:1;
        var w=1-L-R,h=1-T-B,area=w*h,real=ar*w/h;
        var cx=(typeof a.cx==="number"&&isFinite(a.cx))?a.cx:0.5;
        var cy=(typeof a.cy==="number"&&isFinite(a.cy))?a.cy:0.5;
        var box=(a.sigBox&&a.sigBox.length===4)?a.sigBox.slice():[0.25,0.25,0.75,0.75];
        var bw=box[2]-box[0],bh=box[3]-box[1];
        if(bw*bh>0.70||bw>0.80||bh>0.80){
          var s=Math.max(0.18,Math.min(0.60,Math.sqrt(Math.max(0.03,a.bodyRatio||0.20))));
          box=[Math.max(0,cx-s/2),Math.max(0,cy-s/2),Math.min(1,cx+s/2),Math.min(1,cy+s/2)];
          bw=box[2]-box[0];bh=box[3]-box[1];
        }
        var ix=Math.max(0,Math.min(box[2],1-R)-Math.max(box[0],L));
        var iy=Math.max(0,Math.min(box[3],1-B)-Math.max(box[1],T));
        var overlap=(bw>0&&bh>0)?(ix*iy)/(bw*bh):1;
        if(overlap<0.82) return -1;
        var pb=_personBoxOf(a);
        if(pb && (pb[0]<L+0.03||pb[1]<T+0.03||pb[2]>1-R-0.03||pb[3]>1-B-0.03)) return -1;
        try{
          if(a.allBoxes&&a.allBoxes.length){
            var g=_objectGuard(c.map(function(v){return Math.round(v);}),a.allBoxes);
            if(JSON.stringify(g)!==JSON.stringify(c.map(function(v){return Math.round(v);}))) return -1;
          }
        }catch(e){}
        // v13.1.0：肤色边缘守卫——小人物未被模型检出时的最后一道保护（裁掉的条带里有成块肤色 → 否决）
        try{ if(_skinEdgeGuard(c.map(function(v){return Math.round(v);}),a).veto) return -1; }catch(e){}
        var nx=(cx-L)/Math.max(0.01,w), ny=(cy-T)/Math.max(0.01,h);
        var fit=_thirdsFitScore(nx,ny);
        var targets=[0.75,0.8,1,4/3,16/9];
        var minErr=1;
        for(var ti=0;ti<targets.length;ti++){ minErr=Math.min(minErr,Math.abs(real-targets[ti])/targets[ti]); }
        var standard=minErr<0.02?1:(minErr<0.05?0.78:(minErr<0.10?0.45:0.15));
        var cutEnergy=0;
        try{
          var ee=a.edgeEnergy||{};
          var col=ee.col||[], row=ee.row||ee.eT||[];
          var sum=0,n=0;
          if(L>0&&col.length){ var li=Math.floor(L*col.length); for(var i=0;i<li;i++){sum+=(col[i]||0);n++;} }
          if(R>0&&col.length){ var ri=Math.floor((1-R)*col.length); for(var j=ri;j<col.length;j++){sum+=(col[j]||0);n++;} }
          if(T>0&&row.length){ var ti2=Math.floor(T*row.length); for(var k=0;k<ti2;k++){sum+=(row[k]||0);n++;} }
          if(B>0&&row.length){ var bi=Math.floor((1-B)*row.length); for(var m=bi;m<row.length;m++){sum+=(row[m]||0);n++;} }
          cutEnergy=n?Math.min(1,sum/n):0;
        }catch(e){}
        // v13.1.0 幅度预算感知：旧版把"保留 85% 面积"当最优、面积一小就罚分，
        // 导致任何主动重构图（小框/靠近）在打分上永远输给"不裁"——这是"AI 不敢裁"的数学根源。
        // 现在：预算内（area ≥ cropMinArea）越紧越加分；只有超出预算才重罚。
        var _floor=(typeof a.cropMinArea==="number"&&a.cropMinArea>0.02&&a.cropMinArea<0.95)
          ? a.cropMinArea : (pb?0.40:0.25);
        var areaScore=0.70+0.30*Math.min(1,(1-area)/0.70);
        if(area<_floor) areaScore-=0.85;
        var centerBalance=1-Math.min(1,Math.abs(nx-0.5)+Math.abs(ny-0.5));
        // 不裁不能靠"零裁切能量"白拿高分；普通照片里保留太多冗余本身是弱项。
        var isNoCrop=(L+T+R+B)<0.005;
        var cutScore=isNoCrop?0.55:Math.max(0,1-cutEnergy);
        if(isNoCrop) areaScore=0.72;
        var tightGain=isNoCrop?0:Math.min(1,(1/area-1)*2.2);
        return 0.26*overlap + 0.19*fit + 0.16*standard + 0.17*cutScore + 0.12*areaScore + 0.06*centerBalance + 0.04*tightGain;
      }catch(e){ return -1; }
    }

    function _saferCropVariant(a, crop){
      try{
        if(!a||!crop||crop.length!==4) return null;
        var c=crop.map(function(v){return Math.round(v);});
        var noScore=_cropQualityScore(a,[0,0,0,0],true);
        var best=null,bestScore=noScore+0.02;
        function tryCrop(t){
          if(!t) return;
          var sum=t[0]+t[1]+t[2]+t[3];
          if(sum<=5 || sum>28) return;
          var s=_cropQualityScore(a,t,false);
          if(s>=0 && s>bestScore){ best=t; bestScore=s; }
        }
        if(c[3]>0) tryCrop([c[0],Math.min(24,c[1]+c[3]),c[2],0]);
        if(c[1]>0) tryCrop([c[0],0,c[2],Math.min(24,c[1]+c[3])]);
        if(c[3]>0 && c[3]>4) tryCrop([c[0],c[1],c[2],Math.max(0,c[3]-4)]);
        return best;
      }catch(e){ return null; }
    }

    function _candidateRatioTag(crop, ar){
      try{
        var L=crop[0]/100,T=crop[1]/100,R=crop[2]/100,B=crop[3]/100;
        var real=ar*(1-L-R)/(1-T-B);
        var ts=[{v:0.8,t:"4:5"},{v:1,t:"1:1"},{v:4/3,t:"4:3"},{v:16/9,t:"16:9"},{v:0.75,t:"3:4"},{v:2/3,t:"2:3"}];
        var best=ts[0],bd=9;
        for(var i=0;i<ts.length;i++){ var d=Math.abs(real-ts[i].v); if(d<bd){bd=d;best=ts[i];} }
        return best.t;
      }catch(e){ return "构图"; }
    }

    function _candidateAspectCrop(a, target){
      try{
        var ar=(typeof a.frameAspect==="number"&&isFinite(a.frameAspect))?a.frameAspect:1;
        if(!(target>0.2&&target<5)||Math.abs(target-ar)<0.02) return null;
        var cx=(typeof a.cx==="number"&&isFinite(a.cx))?a.cx:0.5;
        var cy=(typeof a.cy==="number"&&isFinite(a.cy))?a.cy:0.5;
        var vars=[];
        if(target>ar){ // 更宽：裁高
          var ch=1-ar/target;
          if(ch<0.02||ch>0.30) return null;
          var t0=Math.max(0,Math.min(ch,cy-0.5*(1-ch)));
          var topRatio=(a.topBandHsv&&typeof a.topBandHsv.ratio==="number")?a.topBandHsv.ratio:0;
          var protectTop=(topRatio>0.25 || (typeof a.blueWater==="number"&&a.blueWater>0.55));
          vars=[t0, protectTop?0:ch, protectTop?ch:0, ch/2];
        }else{ // 更窄：裁宽
          var cw=1-target/ar;
          if(cw<0.02||cw>0.30) return null;
          var l0=Math.max(0,Math.min(cw,cx-0.5*(1-cw)));
          vars=(typeof a.sym==="number"&&a.sym>0.42)?[cw/2]:[l0,0,cw];
        }
        var best=null,bs=-1;
        for(var i=0;i<vars.length;i++){
          var v=vars[i];
          var c=(target>ar)?[0,Math.round(v*100),0,Math.round((ch-v)*100)]
                           :[Math.round(v*100),0,Math.round((cw-v)*100),0];
          var sum=c[0]+c[1]+c[2]+c[3];
          if(sum<=3) continue;
          var s=_cropQualityScore(a,c,false);
          if(s>=0 && s>bs){ bs=s; best=c; }
        }
        return best;
      }catch(e){ return null; }
    }

    function _buildCompositionCandidates(a, plan){
      try{
        if(!a||!plan) return [];
        // v13.2：只有"确实有人"才整体不组候选。纯像素把人像场景猜错时（水面/木纹被判 portrait_close，
        // ls01 就是这样 0 候选），不该连候选表都不给；人物安全仍由 _validateNewCrop 的肤色/人物边距兜底。
        // “确实有人”= 可定位人物框，或高置信 person / 真脸 / 真肤色（ls09 的 0.377 无框假人不再触发）。
        var _personStrong=_isRealPortrait(a);
        if(/portrait/.test(plan.sceneType||"") && _personStrong) return [];
        var ar=(typeof a.frameAspect==="number"&&isFinite(a.frameAspect))?a.frameAspect:1;
        var budget=_cropBudget(a, plan.sceneType||"general");
        try{ a.cropMinArea=budget.minArea; }catch(e){} // 让质量分与候选生成用同一套预算
        var out=[], seen={};
        function accept(c,intent,tag,reason,source,expected){
          if(!c||c.length!==4) return false;
          var cc=c.map(function(v){return Math.round(v);});
          if(expected){ // 画幅候选被保护改动后偏离目标 >2% → 不展示（避免"标着 1:1 实际不是"）
            var _r=ar*(1-cc[0]/100-cc[2]/100)/(1-cc[1]/100-cc[3]/100);
            if(Math.abs(_r-expected)/expected>0.02) return false;
          }
          var v=_validateNewCrop(cc,a,plan.sceneType||"general",budget,{source:source});
          if(!v.ok) return false;
          var k=cc.join(",");
          if(seen[k]) return false;
          for(var oi=0;oi<out.length;oi++){ if(_cropsSimilar(out[oi].crop,cc)) return false; } // 近似重复才剔
          seen[k]=1;
          out.push({crop:cc,noCrop:false,tag:tag||intent,intent:intent,reason:reason,source:source,score:v.score,area:v.area});
          return true;
        }
        // 1) 本地已落地的主动构图（保持原值，避免 1% 级抖动）
        if(!plan.noCrop && plan.crop) accept(plan.crop,"local","本地构图","本地引擎找到的构图","local");
        // 2) 意图模板候选（三分/地平线/小框重构图/去死边/画幅）
        var intents=_intentCandidates(a,plan,budget);
        var quota={};
        for(var ii=0;ii<intents.length && out.length<8;ii++){
          var it=intents[ii];
          quota[it.intent]=quota[it.intent]||0;
          if(quota[it.intent]>=2) continue; // 每种意图最多 2 个，保证"思路多"而不是"同一思路的近似框"
          if(accept(it.crop,it.intent,it.tag,it.reason,"intent")) quota[it.intent]++;
        }
        // 3) 兜底：意图候选不足 3 个时，补两个不同画幅（保持 v13 的能力不回退）
        var targets=(ar<0.70)?[0.75,0.8,1]:(ar<0.95?[1,2/3,0.8]:(ar<1.45?[4/3,1,16/9]:[16/9,4/3,1]));
        for(var i=0;i<targets.length && out.length<3;i++){
          var c=_candidateAspectCrop(a,targets[i]);
          if(c) accept(c,"aspect","画幅 "+_candidateRatioTag(c,ar),"换成 "+_candidateRatioTag(c,ar)+" 更好发","aspect",targets[i]);
        }
        // 4) 强制含"最宽"和"最紧"两个极端（研究结论：候选必须覆盖不同构图意图，否则云端选择没有区分度）
        out.sort(function(x,y){ return y.score-x.score; });
        out=out.slice(0,8);
        // 少于 2 个真实裁切时不组联系表（字母含义会漂移），退回语义通道
        if(out.length<1) return [];   // v13.2：只有 1 个真实裁切也组表（2 格：裁切+原图），否则这些照片云端只能退回语义通道
        var noScore=_cropQualityScore(a,[0,0,0,0],true);
        out.push({crop:[0,0,0,0],noCrop:true,tag:"原图",intent:"original",reason:"保留完整画面",source:"original",score:noScore,area:1});
        for(var j=0;j<out.length;j++) out[j].id=String.fromCharCode(65+j);
        return out;
      }catch(e){ return []; }
    }

    function _srcMegapixels(a){
      var w=a&&a.srcW, h=a&&a.srcH;
      if(!(w>0)||!(h>0)) return 12;
      return (w*h)/1e6;
    }

    function _cropBudget(a, scene){
      var mp=_srcMegapixels(a);
      var sc=String(scene||"general");
      var mean=(a&&typeof a.mean==="number")?a.mean:128;
      var sharp=(a&&typeof a.sharpness==="number")?a.sharpness:50;
      var minArea, allowTight, why;
      var _isPortraitScene=/portrait/.test(sc);
      if(_isPortraitScene && !(_personBoxOf(a)||a.isPerson===true||((typeof a.skinRatio==="number"?a.skinRatio:0)>0.06))){ _isPortraitScene=false; }
      if(_isPortraitScene){ minArea=0.72; allowTight=false; why="人像/特写：不做大裁"; }
      else if(_personBoxOf(a)){
        // v13.1.0 修正：不能"只要检出一个 2% 大小的人就把幅度锁死"。实测（imgs/u50 探针）：
        // 端侧模型开启时任何人物框都会让候选从 6~7 个掉到 3~4 个，云端 refine 命中率直接归零——
        // 这正是"云端超越不了本地"的真因。人物保护不该靠"禁止生成候选"实现，
        // 而是靠 _validateNewCrop 里的人物 3% 边距、物体保护与肤色边缘守卫（它们与幅度预算无关）。
        var _pbb=_personBoxOf(a);
        var _pbArea=Math.max(0,_pbb[2]-_pbb[0])*Math.max(0,_pbb[3]-_pbb[1]);
        if(_pbArea>=0.10){ minArea=0.40; allowTight=false; why="人物占画面较大（≥10%）：只允许中度收紧"; }
        else { minArea=0.30; allowTight=true; why="人物占比小：允许主动重构图，人物边距仍由硬校验兜底"; }
      }
      else if(sc==="animal"){ minArea=0.35; allowTight=false; why="宠物轮廓/耳朵最脆：限制收紧幅度"; }
      else if(sc==="food"){ minArea=0.20; allowTight=true; why="食物可以大胆靠近"; }
      else if(sc==="night"||(mean<85&&sharp<45)){ minArea=0.55; allowTight=false; why="暗调/高噪：大裁会把噪点放大"; }
      else { minArea=0.25; allowTight=true; why="无人物的大场景：允许主动重构图"; }
      // 像素授权：短边≥900、长边≥1350 是"发得出去且不放大"的底线（朋友圈官方短边≤1080、
      // Instagram 4:5 长边 1080、手机全屏 1206 宽）。源像素不足时自动抬高 minArea。
      var sw=(a&&a.srcW>0)?a.srcW:4000, sh=(a&&a.srcH>0)?a.srcH:3000;
      var shortSide=Math.min(sw,sh), longSide=Math.max(sw,sh);
      var areaByShort=Math.pow(900/shortSide,2);
      var areaByLong=Math.pow(1350/longSide,2);
      var floorArea=Math.max(areaByShort,areaByLong);
      if(floorArea>minArea){ minArea=Math.min(0.60,floorArea); allowTight=false; why="源像素不足，已自动收紧裁切幅度"; }
      // "小框重构图"档能小到多少，由源真实像素决定（等效变焦 z=1/sqrt(area)）。
      // 档位按本应用的实际工作分辨率标定（上传长边压到 2400/3200px）：
      //   ≈12MP→2.7x(14%)、≈8MP→2.35x(18%)、≈4MP→2.1x(22%)、更小→2x(25%)。
      // 抖音魔法框实测 10~16% 面积（2.5~3.2x），需要光学长焦，属于"拍前"能力，见 docs/research/v13.1-composition.md。
      var tightArea=mp>=12?0.14:(mp>=7?0.18:(mp>=4?0.22:0.25));
      if(!allowTight) tightArea=minArea;
      // 注意：floorArea 只用于"抬高"下限，绝不能把下限推到 >1（小图会让任何裁切都非法）。
      // 源本身就不够大时（如 800px 网图），只做轻度收紧，并靠 allowTight=false 禁止小框重构图。
      if(tightArea<floorArea && floorArea<=0.60) tightArea=floorArea;
      if(tightArea>0.60) tightArea=0.60;
      // tightArea 允许低于 minArea：minArea 是"常规候选"的下限，tightArea 是"小框重构图"的下限，
      // 两者分开正是高像素图能做出 2.5~3.2x 魔法框、而普通图仍保守的原因。
      var maxZoom=1/Math.sqrt(Math.max(0.02,tightArea));
      return {minArea:Math.round(minArea*1000)/1000, tightArea:Math.round(tightArea*1000)/1000,
              allowTight:!!allowTight, maxZoom:Math.round(maxZoom*100)/100,
              srcMP:Math.round(mp*10)/10, shortSide:Math.round(shortSide), longSide:Math.round(longSide), why:why};
    }

    function _subjectEvidence(a, plan){
      try{
        if(!a) return {ok:false, why:"没有像素分析结果"};
        var mean=typeof a.mean==="number"?a.mean:128;
        var sat=typeof a.sat==="number"?a.sat:0.2;
        var sharp=typeof a.sharpness==="number"?a.sharpness:50;
        var dr=typeof a.dynamicRange==="number"?a.dynamicRange:0.3;
        var sig=typeof a.sigRatio==="number"?a.sigRatio:0;
        var ed=0, en=0;
        try{ var eL=a.edgeEnergy&&a.edgeEnergy.eL||[], eT=a.edgeEnergy&&a.edgeEnergy.eT||[];
          ed=(eL.reduce(function(s,v){return s+v;},0)/Math.max(1,eL.length)+eT.reduce(function(s,v){return s+v;},0)/Math.max(1,eT.length))/2; en=1; }catch(e){}
        if(sharp<22) return {ok:false, why:"画面偏糊，裁了只会更糊"};
        if(dr<0.10 && sat<0.10) return {ok:false, why:"画面几乎没有层次与色彩"};
        // v13.6.0：真·近黑才拦（mean 极低且无任何亮区/光影结构）；暗调但有光束/主体（如暗墙里的黑跑车）放行
        if(mean<26){
          var _lgDark=null; try{ _lgDark=_lightGeometry(a); }catch(e){}
          if(!(_lgDark&&_lgDark.ok&&(_lgDark.litRatio>=0.05||_lgDark.diagRatio>=0.30))) return {ok:false, why:"接近全黑"};
        }
        if(sat<0.03 && ed<0.02){
          // v13.2：黑白/低饱和的建筑光影照样有内容——用光影几何兜底（ls03 就是被这条误杀）
          var _lgp=null; try{ _lgp=_lightGeometry(a); }catch(e){}
          if(!(_lgp&&_lgp.ok&&(_lgp.diagRatio>=0.35||_lgp.litRatio>=0.10))) return {ok:false, why:"纯色/无内容"};
        }
        if(ed>0.35 && sat<0.08) return {ok:false, why:"像截图/图文，不是照片"};
        var hasPerson=!!_personBoxOf(a);
        var hasFood=(a.hasFoodEvidence===true);
        // sigRatio 缺失时退化到 bodyRatio / sigBox 面积（真实 analyzePixels 一定有，单测夹具可能只给其一）
        if(!(sig>0)){
          var bs=(typeof a.bodyRatio==="number")?a.bodyRatio:0;
          if(!(bs>0) && a.sigBox && a.sigBox.length===4) bs=Math.max(0,a.sigBox[2]-a.sigBox[0])*Math.max(0,a.sigBox[3]-a.sigBox[1]);
          sig=bs;
        }
        // 可信主体：模型人框 / 显著性质心占比合理 / 食物证据
        // v13.2：光影/极简照片没有"显著物体"，但有明确明暗结构——亮区集中或对角梯度占优就认它当主体，
        // 否则这类照片会被判"找不到主体"直接不裁（ls01/ls03 就是 0 候选的原因之一）。
        if(!hasPerson && !hasFood && (sig<0.02||sig>0.92)){
          var _lgv=null; try{ _lgv=_lightGeometry(a); }catch(e){}
          if(_lgv&&_lgv.ok&&(_lgv.litRatio>=0.06||_lgv.diagRatio>=0.42)) return {ok:true,hasPerson:false,hasFood:false,sigRatio:Math.max(sig,_lgv.litRatio),byLight:true};
          return {ok:false, why:"找不到明确主体"};
        }
        return {ok:true, hasPerson:hasPerson, hasFood:hasFood, sigRatio:sig};
      }catch(e){ return {ok:false, why:"证据判定异常"}; }
    }

    function _skinEdgeGuard(crop, a){
      try{
        if(!a||!Array.isArray(a.skinGrid)||!a.gridW||!crop||crop.length!==4) return {veto:false, crop:crop};
        var GW=a.gridW, GH=a.gridH||GW, g=a.skinGrid;
        var cellPx=(typeof a.skinCellPx==="number"&&a.skinCellPx>0)?a.skinCellPx:1000;
        var blobCell=cellPx*0.30; // 单格肤色占比>30% 才算"一块皮肤"
        var L=crop[0]/100, T=crop[1]/100, R=crop[2]/100, B=crop[3]/100;
        if(!(L>0||T>0||R>0||B>0)) return {veto:false, crop:crop};
        var total=0; for(var t=0;t<GW*GH;t++) total+=g[t]||0;
        if(total<=0) return {veto:false};
        // 关键校准（实测教训）：木桌/木地板/秋叶/砖墙/暖色外墙整片都会落进 YCbCr 肤色范围。
        // 一张照片里"肤色"占比超过 18% 时，几乎必然是大面积暖色表面而不是人
        // （真人露肤占比通常 <15%，更大就是特写——特写走人像通道根本不裁）。
        // 不加这条会把构图能力直接清零（实测一张笔记本+木桌照片拦掉全部候选）。
        var ratio=total/(GW*GH*cellPx);
        if(ratio>0.08) return {veto:false, diffuse:true, skinRatio:+ratio.toFixed(3)}; // v13.2：暖墙/霉斑/锈色整片落进肤色范围一律放行（示例图实测 11% 被误判成人皮）
        function cells(x0,y0,x1,y1){
          var gx0=Math.max(0,Math.floor(x0*GW)), gx1=Math.min(GW,Math.ceil(x1*GW));
          var gy0=Math.max(0,Math.floor(y0*GH)), gy1=Math.min(GH,Math.ceil(y1*GH));
          var out=[];
          for(var yy=gy0;yy<gy1;yy++) for(var xx=gx0;xx<gx1;xx++) out.push(g[yy*GW+xx]||0);
          return out;
        }
        function stat(list){
          var n=list.length, sum=0, blobs=0;
          for(var i=0;i<n;i++){ sum+=list[i]; if(list[i]>=blobCell) blobs++; }
          return {n:n, sum:sum, blobs:blobs, avg:n?sum/n/cellPx:0};
        }
        // 紧贴裁切线的"跨界带"（2 格宽 ≈ 画面 12%）
        var zones=[
          {edge:"左", out:stat(cells(0,0,L,1)),            cross:stat(cells(Math.max(0,L-0.13),0,L+0.02,1)), kept:stat(cells(L,0,1-R,1))},
          {edge:"右", out:stat(cells(1-R,0,1,1)),          cross:stat(cells(1-R-0.02,0,Math.min(1,1-R+0.13),1)), kept:stat(cells(L,0,1-R,1))},
          {edge:"上", out:stat(cells(0,0,1,T)),            cross:stat(cells(0,Math.max(0,T-0.13),1,T+0.02)), kept:stat(cells(0,T,1,1-B))},
          {edge:"下", out:stat(cells(0,1-B,1,1)),          cross:stat(cells(0,1-B-0.02,1,Math.min(1,1-B+0.13))), kept:stat(cells(0,T,1,1-B))}
        ];
        var diag=[];
        for(var i=0;i<4;i++){
          var z=zones[i];
          if([L,T,R,B][i]<=0.005) continue;
          // 跨界判定用"成块格数"而不是条带平均：一个人的头/手跨在裁切线上只占条带里 2~3 格，
          // 平均质量会被整条边带稀释到 2%，用平均值判等于永远拦不住。
          var straddle=(z.cross.blobs>=2 && z.kept.blobs>=2);
          var removeAll=(z.out.blobs>=3 && z.out.sum/total>=0.60);
          diag.push({edge:z.edge,crossBlobs:z.cross.blobs,crossAvg:+z.cross.avg.toFixed(3),keptBlobs:z.kept.blobs,outShare:+(z.out.sum/total).toFixed(2)});
          if(straddle||removeAll){
            return {veto:true, why:"裁掉的"+z.edge+"侧正切到人物皮肤（"+(straddle?"人跨在裁切线上":"会把人整个裁掉")+"）",
                    mode:straddle?"straddle":"removeAll", crossAvg:+z.cross.avg.toFixed(3), crossBlobs:z.cross.blobs, keptBlobs:z.kept.blobs, outShare:+(z.out.sum/total).toFixed(2), diag:diag};
          }
        }
        return {veto:false, diag:diag, skinTotal:total};
      }catch(e){ return {veto:false, crop:crop}; }
    }

    function _cropsIoU(c1, c2){
      var a1=[c1[0]/100,c1[1]/100,1-c1[2]/100,1-c1[3]/100];
      var a2=[c2[0]/100,c2[1]/100,1-c2[2]/100,1-c2[3]/100];
      var ix=Math.max(0,Math.min(a1[2],a2[2])-Math.max(a1[0],a2[0]));
      var iy=Math.max(0,Math.min(a1[3],a2[3])-Math.max(a1[1],a2[1]));
      var inter=ix*iy, u=a1[2]-a1[0], v=a1[3]-a1[1], u2=a2[2]-a2[0], v2=a2[3]-a2[1];
      var uni=u*v+u2*v2-inter;
      return uni>0?inter/uni:0;
    }

    function _cropsSimilar(c1, c2){
      var iou=_cropsIoU(c1,c2);
      if(iou>=0.88) return true;
      var a1=(1-c1[0]/100-c1[2]/100)*(1-c1[1]/100-c1[3]/100);
      var a2=(1-c2[0]/100-c2[2]/100)*(1-c2[1]/100-c2[3]/100);
      var cx1=(c1[0]-c1[2])/2+50, cy1=(c1[1]-c1[3])/2+50, cx2=(c2[0]-c2[2])/2+50, cy2=(c2[1]-c2[3])/2+50;
      var d=Math.sqrt((cx1-cx2)*(cx1-cx2)+(cy1-cy2)*(cy1-cy2))/100;
      return (Math.abs(a1-a2)<0.05 && d<0.05);
    }

    function _windowToCrop(x0,y0,x1,y1){
      return [Math.max(0,Math.round(x0*100)),Math.max(0,Math.round(y0*100)),
              Math.max(0,Math.round((1-x1)*100)),Math.max(0,Math.round((1-y1)*100))];
    }

    function _anchorWindow(cx, cy, keepArea, targetNX, targetNY){
      var s=Math.sqrt(Math.max(0.05,Math.min(1,keepArea)));
      var w=s, h=s;
      var x0=cx-targetNX*w, y0=cy-targetNY*h;
      if(x0<0) x0=0; if(x0+w>1) x0=1-w;
      if(y0<0) y0=0; if(y0+h>1) y0=1-h;
      return [x0,y0,x0+w,y0+h];
    }

    function _intentCandidates(a, plan, budget){
      var out=[];
      try{
        if(!a||!plan) return out;
        var ar=(typeof a.frameAspect==="number"&&isFinite(a.frameAspect))?a.frameAspect:1;
        var box=(a.sigBox&&a.sigBox.length===4)?a.sigBox:[0.25,0.25,0.75,0.75];
        var cx=(typeof a.cx==="number"&&isFinite(a.cx))?a.cx:0.5;
        var cy=(typeof a.cy==="number"&&isFinite(a.cy))?a.cy:0.5;
        var pb=_personBoxOf(a);
        // v13.1.0：只有"人物在画面里占比较大"才禁止生成意图候选；小人物照常生成候选，
        // 由 _validateNewCrop 的人物 3% 边距 / 物体保护 / 肤色边缘三重硬校验决定去留。
        var pbBig=(function(){ try{ return !!pb && Math.max(0,pb[2]-pb[0])*Math.max(0,pb[3]-pb[1])>=0.10; }catch(e){ return !!pb; } })();
        var topWarm=(a.topBandHsv&&typeof a.topBandHsv.ratio==="number")?a.topBandHsv.ratio:0;
        var protectTop=(topWarm>0.25||(typeof a.blueWater==="number"&&a.blueWater>0.55));
        var symStrong=(typeof a.sym==="number"&&a.sym>0.42);
        function push(win,intent,tag,reason){
          if(!win) return;
          var c=_windowToCrop(win[0],win[1],win[2],win[3]);
          var sum=c[0]+c[1]+c[2]+c[3];
          if(sum<=2) return;
          out.push({crop:c,intent:intent,tag:tag,reason:reason});
        }
        // 1) 主体三分（左/右交点）——把主体放到三分线交点，这是"随手拍→有构图"的最大一步
        var midArea=Math.max(budget.tightArea,0.45);
        if(!pbBig && !symStrong){
          push(_anchorWindow(cx,cy,midArea,1/3,0.5),"thirds-left","主体放左侧三分","把主体从正中间挪到左侧三分线，画面立刻有呼吸");
          push(_anchorWindow(cx,cy,midArea,2/3,0.5),"thirds-right","主体放右侧三分","把主体从正中间挪到右侧三分线，视线有延伸");
        }
        // 2) 地平线三分（上/下）——天空与地面二选一权重，正中间是最呆的位置
        var hy=(typeof a.row==="number"&&typeof a.rowGap==="number"&&a.rowGap>18)?(a.row/(a.gridH||16)):null;
        if(hy!==null && hy>0.15 && hy<0.85 && !pbBig){
          push(_anchorWindow(cx,hy,Math.max(budget.tightArea,0.40),0.5,1/3),"horizon-upper","地平线放上三分","把地平线压到上三分线，地面/前景成为主角");
          if(!protectTop) push(_anchorWindow(cx,hy,Math.max(budget.tightArea,0.40),0.5,2/3),"horizon-lower","地平线放下三分","把地平线抬到下三分线，天空/氛围占主导");
        }
        // 3) 主体紧抱（小框重构图）——抖音"魔法框"的核心：只留最值得看的那一块
        var subjW=Math.max(0.05,box[2]-box[0]), subjH=Math.max(0.05,box[3]-box[1]);
        var needArea=Math.max(budget.tightArea, Math.min(0.6,(subjW*1.6)*(subjH*1.6)));
        if(budget.allowTight && !pbBig && subjW<0.55 && subjH<0.55){
          push(_anchorWindow(cx,cy,needArea,0.5,0.5),"subject-tight","小框重构图","只框住最好看的那一块，主体占比明显变大");
          push(_anchorWindow(cx,cy,Math.min(0.62,needArea*1.7),1/3,0.5),"subject-tight-third","小框+三分","只留最好看的一块，并把主体放三分线");
        }
        // 4) 去死边——把低能量边带裁掉，杂物/空地面出局
        try{
          var col=(a.edgeEnergy&&a.edgeEnergy.col)||[], row=(a.edgeEnergy&&a.edgeEnergy.row)||a.edgeEnergy.eT||[];
          if(col.length>16&&row.length>16){
            var avg=function(arr,f0,f1){var s=0,c=0,i0=Math.floor(f0*arr.length),i1=Math.ceil(f1*arr.length);for(var i=Math.max(0,i0);i<Math.min(arr.length,i1);i++){s+=arr[i]||0;c++;}return c?s/c:0;};
            var midC=avg(col,0.3,0.7), midR=avg(row,0.3,0.7);
            var L=0,T=0,R=0,B=0, lim=budget.allowTight?0.16:0.10;
            if(avg(col,0,0.10)<midC*0.6) L=lim*0.6;
            if(avg(col,0.9,1)<midC*0.6) R=lim*0.6;
            if(avg(row,0,0.10)<midR*0.6 && !protectTop) T=lim*0.5;
            if(avg(row,0.9,1)<midR*0.6) B=lim*0.6;
            if(L+T+R+B>0.05) push([L,T,1-R,1-B],"deadzone-trim","裁掉空边","把没有内容的边带裁掉，画面更干净");
          }
        }catch(e){}
        // 4.5) v13.2 光影几何（自己找构图）：以"亮区∪显著主体"为目标框，
        //      按预算下限补足面积，生成"光影紧裁"与"对角线光影"两类候选。
        var lg=null; try{ lg=_lightGeometry(a); }catch(e){}
        if(lg&&lg.ok&&!pbBig){
          var _union=lg.bbox.slice();
          if(box&&box.length===4){
            _union[0]=Math.min(_union[0],box[0]); _union[1]=Math.min(_union[1],box[1]);
            _union[2]=Math.max(_union[2],box[2]); _union[3]=Math.max(_union[3],box[3]);
          }
          var _ucx=(_union[0]+_union[2])/2, _ucy=(_union[1]+_union[3])/2;
          var _uarea=Math.max(0.06,(_union[2]-_union[0])*(_union[3]-_union[1]));
          var _need=Math.max(budget.tightArea, Math.min(0.72,_uarea*1.28));
          push(_anchorWindow(_ucx,_ucy,_need,0.5,0.5),"light-tight","光影紧裁","只留光束和它的落点，明暗切割更利落");
          if(lg.diagRatio>=0.42){
            push(_anchorWindow(_ucx,_ucy,Math.min(0.80,_need*1.3),1/3,0.5),"light-diag","对角线光影","让光束沿对角线穿过画面");
          }
          if(lg.lowKey){
            push(_anchorWindow(_ucx,_ucy,Math.min(0.85,_need*1.6),0.5,2/3),"light-dark-frame","暗部做减法","压暗四周、保留亮区，氛围更集中");
          }
        }
        // 5) 社交画幅（保留旧能力：2:3 / 4:5 / 1:1 / 16:9），供"发朋友圈/小红书"直接用
        var targets=(ar<0.70)?[0.75,0.8]:(ar<0.95?[1,2/3,0.8]:(ar<1.45?[4/3,1,16/9]:[16/9,4/3,0.8]));
        for(var ti=0;ti<targets.length;ti++){
          var c=_candidateAspectCrop(a,targets[ti]);
          if(c) out.push({crop:c,intent:"aspect",tag:"画幅 "+_candidateRatioTag(c,ar),reason:"换成 "+_candidateRatioTag(c,ar)+" 更好发"});
        }
      }catch(e){}
      return out;
    }

    function _cloudTrimToCrop(baseCrop, trim){
      try{
        var c=(baseCrop||[0,0,0,0]).slice();
        var t=trim||{};
        var ALLOW={0:1,5:1,10:1,15:1,20:1,25:1};
        function v(x){ x=Math.round(Number(x)||0); if(x<0) x=0; if(!ALLOW[x]) { x=x<=2?0:(x<=7?5:(x<=12?10:(x<=17?15:(x<=22?20:25)))); } return Math.min(25,x); }
        return [Math.min(40,c[0]+v(t.l)),Math.min(40,c[1]+v(t.t)),Math.min(40,c[2]+v(t.r)),Math.min(40,c[3]+v(t.b))];
      }catch(e){ return (baseCrop||[0,0,0,0]).slice(); }
    }

    function _validateNewCrop(crop, a, scene, budget, opts){
      try{
        opts=opts||{};
        if(!crop||crop.length!==4) return {ok:false, why:"裁切参数不完整"};
        var c=crop.map(function(v){return Math.round(v);});
        var sum=c[0]+c[1]+c[2]+c[3];
        if(sum<=5) return {ok:false, why:"几乎没裁（四边合计 "+sum+"%）"}; // 微裁一律归零：产品口径"要么明显更好，要么不动"
        var area=(1-c[0]/100-c[2]/100)*(1-c[1]/100-c[3]/100);
        var _floorArea=(typeof budget.tightArea==="number"&&budget.tightArea>0)?budget.tightArea:budget.minArea;
        if(area<_floorArea) return {ok:false, why:"裁得太狠（保留 "+Math.round(area*100)+"% < 允许 "+Math.round(_floorArea*100)+"%）"};
        var mxEdge=Math.max(c[0],c[1],c[2],c[3]);
        // 分级幅度上限：宠物最脆、有人物次之；无人物的大场景/美食允许"小框重构图"。
        // 注意真正的硬约束是"保留面积 ≥ tightArea"（等价于限制等效变焦），
        // 四边合计只是防止某一边吃掉整幅；对称紧裁（25/25/25/25）合计会到 100，属合法构图。
        var sc2=String(scene||"");
        var capEdge=45, capSum=150;
        if(sc2==="animal"){ capEdge=8; capSum=25; }
        else if(sc2==="food"){ capEdge=30; capSum=130; } // 餐盘居中紧裁需要四边同时收，面积下限才是真约束
        else if(_personBoxOf(a)){ capEdge=15; capSum=40; }
        // 允许"小框重构图"的场景：居中紧裁必然让四边同时收到 (1-√面积下限)/2，
        // 单边上限必须跟着放开，否则魔法框那种 10~16% 的居中紧裁永远被单边上限误杀。
        if(budget.allowTight){
          var _edgeNeed=Math.ceil((1-Math.sqrt(Math.max(0.02,budget.tightArea)))/2*100)+5; // +5：主体不在正中心时两侧不对称
          capEdge=Math.max(capEdge,Math.min(45,_edgeNeed));
          capSum=Math.max(capSum,4*_edgeNeed);
        }
        if(mxEdge>capEdge) return {ok:false, why:"单边裁切 "+mxEdge+"% 超过该场景上限 "+capEdge+"%"};
        if(sum>capSum) return {ok:false, why:"四边合计 "+sum+"% 超过上限 "+capSum+"%"};
        var ev=_subjectEvidence(a,null);
        if(!ev.ok) return {ok:false, why:ev.why};
        var sk=_skinEdgeGuard(c,a);
        if(sk.veto) return {ok:false, why:sk.why};
        var qs=_cropQualityScore(a,c,false);
        if(qs<0) return {ok:false, why:"切到主体/人物/物体"};
        // 人物：任何一条边都必须离人物框 ≥3%，多主体一律拒绝大裁（Twitter 裁切研究的教训）
        var pb=_personBoxOf(a);
        if(pb && (pb[0]<c[0]/100+0.03||pb[1]<c[1]/100+0.03||pb[2]>1-c[2]/100-0.03||pb[3]>1-c[3]/100-0.03)) return {ok:false, why:"会切到人物"};
        if(area<0.45 && Array.isArray(a.allBoxes)){
          var pc=0; for(var i=0;i<a.allBoxes.length;i++){ if(a.allBoxes[i]&&a.allBoxes[i].class==="person") pc++; }
          if(pc>1) return {ok:false, why:"画面里不止一个人，大裁会丢掉其他人"};
        }
        // 物体保护：_objectGuard 若改变裁切，说明原方案切到了物体
        try{
          if(Array.isArray(a.allBoxes)&&a.allBoxes.length){
            var g=_objectGuard(c,a.allBoxes);
            if(JSON.stringify(g)!==JSON.stringify(c)) return {ok:false, why:"会切到画面里的物体"};
          }
        }catch(e){}
        return {ok:true, score:qs, area:area};
      }catch(e){ return {ok:false, why:"校验异常"}; }
    }

    function _nonDeadEdgeCalm(crop, ee){
      try{
        if(!crop||crop.length!==4) return crop;
        var c=crop.map(function(v){return v;});
        var row=(ee&&ee.row)||[], col=(ee&&ee.col)||[];
        if(!row.length||!col.length) return c;
        function avg(arr,f0,f1){
          var i0=Math.floor(f0*arr.length), i1=Math.ceil(f1*arr.length), s=0,n=0;
          for(var i=Math.max(0,i0);i<Math.min(arr.length,i1);i++){ s+=(arr[i]||0); n++; }
          return n?s/n:0;
        }
        var cR=avg(row,0.30,0.70), cC=avg(col,0.30,0.70);
        var THR=0.50, BIG=16; // 单边裁≥16% 且条带能量>中心50% → 判为非死边，该边裁量减半
        if(c[1]>=BIG){ var tS=avg(row,0,c[1]/100);          if(tS>cR*THR) c[1]=Math.round(c[1]*0.5); }
        if(c[3]>=BIG){ var bS=avg(row,1-c[3]/100,1);        if(bS>cR*THR) c[3]=Math.round(c[3]*0.5); }
        if(c[0]>=BIG){ var lS=avg(col,0,c[0]/100);          if(lS>cC*THR) c[0]=Math.round(c[0]*0.5); }
        if(c[2]>=BIG){ var rS=avg(col,1-c[2]/100,1);        if(rS>cC*THR) c[2]=Math.round(c[2]*0.5); }
        return c;
      }catch(e){ return crop; }
    }

module.exports = { _deriveCrop, _smartCrop, _landscapeCrop, _classifyYaw, _gazeGuard, _edgeSnap, _rodGuard, _cloudCropIntentGuard, _jointGuard, _objectGuard, _portraitFraming, _aspectCrop, _figureGround, _yoloNMS, _estTiltDeg, _guidanceEyeLevel, _guidanceEyeOnGrid, _guidanceDistance, _guidanceOrientation, _faceLightSplit, _lightPosition, _warmLightHint, _windowLightHint, _lowAngleAdvice, _composeDiagnosis, _recommendFilter, _confBand, _medianBox, _consensusPerson, _sceneDebounce, _debangText, _applyPref, _lightDiagnosisPro, _gazeGuardPro, _guidanceDistancePro, _guidanceWaistLevel, _singlePersonGate, _classifyComposition, _composeOverlay, _finalPipelinePlan, _classifyMulti, _scenePrefix, _sceneComposeTip, _aimAlign, _composeVariants, _deadZoneStrength, _cropIntentFromBox, _directionsOppose, _hardProtectionHit, _localConf, _extractIntentLocal, _parseIntentCloud, _negotiateBox, _arbitrateCrop, _hueInWarmBand, _sunsetWarmGuard, _foodMisClassGuard, _symmetryGuard, _decloudPlan, _bandSatSignal, _symEdgeSignal, _foodEvidenceSignal, _contentGuard, _isRealPortrait, _realEdgeDensity, _gridStdCV, _realContentGuard, _bandDead, _thirdsFitScore, aestheticScore, _cloudCropGuard, _personBoxOf, _proactiveComposition, _balanceCrop, _cropQualityScore, _saferCropVariant, _candidateRatioTag, _candidateAspectCrop, _buildCompositionCandidates, _srcMegapixels, _cropBudget, _subjectEvidence, _skinEdgeGuard, _cropsIoU, _cropsSimilar, _windowToCrop, _anchorWindow, _intentCandidates, _cloudTrimToCrop, _validateNewCrop, _nonDeadEdgeCalm };
