(function(){
"use strict";

var VERSION="HX-CONTRACT-2026-09-29-v4";
var STORAGE_KEY="hongxing-contract-v4";
var app=document.getElementById("app");
var canvas=document.getElementById("buyerSignature");
var pad=document.getElementById("signaturePad");
var hint=document.getElementById("signatureHint");
var ctx=null,dpr=1,drawing=false,hasInk=false,history=[],locked=false,unlocked=false,securePayload=null;
var saveEls=Array.prototype.slice.call(document.querySelectorAll("[data-save]"));
var latestPdfBlob=null;

function q(id){return document.getElementById(id);}
function esc(s){return String(s||"").replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]);});}
function b64urlToBytes(s){
  s=s.replace(/-/g,"+").replace(/_/g,"/");
  while(s.length%4)s+="=";
  var raw=atob(s),out=new Uint8Array(raw.length);
  for(var i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
  return out;
}
function bytesToHex(arr){return Array.from(arr).map(function(x){return x.toString(16).padStart(2,"0");}).join("");}
function safeName(){return(q("partyAName").value.trim()||"甲方").replace(/[\\/:*?"<>|]/g,"_");}
function formatDate(v){
  if(!v)return"";
  var p=v.split("-");
  return Number(p[0])+"年"+Number(p[1])+"月"+Number(p[2])+"日";
}
function toast(msg){
  var t=document.getElementById("toast");
  if(!t){
    t=document.createElement("div");t.id="toast";
    t.style.cssText="position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#171817;color:#fff;padding:10px 14px;border-radius:7px;z-index:9999;font-size:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);transition:opacity .2s;max-width:calc(100% - 28px);text-align:center";
    document.body.appendChild(t);
  }
  t.textContent=msg;t.style.opacity="1";clearTimeout(t._timer);t._timer=setTimeout(function(){t.style.opacity="0";},2600);
}

async function unlockSecure(){
  var params=new URLSearchParams(location.hash.slice(1));
  var keyText=params.get("k");
  if(!keyText)return false;
  try{
    var enc=await fetch("secure.json",{cache:"no-store"}).then(function(r){if(!r.ok)throw new Error("secure");return r.json();});
    var keyBytes=b64urlToBytes(keyText);
    var key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["decrypt"]);
    var pt=await crypto.subtle.decrypt({
      name:"AES-GCM",
      iv:b64urlToBytes(enc.iv),
      additionalData:new TextEncoder().encode(enc.aad),
      tagLength:128
    },key,b64urlToBytes(enc.ciphertext));
    securePayload=JSON.parse(new TextDecoder().decode(pt));
    q("bankName").textContent=securePayload.bank_name+"（"+securePayload.bank_code+"）";
    q("bankAccount").textContent=securePayload.bank_account;
    q("paymentLocked").hidden=true;q("paymentUnlocked").hidden=false;
    var box=q("sellerSignature");box.innerHTML="";
    var img=document.createElement("img");img.src=securePayload.seller_signature_data_url;img.alt="乙方林震宇手寫簽章";box.appendChild(img);
    unlocked=true;
    return true;
  }catch(e){
    toast("專屬簽約連結無法解鎖");
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
  ctx.lineCap="round";ctx.lineJoin="round";ctx.lineWidth=2.1;ctx.strokeStyle="#153b75";
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

function values(){
  var out={};
  saveEls.forEach(function(el){out[el.id]=el.type==="checkbox"?el.checked:el.value;});
  return out;
}
function state(){
  return{
    version:VERSION,values:values(),signature:hasInk?canvas.toDataURL("image/png"):"",
    signedAt:q("signedAt").textContent||"",hash:q("contractHash").textContent||"",
    delivery:q("deliveryStatus").textContent||"",locked:locked
  };
}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state()));}catch(e){}}
function restore(){
  try{
    var raw=localStorage.getItem(STORAGE_KEY);if(!raw)return;
    var s=JSON.parse(raw);if(s.version!==VERSION)return;
    saveEls.forEach(function(el){if(!Object.prototype.hasOwnProperty.call(s.values,el.id))return;el.type==="checkbox"?el.checked=!!s.values[el.id]:el.value=s.values[el.id]||"";});
    if(s.signature){
      var im=new Image(),r=pad.getBoundingClientRect();
      im.onload=function(){ctx.drawImage(im,0,0,r.width,r.height);hasInk=true;history=[s.signature];hint.hidden=true;};im.src=s.signature;
    }
    if(s.signedAt)q("signedAt").textContent=s.signedAt;
    if(s.hash)q("contractHash").textContent=s.hash;
    if(s.delivery)q("deliveryStatus").textContent=s.delivery;
    if(s.locked)setLocked(true);
    updateDateText();
  }catch(e){}
}
saveEls.forEach(function(el){el.addEventListener("input",function(){updateDateText();persist();});el.addEventListener("change",function(){updateDateText();persist();});});
q("saveBtn").addEventListener("click",function(){persist();toast("草稿已儲存在這台裝置");});
function updateDateText(){q("buyerDateText").textContent=formatDate(q("buyerDate").value);}

function setLocked(v){
  locked=v;app.classList.toggle("locked",v);
  saveEls.forEach(function(el){el.disabled=v;});
  q("clearSig").disabled=v;q("undoSig").disabled=v;q("finalizeBtn").disabled=v;
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
  if(miss.length){toast("請先完成："+Array.from(new Set(miss)).join("、"));return false;}
  return true;
}
async function sha256(text){
  var h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(h));
}
function canonicalPayload(){
  return JSON.stringify({
    version:VERSION,
    values:values(),
    buyerSignature:hasInk?canvas.toDataURL("image/png"):"",
    seller:"林震宇",
    sellerSignedDate:"2026-09-29",
    payment:securePayload?{bank:securePayload.bank_name,code:securePayload.bank_code,account:securePayload.bank_account}:null,
    terms:[
      "WordPress + Elementor 多頁式形象網站",
      "總價 NT$30,000；50% 啟動款 + 50% Staging 驗收後/正式切站前",
      "預計工期 10–15 個工作天；固定價內含 2 輪集中修改",
      "9 組舊 URL 301、Local SEO、Search Console 串接協助、Highest Administrator、教學交接",
      "Google 排名/流量/收錄時間不保證",
      "60 日既定功能 Bug 保固與本頁所列售後收費",
      "甲方付清後可永久使用及修改最終客製成果；第三方授權依其條款"
    ]
  });
}

