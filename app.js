/* BF Elite System - Enterprise Logic
   Features: Admin Panel, Realtime Dashboard, User Management
*/

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, getDocs, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- إعدادات فايربيس (تأكد من بياناتك) ---
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

let currentUser = null; // لتخزين بيانات المستخدم الحالي

// === 1. التهيئة والتحقق ===
document.addEventListener('DOMContentLoaded', () => { if(typeof AOS !== 'undefined') AOS.init(); });

onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('loginScreen').classList.add('d-none');
        document.getElementById('appContainer').classList.remove('d-none');
        await loadUserData(user.uid);
        startClock();
    } else {
        document.getElementById('loginScreen').classList.remove('d-none');
        document.getElementById('appContainer').classList.add('d-none');
    }
});

// === 2. تحميل بيانات المستخدم الشاملة ===
async function loadUserData(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentUser = docSnap.data();
            
            // تعبئة البيانات في الواجهة
            updateDashboardUI(currentUser, auth.currentUser.email);
            
            // التحقق من صلاحيات المدير
            if (currentUser.role === 'admin') {
                enableAdminFeatures();
            }

        } else {
            Swal.fire('خطأ', 'حسابك غير مسجل في قاعدة بيانات الموظفين', 'error');
        }
    } catch (error) {
        console.error("Error loading data:", error);
    }
}

function updateDashboardUI(data, email) {
    // Header
    document.getElementById('headerName').innerText = data.full_name.split(' ')[0];
    
    // Dashboard Cards
    document.getElementById('shiftTime').innerText = `${data.shift_start || '--'} - ${data.shift_end || '--'}`;
    document.getElementById('currentSalary').innerText = (data.salary ? data.salary.toLocaleString() : '0') + ' EGP';
    document.getElementById('annualBalance').innerText = data.balance_annual || 0;
    
    // Stats (لو مش موجودة حط أصفار)
    document.getElementById('statWorkHours').innerText = data.stats?.work_hours || "00:00";
    document.getElementById('statLateness').innerText = data.stats?.lateness || "00:00";
    document.getElementById('statOvertime').innerText = data.stats?.overtime || "00:00";

    // Profile Section
    document.getElementById('profileNameFull').innerText = data.full_name;
    document.getElementById('profileJob').innerText = data.job_title || 'Employee';
    document.getElementById('profileEmail').innerText = email;
    document.getElementById('profileImg').src = `https://ui-avatars.com/api/?name=${data.full_name}&background=00f2ff&color=000`;
}

// === 3. ميزات الأدمن (المدير) ===
function enableAdminFeatures() {
    // إظهار زر الأدمن في النافبار والهيدر
    document.getElementById('navAdminLink').classList.remove('d-none');
    document.getElementById('adminBadge').classList.remove('d-none');
    
    // تحميل قائمة الموظفين
    loadEmployeesList();
}

async function loadEmployeesList() {
    const list = document.getElementById('employeesList');
    list.innerHTML = '<div class="text-center text-white-50"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';
    
    const querySnapshot = await getDocs(collection(db, "users"));
    list.innerHTML = ''; // تفريغ القائمة

    querySnapshot.forEach((doc) => {
        const emp = doc.data();
        list.innerHTML += `
            <div class="glass-card p-3 d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center gap-3">
                    <img src="https://ui-avatars.com/api/?name=${emp.full_name}&size=40" class="rounded-circle">
                    <div>
                        <h6 class="text-white m-0">${emp.full_name}</h6>
                        <small class="text-white-50">${emp.job_title} | ${emp.salary} EGP</small>
                    </div>
                </div>
                <span class="badge bg-${emp.role === 'admin' ? 'warning' : 'info'} text-dark">${emp.role}</span>
            </div>
        `;
    });
}

// إضافة موظف جديد (UI Only - يضيف داتا فقط، الإيميل يتعمل من الكونسول)
window.showAddUserModal = () => {
    Swal.fire({
        title: 'إضافة موظف جديد',
        html: `
            <input id="newUid" class="swal2-input" placeholder="User UID (من Authentication)">
            <input id="newName" class="swal2-input" placeholder="الاسم رباعي">
            <input id="newJob" class="swal2-input" placeholder="المسمى الوظيفي">
            <input id="newSalary" type="number" class="swal2-input" placeholder="الراتب الأساسي">
            <select id="newRole" class="swal2-input">
                <option value="employee">موظف</option>
                <option value="admin">مدير (Admin)</option>
            </select>
        `,
        confirmButtonText: 'حفظ الموظف',
        background: '#1a1a40', color: '#fff'
    }).then(async (result) => {
        if (result.isConfirmed) {
            const uid = document.getElementById('newUid').value;
            const data = {
                full_name: document.getElementById('newName').value,
                job_title: document.getElementById('newJob').value,
                salary: Number(document.getElementById('newSalary').value),
                role: document.getElementById('newRole').value,
                shift_start: "09:00 AM",
                shift_end: "05:00 PM",
                balance_annual: 21,
                stats: { work_hours: "00:00", lateness: "00:00", overtime: "00:00" }
            };
            
            try {
                await setDoc(doc(db, "users", uid), data);
                Swal.fire('تم!', 'تمت إضافة الموظف للنظام', 'success');
                loadEmployeesList(); // تحديث القائمة
            } catch (e) {
                Swal.fire('خطأ', e.message, 'error');
            }
        }
    });
};

// === 4. الوظائف الأساسية ===
window.loginSystem = async () => {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passInput').value;
    if(!email || !pass) return Swal.fire('تنبيه', 'أدخل البيانات', 'warning');

    try {
        Swal.showLoading();
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        Swal.fire('خطأ', 'بيانات الدخول غير صحيحة', 'error');
    }
};

window.logout = () => signOut(auth).then(() => location.reload());

window.handleAttendance = () => {
    Swal.fire({
        title: 'تسجيل الحضور',
        text: 'جاري تحديد موقعك...',
        timer: 2000,
        didOpen: () => Swal.showLoading(),
        background: '#1a1a40', color: '#fff'
    }).then(() => {
        // هنا المفروض كود الـ Firestore addDoc
        Swal.fire({icon:'success', title: 'تم تسجيل الحضور', text: '09:00 AM - المقر الرئيسي', background: '#1a1a40', color: '#fff'});
    });
};

window.switchTab = (sectionId, btn) => {
    document.querySelectorAll('main section').forEach(el => el.classList.add('d-none'));
    document.getElementById(sectionId).classList.remove('d-none');
    document.querySelectorAll('.glass-nav a').forEach(a => a.classList.remove('active'));
    btn.classList.add('active');
};

function startClock() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('clock').innerText = now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});
        document.getElementById('date').innerText = now.toLocaleDateString('ar-EG', {weekday:'long', day:'numeric', month:'short'});
    }, 1000);
}