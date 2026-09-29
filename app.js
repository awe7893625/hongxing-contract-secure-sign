(function(){
"use strict";
var VERSION="HX-CONTRACT-SECURE-2026-09-29-v2";
var STORAGE_KEY="hongxing-contract-secure-v2";
var app=document.getElementById("app");
var canvas=document.getElementById("buyerSignature");
var pad=document.getElementById("signaturePad");
var hint=document.getElementById("signatureHint");
var ctx=null,dpr=1,drawing=false,hasInk=false,history=[],locked=false,unlocked=false,securePayload=null;
var saveEls=Array.prototype.slice.call(document.querySelectorAll("[data-save]"));

function q(id){return document.getElementById(id);}
function b64urlToBytes(s){
  s=s.replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  var raw=atob(s),out=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
function bytesToHex(arr){return Array.from(arr).map(function(x){return x.toString(16).padStart(2,"0");}).join("");}
function toast(msg){
  var t=document.getElementById("toast");
  if(!t){t=document.createElement("div");t.id="toast";t.style.cssText="position:fixed;left:50%;bottom:28px;transform:translateX(-50%);background:#171917;color:#fff;padding:11px 16px;border-radius:8px;z-index:9999;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,.22);transition:opacity .2s";document.body.appendChild(t);}
  t.textContent=msg;t.style.opacity="1";clearTimeout(t._timer);t._timer=setTimeout(function(){t.style.opacity="0";},2400);
}
async function unlockSecure(){
  var params=new URLSearchParams(location.hash.slice(1));
  var keyText=params.get("k");
  if(!keyText){return false;}
  try{
    var enc=await fetch("secure.json",{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error("secure.json");return r.json();});
    var keyBytes=b64urlToBytes(keyText);
    if(keyBytes.length!==32)throw new Error("key length");
    var key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["decrypt"]);
    var iv=b64urlToBytes(enc.iv),ct=b64urlToBytes(enc.ciphertext);
    var pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:iv,additionalData:new TextEncoder().encode(enc.aad),tagLength:128},key,ct);
    securePayload=JSON.parse(new TextDecoder().decode(pt));
    q("bankName").textContent=securePayload.bank_name+"（"+securePayload.bank_code+"）";
    q("bankAccount").textContent=securePayload.bank_account;
    q("paymentLocked").hidden=true;q("paymentUnlocked").hidden=false;
    var box=q("sellerSignature");box.innerHTML="";
    var img=document.createElement("img");img.src=securePayload.seller_signature_data_url;img.alt="乙方林震宇手寫簽章";box.appendChild(img);
    unlocked=true;
    return true;
  }catch(e){
    q("paymentLocked").textContent="受保護資訊解鎖失敗（"+(e && e.name ? e.name : "Unknown")+")";
    toast("專屬簽約連結無法解鎖，請確認網址完整");
    return false;
  }
}

function setupCanvas(preserve){
  var previous=null;
  if(preserve&&canvas.width&&canvas.height&&hasInk)previous=canvas.toDataURL("image/png");
  var rect=pad.getBoundingClientRect();
  dpr=Math.max(1,Math.min(3,window.devicePixelRatio||1));
  canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);
  canvas.style.width=rect.width+"px";canvas.style.height=rect.height+"px";
  ctx=canvas.getContext("2d");ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=2.15;ctx.strokeStyle="#153c76";
  if(previous){
    var im=new Image();im.onload=function(){ctx.drawImage(im,0,0,rect.width,rect.height);};im.src=previous;
  }
}
function point(e){var r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
function start(e){if(locked)return;e.preventDefault();drawing=true;var p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y);try{canvas.setPointerCapture(e.pointerId);}catch(_){}}
function move(e){if(!drawing||locked)return;e.preventDefault();var p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke();hasInk=true;hint.hidden=true;}
function end(e){if(!drawing)return;e.preventDefault();drawing=false;if(hasInk){history.push(canvas.toDataURL("image/png"));if(history.length>30)history.shift();persist();}}
canvas.addEventListener("pointerdown",start);canvas.addEventListener("pointermove",move);canvas.addEventListener("pointerup",end);canvas.addEventListener("pointercancel",end);
window.addEventListener("resize",function(){setupCanvas(true);});

q("clearSig").addEventListener("click",function(){if(locked)return;ctx.clearRect(0,0,canvas.width/dpr,canvas.height/dpr);hasInk=false;history=[];hint.hidden=false;persist();});
q("undoSig").addEventListener("click",function(){
  if(locked||!history.length)return;history.pop();ctx.clearRect(0,0,canvas.width/dpr,canvas.height/dpr);
  if(!history.length){hasInk=false;hint.hidden=false;persist();return;}
  var src=history[history.length-1],im=new Image(),r=pad.getBoundingClientRect();
  im.onload=function(){ctx.drawImage(im,0,0,r.width,r.height);hasInk=true;hint.hidden=true;persist();};im.src=src;
});

