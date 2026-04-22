// 1. Cấu hình Supabase
const SUPABASE_URL = "https://vofobnzwvzifuaxedyrx.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZvZm9ibnp3dnppZnVheGVkeXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2NjEzMjcsImV4cCI6MjA5MjIzNzMyN30.gCW7WNIniomy3KKYsgyp8ncJg-W_moHdSSFCpwEqVGs";

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentMa = "";
let currentAction = "NHẬP";
let isProcessing = false;
let stockChart = null;
let currentDaysFilter = 30; // Mặc định 30 ngày

// 2. Khởi tạo khi trang tải xong
document.addEventListener("DOMContentLoaded", () => {
    // Tự động điền thông tin cũ nếu có
    document.getElementById('inp-user').value = localStorage.getItem('lastUser') || '';
    document.getElementById('inp-loc').value = localStorage.getItem('lastLoc') || '';
    
    // Xử lý quét mã QR
    const fileInput = document.getElementById('qr-input-file');
    fileInput.addEventListener('change', async (e) => {
        if (e.target.files.length == 0) return;
        
        const imageFile = e.target.files[0];
        const html5QrCode = new Html5Qrcode("reader");
        
        showLoading("Đang phân tích hình ảnh...");
        
        try {
            const decodedText = await html5QrCode.scanFile(imageFile, true);
            hideLoading();
            handleMaReceived(decodedText);
        } catch (err) {
            hideLoading();
            alert("❌ Không tìm thấy mã QR. Hãy thử chụp rõ nét hơn!");
            console.error(err);
        }
    });

    // Load dashboard data on start
    loadDashboardData();
});

// View Switching
function switchTab(tab) {
    const scannerView = document.getElementById('scanner-view');
    const dashboardView = document.getElementById('dashboard-view');
    const navItems = document.querySelectorAll('.nav-item');

    if (tab === 'scanner') {
        scannerView.classList.add('active');
        dashboardView.classList.remove('active');
        navItems[0].classList.add('active');
        navItems[1].classList.remove('active');
    } else {
        scannerView.classList.remove('active');
        dashboardView.classList.add('active');
        navItems[0].classList.remove('active');
        navItems[1].classList.add('active');
        loadDashboardData();
    }
}

// 3. Xử lý khi nhận được mã Logo
async function handleMaReceived(ma) {
    ma = ma.trim().toUpperCase(); // Chuẩn hóa in hoa
    
    // Tách mã theo quy tắc H + 9 ký tự
    const finalCode = extractLogoId(ma);
    
    if (!finalCode) {
        alert("❌ Mã không hợp lệ (Không tìm thấy ký tự H)!");
        hideLoading();
        return;
    }

    if (finalCode === currentMa) return;
    currentMa = finalCode;
    
    showLoading("Đang tra cứu từ Supabase...");
    
    try {
        // Lấy thông tin logo từ bảng "logos" (cột id, decription)
        const { data: logo, error: logoErr } = await _supabase
            .from('logos')
            .select('*')
            .eq('id', finalCode)
            .single();

        // Lấy thông tin tồn kho từ bảng "inventory" (cột id, quanlity)
        const { data: stock, error: stockErr } = await _supabase
            .from('inventory')
            .select('*')
            .eq('id', finalCode)
            .single();

        hideLoading();

        if (logoErr && logoErr.code !== 'PGRST116') throw logoErr;

        displayLogoInfo({
            maLogo: finalCode,
            brand: logo ? logo.brand : (stock ? stock.brand : "MỚI (Chưa có trong danh mục)"),
            moTa: logo ? logo.decription : (stock ? stock.decription : "Chưa có mô tả"),
            tonKho: stock ? stock.quanlity : 0,
            viTriMacDinh: stock ? stock.location : (logo ? logo.brand : "")
        });

    } catch (err) {
        hideLoading();
        console.error(err);
        alert("Lỗi kết nối Supabase: " + err.message);
    }
}

function handleManualSearch() {
    const ma = document.getElementById('manualInput').value.trim().toUpperCase();
    if (!ma) return;
    handleMaReceived(ma);
}

function extractLogoId(raw) {
    const hIndex = raw.indexOf('H');
    if (hIndex === -1) return null;
    return raw.substring(hIndex, hIndex + 10);
}

