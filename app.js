console.log("App.js Loaded Successfully"); // للتأكد من التحميل

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// إعدادات مشروعك (كما أرسلتها سابقاً)
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

// تهيئة الأنيميشن بشكل آمن
if(typeof AOS !== 'undefined') {
    AOS.init();
}

let currentUserProfile = null;

// مراقبة الدخول
onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('loginScreen').classList.add('d-none');
        document.getElementById('appContainer').classList.remove('d-none');
        await fetchUserProfile(user.uid);
        startClock();
    } else {
        document.getElementById('loginScreen').classList.remove('d-none');
        document.getElementById('appContainer').classList.add('d-none');
    }
});

// جلب بيانات الموظف
async function fetchUserProfile(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentUserProfile = docSnap.data();
            
            // تحديث البيانات
            document.getElementById('userNameDisplay').innerText = currentUserProfile.full_name || "مستخدم";
            document.getElementById('profileName').innerText = currentUserProfile.full_name || "مستخدم";
            document.getElementById('profileRole').innerText = currentUserProfile.job_title || "موظف";
            document.getElementById('profileEmail').innerText = auth.currentUser.email;

            // تحديث الراتب
            const salaryEl = document.querySelector('.fa-wallet');
            if(salaryEl && currentUserProfile.salary) {
                salaryEl.nextElementSibling.innerText = currentUserProfile.salary.toLocaleString() + " EGP";
            }

            // فحص لوحة المدير
            checkPermissions(currentUserProfile.role);
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

// فحص الصلاحيات
function checkPermissions(role) {
    const teamTab = document.querySelector('a[onclick*="teamSection"]');
    if (role === 'admin') {
        if(teamTab) teamTab.style.display = 'block';
        loadAllEmployees();
    } else {
        if(teamTab) teamTab.style.display = 'none';
    }
}

// تحميل الموظفين (للمدير)
async function loadAllEmployees() {
    const container = document.getElementById('teamListContainer');
    container.innerHTML = '<h5 class="text-white mb-3">فريق العمل</h5>';
    
    try {
        const q = collection(db, "users");
        const querySnapshot = await getDocs(q);
        
        querySnapshot.forEach((doc) => {
            const emp = doc.data();
            container.innerHTML += `
                <div class="glass-card p-3 mb-2 d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="text-white m-0">${emp.full_name}</h6>
                        <small class="text-white-50">${emp.job_title}</small>
                    </div>
                    <span class="badge bg-primary">${emp.role}</span>
                </div>
            `;
        });
    } catch(e) {
        console.log("Error loading team", e);
    }
}

// دوال النظام
window.loginSystem = async () => {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passInput').value;
    if(!email || !pass) return Swal.fire('تنبيه', 'أدخل البيانات كاملة', 'warning');

    try {
        Swal.showLoading();
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
        Swal.fire('خطأ', 'فشل تسجيل الدخول: ' + error.code, 'error');
    }
};

window.logout = () => {
    signOut(auth).then(() => location.reload());
};

function startClock() {
    setInterval(() => {
        const now = new Date();
        const c = document.getElementById('clock');
        if(c) c.innerText = now.toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
        document.getElementById('date').innerText = now.toLocaleDateString('ar-EG', {weekday:'long', day:'numeric', month:'short'});
    }, 1000);
}

window.switchTab = (sectionId, btn) => {
    document.querySelectorAll('main section').forEach(el => el.classList.add('d-none'));
    document.getElementById(sectionId).classList.remove('d-none');
    document.querySelectorAll('.glass-nav a').forEach(a => a.classList.remove('active'));
    btn.classList.add('active');
};