const fileInput = document.getElementById("fileInput");
const badge = document.getElementById("countBadge");
const diag = document.getElementById("diagDetails");

// Logging function for diagnostics
function logDiag(msg, level = "info") {
//
}

// Clear diagnostics
function clearDiag() { diag.textContent = ""; }

// Show error
function showError(msg) { 
    badge.textContent = msg; 
    badge.style.background="#d9534f"; 
    logDiag(msg,"error"); 
}

// Show success
function showOK(msg) { 
    badge.textContent = msg; 
    badge.style.background="#5cb85c"; 
    logDiag(msg,"ok"); 
}

fileInput.addEventListener("change", async function(event) {
    clearDiag();
    const file = event.target.files[0];
    if(!file){ showError("No file selected. Please choose an Excel (.xlsx/.xls) or CSV file."); return; }

    logDiag(`Selected file: ${file.name}`);

    let arrayBuffer;
    try { arrayBuffer = await file.arrayBuffer(); } 
    catch(err){ showError("Error reading the file."); console.error(err); return; }

    let workbook;
    try { workbook = XLSX.read(new Uint8Array(arrayBuffer), { type:"array" }); } 
    catch(err){ showError("Error parsing Excel file."); console.error(err); return; }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    let rows;
    try { rows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:""}); } 
    catch(err){ showError("Error converting sheet to rows."); console.error(err); return; }

    logDiag(`Number of rows read: ${rows.length}`);

    // Find header row
    const requiredCols = ["Item Code","Color Code","Total Warehouse Stock","Total Sales Stock"];
    let headerRowIndex = -1;
    for(let i=0;i<Math.min(rows.length,50);i++){
        const r = rows[i].map(c=>String(c).trim());
        if(requiredCols.every(col=>r.includes(col))){
            headerRowIndex = i;
            break;
        }
    }

    if(headerRowIndex === -1){ showError("Header row not found."); return; }

    logDiag(`Header row found at row ${headerRowIndex+1}`);
    const header = rows[headerRowIndex];
    const colIndex = {};
    requiredCols.forEach(col=>{
        colIndex[col] = header.indexOf(col);
    });

    const dataRows = rows.slice(headerRowIndex+1);

    // 🔥 Grouping and filtering
    const filteredGroups = groupAndFilter(dataRows, colIndex);

    // Display results
    const tbody = document.querySelector("#resultTable tbody");
    tbody.innerHTML = "";
    filteredGroups.forEach(g=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${g.itemCode}</td><td>${g.colorCode}</td><td>${g.warehouse}</td><td>${g.sales}</td>`;
        tbody.appendChild(tr);
    });

    showOK(`Scan completed — ${filteredGroups.length} products need refill.`);
    logDiag("Scan finished successfully.");
});

// 🟢 Group by Item Code + Color Code
function groupAndFilter(dataRows, colIndex){
    const groups = {};
    dataRows.forEach(r=>{
        const item = r[colIndex["Item Code"]];
        const color = r[colIndex["Color Code"]];
        if(!item||!color) return;

        let warehouse = parseInt(r[colIndex["Total Warehouse Stock"]]) || 0;
        let sales = parseInt(r[colIndex["Total Sales Stock"]]) || 0;

        const key = `${item}_${color}`;
        if(!groups[key]){
            groups[key] = {itemCode:item, colorCode:color, warehouse:0, sales:0};
        }

        groups[key].warehouse += warehouse;
        groups[key].sales += sales;
    });

    // Filter: products with total sales < 4 and warehouse > 0
    return Object.values(groups).filter(g=>g.sales<6 && g.warehouse>0);
}