function pdfHeader(pageNo,title){
  return '<div class="pdf-head"><div><div class="pdf-brand">HONG XING CURTAIN</div><div class="pdf-title">'+title+'</div><div class="pdf-sub">網站設計・建置・交接｜契約版本 2026-09-29</div></div><div class="pdf-page-no">PAGE '+pageNo+' / 4</div></div>';
}
function pdfFooter(){
  return '<div class="pdf-footer"><span>鴻星窗簾網站建置契約</span><span>乙方：林震宇</span></div>';
}
function buildPdfStage(){
  if(!securePayload)throw new Error("secure data locked");
  var buyerSig=hasInk?canvas.toDataURL("image/png"):"";
  var sellerSig=securePayload.seller_signature_data_url;
  var party=values();
  var bank=esc(securePayload.bank_name)+"（"+esc(securePayload.bank_code)+"） "+esc(securePayload.bank_account);
  var hash=esc(q("contractHash").textContent||"尚未簽署");
  var signedAt=esc(q("signedAt").textContent||"");
  var buyerDate=esc(formatDate(q("buyerDate").value));
  var stage=q("pdfStage");
  stage.innerHTML=
    '<section class="pdf-page">'+pdfHeader(1,"鴻星窗簾網站建置契約書")+
      '<div class="pdf-block"><div class="pdf-grid">'+
        '<div class="pdf-field"><small>甲方（委託人）</small><b>'+esc(party.partyAName)+'</b></div>'+
        '<div class="pdf-field"><small>甲方統一編號</small><b>'+esc(party.partyATax)+'</b></div>'+
        '<div class="pdf-field"><small>甲方代表人 / 聯絡人</small><b>'+esc(party.partyARep)+'</b></div>'+
        '<div class="pdf-field"><small>甲方聯絡電話</small><b>'+esc(party.partyAPhone)+'</b></div>'+
        '<div class="pdf-field"><small>甲方 Email</small><b>'+esc(party.partyAEmail)+'</b></div>'+
        '<div class="pdf-field"><small>乙方（受託人）</small><b>林震宇</b></div>'+
      '</div></div>'+
      '<div class="pdf-block"><h3>一、專案與價金</h3><div class="pdf-money"><div><p><b>專案總價：NT$30,000</b></p><p>簽約啟動款 50%：NT$15,000</p><p>Staging 驗收通過、正式切站前尾款 50%：NT$15,000</p><p>預計工期：第一期款與必要資料到齊後 10–15 個工作天。</p></div><div class="pdf-bank"><small>轉帳資訊</small><p><b>'+bank+'</b></p><p>第三方主機、網域、Elementor、付費外掛及 SaaS 由甲方直接支付。</p></div></div></div>'+
      '<div class="pdf-block"><h3>二、建置內容</h3><ul><li>WordPress + Elementor 多頁式形象網站，交付甲方 Highest Administrator。</li><li>首頁：門市資訊、電話、Google 地圖、完工大圖、主要產品、精選案例與免費丈量 CTA。</li><li>產品分類：布簾、遮光、蛇形 / 蛇簾、調光捲簾、蜂巢簾、羅馬簾、塑膠拉門、壁紙、木百葉、片簾、紗簾等，可共用產品模板。</li><li>完工案例後台：封面、Gallery、地區、產品、空間、風格、日期、摘要、需求與解法皆可自行管理。</li><li>Local SEO、Sitemap、LocalBusiness Schema、Google Maps、RWD、Search Console 串接協助。</li><li>依甲方確認之 9 組舊 URL 對應建立 301，協助正式 DNS 切換。</li></ul></div>'+
      pdfFooter()+'</section>'+

    '<section class="pdf-page">'+pdfHeader(2,"履約、修改與驗收")+
      '<div class="pdf-block"><h3>三、工期與修改</h3><ol><li>第一期款與必要資料到齊後，預計 10–15 個工作天完成 Staging；甲方延遲資料、驗證或回饋時，工期相應順延。</li><li>固定價內含 2 輪集中式設計 / 版面修改；確實不符合本契約規格之修正不計入美感方向修改。</li><li>已確認方向後全面換風格、新增頁面、新功能或新串接，屬追加需求，須另行報價並以可保存文字確認。</li></ol></div>'+
      '<div class="pdf-block"><h3>四、客觀驗收</h3><table class="pdf-accept"><tr><th>類別</th><th>驗收標準</th></tr><tr><td>網站</td><td>核心頁正常、主要圖片正常、390px 手機無明顯水平溢出，Chromium / Safari 核心功能可用。</td></tr><tr><td>案例後台</td><td>可新增、換封面 / Gallery、分類、草稿 / 發布，發布後有獨立 URL。</td></tr><tr><td>SEO</td><td>production 無 noindex；robots、Sitemap、主要 Meta、LocalBusiness Schema 可驗證。</td></tr><tr><td>301 / DNS</td><td>9 組 mapping 經甲方確認；切站前保留 DNS snapshot，避免影響既有 Email。</td></tr><tr><td>交接</td><td>Highest Administrator 交付；甲方可自行發布一篇測試案例。</td></tr></table><p>Staging 交付後，甲方應於 5 個工作日內一次提出具體不符合項目。</p></div>'+
      '<div class="pdf-block"><h3>五、SEO 邊界</h3><p>乙方負責合理之技術 SEO 與搜尋引擎可存取條件，但不保證 Google 排名、流量、關鍵字第一頁或特定收錄時間。Google Business / Search Console 如要求 Owner 驗證，由甲方本人完成。</p></div>'+
      pdfFooter()+'</section>'+

    '<section class="pdf-page">'+pdfHeader(3,"所有權、保固與售後")+
      '<div class="pdf-block"><h3>六、所有權與素材</h3><ul><li>網域、Hosting、Google Business、Search Console、GA4、Elementor 等核心資產由甲方持有 Owner / 最高權限。</li><li>甲方提供之照片、文字、Logo 等素材，由甲方確認具有合法使用權。</li><li>甲方付清全部價款後，可永久使用及修改本網站最終客製成果，也可委託第三方接手維護。</li><li>WordPress、Elementor、開源套件、第三方外掛、字型與圖庫仍依各自授權條款；乙方既有通用工具與可重複利用元件不因本案移轉。</li></ul></div>'+
      '<div class="pdf-block"><h3>七、保固與售後</h3><p><b>免費保固：</b>正式上線 / 驗收完成（以較晚者為準）起 60 日，既定功能 Bug 或乙方上架內容與核准內容不一致，免費修正。</p><p><b>不屬免費保固：</b>換圖 / 改字、新頁面 / 新功能、已驗收設計重新改版、甲方或第三人自行修改造成故障、第三方重大更新、帳密外洩或主機商故障。</p><table class="pdf-accept"><tr><th>售後項目</th><th>收費</th></tr><tr><td>文字 / 圖片 / 電話 / 營業時間</td><td>NT$1,000 / 小時，最低 1 小時</td></tr><tr><td>Elementor / RWD / 版面樣式</td><td>NT$1,500 / 小時，最低 1 小時</td></tr><tr><td>既有模板新增頁面</td><td>NT$3,000 起 / 頁</td></tr><tr><td>新功能 / 互動 / 第三方串接</td><td>NT$5,000 起，另行報價</td></tr><tr><td>24 小時內急件</td><td>一般費率 × 1.5</td></tr></table><p>不強制購買月維護；如需代管更新、備份與健康檢查，可另選 NT$2,000 / 月起維護方案。</p></div>'+
      '<div class="pdf-block"><h3>八、終止與準據法</h3><p>甲方於專案中途取消，第一期款用於結算已投入之規劃、設計與開發，不當然退還；乙方無正當理由拒絕履行主要約定，甲方得要求限期改善，未改善時依未完成比例協商退款。本契約以中華民國（台灣）法律為準據法；爭議先誠信協商，如需訴訟依法律規定之有管轄權法院辦理。</p></div>'+
      pdfFooter()+'</section>'+

    '<section class="pdf-page">'+pdfHeader(4,"簽署頁")+
      '<div class="pdf-block"><h3>九、簽署確認</h3><p>甲方確認已閱讀並同意本契約全部條款、付款方式、驗收方式及售後收費；確認固定價範圍、2 輪集中修改、9 組 301 範圍與第三方費用由甲方直接支付；並了解 SEO / Search Console 為技術協助，不包含 Google 排名、流量或收錄時間保證。</p></div>'+
      '<div class="pdf-sign-grid"><div class="pdf-sign-box"><b>甲方（委託人）　'+esc(party.partyAName)+'</b><div class="pdf-sign-img">'+(buyerSig?'<img src="'+buyerSig+'">':'')+'</div><p>代表人 / 聯絡人：'+esc(party.partyARep)+'</p><p>簽署日期：'+buyerDate+'</p></div><div class="pdf-sign-box"><b>乙方（受託人）　林震宇</b><div class="pdf-sign-img"><img src="'+sellerSig+'"></div><p>簽署日期：2026年9月29日</p></div></div>'+
      '<div class="pdf-block" style="margin-top:22px"><h3>簽署紀錄</h3><p>完成時間：'+signedAt+'</p><p>契約 SHA-256 摘要：</p><div class="pdf-hash">'+hash+'</div></div>'+
      pdfFooter()+'</section>';
  return Array.prototype.slice.call(stage.querySelectorAll(".pdf-page"));
}

