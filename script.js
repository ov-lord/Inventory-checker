const fileInput = document.getElementById("fileInput");
const badge = document.getElementById("countBadge");
const diag = document.getElementById("diagDetails");
const exportBtn = document.getElementById("exportBtn");

let filteredGroups = []; // store current results

function clearDiag() { diag.textContent = ""; }
function showError(msg) { badge.textContent = msg; badge.style.background="#d9534f"; }
function showOK(msg) { badge.textContent = msg; badge.style.background="#5cb85c"; }

fileInput.addEventListener("change", async function(event) {
    clearDiag();
    const file = event.target.files[0];
    if(!file){ showError("No file selected."); return; }

    let arrayBuffer;
    try { arrayBuffer = await file.arrayBuffer(); } 
    catch(err){ showError("Error reading the file."); return; }

    let workbook;
    try { workbook = XLSX.read(new Uint8Array(arrayBuffer), { type:"array" }); } 
    catch(err){ showError("Error parsing Excel file."); return; }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    let rows;
    try { rows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:""}); } 
    catch(err){ showError("Error converting sheet to rows."); return; }

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

    const header = rows[headerRowIndex];
    const colIndex = {};
    requiredCols.forEach(col=>{ colIndex[col] = header.indexOf(col); });

    const dataRows = rows.slice(headerRowIndex+1);

    filteredGroups = groupAndFilter(dataRows, colIndex);

    // Display results
    const tbody = document.querySelector("#resultTable tbody");
    tbody.innerHTML = "";
    filteredGroups.forEach(g=>{
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${g.itemCode}</td><td>${g.colorCode}</td><td>${g.warehouse}</td><td>${g.sales}</td>`;
        tbody.appendChild(tr);
    });

    showOK(`Scan completed — ${filteredGroups.length} products need refill.`);
});

// Group + sum
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

    return Object.values(groups).filter(g=>g.sales<6 && g.warehouse>0);
}

// Export Excel
exportBtn.addEventListener("click", () => {
    if (filteredGroups.length === 0) {
        alert("No results to export.");
        return;
    }

    // Header
    const wsData = [[
        "Product Code",
        "Total Warehouse Stock",
        "Total Sales Stock"
    ]];

    // Data
    filteredGroups.forEach(g => {
        const productCode = `${g.itemCode}${g.colorCode}`;

        wsData.push([
            productCode,
            g.warehouse,
            g.sales
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Refill Results");

    XLSX.writeFile(wb, "Inventory_Refill_Report.xlsx");
});