function displayLogoInfo(data) {
    document.getElementById('result-card').style.display = 'block';
    document.getElementById('res-code').textContent = data.maLogo;
    document.getElementById('res-brand').textContent = data.brand;
    document.getElementById('res-desc').textContent = data.moTa;
    document.getElementById('res-stock').textContent = data.tonKho;
    
    if (data.viTriMacDinh) {
        document.getElementById('inp-loc').value = data.viTriMacDinh;
    }
    
    document.getElementById('result-card').scrollIntoView({ behavior: 'smooth' });
}

function setAction(action) {
    currentAction = action;
    const btnNhap = document.getElementById('btn-nhap');
    const btnXuat = document.getElementById('btn-xuat');
    
    if (action === 'NHẬP') {
        btnNhap.className = 'active-nhap';
        btnXuat.className = '';
    } else {
        btnNhap.className = '';
        btnXuat.className = 'active-xuat';
    }
}

// 4. Xác nhận giao dịch
async function submitTransaction() {
    if (isProcessing) return;

    const qtyInput = document.getElementById('inp-qty');
    const qty = Number(qtyInput.value);
    const loc = document.getElementById('inp-loc').value.trim();
    const user = document.getElementById('inp-user').value.trim();
    const brand = document.getElementById('res-brand').textContent;
    const decription = document.getElementById('res-desc').textContent;
    
    if (!qty || qty <= 0) { alert("Vui lòng nhập số lượng!"); return; }
    if (!loc || !user) { alert("Vui lòng nhập Vị trí và Người thực hiện!"); return; }

    localStorage.setItem('lastUser', user);
    localStorage.setItem('lastLoc', loc);

    showLoading("Đang cập nhật Supabase...");
    isProcessing = true;

    try {
        // 1. Tính toán số lượng tồn mới
        let currentStock = Number(document.getElementById('res-stock').textContent);
        let newQty = (currentAction === "NHẬP") ? (currentStock + qty) : (currentStock - qty);

        if (newQty < 0) throw new Error("Số lượng xuất vượt quá tồn kho hiện tại!");

        const nowIso = new Date().toISOString();

        // 2. Cập nhật bảng inventory (Khớp với cột id, brand, decription, quanlity, location, last_updated)
        const { error: invErr } = await _supabase
            .from('inventory')
            .upsert({
                id: currentMa,
                brand: brand,
                decription: decription,
                quanlity: newQty,
                location: loc,
                last_updated: nowIso
            });
        
        if (invErr) throw invErr;

        // 3. Ghi vào bảng transactions (Khớp với cột updated_at, id, brand, decription, quanlity, action, location, updated_by)
        const { error: transErr } = await _supabase
            .from('transactions')
            .insert({
                updated_at: nowIso,
                id: currentMa,
                brand: brand,
                decription: decription,
                quanlity: qty,
                action: currentAction,
                location: loc,
                updated_by: user
            });

        if (transErr) throw transErr;

        hideLoading();
        alert(`✅ Đã ${currentAction === "NHẬP" ? "NHẬP" : "XUẤT"} ${qty} cho ${currentMa}. Tồn mới: ${newQty}`);
        
        // Refresh dashboard in background
        loadDashboardData();
        
        resetApp();

    } catch (err) {
        hideLoading();
        alert("❌ Lỗi: " + err.message);
    } finally {
        isProcessing = false;
    }
}

