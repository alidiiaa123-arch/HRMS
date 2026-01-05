import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, updateDoc, serverTimestamp, query, where, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

let userData = null;
let allEmployeesData = [];
let allRequests = [];
let myTotalApprovedLoans = 0;
let financeChart = null;

// --- [1] مراقب الدخول ---
onAuthStateChanged(auth, async (user) => {
    const loader = document.getElementById('loader');
    if (user) {
        onSnapshot(doc(db, "users", user.uid), (docSnap) => {
            if (docSnap.exists()) {
                userData = docSnap.data();
                userData.uid = user.uid;
                initSystem();
            }
            loader.classList.add('hidden');
        });
    } else {
        document.getElementById('authSection').classList.remove('hidden');
        document.getElementById('appMain').classList.add('hidden');
        loader.classList.add('hidden');
    }
});

function initSystem() {
    const authS = document.getElementById('authSection');
    const appM = document.getElementById('appMain');
    if(authS) authS.classList.add('hidden');
    if(appM) appM.classList.remove('hidden');

    const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; }
    
    if (userData) {
        // فحص الحظر
        if (userData.role === 'banned') {
            Swal.fire('تم إنهاء الخدمة', 'تم تعطيل هذا الحساب من قبل الإدارة.', 'error')
            .then(() => { signOut(auth).then(() => location.reload()); });
            return;
        }

        let roleDisplay = 'Employee';
        if(userData.role === 'admin') roleDisplay = 'General Manager';
        if(userData.role === 'branch_manager') roleDisplay = 'Branch Manager';

        setText('headerName', userData.full_name);
        setText('headerRole', roleDisplay);
        setText('avatar', userData.full_name.charAt(0));
        
        setText('userBranchDisplay', `الفرع: ${userData.branch || 'غير محدد'}`);
        setText('profName', userData.full_name);
        setText('profJob', userData.job_title);
        setText('profBranch', userData.branch || 'غير محدد');
        setText('profEmail', userData.email);
        setText('profAvatar', userData.full_name.charAt(0));

        if (userData.role === 'admin' || userData.role === 'branch_manager') {
            const adminBtn = document.getElementById('adminBtn');
            if (adminBtn) adminBtn.classList.remove('hidden');
            if(userData.role === 'admin') {
                document.getElementById('resetMonthBtn').classList.remove('hidden');
            }
            runAdminPanel();
        }
        runEmployeePanel();
    }
}

// --- [2] الموظف ---
window.sendRequest = async (type) => {
    let title = `طلب ${type}`;
    let confirmColor = '#2563eb';
    if (type === 'شكوى') { title = 'تقديم شكوى'; confirmColor = '#ef4444'; }
    if (type === 'استقالة') { title = 'تقديم استقالة'; confirmColor = '#0f172a'; }

    const { value: note } = await Swal.fire({
        title: title,
        input: 'textarea',
        inputPlaceholder: 'اكتب التفاصيل هنا...',
        confirmButtonText: 'إرسال',
        confirmButtonColor: confirmColor,
        background: '#f8fafc'
    });

    if (note !== undefined) {
        await addDoc(collection(db, "requests"), {
            userId: auth.currentUser.uid,
            userName: userData.full_name,
            userBranch: userData.branch || 'عام',
            type: type,
            note: note,
            status: 'pending',
            admin_response: '',
            timestamp: serverTimestamp()
        });
        Swal.fire({ icon: 'success', title: 'تم الإرسال', showConfirmButton: false, timer: 1500 });
    }
};

