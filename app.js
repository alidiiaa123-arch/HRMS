/* BF Elite HRMS - Engine V6.1 - Final Integration */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, onSnapshot, updateDoc, serverTimestamp, query, where, addDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// إعدادات مشروعك
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

// --- [1] مراقب الدخول الرئيسي ---
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
    document.getElementById('authSection').classList.add('hidden');
    document.getElementById('appMain').classList.remove('hidden');
    
    // بيانات الهيدر والبروفايل
    document.getElementById('headerName').innerText = userData.full_name;
    document.getElementById('headerRole').innerText = userData.role === 'admin' ? 'Manager' : 'Employee';
    document.getElementById('avatar').innerText = userData.full_name.charAt(0);
    document.getElementById('userSalary').innerText = (userData.base_salary || 0).toLocaleString();

    document.getElementById('profName').innerText = userData.full_name;
    document.getElementById('profJob').innerText = userData.job_title;
    document.getElementById('profEmail').innerText = userData.email;
    document.getElementById('profSalary').innerText = (userData.base_salary || 0).toLocaleString() + " EGP";
    document.getElementById('profAvatar').innerText = userData.full_name.charAt(0);

    if (userData.role === 'admin') {
        document.getElementById('adminBtn').classList.remove('hidden');
        runAdminPanel();
    }
    runEmployeePanel();
}

// --- [2] محرك الموظف (سجل الطلبات) ---
window.sendRequest = async (type) => {
    const { value: note } = await Swal.fire({
        title: `طلب ${type}`,
        input: 'textarea',
        inputPlaceholder: 'أدخل ملاحظاتك هنا...',
        confirmButtonText: 'إرسال',
        confirmButtonColor: '#2563eb',
        background: '#f8fafc'
    });

    if (note !== undefined) {
        await addDoc(collection(db, "requests"), {
            userId: auth.currentUser.uid,
            userName: userData.full_name,
            type: type,
            note: note,
            status: 'pending',
            timestamp: serverTimestamp()
        });
        Swal.fire({ icon: 'success', title: 'تم الإرسال بنجاح', showConfirmButton: false, timer: 1500 });
    }
};

function runEmployeePanel() {
    const q = query(collection(db, "requests"), where("userId", "==", auth.currentUser.uid));
    onSnapshot(q, (snap) => {
        const container = document.getElementById('myRequests');
        container.innerHTML = '';
        
        const docs = snap.docs.sort((a, b) => (b.data().timestamp || 0) - (a.data().timestamp || 0));

        docs.forEach(docSnap => {
            const req = docSnap.data();
            const styles = req.status === 'approved' ? 'bg-green-100 text-green-700' : req.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700';
            const statusLabel = req.status === 'approved' ? 'تمت الموافقة' : req.status === 'rejected' ? 'مرفوض' : 'قيد الانتظار';
            
            container.innerHTML += `
                <div class="bg-slate-50 p-4 rounded-2xl flex justify-between items-center border border-slate-100">
                    <div>
                        <p class="font-bold text-slate-800 text-sm">${req.type}</p>
                        <p class="text-[10px] text-slate-400 italic">"${req.note || 'بدون ملاحظة'}"</p>
                    </div>
                    <span class="px-3 py-1 rounded-full text-[10px] font-bold ${styles}">${statusLabel}</span>
                </div>`;
        });
    });
}

// --- [3] محرك المدير (الإدارة) ---
function runAdminPanel() {
    onSnapshot(query(collection(db, "requests"), where("status", "==", "pending")), (snap) => {
        document.getElementById('pendingBadge').classList.toggle('hidden', snap.empty);
    });

    onSnapshot(collection(db, "users"), (snap) => {
        const list = document.getElementById('employeesList');
        list.innerHTML = '';
        snap.forEach(empDoc => {
            const emp = empDoc.data();
            if (emp.role === 'admin' && emp.email === userData.email) return;

            const qP = query(collection(db, "requests"), where("userId", "==", empDoc.id), where("status", "==", "pending"));
            onSnapshot(qP, (pSnap) => {
                const hasPending = !pSnap.empty;
                const empId = empDoc.id;
                
                const card = `
                    <div id="card-${empId}" onclick="openEmpRequests('${empId}', '${emp.full_name}', '${emp.job_title}')" class="bg-white p-5 rounded-[2rem] border border-slate-100 flex justify-between items-center cursor-pointer hover:shadow-xl transition-all">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 bg-slate-50 text-brand rounded-xl flex items-center justify-center font-bold border border-slate-100">${emp.full_name.charAt(0)}</div>
                            <div>
                                <p class="font-bold text-slate-800 text-sm">${emp.full_name}</p>
                                <p class="text-[10px] text-slate-400 font-bold uppercase">${emp.job_title} | <span class="text-brand">${emp.base_salary || 0} EGP</span></p>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            ${hasPending ? '<span class="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse"></span>' : ''}
                            <button onclick="event.stopPropagation(); editSalary('${empId}', '${emp.full_name}')" class="text-slate-300 hover:text-brand p-2"><i class="fas fa-edit"></i></button>
                        </div>
                    </div>`;

                const existing = document.getElementById(`card-${empId}`);
                if (existing) existing.outerHTML = card; else list.innerHTML += card;
            });
        });
    });
}

