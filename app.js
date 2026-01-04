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
let myTotalApprovedLoans = 0;

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
    // إخفاء/إظهار الشاشات بأمان
    const authS = document.getElementById('authSection');
    const appM = document.getElementById('appMain');
    if(authS) authS.classList.add('hidden');
    if(appM) appM.classList.remove('hidden');

    // دالة تعيين نصوص آمنة
    const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; }
    
    if (userData) {
        setText('headerName', userData.full_name);
        setText('headerRole', userData.role === 'admin' ? 'Manager' : 'Employee');
        setText('avatar', userData.full_name.charAt(0));
        
        // الصفحة الرئيسية والبروفايل
        setText('userBranchDisplay', `الفرع: ${userData.branch || 'غير محدد'}`);
        setText('profName', userData.full_name);
        setText('profJob', userData.job_title);
        setText('profBranch', userData.branch || 'غير محدد');
        setText('profEmail', userData.email);
        setText('profAvatar', userData.full_name.charAt(0));

        // زر الأدمن
        if (userData.role === 'admin') {
            const adminBtn = document.getElementById('adminBtn');
            if (adminBtn) adminBtn.classList.remove('hidden');
            runAdminPanel();
        }
        runEmployeePanel();
    }
}

// --- [2] الموظف: حسابات وطلبات ---
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
            // حساب السلف المقبولة
            if (req.type === 'سلفة' && req.status === 'approved') {
                const amount = parseFloat(req.note.replace(/[^0-9.]/g, '')) || 0;
                myTotalApprovedLoans += amount;
            }

            const isComplaint = req.type === 'شكوى';
            const isResignation = req.type === 'استقالة';
            let styles = req.status === 'approved' ? 'bg-green-100 text-green-700' : req.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700';
            if ((isComplaint || isResignation) && req.status === 'pending') styles = 'bg-red-50 text-red-600 border border-red-100';
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
    const bonuses = userData.bonuses || 0; // المكافآت
    const evaluation = userData.evaluation || 0; // التقييم
    const netSalary = (baseSalary + bonuses) - (deductions + myTotalApprovedLoans);

    const setText = (id, txt) => { const el = document.getElementById(id); if(el) el.innerText = txt; }

    setText('sidebarBase', baseSalary.toLocaleString());
    setText('sidebarBonuses', `+${bonuses.toLocaleString()}`);
    setText('sidebarDeductions', `-${deductions.toLocaleString()}`);
    setText('sidebarLoans', `-${myTotalApprovedLoans.toLocaleString()}`);
    setText('sidebarNetSalary', netSalary.toLocaleString());
    
    // تحديث الكارت الرئيسي
    setText('userSalary', netSalary.toLocaleString());

    // تحديث دائرة التقييم
    setText('sidebarEval', evaluation);
    const circle = document.getElementById('evalCircle');
    if (circle) {
        // محيط الدائرة r=60 هو 377 تقريباً
        // النسبة = (10 - التقييم) / 10 * 377
        const offset = ((10 - evaluation) / 10) * 377;
        circle.style.strokeDashoffset = offset;
        // تغيير اللون حسب التقييم
        if (evaluation >= 8) circle.style.stroke = '#22c55e'; // أخضر ممتاز
        else if (evaluation >= 5) circle.style.stroke = '#eab308'; // أصفر متوسط
        else circle.style.stroke = '#ef4444'; // أحمر ضعيف
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

// --- [3] الأدمن ---
function runAdminPanel() {
    onSnapshot(query(collection(db, "requests"), where("status", "==", "pending")), (snap) => {
        const hasPending = !snap.empty;
        const el1 = document.getElementById('pendingBadge'); if(el1) el1.classList.toggle('hidden', !hasPending);
        const el2 = document.getElementById('navBadge'); if(el2) el2.classList.toggle('hidden', !hasPending);
        const el3 = document.getElementById('notifDot'); if(el3) el3.classList.toggle('hidden', !hasPending);
    });

    onSnapshot(collection(db, "users"), (snap) => {
        allEmployeesData = [];
        snap.forEach(empDoc => { allEmployeesData.push({ id: empDoc.id, ...empDoc.data() }); });
        filterAdminList();
    });
}

window.filterAdminList = () => {
    const filterEl = document.getElementById('adminBranchFilter');
    const list = document.getElementById('employeesList');
    if (!filterEl || !list) return;

    const filterValue = filterEl.value;
    list.innerHTML = '';

    const filteredEmps = filterValue === 'all' ? allEmployeesData : allEmployeesData.filter(emp => emp.branch === filterValue);
    if (filteredEmps.length === 0) { list.innerHTML = '<p class="text-center text-slate-400 py-4">لا يوجد موظفين</p>'; return; }

    filteredEmps.forEach(emp => {
        const qP = query(collection(db, "requests"), where("userId", "==", emp.id), where("status", "==", "pending"));
        onSnapshot(qP, (pSnap) => {
            const hasPending = !pSnap.empty;
            const isMe = emp.id === auth.currentUser.uid;
            const bgClass = isMe ? 'bg-blue-50/50 border-blue-100' : 'bg-white border-slate-100';
            
            const card = `
                <div id="card-${emp.id}" onclick="openEmpRequests('${emp.id}', '${emp.full_name}', '${emp.branch || 'غير محدد'}')" class="${bgClass} p-5 rounded-[2rem] border flex justify-between items-center cursor-pointer hover:shadow-xl transition-all">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-slate-50 text-brand rounded-xl flex items-center justify-center font-bold border border-slate-100">${emp.full_name.charAt(0)}</div>
                        <div>
                            <p class="font-bold text-slate-800 text-sm">${emp.full_name} ${isMe ? '(أنت)' : ''}</p>
                            <p class="text-[10px] text-slate-400 font-bold uppercase">
                                ${emp.branch || 'بدون فرع'} | <span class="text-brand">${(emp.base_salary || 0).toLocaleString()} EGP</span>
                            </p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        ${hasPending ? '<span class="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>' : ''}
                        <button onclick="event.stopPropagation(); editFinancials('${emp.id}', '${emp.full_name}', ${emp.base_salary || 0}, ${emp.deductions || 0}, ${emp.bonuses || 0}, ${emp.evaluation || 0})" class="text-slate-300 hover:text-brand p-2"><i class="fas fa-sliders-h"></i></button>
                    </div>
                </div>`;

            const existing = document.getElementById(`card-${emp.id}`);
            if (existing) existing.outerHTML = card; else list.innerHTML += card;
        });
    });
};

// دالة تعديل الماليات والتقييم (للأدمن)
window.editFinancials = async (id, name, sal, ded, bon, ev) => {
    const { value: formValues } = await Swal.fire({
        title: `إدارة الموظف | ${name}`,
        html:
            `<div class="text-right space-y-3">` +
            `<div><label class="text-xs font-bold">الراتب الأساسي</label><input id="swal-sal" type="number" class="w-full border p-2 rounded" value="${sal}"></div>` +
            `<div><label class="text-xs font-bold text-green-600">مكافآت / حوافز</label><input id="swal-bon" type="number" class="w-full border p-2 rounded" value="${bon}"></div>` +
            `<div><label class="text-xs font-bold text-red-500">خصومات / جزاءات</label><input id="swal-ded" type="number" class="w-full border p-2 rounded" value="${ded}"></div>` +
            `<div><label class="text-xs font-bold text-brand">التقييم (من 10)</label><input id="swal-ev" type="number" max="10" min="0" class="w-full border p-2 rounded" value="${ev}"></div>` +
            `</div>`,
        focusConfirm: false,
        confirmButtonText: 'حفظ التحديثات',
        preConfirm: () => {
            return [
                document.getElementById('swal-sal').value,
                document.getElementById('swal-ded').value,
                document.getElementById('swal-bon').value,
                document.getElementById('swal-ev').value
            ]
        }
    });

    if (formValues) {
        await updateDoc(doc(db, "users", id), { 
            base_salary: Number(formValues[0]),
            deductions: Number(formValues[1]),
            bonuses: Number(formValues[2]),
            evaluation: Number(formValues[3])
        });
        Swal.fire('تم الحفظ', 'تم تحديث البيانات المالية والتقييم', 'success');
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
                content.innerHTML += `
                    <div class="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-3 text-right">
                        <div class="flex justify-between items-center">
                            <span class="font-bold text-xs text-brand">${r.type}</span>
                            <small class="text-[10px] text-slate-400">${r.timestamp ? new Date(r.timestamp.toDate()).toLocaleDateString() : 'الآن'}</small>
                        </div>
                        <p class="text-xs text-slate-600 italic">"${r.note || 'بدون ملاحظة'}"</p>
                        ${r.admin_response ? `<div class="bg-white p-2 rounded-lg border border-slate-200 text-[10px] text-slate-500"><strong>رد:</strong> ${r.admin_response}</div>` : ''}
                        ${isPending ? `
                            <div class="flex gap-2 pt-2">
                                <button onclick="processRequest('${d.id}', 'approved')" class="flex-1 bg-brand text-white py-2 rounded-xl text-[10px] font-bold">موافقة</button>
                                <button onclick="processRequest('${d.id}', 'rejected')" class="flex-1 bg-slate-200 text-slate-500 py-2 rounded-xl text-[10px] font-bold">رفض</button>
                            </div>` 
                        : `<p class="text-[10px] font-bold ${r.status === 'approved' ? 'text-green-500' : 'text-red-500'}">الحالة: ${r.status === 'approved' ? 'مقبول' : 'مرفوض'}</p>`}
                    </div>`;
            });
        }
    });
};