async function generatePdfBlob(){
  if(!window.html2canvas||!window.jspdf)throw new Error("PDF library unavailable");
  var pages=buildPdfStage();
  var jsPDF=window.jspdf.jsPDF;
  var pdf=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
  for(var i=0;i<pages.length;i++){
    if(i>0)pdf.addPage();
    var c=await window.html2canvas(pages[i],{scale:1.7,backgroundColor:"#ffffff",useCORS:true,logging:false});
    var img=c.toDataURL("image/jpeg",0.93);
    pdf.addImage(img,"JPEG",0,0,210,297,undefined,"FAST");
  }
  return pdf.output("blob");
}

function downloadBlob(name,blob){
  var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove();},1800);
}
q("previewPdfBtn").addEventListener("click",async function(){
  if(!unlocked){toast("請使用專屬簽約連結開啟");return;}
  var win=window.open("about:blank","_blank");
  try{
    var blob=await generatePdfBlob(),url=URL.createObjectURL(blob);
    if(win)win.location.href=url;else downloadBlob("鴻星窗簾網站建置契約_預覽.pdf",blob);
    setTimeout(function(){URL.revokeObjectURL(url);},120000);
  }catch(e){if(win)win.close();toast("PDF 產生失敗，請稍後再試");}
});

async function sendSignedPdf(pdfBlob){
  if(!securePayload||!securePayload.formsubmit_token)throw new Error("delivery endpoint locked");
  var fd=new FormData();
  fd.append("_subject","鴻星窗簾網站建置契約｜"+q("partyAName").value.trim()+" 已簽署");
  fd.append("_template","table");
  fd.append("_captcha","false");
  fd.append("_url",location.href.split("#")[0]);
  fd.append("甲方名稱",q("partyAName").value.trim());
  fd.append("甲方代表人",q("partyARep").value.trim());
  fd.append("甲方電話",q("partyAPhone").value.trim());
  fd.append("甲方Email",q("partyAEmail").value.trim());
  fd.append("簽署日期",formatDate(q("buyerDate").value));
  fd.append("完成時間",q("signedAt").textContent);
  fd.append("契約SHA256",q("contractHash").textContent);
  fd.append("message","鴻星窗簾網站建置契約已完成線上簽署，正式 PDF 已附檔。");
  if(q("partyAEmail").value.trim())fd.append("_replyto",q("partyAEmail").value.trim());
  var file=new File([pdfBlob],"鴻星窗簾網站建置契約_"+safeName()+"_"+q("buyerDate").value+".pdf",{type:"application/pdf"});
  fd.append("attachment",file);
  var endpoint="https://formsubmit.co/ajax/"+securePayload.formsubmit_token;
  var resp=await fetch(endpoint,{method:"POST",headers:{"Accept":"application/json"},body:fd});
  var data=await resp.json().catch(function(){return{};});
  if(!resp.ok||String(data.success).toLowerCase()!=="true")throw new Error(data.message||"delivery failed");
  return data;
}

