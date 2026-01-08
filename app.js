import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, onSnapshot, updateDoc, serverTimestamp, query, where, addDoc, orderBy, limit, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
const firebaseConfig = {
    apiKey: "AIzaSyDwGoNaK-XPUB8WIBCelpZYGGsUAH8WeYI",
    authDomain: "bf-elite-system.firebaseapp.com",
    projectId: "bf-elite-system",
    storageBucket: "bf-elite-system.firebasestorage.app",
    messagingSenderId: "288809372816",
    appId: "1:288809372816:web:79b575d594d4707c985c15"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- إعدادات الفروع والورديات ---
const branchLocations = {
    "روكتس شبين": { lat: 30.5503, lng: 31.0106 },
    "الإدارة المالية": { lat: 0, lng: 0 },
    "قسم التجهيزات": { lat: 0, lng: 0 },
    "قسم إدارة التشغيل": { lat: 0, lng: 0 },
    "برجر شبين": { lat: 0, lng: 0 },
    "وزير الجمبري": { lat: 0, lng: 0 },
    "شواية اسبايسي": { lat: 0, lng: 0 },
    "قليوب": { lat: 0, lng: 0 },
    "الخصوص": { lat: 30.308341720140046, lng: 31.31406040935453 },
    "القلج": { lat: 0, lng: 0 },
    "الباجور": { lat: 0, lng: 0 },
    "عزبة النخل": { lat: 0, lng: 0 },
    "العبور": { lat: 0, lng: 0 },
    "نوي": { lat: 0, lng: 0 },
    "القناطر": { lat: 0, lng: 0 }
};

const SHIFTS = {
    MORNING: { start: 10, end: 19, name: 'صباحي' }, 
    NIGHT: { start: 19, end: 4, name: 'مسائي' }    
};
const MAX_DISTANCE_METERS = 300;
const LATE_BUFFER_MINUTES = 15;

let userData = null;
let allEmployeesData = [];
let allRequests = [];
let myTotalApprovedLoans = 0;
let financeChart = null;
let activeAttendanceDocId = null; 
let timerInterval = null;

// --- [1] التشغيل والتحقق ---
onAuthStateChanged(auth, async (user) => {
    const loader = document.getElementById('loader');
    if (user) {
        onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists()) {
                userData = docSnap.data();
                userData.uid = user.uid;
                initSystem();
            } else {
                signOut(auth);
            }
            if(loader) loader.classList.add('hidden');
        });
    } else {
        document.getElementById('authSection').classList.remove('hidden');
        document.getElementById('appMain').classList.add('hidden');
        document.getElementById('systemUI').classList.remove('hidden');
        if(loader) loader.classList.add('hidden');
    }
});

function initSystem() {
    const authS = document.getElementById('authSection');
    const appM = document.getElementById('appMain');
    const loader = document.getElementById('loader');

    if(authS) authS.classList.add('hidden');
    if(appM) appM.classList.remove('hidden');

    const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; }
    
    if (userData) {
        if (userData.role === 'banned') {
            Swal.fire('تم إنهاء الخدمة', 'تم تعطيل هذا الحساب.', 'error').then(() => { signOut(auth); });
            return;
        }

        let roleDisplay = 'Employee';
        if(userData.role === 'admin') roleDisplay = 'General Manager';
        if(userData.role === 'branch_manager') roleDisplay = 'Branch Manager';

        setText('headerName', userData.full_name);
        setText('headerRole', roleDisplay);
        setText('userBranchDisplay', userData.branch || 'غير محدد');
        setText('userSalary', (userData.base_salary - userData.deductions).toLocaleString());
        setText('profName', userData.full_name);
        setText('profJob', userData.job_title);
        setText('profBranch', userData.branch || 'غير محدد');
        setText('profAvatar', userData.full_name.charAt(0));
        setText('currentDateDisplay', new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));

        checkActiveSession();
        loadMyAttendanceLog();
        loadUserMessages();
        
        // تشغيل لوحة الموظف (المسؤولة عن السايد بار)
        runEmployeePanel(); 

        if (userData.role === 'admin' || userData.role === 'branch_manager') {
            const adminBtn = document.getElementById('adminBtn');
            if (adminBtn) adminBtn.classList.remove('hidden');
            if(userData.role === 'admin') {
                const resetBtn = document.getElementById('resetMonthBtn');
                if(resetBtn) resetBtn.classList.remove('hidden');
                setText('adminDate', new Date().toLocaleDateString('ar-EG'));
            }
            runAdminPanel();
        }
    }
    if(loader) loader.classList.add('hidden');
}