function resetApp() {
    document.getElementById('result-card').style.display = 'none';
    document.getElementById('manualInput').value = '';
    document.getElementById('inp-qty').value = '1';
    currentMa = "";
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 5. Dashboard Data Loading
async function loadDashboardData() {
    try {
        // 1. Lấy toàn bộ lịch sử giao dịch
        const { data: allTrans, error: transErr } = await _supabase
            .from('transactions')
            .select('*')
            .order('updated_at', { ascending: true });

        if (transErr) throw transErr;

        // 2. Xử lý dữ liệu đầy đủ
        const brandStocks = {}; 
        const timeline = {};    
        const allUniqueDates = [];
        const uniqueBrands = new Set();

        allTrans.forEach(t => {
            const dateObj = new Date(t.updated_at);
            const dateStr = dateObj.toLocaleDateString('vi-VN');
            
            if (!allUniqueDates.includes(dateStr)) allUniqueDates.push(dateStr);
            uniqueBrands.add(t.brand);

            const delta = (t.action === 'NHẬP') ? t.quanlity : -t.quanlity;
            brandStocks[t.brand] = (brandStocks[t.brand] || 0) + delta;

            if (!timeline[dateStr]) timeline[dateStr] = {};
            timeline[dateStr][t.brand] = brandStocks[t.brand];
        });

        // 3. Lọc theo khoảng thời gian được chọn
        let filteredDates = [...allUniqueDates];
        if (currentDaysFilter !== 'all') {
            const now = new Date();
            const threshold = new Date();
            threshold.setDate(now.getDate() - currentDaysFilter);
            
            // Giả sử dateStr là dd/mm/yyyy. Cần chuyển lại để so sánh.
            // Để đơn giản và chính xác hơn, mình sẽ lọc dựa trên đối tượng date khi duyệt allTrans phía trên hoặc xử lý lại ở đây:
            filteredDates = allUniqueDates.filter(dateStr => {
                const parts = dateStr.split('/'); // [dd, mm, yyyy]
                const d = new Date(parts[2], parts[1] - 1, parts[0]);
                return d >= threshold;
            });
        }

        // Chuẩn bị datasets cho Chart.js dựa trên filteredDates
        const brandList = Array.from(uniqueBrands);
        const datasets = brandList.map((brand, idx) => {
            const data = [];
            let lastKnownStock = 0;
            
            // Để có lastKnownStock chính xác tại thời điểm bắt đầu biểu đồ, 
            // ta phải duyệt qua toàn bộ allUniqueDates cho đến ngày đầu tiên của biểu đồ.
            allUniqueDates.forEach(dateStr => {
                if (timeline[dateStr] && timeline[dateStr][brand] !== undefined) {
                    lastKnownStock = timeline[dateStr][brand];
                }
                if (filteredDates.includes(dateStr)) {
                    data.push(lastKnownStock);
                }
            });

            return {
                label: brand,
                data: data,
                borderColor: getBrandColor(idx),
                backgroundColor: getBrandColor(idx, 0.1),
                borderWidth: 2,
                pointRadius: 3,
                tension: 0.3
            };
        });

        renderStockChart(filteredDates, datasets);

        // 4. Hiển thị bảng tổng hợp theo Brand
        renderBrandSummary(brandStocks, brandList);

    } catch (err) {
        console.error("Dashboard error:", err);
    }
}

function setChartRange(days) {
    currentDaysFilter = days;
    
    // Cập nhật UI nút active
    const buttons = document.querySelectorAll('.filter-btn');
    buttons.forEach(btn => btn.classList.remove('active'));
    
    // Tìm nút vừa bấm để add class active (tạm thời tìm theo text hoặc index nếu cần chính xác hơn)
    // Nhưng đơn giản nhất là render lại Dashboard
    loadDashboardData();
    
    // Cập nhật class active dựa trên giá trị
    setTimeout(() => {
        const btnContainer = document.getElementById('chart-range-selector');
        if (btnContainer) {
            const btns = btnContainer.querySelectorAll('.filter-btn');
            btns[0].classList.toggle('active', days === 30);
            btns[1].classList.toggle('active', days === 90);
            btns[2].classList.toggle('active', days === 'all');
        }
    }, 100);
}

function getBrandColor(index, alpha = 1) {
    const colors = [
        `rgba(79, 70, 229, ${alpha})`, // Indigo
        `rgba(34, 197, 94, ${alpha})`,  // Green
        `rgba(239, 68, 68, ${alpha})`,  // Red
        `rgba(245, 158, 11, ${alpha})`, // Amber
        `rgba(6, 182, 212, ${alpha})`,  // Cyan
        `rgba(168, 85, 247, ${alpha})`, // Purple
        `rgba(236, 72, 153, ${alpha})`  // Pink
    ];
    return colors[index % colors.length];
}

function renderStockChart(labels, datasets) {
    const canvas = document.getElementById('stockChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (stockChart) {
        stockChart.destroy();
    }
    
    stockChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94A3B8', font: { size: 10 } }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#94A3B8', font: { size: 10 } }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#F8FAFC', boxWidth: 10, padding: 15, font: { size: 10 } }
                }
            }
        }
    });
}

