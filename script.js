const fileInput = document.getElementById("fileInput");
const badge = document.getElementById("countBadge");

let diag = document.getElementById("diagDetails");
if (!diag) {
    diag = document.createElement("pre");
    diag.id = "diagDetails";
    diag.style.whiteSpace = "pre-wrap";
    diag.style.background = "#fff";
    diag.style.padding = "12px";
    diag.style.borderRadius = "8px";
    diag.style.boxShadow = "0 1px 6px rgba(0,0,0,0.08)";
    diag.style.marginTop = "12px";
    diag.style.fontSize = "13px";
    const summary = document.getElementById("summary") || document.body;
    summary.appendChild(diag);
}

function logDiag(msg, level = "info") {
    const time = new Date().toLocaleTimeString();
    const prefix = ({info: "ℹ️", warn: "⚠️", error: "❌", ok: "✅"})[level] || "ℹ️";
    diag.textContent += `${prefix} [${time}] ${msg}\n`;
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](msg);
}

function clearDiag() { diag.textContent = ""; }
function showError(msg) { badge.textContent = msg; badge.style.background = "#d9534f"; logDiag(msg, "error"); }
function showInfo(msg) { badge.textContent = msg; badge.style.background = "#f0ad4e"; logDiag(msg, "info"); }
function showOK(msg) { badge.textContent = msg; badge.style.background = "#5cb85c"; logDiag(msg, "ok"); }

fileInput.addEventListener("change", async function (event) {
    clearDiag();
    logDiag("بدأت عملية فحص الملف...", "info");

    const file = event.target.files && event.target.files[0];
    if (!file) { showError("لم يتم اختيار ملف."); return; }

    const name = file.name || "";
    const ext = name.split(".").pop().toLowerCase();
    logDiag(`اسم الملف: ${name}`);
    if (!["xlsx", "xls", "csv"].includes(ext)) { showError(`نوع الملف غير مدعوم: .${ext}`); return; }
    logDiag(`امتداد صالح: .${ext}`);

    if (typeof XLSX === "undefined") { showError("مكتبة XLSX غير موجودة."); return; }
    logDiag("مكتبة XLSX موجودة.");

    let arrayBuffer;
    try { arrayBuffer = await file.arrayBuffer(); logDiag("تم قراءة الملف إلى ArrayBuffer."); } 
    catch (err) { showError("خطأ أثناء قراءة الملف."); console.error(err); return; }

    let workbook;
    try { workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" }); logDiag(`تم فتح ملف Excel. أوراق: ${workbook.SheetNames.length}`); }
    catch (err) { showError("خطأ أثناء تحليل الملف."); console.error(err); return; }

    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    logDiag(`استخدام الورقة الأولى: "${firstSheetName}"`);

    let rows;
    try { rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }); logDiag(`عدد الصفوف المقروءة: ${rows.length}`); }
    catch (err) { showError("خطأ أثناء تحويل الورقة إلى صفوف."); console.error(err); return; }
    if (!rows || rows.length === 0) { showError("الورقة فارغة."); return; }

    const required = {
        "Sku Code": ["Sku Code","SkuCode","SKUCode","SKU CODE","Sku_Code"],
        "Item Code": ["Item Code","ItemCode","ITEM CODE"],
        "Size": ["Size","SIZE"],
        "Color Code": ["Color Code","ColorCode","COLOR CODE"],
        "Total Warehouse Stock": ["Total Warehouse Stock","Warehouse Stock","FWareHouseStock"],
        "Total Sales Stock": ["Total Sales Stock","Sales Stock"]
    };

    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const r = rows[i].map(c => (c===null||c===undefined)?"":String(c).trim().toLowerCase());
        let foundAll = true;
        for (const colName in required) {
            const possible = required[colName].map(x=>x.toLowerCase());
            if (!r.some(cell => possible.includes(cell))) { foundAll=false; break; }
        }
        if (foundAll) { headerRowIndex=i; break; }
    }
    if (headerRowIndex===-1) { showError("تعذر العثور على صف العناوين."); return; }
    logDiag(`تم العثور على صف العناوين في الصف ${headerRowIndex+1}.`);
    const header = rows[headerRowIndex].map(h => (h===null||h===undefined)?"":String(h).trim());

    const colIndex = {}; const missing=[];
    for(const colName in required){
        const possible=required[colName].map(x=>x.toLowerCase());
        let found=-1;
        for(let i=0;i<header.length;i++){ if(possible.includes(String(header[i]).toLowerCase())){found=i;break;} }
        if(found===-1) missing.push(colName); else colIndex[colName]=found;
    }
    if(missing.length){ showError("الأعمدة التالية مفقودة: "+missing.join(", ")); logDiag("عناوين الصف الموجودة: "+JSON.stringify(header)); return; }
    logDiag("جميع الأعمدة المطلوبة موجودة.");

    const dataRows = rows.slice(headerRowIndex+1);
    logDiag(`عدد صفوف البيانات بعد العنوان: ${dataRows.length}`);

    const tbody = document.querySelector("#resultTable tbody");
    tbody.innerHTML="";

    // ------------------- التجميع حسب Item Code + Color Code -------------------
    const grouped = {};
    dataRows.forEach((r, idx)=>{
        const itemCode = r[colIndex["Item Code"]];
        const colorCode = r[colIndex["Color Code"]];

        let warehouse = Number(r[colIndex["Total Warehouse Stock"]]);
        let sales = Number(r[colIndex["Total Sales Stock"]]);

        // تحويل القيم السالبة إلى 0
        if (!Number.isFinite(warehouse) || warehouse <= 0) warehouse = 0;
        if (!Number.isFinite(sales) || sales < 0) sales = 0;

        // تجاهل المنتجات بدون مخزون في المخزن
        if (warehouse === 0) return;

        const key = `${itemCode}__${colorCode}`;
        if(!grouped[key]) grouped[key]={itemCode,colorCode,totalWarehouse:0,totalSales:0};
        grouped[key].totalWarehouse += warehouse;
        grouped[key].totalSales += sales;
    });

    // فلترة المنتجات التي تحتاج تعبئة
    const filtered = Object.values(grouped).filter(p=>p.totalSales<4 && p.totalWarehouse>0);
    let refillCount = filtered.length;

    // عرض النتائج
    filtered.forEach(p=>{
        const tr = document.createElement("tr");
        tr.innerHTML=`
            <td>${escapeHtml(p.itemCode)}</td>
            <td>${escapeHtml(p.colorCode)}</td>
            <td>${escapeHtml(p.totalWarehouse)}</td>
            <td>${escapeHtml(p.totalSales)}</td>
        `;
        tbody.appendChild(tr);
    });

    if(refillCount===0){ showOK("تم الفحص — لا منتجات تحتاج تعبئة (0)."); }
    else { showOK(`تم الفحص — ${refillCount} منتجات تحتاج تعبئة.`); }

    logDiag(`ملخص الفحص: مجموع المنتجات المحتاجة للتعبئة: ${refillCount}`);
    logDiag("انتهت عملية الفحص.");
});

// دالة مساعدة لتجنب مشاكل HTML
function escapeHtml(s){if(typeof s!=="string") s=String(s);return s.replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
