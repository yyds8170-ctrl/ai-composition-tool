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

module.exports = { _deriveCrop, _jointGuard, _objectGuard, _figureGround, _yoloNMS, _estTiltDeg };