// --- [2] الدالة الناقصة (سبب مشكلة السايد بار) ---
// --- دالة لوحة تحكم الموظف (المحدثة) ---
function runEmployeePanel() {
    const q = query(collection(db, "requests"), where("userId", "==", auth.currentUser.uid));
    onSnapshot(q, (snap) => {
        const container = document.getElementById('myRequests');
        if(container) container.innerHTML = '';
        myTotalApprovedLoans = 0; // تصفير السلف لإعادة الحساب
        
        const docs = snap.docs.sort((a, b) => (b.data().timestamp || 0) - (a.data().timestamp || 0));

        docs.forEach(docSnap => {
            const req = docSnap.data();
            
            // 1. الحسابات المالية (تتم دائماً حتى لو الطلب مخفي)
            // عشان لو موظف خفى سلفة، تفضل مخصومة عليه من المرتب
            if (req.type === 'سلفة' && (req.status === 'approved' || req.status === 'archived_loan')) {
                const amount = parseFloat(req.note.replace(/[^0-9.]/g, '')) || 0;
                myTotalApprovedLoans += amount;
            }
            
            // 2. العرض في القائمة (نتجاوز الطلبات المخفية)
            if (req.isHidden === true) return; 

            // تحديد حالة الطلب للزرار (حذف حقيقي ولا إخفاء)
            const isPending = req.status === 'pending';
            const deleteIcon = isPending ? 'fa-trash' : 'fa-eye-slash'; // أيقونة حذف أو إخفاء
            const deleteTitle = isPending ? 'تراجع وحذف الطلب' : 'إخفاء من السجل';
            const deleteColor = isPending ? 'text-red-500 hover:bg-red-50' : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500';

            if(container) {
                const isComplaint = req.type === 'شكوى';
                let styles = req.status === 'approved' ? 'bg-green-100 text-green-700' : req.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700';
                if ((isComplaint || req.type === 'استقالة') && req.status === 'pending') styles = 'bg-red-50 text-red-600 border border-red-100';
                
                // لو السلفة مؤرشفة، نغير شكل الحالة لمقبول عشان الشكل العام
                let displayStatus = req.status;
                if(req.status === 'archived_loan') { displayStatus = 'approved'; styles = 'bg-green-100 text-green-700'; }
                const statusLabel = displayStatus === 'approved' ? 'مقبول' : displayStatus === 'rejected' ? 'مرفوض' : 'قيد الانتظار';

                container.innerHTML += `
                    <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100 ${isComplaint ? 'border-l-4 border-l-red-500' : ''} group relative">
                        <button onclick="deleteMyRequest('${docSnap.id}', '${req.status}')" class="absolute top-4 left-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors ${deleteColor}" title="${deleteTitle}">
                            <i class="fas ${deleteIcon}"></i>
                        </button>

                        <div class="flex justify-between items-start mb-2 pl-8">
                            <div>
                                <p class="font-bold text-slate-800 text-sm flex items-center gap-2">
                                    ${isComplaint ? '<i class="fas fa-bullhorn text-red-500"></i>' : ''} ${req.type}
                                </p>
                                <p class="text-[10px] text-slate-400 italic">"${req.note || 'بدون تفاصيل'}"</p>
                            </div>
                            <span class="px-3 py-1 rounded-full text-[10px] font-bold ${styles}">${statusLabel}</span>
                        </div>
                        ${req.admin_response ? `<div class="admin-note"><span class="font-bold text-slate-700">رد الإدارة:</span> ${req.admin_response}</div>` : ''}
                    </div>`;
            }
        });
        // تحديث السايد بار بعد حساب السلف
        updateFinancialSidebar();
    });
}
function updateFinancialSidebar() {
    if (!userData) return;
    const baseSalary = userData.base_salary || 0;
    const deductions = userData.deductions || 0;
    const bonuses = userData.bonuses || 0;
    const evaluation = userData.evaluation || 0;
    
    // المعادلة: (الأساسي + المكافآت) - (الخصومات + السلف)
    const netSalary = (baseSalary + bonuses) - (deductions + myTotalApprovedLoans);

    const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; }
    
    setText('sidebarBase', baseSalary.toLocaleString());
    setText('sidebarBonuses', `+${bonuses.toLocaleString()}`);
    setText('sidebarDeductions', `-${deductions.toLocaleString()}`);
    setText('sidebarLoans', `-${myTotalApprovedLoans.toLocaleString()}`);
    setText('sidebarNetSalary', netSalary.toLocaleString());
    setText('userSalary', netSalary.toLocaleString());
    setText('sidebarEval', evaluation);
    
    setText('printBase', baseSalary.toLocaleString());
    setText('printBonuses', bonuses.toLocaleString());
    setText('printDeductions', deductions.toLocaleString());
    setText('printLoans', myTotalApprovedLoans.toLocaleString());
    setText('printNet', netSalary.toLocaleString());

    // تحديث دائرة التقييم
    const circle = document.getElementById('evalCircle');
    if (circle) {
        const offset = ((10 - evaluation) / 10) * 377;
        circle.style.strokeDashoffset = offset;
        if (evaluation >= 8) circle.style.stroke = '#22c55e';
        else if (evaluation >= 5) circle.style.stroke = '#eab308';
        else circle.style.stroke = '#ef4444';
    }
}

// --- [3] نظام الأدمن (محسن لإظهار الطلبات فوراً) ---
function runAdminPanel() {
    // تحميل كل الطلبات مرة واحدة لتجنب مشاكل الفهرسة
    onSnapshot(collection(db, "requests"), (snap) => {
        allRequests = [];
        let hasPending = false;
        snap.forEach(doc => {
            const r = doc.data();
            allRequests.push({ id: doc.id, ...r });
            if (r.status === 'pending') hasPending = true;
        });
        
        // تحديث شارات التنبيه
        const el1 = document.getElementById('navBadge'); if(el1) el1.classList.toggle('hidden', !hasPending);
        const el2 = document.getElementById('notifDot'); if(el2) el2.classList.toggle('hidden', !hasPending);
        
        // تحديث قائمة الموظفين (لإظهار النقطة الحمراء)
        filterAdminList(); 
    });

    onSnapshot(collection(db, "users"), (snap) => {
        allEmployeesData = [];
        snap.forEach(empDoc => { allEmployeesData.push({ id: empDoc.id, ...empDoc.data() }); });
        filterAdminList();
    });

    // إحصائيات الحضور اليومي
    if(userData.role === 'admin') {
        const todayStr = new Date().toDateString();
        const qAtt = query(collection(db, "attendance"), where("dateStr", "==", todayStr));
        onSnapshot(qAtt, (snap) => {
            let present = 0, late = 0, early = 0;
            snap.forEach(d => {
                const r = d.data();
                present++;
                if (r.status === 'late') late++;
                if (r.status === 'early') early++;
            });
            document.getElementById('statPresent').innerText = present;
            document.getElementById('statLate').innerText = late;
            document.getElementById('statEarly').innerText = early;
            document.getElementById('statTotalAtt').innerText = present;
        });
    }
}