q("finalizeBtn").addEventListener("click",async function(){
  if(!requiredOk())return;
  q("finalizeBtn").disabled=true;q("finalizeBtn").textContent="正在簽署並送出…";
  q("signedAt").textContent=new Date().toLocaleString("zh-TW",{hour12:false});
  try{
    q("contractHash").textContent=await sha256(canonicalPayload());
    latestPdfBlob=await generatePdfBlob();
    setLocked(true);
    q("deliveryStatus").textContent="正在傳送…";
    persist();
    var tries=0,lastErr=null;
    while(tries<2){
      try{await sendSignedPdf(latestPdfBlob);lastErr=null;break;}catch(e){lastErr=e;tries++;if(tries<2)await new Promise(function(r){setTimeout(r,1200);});}
    }
    if(lastErr){
      q("deliveryStatus").textContent="簽署完成，但自動送達失敗；請按下方重試";
      q("finalizeBtn").disabled=false;q("finalizeBtn").textContent="重試送出";
      toast("契約已簽署，但寄送失敗，可重試");
    }else{
      q("deliveryStatus").textContent="已自動送達林震宇信箱";
      q("finalizeBtn").textContent="已完成簽署並送達";
      toast("簽署完成，契約已自動送達");
    }
    persist();
  }catch(e){
    setLocked(false);
    q("finalizeBtn").disabled=false;q("finalizeBtn").textContent="完成簽署並送出";
    toast("簽署流程失敗，請稍後再試");
  }
});

q("downloadPdfBtn").addEventListener("click",async function(){
  try{
    if(!latestPdfBlob)latestPdfBlob=await generatePdfBlob();
    downloadBlob("鴻星窗簾網站建置契約_"+safeName()+"_"+q("buyerDate").value+".pdf",latestPdfBlob);
  }catch(e){toast("PDF 產生失敗");}
});
q("editBtn").addEventListener("click",function(){
  if(!locked){toast("目前可直接編輯");return;}
  if(confirm("重新編輯會讓原本契約摘要失效，確定繼續嗎？")){
    q("contractHash").textContent="";q("signedAt").textContent="";q("deliveryStatus").textContent="準備送出";latestPdfBlob=null;setLocked(false);persist();toast("已解除鎖定");
  }
});

setupCanvas(false);
restore();
unlockSecure().then(function(ok){if(!ok)toast("請使用寄給你的專屬簽約連結開啟");});
})();