function runEmployeePanel() {
    const q = query(collection(db, "requests"), where("userId", "==", auth.currentUser.uid));
    onSnapshot(q, (snap) => {
        const container = document.getElementById('myRequests');
        if(container) container.innerHTML = '';
        myTotalApprovedLoans = 0;
        
        const docs = snap.docs.sort((a, b) => (b.data().timestamp || 0) - (a.data().timestamp || 0));

        docs.forEach(docSnap => {
            const req = docSnap.data();
            if (req.type === 'سلفة' && req.status === 'approved') {
                const amount = parseFloat(req.note.replace(/[^0-9.]/g, '')) || 0;
                myTotalApprovedLoans += amount;
            }

            const isComplaint = req.type === 'شكوى';
            let styles = req.status === 'approved' ? 'bg-green-100 text-green-700' : req.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700';
            if ((isComplaint || req.type === 'استقالة') && req.status === 'pending') styles = 'bg-red-50 text-red-600 border border-red-100';
            const statusLabel = req.status === 'approved' ? 'مقبول' : req.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار';
            
            if(container) {
                container.innerHTML += `
                    <div class="bg-slate-50 p-4 rounded-2xl border border-slate-100 ${isComplaint ? 'border-l-4 border-l-red-500' : ''}">
                        <div class="flex justify-between items-start mb-2">
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
        updateFinancialSidebar();
    });
}

function updateFinancialSidebar() {
    if (!userData) return;
    const baseSalary = userData.base_salary || 0;
    const deductions = userData.deductions || 0;
    const bonuses = userData.bonuses || 0;
    const evaluation = userData.evaluation || 0;
    const netSalary = (baseSalary + bonuses) - (deductions + myTotalApprovedLoans);

    const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; }
    setText('sidebarBase', baseSalary.toLocaleString());
    setText('sidebarBonuses', `+${bonuses.toLocaleString()}`);
    setText('sidebarDeductions', `-${deductions.toLocaleString()}`);
    setText('sidebarLoans', `-${myTotalApprovedLoans.toLocaleString()}`);
    setText('sidebarNetSalary', netSalary.toLocaleString());
    setText('userSalary', netSalary.toLocaleString());
    setText('sidebarEval', evaluation);
    
    const circle = document.getElementById('evalCircle');
    if (circle) {
        const offset = ((10 - evaluation) / 10) * 377;
        circle.style.strokeDashoffset = offset;
        if (evaluation >= 8) circle.style.stroke = '#22c55e';
        else if (evaluation >= 5) circle.style.stroke = '#eab308';
        else circle.style.stroke = '#ef4444';
    }
}

window.toggleSidebar = (show) => {
    const sb = document.getElementById('salarySidebar');
    const ov = document.getElementById('sidebarOverlay');
    if (sb && ov) {
        if (show) { sb.classList.remove('translate-x-full'); ov.classList.remove('hidden'); updateFinancialSidebar(); } 
        else { sb.classList.add('translate-x-full'); ov.classList.add('hidden'); }
    }
};

// --- [3] الإدارة ---
function runAdminPanel() {
    onSnapshot(collection(db, "requests"), (snap) => {
        allRequests = [];
        let hasPending = false;
        snap.forEach(doc => {
            const r = doc.data();
            allRequests.push({ id: doc.id, ...r });
            if (r.status === 'pending') hasPending = true;
        });

        const el1 = document.getElementById('pendingBadge'); if(el1) el1.classList.toggle('hidden', !hasPending);
        const el2 = document.getElementById('navBadge'); if(el2) el2.classList.toggle('hidden', !hasPending);
        const el3 = document.getElementById('notifDot'); if(el3) el3.classList.toggle('hidden', !hasPending);
        filterAdminList(); 
    });

    onSnapshot(collection(db, "users"), (snap) => {
        allEmployeesData = [];
        snap.forEach(empDoc => { allEmployeesData.push({ id: empDoc.id, ...empDoc.data() }); });
        filterAdminList();
    });
}

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

window.resetMonthlyData = async () => {
    const { isConfirmed } = await Swal.fire({
        title: 'هل أنت متأكد؟',
        text: "سيتم تصفير جميع المكافآت والخصومات وأرشفة السلف لبدء شهر جديد!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'نعم، ابدأ شهراً جديداً',
        cancelButtonText: 'إلغاء'
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

window.filterAdminList = () => {
    const filterEl = document.getElementById('adminBranchFilter');
    const list = document.getElementById('employeesList');
    if (!filterEl || !list) return;

    let filteredEmps = [];

    if (userData.role === 'branch_manager') {
        filterEl.value = userData.branch;
        filterEl.disabled = true;
        filteredEmps = allEmployeesData.filter(emp => emp.branch === userData.branch);
    } else {
        filterEl.disabled = false;
        const filterValue = filterEl.value;
        filteredEmps = filterValue === 'all' ? allEmployeesData : allEmployeesData.filter(emp => emp.branch === filterValue);
    }

    // استبعاد المحظورين من القائمة
    const activeEmps = filteredEmps.filter(e => e.role !== 'banned');
    updateDashboardStats(activeEmps);

    list.innerHTML = '';
    if (activeEmps.length === 0) { list.innerHTML = '<p class="text-center text-slate-400 py-4">لا يوجد موظفين</p>'; return; }

    activeEmps.forEach(emp => {
        const qP = query(collection(db, "requests"), where("userId", "==", emp.id), where("status", "==", "pending"));
        onSnapshot(qP, (pSnap) => {
            const hasPending = !pSnap.empty;
            const isMe = emp.id === auth.currentUser.uid;
            const canEdit = userData.role === 'admin';
            const actionIcon = canEdit ? 'fa-sliders-h' : 'fa-eye';
            let roleBadge = '';
            if(emp.role === 'admin') roleBadge = '<span class="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded mr-2">Admin</span>';
            else if(emp.role === 'branch_manager') roleBadge = '<span class="bg-orange-100 text-orange-700 text-[10px] px-2 py-0.5 rounded mr-2">Manager</span>';

            const card = `
                <div id="card-${emp.id}" onclick="openEmpRequests('${emp.id}', '${emp.full_name}', '${emp.branch || 'غير محدد'}')" class="bg-white border-slate-100 p-5 rounded-[2rem] border flex justify-between items-center cursor-pointer hover:shadow-xl transition-all">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-slate-50 text-brand rounded-xl flex items-center justify-center font-bold border border-slate-100">${emp.full_name.charAt(0)}</div>
                        <div>
                            <p class="font-bold text-slate-800 text-sm flex items-center">${emp.full_name} ${isMe ? '<span class="text-[10px] bg-slate-100 px-2 rounded mr-1">(أنت)</span>' : ''}</p>
                            <div class="flex items-center mt-1">
                                ${roleBadge}
                                <p class="text-[10px] text-slate-400 font-bold uppercase">${emp.branch || 'بدون فرع'}</p>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        ${hasPending ? '<span class="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>' : ''}
                        <button onclick="event.stopPropagation(); editFinancials('${emp.id}', '${emp.full_name}', ${emp.base_salary || 0}, ${emp.deductions || 0}, ${emp.bonuses || 0}, ${emp.evaluation || 0}, '${emp.role || 'employee'}')" class="text-slate-300 hover:text-brand p-2"><i class="fas ${actionIcon}"></i></button>
                        ${canEdit && !isMe ? `<button onclick="event.stopPropagation(); banUser('${emp.id}', '${emp.email}', '${emp.full_name}')" class="text-slate-300 hover:text-red-600 p-2" title="فصل وحظر"><i class="fas fa-user-times"></i></button>` : ''}
                    </div>
                </div>`;
            const existing = document.getElementById(`card-${emp.id}`);
            if (existing) existing.outerHTML = card; else list.innerHTML += card;
        });
    });
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
            `</select></div>` +
            `<hr class="border-slate-200 my-2">` +
            `<div><label class="text-xs font-bold">الراتب الأساسي</label><input id="swal-sal" type="number" class="w-full border p-2 rounded ${bgClass}" value="${sal}" ${disableAttr}></div>` +
            `<div><label class="text-xs font-bold text-green-600">مكافآت / حوافز</label><input id="swal-bon" type="number" class="w-full border p-2 rounded ${bgClass}" value="${bon}" ${disableAttr}></div>` +
            `<div><label class="text-xs font-bold text-red-500">خصومات / جزاءات</label><input id="swal-ded" type="number" class="w-full border p-2 rounded ${bgClass}" value="${ded}" ${disableAttr}></div>` +
            `<div><label class="text-xs font-bold text-brand">التقييم (من 10)</label><input id="swal-ev" type="number" max="10" min="0" class="w-full border p-2 rounded ${bgClass}" value="${ev}" ${disableAttr}></div>` +
            `</div>`,
        focusConfirm: false,
        showCancelButton: true,
        cancelButtonText: 'إغلاق',
        confirmButtonText: isAdmin ? 'حفظ التحديثات' : 'قراءة فقط',
        showConfirmButton: isAdmin,
        preConfirm: () => {
            return [
                document.getElementById('swal-sal').value,
                document.getElementById('swal-ded').value,
                document.getElementById('swal-bon').value,
                document.getElementById('swal-ev').value,
                document.getElementById('swal-role').value
            ]
        }
    });

    if (formValues && isAdmin) {
        await updateDoc(doc(db, "users", id), { 
            base_salary: Number(formValues[0]),
            deductions: Number(formValues[1]),
            bonuses: Number(formValues[2]),
            evaluation: Number(formValues[3]),
            role: formValues[4]
        });
        Swal.fire('تم الحفظ', 'تم تحديث البيانات', 'success');
        if(id === auth.currentUser.uid && formValues[4] !== userData.role) location.reload();
    }
};

window.banUser = async (id, email, name) => {
    const { isConfirmed } = await Swal.fire({
        title: `فصل الموظف: ${name}`,
        text: "سيتم حذف صلاحياته وإضافته للقائمة السوداء. هل أنت متأكد؟",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'نعم، فصل وحظر',
        cancelButtonText: 'إلغاء'
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

window.openEmpRequests = (id, name, branch) => {
    const mn = document.getElementById('modalName'); if(mn) mn.innerText = name;
    const mb = document.getElementById('modalBranch'); if(mb) mb.innerText = branch;
    const em = document.getElementById('empModal'); if(em) em.classList.remove('hidden');

    onSnapshot(query(collection(db, "requests"), where("userId", "==", id)), (snap) => {
        const content = document.getElementById('modalContent');
        if(content) {
            content.innerHTML = snap.empty ? '<p class="text-center text-slate-400 py-10">لا توجد طلبات</p>' : '';
            const docs = snap.docs.sort((a, b) => (b.data().timestamp || 0) - (a.data().timestamp || 0));
            docs.forEach(d => {
                const r = d.data();
                const isPending = r.status === 'pending';
                const isAdmin = userData.role === 'admin';

                content.innerHTML += `
                    <div class="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-3 text-right">
                        <div class="flex justify-between items-center">
                            <span class="font-bold text-xs text-brand">${r.type}</span>
                            <small class="text-[10px] text-slate-400">${r.timestamp ? new Date(r.timestamp.toDate()).toLocaleDateString() : 'الآن'}</small>
                        </div>
                        <p class="text-xs text-slate-600 italic">"${r.note || 'بدون ملاحظة'}"</p>
                        ${r.admin_response ? `<div class="bg-white p-2 rounded-lg border border-slate-200 text-[10px] text-slate-500"><strong>رد:</strong> ${r.admin_response}</div>` : ''}
                        ${isPending ? 
                            (isAdmin ? 
                                `<div class="flex gap-2 pt-2">
                                    <button onclick="processRequest('${d.id}', 'approved')" class="flex-1 bg-brand text-white py-2 rounded-xl text-[10px] font-bold">موافقة</button>
                                    <button onclick="processRequest('${d.id}', 'rejected')" class="flex-1 bg-slate-200 text-slate-500 py-2 rounded-xl text-[10px] font-bold">رفض</button>
                                </div>`
                                :
                                `<p class="text-[10px] text-orange-500 font-bold mt-2 text-center bg-orange-50 py-1 rounded">⛔ بانتظار قرار الإدارة العليا</p>`
                            )
                        : `<p class="text-[10px] font-bold ${r.status === 'approved' ? 'text-green-500' : 'text-red-500'}">الحالة: ${r.status === 'approved' ? 'مقبول' : 'مرفوض'}</p>`}
                    </div>`;
            });
        }
    });
};

window.processRequest = async (id, status) => {
    if (userData.role !== 'admin') { Swal.fire('تنبيه', 'غير مسموح لك باتخاذ هذا الإجراء', 'error'); return; }
    const actionText = status === 'approved' ? 'الموافقة' : 'الرفض';
    const { value: adminNote } = await Swal.fire({
        title: `تأكيد ${actionText}`,
        input: 'text',
        inputPlaceholder: 'أضف ملاحظات (اختياري)...',
        showCancelButton: true,
        confirmButtonText: 'تأكيد',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: status === 'approved' ? '#22c55e' : '#ef4444'
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