// دالة فلترة وعرض الموظفين (محسنة جداً)
// دالة فلترة وعرض الموظفين (مع البحث)
window.filterAdminList = () => {
    const filterEl = document.getElementById('adminBranchFilter');
    const searchEl = document.getElementById('adminSearchInput'); // عنصر البحث الجديد
    const list = document.getElementById('employeesList');
    if (!filterEl || !list) return;

    let filteredEmps = allEmployeesData;

    // 1. تصفية حسب الفرع
    if (userData.role === 'branch_manager') {
        filterEl.value = userData.branch;
        filterEl.disabled = true;
        filteredEmps = filteredEmps.filter(emp => emp.branch === userData.branch);
    } else {
        filterEl.disabled = false;
        const filterValue = filterEl.value;
        if (filterValue !== 'all') {
            filteredEmps = filteredEmps.filter(emp => emp.branch === filterValue);
        }
    }

    // 2. تصفية حسب البحث (الاسم) - الجزء الجديد
    if (searchEl && searchEl.value.trim() !== "") {
        const term = searchEl.value.toLowerCase().trim();
        filteredEmps = filteredEmps.filter(emp => emp.full_name.toLowerCase().includes(term));
    }

    // 3. استبعاد المحظورين
    const activeEmps = filteredEmps.filter(e => e.role !== 'banned');
    updateDashboardStats(activeEmps);

    // الرسم
    list.innerHTML = '';
    if (activeEmps.length === 0) { list.innerHTML = '<p class="text-center text-slate-400 py-4">لا يوجد موظفين</p>'; return; }

    activeEmps.forEach(emp => {
        const isMe = emp.id === auth.currentUser.uid;
        const canEdit = userData.role === 'admin';
        const hasPending = allRequests.some(r => r.userId === emp.id && r.status === 'pending');
        
        let roleBadge = '';
        if(emp.role === 'admin') roleBadge = '<span class="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded mr-2">Admin</span>';
        else if(emp.role === 'branch_manager') roleBadge = '<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded mr-2">Manager</span>';

        const card = `
            <div onclick="viewEmployeeFullProfile('${emp.id}')" class="bg-white border-slate-100 p-5 rounded-[2rem] border flex justify-between items-center cursor-pointer hover:shadow-xl transition-all group">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-12 bg-slate-50 text-brand rounded-xl flex items-center justify-center font-bold border border-slate-100 group-hover:bg-brand group-hover:text-white transition-colors relative">
                        ${emp.full_name.charAt(0)}
                        ${hasPending ? '<span class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping"></span><span class="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></span>' : ''}
                    </div>
                    <div>
                        <p class="font-bold text-slate-800 text-sm flex items-center">${emp.full_name} ${isMe ? '<span class="text-[10px] bg-slate-100 px-2 rounded mr-1">(أنت)</span>' : ''}</p>
                        <div class="flex items-center mt-1">
                            ${roleBadge}
                            <p class="text-[10px] text-slate-400 font-bold uppercase">${emp.branch || 'بدون فرع'}</p>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    ${canEdit && !isMe ? `
                        <button onclick="event.stopPropagation(); sendMessageTo('${emp.id}', '${emp.full_name}')" class="text-slate-300 hover:text-brand p-2" title="رسالة خاصة"><i class="fas fa-envelope"></i></button>
                        <button onclick="event.stopPropagation(); banUser('${emp.id}', '${emp.email}', '${emp.full_name}')" class="text-slate-300 hover:text-orange-500 p-2" title="حظر"><i class="fas fa-ban"></i></button>
                        <button onclick="event.stopPropagation(); deleteUserPermanent('${emp.id}', '${emp.full_name}')" class="text-slate-300 hover:text-red-600 p-2" title="حذف نهائي"><i class="fas fa-trash"></i></button>
                    ` : ''}
                </div>
            </div>`;
        list.innerHTML += card;
    });
};

function updateDashboardStats(filteredEmps) {
    let totalEmployees = filteredEmps.length;
    let totalBaseSalaries = 0;
    let totalBonuses = 0;
    let totalLoans = 0;

    filteredEmps.forEach(emp => {
        totalBaseSalaries += (emp.base_salary || 0);
        totalBonuses += (emp.bonuses || 0);
    });

    const filteredEmpIds = filteredEmps.map(e => e.id);
    const relevantLoans = allRequests.filter(req => filteredEmpIds.includes(req.userId) && req.type === 'سلفة' && req.status === 'approved');
    relevantLoans.forEach(l => { const amt = parseFloat(l.note.replace(/[^0-9.]/g, '')) || 0; totalLoans += amt; });

    document.getElementById('statCount').innerText = totalEmployees;
    document.getElementById('statSalaries').innerText = totalBaseSalaries.toLocaleString() + ' ج.م';
    document.getElementById('statLoans').innerText = totalLoans.toLocaleString() + ' ج.م';
    document.getElementById('statBonuses').innerText = totalBonuses.toLocaleString() + ' ج.م';

    const ctx = document.getElementById('financeChart').getContext('2d');
    if (financeChart) financeChart.destroy();

    financeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['الرواتب الأساسية', 'إجمالي السلف', 'المكافآت'],
            datasets: [{ data: [totalBaseSalaries, totalLoans, totalBonuses], backgroundColor: ['#2563eb', '#f97316', '#22c55e'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { family: 'Tajawal' } } } }, cutout: '70%' }
    });
}

// --- بقية دوال الحضور والبصمة والرسائل كما هي ---
function checkActiveSession() {
    const q = query(collection(db, "attendance"), 
        where("userId", "==", userData.uid), 
        where("checkOutTime", "==", null),
        orderBy("checkInTime", "desc"),
        limit(1)
    );

    onSnapshot(q, (snap) => {
        const btnText = document.getElementById('attnBtnText');
        const uiSession = document.getElementById('activeSessionUI');
        const btn = document.getElementById('checkInBtn');

        if (!snap.empty) {
            const docData = snap.docs[0].data();
            activeAttendanceDocId = snap.docs[0].id;
            
            if(btnText) btnText.innerText = "تسجيل انصراف";
            if(btn) btn.classList.replace('bg-black', 'bg-danger');
            
            if(uiSession) {
                uiSession.classList.remove('hidden');
                const startTime = docData.checkInTime.toDate();
                document.getElementById('startTimeDisplay').innerText = startTime.toLocaleTimeString('en-US', {hour: '2-digit', minute:'2-digit'});
                startWorkTimer(startTime);
                
                const badge = document.getElementById('shiftBadge');
                if(badge) {
                    badge.classList.remove('hidden');
                    badge.innerText = `وردية ${docData.shiftType || 'عامة'}`;
                }
            }
        } else {
            activeAttendanceDocId = null;
            if(btnText) btnText.innerText = "تسجيل حضور";
            if(btn) btn.classList.replace('bg-danger', 'bg-black');
            if(uiSession) uiSession.classList.add('hidden');
            if(timerInterval) clearInterval(timerInterval);
            const badge = document.getElementById('shiftBadge');
            if(badge) badge.classList.add('hidden');
        }
    });
}