function renderBrandSummary(brandStocks, brandList) {
    const listContainer = document.getElementById('brand-summary-list');
    if (!listContainer) return;

    // Sắp xếp brand theo số lượng giảm dần
    const sortedBrands = brandList.sort((a, b) => (brandStocks[b] || 0) - (brandStocks[a] || 0));

    listContainer.innerHTML = sortedBrands.map((brand, idx) => `
        <div class="summary-item">
            <div class="summary-brand">
                <div class="brand-dot" style="background-color: ${getBrandColor(idx)}; color: ${getBrandColor(idx)}"></div>
                ${brand}
            </div>
            <div class="summary-qty">${brandStocks[brand] || 0}</div>
        </div>
    `).join('');
}

async function exportToExcel() {
    showLoading("Đang chuẩn bị file Excel chuyên nghiệp...");
    try {
        // 1. Lấy dữ liệu tồn kho hiện tại
        const { data: inventory, error } = await _supabase
            .from('inventory')
            .select('*')
            .order('brand', { ascending: true });

        if (error) throw error;

        // 2. Định dạng lại dữ liệu
        const headers = ["Mã Logo", "Thương hiệu (Brand)", "Mô tả", "Số lượng tồn", "Vị trí", "Ngày cập nhật cuối"];
        const rows = inventory.map(item => [
            item.id,
            item.brand,
            item.decription,
            item.quanlity,
            item.location,
            new Date(item.last_updated).toLocaleString('vi-VN')
        ]);

        // Ghép header và data
        const data = [headers, ...rows];

        // 3. Tạo Worksheet
        const worksheet = XLSX.utils.aoa_to_sheet(data);

        // --- Cấu trúc Style ---
        const borderStyle = {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "thin", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "000000" } },
            right: { style: "thin", color: { rgb: "000000" } }
        };

        const headerStyle = {
            fill: { fgColor: { rgb: "4F46E5" } }, // Màu Indigo của App
            font: { bold: true, color: { rgb: "FFFFFF" }, sz: 12 },
            alignment: { horizontal: "center", vertical: "center" },
            border: borderStyle
        };

        const cellStyle = {
            alignment: { vertical: "center", wrapText: true },
            border: borderStyle
        };

        const descCellStyle = {
            alignment: { vertical: "center", horizontal: "left", wrapText: true },
            border: borderStyle
        };

        const numberStyle = {
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: borderStyle
        };

        // --- Áp dụng Style ---
        const range = XLSX.utils.decode_range(worksheet['!ref']);
        for (let R = range.s.r; R <= range.e.r; ++R) {
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
                if (!worksheet[cellAddress]) continue;

                if (R === 0) {
                    worksheet[cellAddress].s = headerStyle;
                } else {
                    // Cột "Số lượng tồn" (Cổ 3 - index 0) căn giữa
                    if (C === 3) {
                        worksheet[cellAddress].s = numberStyle;
                    } else if (C === 2) { // Cột "Mô tả"
                        worksheet[cellAddress].s = descCellStyle;
                    } else {
                        worksheet[cellAddress].s = cellStyle;
                    }
                }
            }
        }

        // --- Tự động tính độ rộng cột ---
        const colWidths = headers.map((h, i) => {
            if (i === 2) return { wch: 40 }; // Cố định cột Mô tả tối đa 40 ký tự

            let maxLen = h.length;
            rows.forEach(row => {
                const cellValue = String(row[i] || "");
                if (cellValue.length > maxLen) maxLen = cellValue.length;
            });
            return { wch: Math.min(maxLen + 5, 50) }; // Các cột khác tự động nhưng không quá 50
        });
        worksheet['!cols'] = colWidths;

        // 4. Tạo Workbook và Xuất file
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "TonKho");

        const fileName = `TonKho_Logo_Premium_${new Date().toLocaleDateString('vi-VN').replace(/\//g, '-')}.xlsx`;
        XLSX.writeFile(workbook, fileName);

        hideLoading();
    } catch (err) {
        hideLoading();
        alert("Lỗi xuất Excel: " + err.message);
    }
}

function showLoading(msg) {
    document.getElementById('overlay-msg').textContent = msg;
    document.getElementById('overlay').style.display = 'flex';
}
function hideLoading() {
    document.getElementById('overlay').style.display = 'none';
}