window.openEmpRequests = (id, name, job) => {
    document.getElementById('modalName').innerText = name;
    document.getElementById('modalJob').innerText = job;
    document.getElementById('empModal').classList.remove('hidden');

    onSnapshot(query(collection(db, "requests"), where("userId", "==", id)), (snap) => {
        const content = document.getElementById('modalContent');
        content.innerHTML = snap.empty ? '<p class="text-center text-slate-400 py-10">لا توجد طلبات</p>' : '';
        
        const docs = snap.docs.sort((a, b) => (b.data().timestamp || 0) - (a.data().timestamp || 0));

        docs.forEach(d => {
            const r = d.data();
            const isPending = r.status === 'pending';
            content.innerHTML += `
                <div class="bg-slate-50 p-5 rounded-3xl border border-slate-100 space-y-3 text-right">
                    <div class="flex justify-between items-center"><span class="font-bold text-xs text-brand">${r.type}</span><small class="text-[10px] text-slate-400">${r.timestamp ? new Date(r.timestamp.toDate()).toLocaleDateString() : 'الآن'}</small></div>
                    <p class="text-xs text-slate-600 italic">"${r.note || 'بدون ملاحظة'}"</p>
                    ${isPending ? `
                        <div class="flex gap-2 pt-2">
                            <button onclick="processRequest('${d.id}', 'approved')" class="flex-1 bg-brand text-white py-2 rounded-xl text-[10px] font-bold">موافقة</button>
                            <button onclick="processRequest('${d.id}', 'rejected')" class="flex-1 bg-slate-200 text-slate-500 py-2 rounded-xl text-[10px] font-bold">رفض</button>
                        </div>` : `<p class="text-[10px] font-bold ${r.status === 'approved' ? 'text-green-500' : 'text-red-500'}">الحالة: ${r.status === 'approved' ? 'مقبول' : 'مرفوض'}</p>`}
                </div>`;
        });
    });
};

window.processRequest = async (id, status) => {
    try {
        await updateDoc(doc(db, "requests", id), { status: status });
    } catch (e) { console.error(e); }
};

window.editSalary = async (id, name) => {
    const { value: salary } = await Swal.fire({ title: `تعديل راتب | ${name}`, input: 'number', confirmButtonText: 'حفظ', confirmButtonColor: '#2563eb' });
    if (salary) await updateDoc(doc(db, "users", id), { base_salary: Number(salary) });
};

// --- [4] وظائف النظام ---
window.login = async () => {
    const e = document.getElementById('email').value, p = document.getElementById('pass').value;
    try { await signInWithEmailAndPassword(auth, e, p); }
    catch (err) { Swal.fire('خطأ', 'البيانات غير صحيحة', 'error'); }
};

window.signup = async () => {
    const name = document.getElementById('regName').value, job = document.getElementById('regJob').value, email = document.getElementById('regEmail').value, pass = document.getElementById('regPass').value;
    try {
        const r = await createUserWithEmailAndPassword(auth, email, pass);
        await setDoc(doc(db, "users", r.user.uid), { full_name: name, job_title: job, email: email, role: "employee", base_salary: 0, joined_at: serverTimestamp() });
        Swal.fire('تم', 'تم إنشاء الحساب بنجاح', 'success');
    } catch (e) { Swal.fire('خطأ', e.message, 'error'); }
};

window.changePass = async () => {
    const oldP = document.getElementById('oldPass').value, newP = document.getElementById('newPass').value, user = auth.currentUser;
    const cred = EmailAuthProvider.credential(user.email, oldP);
    try {
        await reauthenticateWithCredential(user, cred);
        await updatePassword(user, newP);
        Swal.fire('تم', 'تم تغيير كلمة المرور', 'success');
    } catch (e) { Swal.fire('خطأ', 'تأكد من الباسورد القديم', 'error'); }
};

window.switchTab = (id, btn) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active', 'text-brand'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.add('text-slate-400'));
    btn.classList.add('active', 'text-brand'); btn.classList.remove('text-slate-400');
};

window.closeModal = () => document.getElementById('empModal').classList.add('hidden');
window.toggleAuth = (show) => { document.getElementById('loginForm').classList.toggle('hidden', show); document.getElementById('signupForm').classList.toggle('hidden', !show); };
window.logout = () => signOut(auth).then(() => location.reload());