function startWorkTimer(startTime) {
    if(timerInterval) clearInterval(timerInterval);
    const timerEl = document.getElementById('workTimer');
    timerInterval = setInterval(() => {
        const now = new Date();
        const diff = now - startTime;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        if(timerEl) timerEl.innerText = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

window.handleAttendance = () => {
    if (!navigator.geolocation) { Swal.fire('خطأ', 'المتصفح لا يدعم تحديد الموقع', 'error'); return; }
    const targetBranch = branchLocations[userData.branch];
    const bypassGPS = (targetBranch && targetBranch.lat === 0) || userData.role === 'admin';
    Swal.fire({ title: 'جاري التحقق...', didOpen: () => Swal.showLoading() });

    navigator.geolocation.getCurrentPosition(async (pos) => {
        let dist = 0;
        if (!bypassGPS) {
            dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, targetBranch.lat, targetBranch.lng);
        }

        if (bypassGPS || dist <= MAX_DISTANCE_METERS) {
            try {
                if (activeAttendanceDocId) {
                    await updateDoc(doc(db, "attendance", activeAttendanceDocId), { checkOutTime: serverTimestamp() });
                    Swal.fire('تمام', 'تم تسجيل الانصراف. يعطيك العافية! 👋', 'success');
                } else {
                    const now = new Date();
                    const shiftInfo = calculateShiftInfo(now);
                    await addDoc(collection(db, "attendance"), {
                        userId: auth.currentUser.uid,
                        userName: userData.full_name,
                        branch: userData.branch,
                        checkInTime: serverTimestamp(),
                        checkOutTime: null,
                        shiftType: shiftInfo.type,
                        status: shiftInfo.status,
                        dateStr: now.toDateString(),
                        skippedCheck: bypassGPS
                    });
                    let msg = 'تم تسجيل الحضور ✅';
                    if(shiftInfo.status === 'late') msg += ' (متأخر)';
                    Swal.fire('أهلاً بك', msg, shiftInfo.status === 'late' ? 'warning' : 'success');
                }
            } catch (e) { Swal.fire('خطأ', e.message, 'error'); }
        } else {
            Swal.fire('خارج النطاق', `أنت تبعد ${Math.round(dist)} متر عن الفرع.`, 'error');
        }
    }, (err) => {
        Swal.fire('خطأ GPS', 'يرجى تفعيل خدمة الموقع', 'error');
    });
};

function calculateShiftInfo(date) {
    const hour = date.getHours();
    const minutes = date.getMinutes();
    let type = 'غير محدد';
    let status = 'on_time';
    if (hour >= 8 && hour < 16) {
        type = SHIFTS.MORNING.name;
        if (hour > 10 || (hour === 10 && minutes > LATE_BUFFER_MINUTES)) status = 'late';
        else if (hour < 10) status = 'early';
    } else {
        type = SHIFTS.NIGHT.name;
        if (hour > 19 || (hour === 19 && minutes > LATE_BUFFER_MINUTES)) status = 'late';
        else if (hour < 19 && hour > 16) status = 'early';
    }
    return { type, status };
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const p1 = lat1 * Math.PI/180, p2 = lat2 * Math.PI/180;
    const dp = (lat2-lat1) * Math.PI/180, dl = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function loadMyAttendanceLog() {
    const container = document.getElementById('myAttendanceLog');
    if(!container) return;
    if (!auth.currentUser) return;
    try {
        const q = query(
            collection(db, "attendance"), 
            where("userId", "==", auth.currentUser.uid), 
            orderBy("checkInTime", "desc"), 
            limit(20)
        );

        onSnapshot(q, (snap) => {
            container.innerHTML = '';
            if(snap.empty) { 
                container.innerHTML = `<div class="text-center py-6"><i class="fas fa-fingerprint text-4xl text-slate-200 mb-2"></i><p class="text-xs text-slate-400 font-bold">لا يوجد سجلات حضور حتى الآن</p></div>`; 
                return; 
            }
            snap.forEach(d => {
                const r = d.data();
                const inTime = r.checkInTime ? r.checkInTime.toDate() : null;
                const outTime = r.checkOutTime ? r.checkOutTime.toDate() : null;
                let durationStr = 'جاري العمل...';
                let durationColor = 'bg-brand text-white animate-pulse';
                if (inTime && outTime) {
                    const diffMs = outTime - inTime;
                    const hrs = Math.floor(diffMs / 3600000);
                    const mins = Math.floor((diffMs % 3600000) / 60000);
                    durationStr = `${hrs}س ${mins}د`;
                    durationColor = 'bg-slate-200 text-slate-600';
                }
                const statusColor = r.status === 'late' ? 'text-red-500' : (r.status === 'early' ? 'text-green-600' : 'text-slate-600');
                const statusText = r.status === 'late' ? 'تأخير' : (r.status === 'early' ? 'مبكر' : 'مواظب');
                const shiftLabel = r.shiftType || 'عام';
                container.innerHTML += `
                    <div class="flex justify-between items-center bg-slate-50 p-3 rounded-lg border-r-4 ${r.status === 'late' ? 'border-r-red-500' : 'border-r-green-500'} border-slate-100 mb-2">
                        <div>
                            <div class="flex items-center gap-2 mb-1">
                                <p class="text-xs font-black text-slate-800">${inTime ? inTime.toLocaleDateString('ar-EG') : '-'}</p>
                                <span class="text-[9px] bg-black text-white px-1 rounded">${shiftLabel}</span>
                            </div>
                            <p class="text-[10px] text-slate-500 font-bold">
                                ${inTime ? inTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'} 
                                <i class="fas fa-arrow-left mx-1 text-slate-300"></i> 
                                ${outTime ? outTime.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--'}
                            </p>
                        </div>
                        <div class="text-left flex flex-col items-end gap-1">
                            <span class="block text-xs font-black ${statusColor}">${statusText}</span>
                            <span class="text-[9px] font-bold px-2 py-0.5 rounded ${durationColor}">${durationStr}</span>
                        </div>
                    </div>`;
            });
        }, (error) => {
            if (error.message.includes("index")) container.innerHTML = '<p class="text-xs text-red-500 text-center font-bold">مطلوب إنشاء فهرس (Index).</p>';
        });
    } catch (err) { console.error(err); }
}

window.viewEmployeeFullProfile = async (empId) => {
    const empDoc = await getDoc(doc(db, "users", empId));
    if(!empDoc.exists()) return;
    const emp = empDoc.data();
    
    // تعبئة بيانات الموظف الأساسية في المودال
    const mn = document.getElementById('modalName'); if(mn) mn.innerText = emp.full_name;
    const mb = document.getElementById('modalBranch'); if(mb) mb.innerText = emp.job_title + ' | ' + emp.branch;
    
    document.getElementById('empModal').classList.remove('hidden');
    const content = document.getElementById('modalContent');
    content.innerHTML = '<div class="text-center py-10"><i class="fas fa-circle-notch fa-spin text-3xl text-brand"></i></div>';

    // جلب البيانات (الحضور + الطلبات)
    const qAtt = query(collection(db, "attendance"), where("userId", "==", empId), orderBy("checkInTime", "desc"), limit(5));
    // هنا زودنا limit الطلبات لـ 10 عشان تشوف هيستوري أكبر
    const qReq = query(collection(db, "requests"), where("userId", "==", empId), orderBy("timestamp", "desc"), limit(10));

    onSnapshot(qAtt, (attSnap) => {
        onSnapshot(qReq, (reqSnap) => {
            // 1. تجهيز قائمة الحضور
            let attHTML = '';
            if(attSnap.empty) attHTML = '<div class="text-center p-4 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200"><p class="text-xs text-slate-400 font-bold">لا يوجد سجل حضور</p></div>';
            else {
                attSnap.forEach(d => {
                    const r = d.data();
                    const inTime = r.checkInTime ? r.checkInTime.toDate().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '--';
                    const date = r.checkInTime ? r.checkInTime.toDate().toLocaleDateString('ar-EG') : '';
                    const statusClass = r.status === 'late' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700';
                    const statusText = r.status === 'late' ? 'تأخير' : 'مواظب';
                    
                    attHTML += `
                    <div class="flex justify-between items-center text-[10px] bg-white p-2.5 rounded-lg mb-2 border-2 border-slate-100">
                        <div class="flex items-center gap-2">
                            <span class="font-black text-slate-700">${date}</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-slate-600">${inTime}</span>
                            <span class="${statusClass} px-2 py-0.5 rounded-md font-bold">${statusText}</span>
                        </div>
                    </div>`;
                });
            }

            // 2. تجهيز قائمة الطلبات (مع زراير التحكم)
            let reqHTML = '';
            if(reqSnap.empty) reqHTML = '<div class="text-center p-4 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200"><p class="text-xs text-slate-400 font-bold">لا يوجد طلبات حديثة</p></div>';
            else {
                reqSnap.forEach(d => {
                    const r = d.data();
                    const isPending = r.status === 'pending';
                    const isAdmin = userData.role === 'admin';
                    
                    let actions = '';
                    let statusBadge = '';

                    // لو الطلب معلق وأنا أدمن => أظهر الزراير
                    if (isPending) {
                         if (isAdmin) {
                            actions = `
                                <div class="flex gap-2 mt-3 pt-3 border-t-2 border-slate-100">
                                    <button onclick="processRequest('${d.id}', 'approved')" class="flex-1 bg-green-500 text-white py-2 rounded-lg text-xs font-black hover:bg-green-600 transition-transform active:scale-95 shadow-[2px_2px_0px_#15803d]">موافقة</button>
                                    <button onclick="processRequest('${d.id}', 'rejected')" class="flex-1 bg-red-500 text-white py-2 rounded-lg text-xs font-black hover:bg-red-600 transition-transform active:scale-95 shadow-[2px_2px_0px_#b91c1c]">رفض</button>
                                </div>
                            `;
                         } else {
                            statusBadge = `<span class="bg-orange-100 text-orange-600 px-2 py-1 rounded-md text-[10px] font-black animate-pulse">قيد المراجعة</span>`;
                         }
                    } else {
                        // لو الطلب منتهي
                        const color = r.status === 'approved' ? 'text-green-700 bg-green-100' : 'text-red-700 bg-red-100';
                        const text = r.status === 'approved' ? 'مقبول' : 'مرفوض';
                        // تحويل حالة archived_loan لـ مقبول برضه عشان الشكل
                        if (r.status === 'archived_loan') {
                             statusBadge = `<span class="text-slate-500 bg-slate-100 px-2 py-1 rounded-md text-[10px] font-black">مؤرشف</span>`;
                        } else {
                             statusBadge = `<span class="${color} px-2 py-1 rounded-md text-[10px] font-black">${text}</span>`;
                        }
                    }

                    reqHTML += `
                        <div class="bg-white border-2 border-slate-100 p-3 rounded-xl mb-3 relative overflow-hidden transition-all hover:border-brand">
                             <div class="flex justify-between items-start">
                                <div>
                                    <span class="font-black text-xs text-slate-800 block mb-1 flex items-center gap-1">
                                        ${r.type === 'سلفة' ? '<i class="fas fa-money-bill text-green-500"></i>' : r.type === 'شكوى' ? '<i class="fas fa-bullhorn text-red-500"></i>' : '<i class="fas fa-file-alt text-brand"></i>'} 
                                        ${r.type}
                                    </span>
                                    <p class="text-[10px] text-slate-500 font-medium">"${r.note || '-'}"</p>
                                </div>
                                ${statusBadge}
                             </div>
                             <div class="text-[9px] text-slate-300 mt-2 text-left font-bold">${r.timestamp ? r.timestamp.toDate().toLocaleDateString('ar-EG') : 'الآن'}</div>
                             ${actions}
                        </div>`;
                });
            }

            // 3. تجميع العرض النهائي داخل المودال
            content.innerHTML = `
                <div class="space-y-6 pb-10">
                    <div class="bg-slate-50 p-4 rounded-2xl border-2 border-slate-200">
                        <h4 class="font-black text-sm mb-3 border-b-2 border-slate-200 pb-2 flex justify-between">
                            <span>المالية (للشهر الحالي)</span>
                            <i class="fas fa-wallet text-slate-300"></i>
                        </h4>
                        <div class="grid grid-cols-2 gap-2 text-xs">
                            <div class="bg-white p-3 rounded-xl border-2 border-slate-100">
                                <span class="block text-slate-400 text-[10px] font-bold">الأساسي</span>
                                <span class="font-black text-slate-800 text-sm">${emp.base_salary}</span>
                            </div>
                            <div class="bg-white p-3 rounded-xl border-2 border-slate-100">
                                <span class="block text-slate-400 text-[10px] font-bold">المكافآت</span>
                                <span class="font-black text-green-600 text-sm">+${emp.bonuses}</span>
                            </div>
                            <div class="bg-white p-3 rounded-xl border-2 border-slate-100">
                                <span class="block text-slate-400 text-[10px] font-bold">الخصومات</span>
                                <span class="font-black text-red-500 text-sm">-${emp.deductions}</span>
                            </div>
                            <div class="bg-white p-3 rounded-xl border-2 border-slate-100">
                                <span class="block text-slate-400 text-[10px] font-bold">التقييم</span>
                                <span class="font-black text-brand text-sm">${emp.evaluation}/10</span>
                            </div>
                        </div>
                        <button onclick="editFinancials('${empId}', '${emp.full_name}', ${emp.base_salary}, ${emp.deductions}, ${emp.bonuses}, ${emp.evaluation}, '${emp.role}')" class="w-full mt-3 bg-black text-white py-3 rounded-xl text-xs font-black hover:bg-slate-800 transition-colors shadow-[2px_2px_0px_#cbd5e1] active:translate-y-[2px] active:shadow-none">
                            <i class="fas fa-cog ml-2"></i> تعديل البيانات المالية
                        </button>
                    </div>

                    <div>
                        <h4 class="font-black text-sm mb-3 text-slate-700 flex items-center gap-2">
                            <i class="fas fa-inbox text-brand"></i> سجل الطلبات
                        </h4>
                        <div class="max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                            ${reqHTML}
                        </div>
                    </div>

                    <div>
                        <h4 class="font-black text-sm mb-3 text-slate-700 flex items-center gap-2">
                            <i class="fas fa-fingerprint text-slate-400"></i> آخر 5 بصمات
                        </h4>
                        ${attHTML}
                    </div>
                </div>`;
        });
    });
};

// --- [5] نظام الرسائل (المحدث) ---

window.loadUserMessages = () => {
    const container = document.getElementById('adminMessagesList');
    const wrapper = document.getElementById('msgContainer');
    if(!container || !wrapper) return;

    const q = query(
        collection(db, "messages"), 
        where("targetId", "in", ["all", auth.currentUser.uid]),
        orderBy("timestamp", "desc"),
        limit(20) // زودنا العدد عشان لو فيه رسايل ممسوحة
    );

    onSnapshot(q, (snap) => {
        // لو مفيش رسايل خالص، نخفي الكونتينر
        if(snap.empty) { wrapper.classList.add('hidden'); return; }
        
        let visibleCount = 0;
        container.innerHTML = '';
        
        snap.forEach(d => {
            const m = d.data();
            
            // 1. فلتر الإخفاء للموظف (لو الآيدي بتاعي موجود في قائمة المحذوفين، متظهرش الرسالة)
            if (m.deletedBy && m.deletedBy.includes(auth.currentUser.uid)) return;

            visibleCount++;
            const time = m.timestamp ? m.timestamp.toDate().toLocaleDateString('ar-EG') : '';
            const isPrivate = m.targetId !== 'all';
            const isSender = m.senderId === auth.currentUser.uid; // هل أنا اللي باعت الرسالة؟

            // تحديد نوع الحذف (للأدمن حذف نهائي، للموظف إخفاء فقط)
            const deleteTitle = isSender ? 'حذف من عند الجميع (استرداد)' : 'إخفاء من القائمة';
            const deleteIconClass = isSender ? 'text-red-500 hover:bg-red-100' : 'text-slate-400 hover:bg-slate-200';

            container.innerHTML += `
                <div class="bg-yellow-50 p-3 rounded-lg border-2 border-yellow-200 relative group transition-all hover:shadow-md">
                    ${isPrivate ? '<span class="absolute -top-2 -left-2 bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold shadow-sm">خاص</span>' : ''}
                    
                    <button onclick="deleteMessage('${d.id}', ${isSender})" class="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${deleteIconClass}" title="${deleteTitle}">
                        <i class="fas fa-times text-xs"></i>
                    </button>

                    <p class="text-xs font-bold text-slate-800 mb-1 pl-6 leading-relaxed">${m.text}</p>
                    <div class="flex justify-between items-center mt-2 border-t border-yellow-200/50 pt-1">
                        <p class="text-[9px] text-slate-400 font-bold">${time}</p>
                        <p class="text-[9px] text-brand font-black">${isSender ? 'أنت المرسل' : 'الإدارة'}</p>
                    </div>
                </div>
            `;
        });

        // لو كل الرسايل اللي جاية معمولة ليها "إخفاء"، نخفي الكونتينر كله
        if (visibleCount === 0) wrapper.classList.add('hidden');
        else wrapper.classList.remove('hidden');

    }, (error) => {
        if(error.message.includes("index")) console.log("Message Index Required");
    });
};

// دالة حذف الرسالة (ذكية)
window.deleteMessage = async (msgId, isSender) => {
    // الحالة 1: أنا المرسل (أدمن) -> حذف نهائي (Unsend)
    if (isSender) {
        const { isConfirmed } = await Swal.fire({
            title: 'حذف الرسالة نهائياً؟',
            text: "سيتم حذف الرسالة من عند جميع الموظفين وكأنها لم تكن.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            confirmButtonText: 'نعم، حذف للكل',
            cancelButtonText: 'تراجع'
        });

        if (isConfirmed) {
            try {
                await deleteDoc(doc(db, "messages", msgId));
                Swal.fire('تم', 'تم سحب الرسالة بنجاح', 'success');
            } catch (e) {
                Swal.fire('خطأ', 'حدث خطأ أثناء الحذف', 'error');
            }
        }
    } 
    // الحالة 2: أنا المستقبل (موظف) -> إخفاء فقط (Soft Delete)
    else {
        // مش محتاجين تأكيد قوي هنا، ده مجرد تنظيف للقائمة
        try {
            // بنضيف الآيدي بتاعي في مصفوفة deletedBy
            await updateDoc(doc(db, "messages", msgId), {
                deletedBy: arrayUnion(auth.currentUser.uid)
            });
            // مش لازم رسالة نجاح عشان العملية تكون سريعة وسلسة (UX أفضل)
        } catch (e) {
            console.error(e);
        }
    }
};

window.sendMessageTo = async (uid, name) => {
    const { value: text } = await Swal.fire({
        title: `رسالة إلى ${name}`,
        input: 'textarea',
        inputPlaceholder: 'اكتب الرسالة هنا...',
        confirmButtonText: 'إرسال',
        confirmButtonColor: '#000'
    });
    if (text) {
        await addDoc(collection(db, "messages"), {
            text: text, targetId: uid, targetName: name, senderId: auth.currentUser.uid, timestamp: serverTimestamp()
        });
        Swal.fire('تم', 'تم إرسال الرسالة بنجاح', 'success');
    }
};

window.sendBroadcastMessage = async () => {
    const { value: text } = await Swal.fire({
        title: 'نداء عام لكل الموظفين',
        text: 'ستظهر هذه الرسالة في لوحة تحكم الجميع',
        input: 'textarea',
        inputPlaceholder: 'اكتب التنبيه هنا...',
        confirmButtonText: 'إرسال للجميع',
        confirmButtonColor: '#ef4444' 
    });
    if (text) {
        await addDoc(collection(db, "messages"), {
            text: text, targetId: "all", targetName: "All Employees", senderId: auth.currentUser.uid, timestamp: serverTimestamp()
        });
        Swal.fire('تم', 'تم نشر التنبيه للجميع', 'success');
    }
};

window.sendRequest = async (type) => {
    let title = `طلب ${type}`;
    let confirmColor = '#2563eb';
    if (type === 'شكوى') { title = 'تقديم شكوى'; confirmColor = '#ef4444'; }
    if (type === 'استقالة') { title = 'تقديم استقالة'; confirmColor = '#0f172a'; }
    const { value: note } = await Swal.fire({
        title: title, input: 'textarea', inputPlaceholder: 'اكتب التفاصيل هنا...', confirmButtonText: 'إرسال', confirmButtonColor: confirmColor, background: '#f8fafc'
    });
    if (note !== undefined) {
        await addDoc(collection(db, "requests"), {
            userId: auth.currentUser.uid, userName: userData.full_name, userBranch: userData.branch || 'عام', type: type, note: note, status: 'pending', admin_response: '', timestamp: serverTimestamp()
        });
        Swal.fire({ icon: 'success', title: 'تم الإرسال', showConfirmButton: false, timer: 1500 });
    }
};

window.deleteUserPermanent = async (id, name) => {
    const { isConfirmed } = await Swal.fire({
        title: `حذف نهائي للموظف: ${name}`,
        text: "هذا الإجراء سيقوم بمسح الموظف وبياناته تماماً وكأنه لم يكن موجوداً! لا يمكن التراجع.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#000', cancelButtonColor: '#d33', confirmButtonText: 'نعم، احذفه للأبد', cancelButtonText: 'تراجع'
    });
    if (isConfirmed) {
        try { await deleteDoc(doc(db, "users", id)); Swal.fire('تم الحذف', 'تم مسح الموظف من السجلات بنجاح', 'success'); } catch (e) { Swal.fire('خطأ', e.message, 'error'); }
    }
};

window.editFinancials = async (id, name, sal, ded, bon, ev, currentRole) => {
    const isAdmin = userData.role === 'admin';
    const disableAttr = isAdmin ? '' : 'disabled';
    const bgClass = isAdmin ? '' : 'bg-slate-100';
    const { value: formValues } = await Swal.fire({
        title: isAdmin ? `إدارة الموظف | ${name}` : `بيانات الموظف | ${name}`,
        html:
            `<div class="text-right space-y-3">` +
            `<div><label class="text-xs font-bold text-royal">الصلاحية (Role)</label>` +
            `<select id="swal-role" class="w-full border p-2 rounded bg-slate-50 font-bold" ${disableAttr}>` +
            `<option value="employee" ${currentRole === 'employee' ? 'selected' : ''}>موظف عادي</option>` +
            `<option value="branch_manager" ${currentRole === 'branch_manager' ? 'selected' : ''}>مدير فرع</option>` +
            `<option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>مدير عام (Admin)</option>` +
            `</select></div><hr class="border-slate-200 my-2">` +
            `<div><label class="text-xs font-bold">الراتب الأساسي</label><input id="swal-sal" type="number" class="w-full border p-2 rounded ${bgClass}" value="${sal}" ${disableAttr}></div>` +
            `<div><label class="text-xs font-bold text-green-600">مكافآت / حوافز</label><input id="swal-bon" type="number" class="w-full border p-2 rounded ${bgClass}" value="${bon}" ${disableAttr}></div>` +
            `<div><label class="text-xs font-bold text-red-500">خصومات / جزاءات</label><input id="swal-ded" type="number" class="w-full border p-2 rounded ${bgClass}" value="${ded}" ${disableAttr}></div>` +
            `<div><label class="text-xs font-bold text-brand">التقييم (من 10)</label><input id="swal-ev" type="number" max="10" min="0" class="w-full border p-2 rounded ${bgClass}" value="${ev}" ${disableAttr}></div></div>`,
        focusConfirm: false, showCancelButton: true, cancelButtonText: 'إغلاق', confirmButtonText: isAdmin ? 'حفظ التحديثات' : 'قراءة فقط', showConfirmButton: isAdmin,
        preConfirm: () => {
            return [
                document.getElementById('swal-sal').value, document.getElementById('swal-ded').value, document.getElementById('swal-bon').value, document.getElementById('swal-ev').value, document.getElementById('swal-role').value
            ]
        }
    });
    if (formValues && isAdmin) {
        await updateDoc(doc(db, "users", id), { 
            base_salary: Number(formValues[0]), deductions: Number(formValues[1]), bonuses: Number(formValues[2]), evaluation: Number(formValues[3]), role: formValues[4]
        });
        Swal.fire('تم الحفظ', 'تم تحديث البيانات', 'success');
        if(id === auth.currentUser.uid && formValues[4] !== userData.role) location.reload();
    }
};

window.banUser = async (id, email, name) => {
    const { isConfirmed } = await Swal.fire({
        title: `فصل الموظف: ${name}`, text: "سيتم حذف صلاحياته وإضافته للقائمة السوداء. هل أنت متأكد؟", icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', confirmButtonText: 'نعم، فصل وحظر', cancelButtonText: 'إلغاء'
    });
    if (isConfirmed) {
        try {
            await updateDoc(doc(db, "users", id), { role: 'banned' });
            await setDoc(doc(db, "banned_emails", email), { banned_at: serverTimestamp(), reason: "Administrative Termination", name: name });
            Swal.fire('تم الحظر', 'تم فصل الموظف وإضافته للقائمة السوداء', 'success');
            filterAdminList();
        } catch (e) { Swal.fire('خطأ', e.message, 'error'); }
    }
};
window.openEmpRequests = (id, name, branch) => { window.viewEmployeeFullProfile(id); }; // Re-routed for better UX
window.processRequest = async (id, status) => {
    if (userData.role !== 'admin') { Swal.fire('تنبيه', 'غير مسموح لك باتخاذ هذا الإجراء', 'error'); return; }
    const actionText = status === 'approved' ? 'الموافقة' : 'الرفض';
    const { value: adminNote } = await Swal.fire({
        title: `تأكيد ${actionText}`, input: 'text', inputPlaceholder: 'أضف ملاحظات (اختياري)...', showCancelButton: true, confirmButtonText: 'تأكيد', cancelButtonText: 'إلغاء', confirmButtonColor: status === 'approved' ? '#22c55e' : '#ef4444'
    });
    if (adminNote !== undefined) {
        try { await updateDoc(doc(db, "requests", id), { status: status, admin_response: adminNote || '' });
        Swal.fire({ icon: 'success', title: 'تم التحديث', timer: 1000, showConfirmButton: false }); } catch (e) { console.error(e); }
    }
};

window.login = async () => { const e = document.getElementById('email').value, p = document.getElementById('pass').value; try { await signInWithEmailAndPassword(auth, e, p); } catch (err) { Swal.fire('خطأ', 'البيانات غير صحيحة', 'error'); } };
window.signup = async () => {
    const name = document.getElementById('regName').value, branch = document.getElementById('regBranch').value, job = document.getElementById('regJob').value, email = document.getElementById('regEmail').value.toLowerCase().trim(), pass = document.getElementById('regPass').value;
    if(!branch) { Swal.fire('تنبيه', 'يرجى اختيار الفرع', 'warning'); return; }
    try {
        const bannedCheck = await getDoc(doc(db, "banned_emails", email));
        if (bannedCheck.exists()) { Swal.fire({ icon: 'error', title: 'غير مسموح', text: 'عفواً، لا يمكن إنشاء حساب لهذا البريد الإلكتروني (محظور إدارياً).', footer: 'يرجى مراجعة إدارة الموارد البشرية' }); return; }
        const r = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", r.user.uid), { full_name: name, branch: branch, job_title: job, email: email, role: "employee", base_salary: 0, deductions: 0, bonuses: 0, evaluation: 10, joined_at: serverTimestamp() });
        Swal.fire('تم', 'تم إنشاء الحساب بنجاح', 'success'); toggleAuth(false);
    } catch (e) { Swal.fire('خطأ', e.message, 'error'); }
};
window.changePass = async () => { const oldP = document.getElementById('oldPass').value, newP = document.getElementById('newPass').value, user = auth.currentUser; const cred = EmailAuthProvider.credential(user.email, oldP); try { await reauthenticateWithCredential(user, cred); await updatePassword(user, newP); Swal.fire('تم', 'تم تغيير كلمة المرور', 'success'); } catch (e) { Swal.fire('خطأ', 'تأكد من الباسورد القديم', 'error'); } };
window.switchTab = (id, btn) => { document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active')); document.getElementById(id).classList.add('active'); document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active', 'text-brand')); document.querySelectorAll('.nav-btn').forEach(b => b.classList.add('text-slate-400')); btn.classList.add('active', 'text-brand'); btn.classList.remove('text-slate-400'); };
window.closeModal = () => document.getElementById('empModal').classList.add('hidden');
window.toggleAuth = (show) => { document.getElementById('loginForm').classList.toggle('hidden', show); document.getElementById('signupForm').classList.toggle('hidden', !show); };
window.logout = () => signOut(auth).then(() => location.reload());
window.toggleSidebar = (show) => {
    const sb = document.getElementById('salarySidebar');
    const ov = document.getElementById('sidebarOverlay');
    if (sb && ov) {
        if (show) { sb.classList.remove('translate-x-full'); ov.classList.remove('hidden'); updateFinancialSidebar(); } 
        else { sb.classList.add('translate-x-full'); ov.classList.add('hidden'); }
    }
};
window.printSlip = () => {
    const base = userData.base_salary || 0;
    const bon = userData.bonuses || 0;
    const ded = userData.deductions || 0;
    const loans = myTotalApprovedLoans || 0;
    const net = (base + bon) - (ded + loans);
    document.getElementById('printName').innerText = userData.full_name;
    document.getElementById('printBranch').innerText = userData.branch;
    document.getElementById('printJob').innerText = userData.job_title;
    document.getElementById('printDate').innerText = new Date().toLocaleDateString('ar-EG');
    document.getElementById('printBase').innerText = base.toLocaleString();
    document.getElementById('printBonuses').innerText = bon.toLocaleString();
    document.getElementById('printDeductions').innerText = ded.toLocaleString();
    document.getElementById('printLoans').innerText = loans.toLocaleString();
    document.getElementById('printNet').innerText = net.toLocaleString() + ' EGP';
    window.print();
};
window.resetMonthlyData = async () => {
    const { isConfirmed } = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: "سيتم تصفير جميع المكافآت والخصومات وأرشفة السلف لبدء شهر جديد!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444', confirmButtonText: 'نعم، ابدأ شهراً جديداً', cancelButtonText: 'إلغاء'
    });
    if (isConfirmed) {
        Swal.fire({ title: 'جاري المعالجة...', didOpen: () => Swal.showLoading() });
        try {
            const batchPromises = allEmployeesData.map(emp => { return updateDoc(doc(db, "users", emp.id), { bonuses: 0, deductions: 0, evaluation: 10 }); });
            const approvedLoans = allRequests.filter(r => r.type === 'سلفة' && r.status === 'approved');
            const loanPromises = approvedLoans.map(req => { return updateDoc(doc(db, "requests", req.id), { status: 'archived_loan' }); });
            await Promise.all([...batchPromises, ...loanPromises]);
            Swal.fire('تم بنجاح', 'تم بدء شهر مالي جديد', 'success');
        } catch (e) { Swal.fire('خطأ', e.message, 'error'); }
    }
};

