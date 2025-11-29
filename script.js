// script.js — نسخة كاملة نهائية مع تشخيص وتحسينات
// ---------------------------------------------
// ملاحظات:
// - تأكد من إضافة مكتبة SheetJS في HTML:
//   <script src="https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js"></script>
// - تأكد من أن <input id="fileInput"> لديه accept=".xlsx,.xls,.csv"

const fileInput = document.getElementById("fileInput");
const badge = document.getElementById("countBadge");

// عنصر للتفاصيل (إن لم يكن موجودًا سيتم إنشاؤه)
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

function clearDiag() {
    diag.textContent = "";
}

function showError(msg) {
    badge.textContent = msg;
    badge.style.background = "#d9534f";
    logDiag(msg, "error");
}

function showInfo(msg) {
    badge.textContent = msg;
    badge.style.background = "#f0ad4e";
    logDiag(msg, "info");
}

function showOK(msg) {
    badge.textContent = msg;
    badge.style.background = "#5cb85c";
    logDiag(msg, "ok");
}

fileInput.addEventListener("change", async function (event) {
    clearDiag();
    logDiag("بدأت عملية فحص الملف...", "info");

    const file = event.target.files && event.target.files[0];
    if (!file) {
        showError("لم يتم اختيار ملف. الرجاء اختيار ملف Excel (.xlsx/.xls) أو CSV.");
        return;
    }

    // 1) فحص امتداد الملف
    const name = file.name || "";
    const ext = name.split(".").pop().toLowerCase();
    logDiag(`اسم الملف: ${name}`);
    if (!["xlsx", "xls", "csv"].includes(ext)) {
        showError(`نوع الملف غير مدعوم: .${ext} — استخدم .xlsx, .xls أو .csv`);
        return;
    }
    logDiag(`امتداد صالح: .${ext}`);

    // 2) فحص وجود مكتبة XLSX
    if (typeof XLSX === "undefined") {
        showError("مكتبة XLSX غير موجودة. أضف هذا السطر داخل <head>:\n<script src=\"https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js\"></script>");
        return;
    }
    logDiag("مكتبة XLSX موجودة.");

    // 3) قراءة الملف كـ ArrayBuffer
    let arrayBuffer;
    try {
        arrayBuffer = await file.arrayBuffer();
        logDiag("تم قراءة الملف إلى ArrayBuffer بنجاح.");
    } catch (err) {
        showError("خطأ أثناء قراءة الملف (ArrayBuffer).");
        console.error(err);
        return;
    }

    // 4) فتح workbook
    let workbook;
    try {
        workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: "array" });
        logDiag(`تم فتح ملف Excel. عدد الأوراق: ${workbook.SheetNames.length}`);
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
            showError("الملف لا يحتوي على أوراق (sheets).");
            return;
        }
    } catch (err) {
        showError("خطأ أثناء تحليل ملف Excel بواسطة XLSX.read.");
        console.error(err);
        return;
    }

    // 5) اختَر الورقة الأولى
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    logDiag(`إستخدام الورقة الأولى: "${firstSheetName}"`);

    // 6) اقرأ الصفوف كـ array of arrays (header:1)
    let rows;
    try {
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        logDiag(`عدد الصفوف المقروءة (raw): ${rows.length}`);
        if (!rows || rows.length === 0) {
            showError("الورقة فارغة — لا توجد بيانات لقراءتها.");
            return;
        }
    } catch (err) {
        showError("خطأ أثناء تحويل الورقة إلى صفوف (sheet_to_json header:1).");
        console.error(err);
        return;
    }

    // 7) عرض أول 10 صفوف للمراجعة السريعة
    const previewCount = Math.min(10, rows.length);
    logDiag("---- معاينة أول 10 صفوف ----");
    for (let i = 0; i < previewCount; i++) {
        logDiag(`صف ${i + 1}: ${JSON.stringify(rows[i])}`);
    }
    logDiag("----------------------------");

    // 8) أسماء الأعمدة المقبولة لكل عمود
    const required = {
        "Sku Code": ["Sku Code", "SkuCode", "SKUCode", "SKU CODE", "Sku_Code"],
        "Item Code": ["Item Code", "ItemCode", "ITEM CODE"],
        "Size": ["Size", "SIZE"],
        "Color Code": ["Color Code", "ColorCode", "COLOR CODE"],
        "Total Warehouse Stock": ["Total Warehouse Stock", "Warehouse Stock", "FWareHouseStock"],
        "Total Sales Stock": ["Total Sales Stock", "Sales Stock"]
    };

    // البحث عن صف العناوين
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(rows.length, 50); i++) {
        const r = rows[i].map(c => (c === null || c === undefined) ? "" : String(c).trim().toLowerCase());
        let foundAll = true;
        for (const colName in required) {
            const possible = required[colName].map(x => x.toLowerCase());
            if (!r.some(cell => possible.includes(cell))) {
                foundAll = false;
                break;
            }
        }
        if (foundAll) {
            headerRowIndex = i;
            break;
        }
    }

    if (headerRowIndex === -1) {
        showError("تعذر العثور على صف العناوين (headers) بعد التحديث.");
        return;
    }

    logDiag(`تم العثور على صف العناوين في الصف رقم ${headerRowIndex + 1}.`);
    const header = rows[headerRowIndex].map(h => (h === null || h === undefined) ? "" : String(h).trim());

    // بناء map للأعمدة المطلوبة
    const colIndex = {};
    const missing = [];
    for (const colName in required) {
        const possible = required[colName].map(x => x.toLowerCase());
        let found = -1;
        for (let i = 0; i < header.length; i++) {
            if (possible.includes(String(header[i]).toLowerCase())) {
                found = i;
                break;
            }
        }
        if (found === -1) missing.push(colName);
        else colIndex[colName] = found;
    }

    if (missing.length) {
        showError("الأعمدة التالية مفقودة: " + missing.join(", "));
        logDiag("عناوين الصف الموجودة: " + JSON.stringify(header));
        return;
    }

    logDiag("جميع الأعمدة المطلوبة موجودة في صف العناوين.");

    // جلب الصفوف الحقيقية بعد صف العناوين
    const dataRows = rows.slice(headerRowIndex + 1);
    logDiag(`عدد صفوف البيانات بعد العنوان: ${dataRows.length}`);

    // تفريغ الجدول القديم
    const tbody = document.querySelector("#resultTable tbody");
    tbody.innerHTML = "";

    // ترشيح ومعالجة الصفوف
    let refillCount = 0;
    let invalidRows = 0;
    let processedRows = 0;

    dataRows.forEach((r, idx) => {
        const wCell = r[colIndex["Total Warehouse Stock"]];
        const sCell = r[colIndex["Total Sales Stock"]];

        const warehouse = (wCell === "" || wCell === null || wCell === undefined) ? NaN : Number(String(wCell).replace(/,/g, "").trim());
        const sales = (sCell === "" || sCell === null || sCell === undefined) ? NaN : Number(String(sCell).replace(/,/g, "").trim());

        if (!Number.isFinite(warehouse) && !Number.isFinite(sales)) {
            invalidRows++;
            logDiag(`تجاهلنا صف بيانات رقم ${headerRowIndex + 2 + idx} لعدم احتوائه على أرقام صالحة.`, "warn");
            return;
        }

        processedRows++;

        if (Number.isFinite(sales) && Number.isFinite(warehouse) && sales < 6 && warehouse > 0) {
            refillCount++;
            const tr = document.createElement("tr");
            const safe = v => (v === undefined || v === null) ? "" : String(v);
            tr.innerHTML = `
                <td>${escapeHtml(safe(r[colIndex["Sku Code"]]))}</td>
                <td>${escapeHtml(safe(r[colIndex["Item Code"]]))}</td>
                <td>${escapeHtml(safe(r[colIndex["Size"]]))}</td>
                <td>${escapeHtml(safe(r[colIndex["Color Code"]]))}</td>
                <td>${escapeHtml(safe(warehouse))}</td>
                <td>${escapeHtml(safe(sales))}</td>
            `;
            tbody.appendChild(tr);
        }
    });

    // نتائج نهائية
    if (refillCount === 0) {
        showOK(`تم الفحص — لا منتجات تحتاج تعبئة (0).`);
    } else {
        showOK(`تم الفحص — ${refillCount} منتجات تحتاج تعبئة.`);
    }

    logDiag(`ملخص الفحص: processedRows=${processedRows}, invalidRows=${invalidRows}, refillCount=${refillCount}`);
    logDiag("انتهت عملية الفحص.");

}); // نهاية event listener

// دالة مساعدة لتجنب مشاكل HTML
function escapeHtml(s) {
    if (typeof s !== "string") s = String(s);
    return s.replace(/[&<>"']/g, function (m) {
        return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]);
    });
}