function values(){var out={};saveEls.forEach(function(el){out[el.id]=el.type==="checkbox"?el.checked:el.value;});return out;}
function state(){return{version:VERSION,values:values(),signature:hasInk?canvas.toDataURL("image/png"):"",signedAt:q("signedAt").textContent||"",hash:q("contractHash").textContent||"",locked:locked};}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state()));}catch(e){}}
function restore(){
  try{
    var raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;var s=JSON.parse(raw);if(s.version!==VERSION)return;
    saveEls.forEach(function(el){if(!Object.prototype.hasOwnProperty.call(s.values,el.id))return;if(el.type==="checkbox")el.checked=!!s.values[el.id];else el.value=s.values[el.id]||"";});
    if(s.signature){
      var im=new Image(),r=pad.getBoundingClientRect();
      im.onload=function(){ctx.drawImage(im,0,0,r.width,r.height);hasInk=true;history=[s.signature];hint.hidden=true;};im.src=s.signature;
    }
    if(s.signedAt)q("signedAt").textContent=s.signedAt;if(s.hash)q("contractHash").textContent=s.hash;
    if(s.locked)setLocked(true);
  }catch(e){}
}
saveEls.forEach(function(el){el.addEventListener("input",persist);el.addEventListener("change",persist);});
q("saveBtn").addEventListener("click",function(){persist();toast("草稿已儲存在這台裝置");});

function setLocked(v){
  locked=v;app.classList.toggle("locked",v);saveEls.forEach(function(el){el.disabled=v;});q("clearSig").disabled=v;q("undoSig").disabled=v;
  q("finalizeBtn").disabled=v;
  q("sealStatus").textContent=v?"已完成簽署":"尚未完成簽署";
  q("sealMeta").hidden=!v;
}
function requiredOk(){
  var miss=[];
  if(!unlocked)miss.push("專屬簽約連結");
  if(!q("partyAName").value.trim())miss.push("甲方名稱");
  if(!q("partyARep").value.trim())miss.push("甲方代表人 / 聯絡人");
  if(!q("buyerDate").value)miss.push("甲方簽署日期");
  if(!hasInk)miss.push("甲方手寫簽名");
  ["agreeTerms","agreeScope","agreeSeo"].forEach(function(id){if(!q(id).checked)miss.push("三項簽署確認");});
  if(miss.length){toast("請先完成："+Array.from(new Set(miss)).join("、"));return false;}return true;
}
async function sha256(text){var h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return bytesToHex(new Uint8Array(h));}
function canonicalPayload(){
  return JSON.stringify({version:VERSION,values:values(),buyerSignature:hasInk?canvas.toDataURL("image/png"):"",seller:"林震宇",sellerSignedDate:"2026-09-29",payment:securePayload?{bank:securePayload.bank_name,code:securePayload.bank_code,account:securePayload.bank_account}:null,contract:q("contract").innerText.replace(/契約 SHA-256 摘要[\s\S]*$/,"").trim()});
}
q("finalizeBtn").addEventListener("click",async function(){
  if(!requiredOk())return;
  q("signedAt").textContent=new Date().toLocaleString("zh-TW",{hour12:false});
  try{q("contractHash").textContent=await sha256(canonicalPayload());setLocked(true);persist();toast("簽署完成，請下載副本並存成 PDF");}
  catch(e){toast("無法產生契約摘要，請確認以 HTTPS 開啟");}
});
q("editBtn").addEventListener("click",function(){
  if(!locked){toast("目前可直接編輯");return;}
  if(confirm("解除簽署鎖定後，原 SHA-256 摘要會失效。確定繼續？")){q("contractHash").textContent="";q("signedAt").textContent="";setLocked(false);persist();toast("已解除鎖定");}
});
function safeName(){return(q("partyAName").value.trim()||"甲方").replace(/[\\/:*?"<>|]/g,"_");}
function download(name,blob){var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1600);}
async function archiveHtml(){
  var clone=document.documentElement.cloneNode(true);
  clone.querySelectorAll("script,.topbar,.privacy-note .no-print,.no-print").forEach(function(x){x.remove();});
  clone.querySelectorAll("[data-save]").forEach(function(el){
    var original=document.getElementById(el.id),span=document.createElement("span");span.className="archive-value";
    span.textContent=original.type==="checkbox"?(original.checked?"☑ 已確認":"☐ 未確認"):(original.value||"");
    el.replaceWith(span);
  });
  var cc=clone.querySelector("#buyerSignature");
  if(cc){var sig=document.createElement("img");sig.src=hasInk?canvas.toDataURL("image/png"):"";sig.alt="甲方手寫簽名";sig.style.cssText="width:100%;height:140px;object-fit:contain;border:1px solid #aaa";cc.parentElement.replaceWith(sig);}
  clone.querySelectorAll(".signature-pad__hint,.signature-tools,.final-actions").forEach(function(x){x.remove();});
  var css=await fetch("style.css",{cache:"no-store"}).then(function(r){return r.text();});
  var link=clone.querySelector('link[rel="stylesheet"]');if(link){var st=document.createElement("style");st.textContent=css;link.replaceWith(st);}
  return"<!doctype html>\n"+clone.outerHTML;
}
q("archiveBtn").addEventListener("click",async function(){if(!locked){toast("請先完成簽署");return;}var html=await archiveHtml();download("鴻星窗簾網站建置契約_"+safeName()+"_"+q("buyerDate").value+".html",new Blob([html],{type:"text/html;charset=utf-8"}));});
q("recordBtn").addEventListener("click",function(){
  if(!locked){toast("請先完成簽署");return;}
  var rec=state();rec.seller="林震宇";rec.sellerSignedDate="2026-09-29";rec.payment=securePayload?{bank:securePayload.bank_name,code:securePayload.bank_code,account:securePayload.bank_account}:null;
  download("鴻星窗簾網站建置契約_"+safeName()+"_"+q("buyerDate").value+".json",new Blob([JSON.stringify(rec,null,2)],{type:"application/json"}));
});
q("printBtn").addEventListener("click",function(){window.print();});

setupCanvas(false);
restore();
unlockSecure().then(function(ok){if(!ok)toast("目前為鎖定檢視；請使用寄給你的專屬簽約連結");});
})();