// دالة حذف أو إخفاء الطلب للموظف
window.deleteMyRequest = async (reqId, status) => {
    // لو الطلب لسه معلق، بنسمح بالحذف النهائي
    if (status === 'pending') {
        const { isConfirmed } = await Swal.fire({
            title: 'هل تريد حذف الطلب؟',
            text: "سيتم التراجع عن الطلب وحذفه نهائياً.",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'نعم، احذف',
            cancelButtonText: 'تراجع'
        });

        if (isConfirmed) {
            try {
                await deleteDoc(doc(db, "requests", reqId));
                Swal.fire('تم الحذف', 'تم حذف الطلب بنجاح', 'success');
            } catch (error) {
                Swal.fire('خطأ', 'حدث خطأ أثناء الحذف', 'error');
            }
        }
    } 
    // لو الطلب تم الرد عليه (مقبول/مرفوض)، بنعمل إخفاء فقط (Soft Delete)
    else {
        const { isConfirmed } = await Swal.fire({
            title: 'إخفاء من السجل؟',
            text: "سيتم إخفاء الطلب من القائمة أمامك فقط، ولكنه سيظل محفوظاً في النظام للحسابات.",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#000',
            confirmButtonText: 'نعم، إخفاء',
            cancelButtonText: 'إلغاء'
        });

        if (isConfirmed) {
            try {
                // بنعدل الدوكيمنت ونضيف حقل اسمه isHidden
                await updateDoc(doc(db, "requests", reqId), {
                    isHidden: true
                });
                Swal.fire('تم', 'تم إخفاء الطلب من القائمة', 'success');
            } catch (error) {
                Swal.fire('خطأ', 'حدث خطأ أثناء الإخفاء', 'error');
            }
        }
    }
};