window.processRequest = async (id, status) => {
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
    const name = document.getElementById('regName').value, branch = document.getElementById('regBranch').value, job = document.getElementById('regJob').value, email = document.getElementById('regEmail').value, pass = document.getElementById('regPass').value;
    if(!branch) { Swal.fire('تنبيه', 'يرجى اختيار الفرع', 'warning'); return; }
    try {
        const r = await createUserWithEmailAndPassword(auth, email, pass);
        // إضافة الحقول الجديدة (مكافآت وتقييم)
        await setDoc(doc(db, "users", r.user.uid), { full_name: name, branch: branch, job_title: job, email: email, role: "employee", base_salary: 0, deductions: 0, bonuses: 0, evaluation: 10, joined_at: serverTimestamp() });
        Swal.fire('تم', 'تم إنشاء الحساب بنجاح', 'success'); toggleAuth(false);
    } catch (e) { Swal.fire('خطأ', e.message, 'error'); }
};
window.changePass = async () => { const oldP = document.getElementById('oldPass').value, newP = document.getElementById('newPass').value, user = auth.currentUser; const cred = EmailAuthProvider.credential(user.email, oldP); try { await reauthenticateWithCredential(user, cred); await updatePassword(user, newP); Swal.fire('تم', 'تم تغيير كلمة المرور', 'success'); } catch (e) { Swal.fire('خطأ', 'تأكد من الباسورد القديم', 'error'); } };
window.switchTab = (id, btn) => { document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active')); document.getElementById(id).classList.add('active'); document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active', 'text-brand')); document.querySelectorAll('.nav-btn').forEach(b => b.classList.add('text-slate-400')); btn.classList.add('active', 'text-brand'); btn.classList.remove('text-slate-400'); };
window.closeModal = () => document.getElementById('empModal').classList.add('hidden');
window.toggleAuth = (show) => { document.getElementById('loginForm').classList.toggle('hidden', show); document.getElementById('signupForm').classList.toggle('hidden', !show); };
window.logout = () => signOut(auth).then(() => location.reload());