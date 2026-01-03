/* BF Elite System - Full Logic
   Features: Role Management, Real Data Fetching
*/

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
    query,
    where,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ⚠️ تأكد أن البيانات دي بتاعتك من فايربيس
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

// متغير عالمي لتخزين بيانات المستخدم الحالي
let currentUserProfile = null;

// ==========================================
// 1. المراقب الذكي (العقل المدبر)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. المستخدم عمل تسجيل دخول
        document.getElementById('loginScreen').classList.add('d-none');
        document.getElementById('appContainer').classList.remove('d-none');
        
        // 2. نجيب بياناته الخاصة من الداتا بيز
        await fetchUserProfile(user.uid);
        
        // 3. تشغيل العدادات والأنيميشن
        if(typeof AOS !== 'undefined') AOS.init();
        startClock();

    } else {
        // المستخدم خرج
        document.getElementById('loginScreen').classList.remove('d-none');
        document.getElementById('appContainer').classList.add('d-none');
        currentUserProfile = null;
    }
});

// ==========================================
// 2. دالة جلب بيانات الموظف (أهم دالة)
// ==========================================
async function fetchUserProfile(uid) {
    try {
        const docRef = doc(db, "users", uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            currentUserProfile = docSnap.data();
            console.log("Profile Data:", currentUserProfile);

            // تحديث الواجهة بالبيانات الحقيقية
            document.getElementById('userNameDisplay').innerText = currentUserProfile.full_name;
            document.getElementById('profileName').innerText = currentUserProfile.full_name;
            document.getElementById('profileRole').innerText = currentUserProfile.job_title; // عنصر جديد
            
            // عرض المرتب (لو موجود)
            if(currentUserProfile.salary) {
                // نبحث عن العنصر اللي بيعرض المرتب ونحدثه
                const salaryEl = document.querySelector('.fa-wallet').nextElementSibling;
                if(salaryEl) salaryEl.innerText = currentUserProfile.salary.toLocaleString() + " EGP";
            }

            // فحص الصلاحيات (Admin vs Employee)
            checkPermissions(currentUserProfile.role);

        } else {
            console.log("المستخدم مسجل دخول لكن ليس له ملف بيانات!");
            document.getElementById('userNameDisplay').innerText = "مستخدم غير معرف";
            Swal.fire({icon: 'error', title: 'خطأ في الحساب', text: 'يرجى مراجعة الـ HR لإنشاء ملف وظيفي لك'});
        }
    } catch (error) {
        console.error("Error fetching data:", error);
    }
}

// ==========================================
// 3. نظام الصلاحيات (Admin Control)
// ==========================================
function checkPermissions(role) {
    const teamSection = document.getElementById('teamSection');
    const teamTab = document.querySelector('a[onclick*="teamSection"]');

    if (role === 'admin') {
        // لو مدير: اظهر زرار الفريق ولوحة التحكم
        if(teamTab) teamTab.style.display = 'block';
        
        // هنا ممكن نجيب بيانات كل الموظفين عشان المدير يشوفهم
        loadAllEmployees();
    } else {
        // لو موظف عادي: اخفي زرار الفريق
        if(teamTab) teamTab.style.display = 'none';
    }
}

// دالة للمدير فقط: عرض كل الموظفين
async function loadAllEmployees() {
    const teamList = document.getElementById('teamSection');
    teamList.innerHTML = '<h5 class="text-white mb-3">فريق العمل</h5>';
    
    const q = collection(db, "users");
    const querySnapshot = await getDocs(q);
    
    querySnapshot.forEach((doc) => {
        const emp = doc.data();
        // ميعرضش المدير نفسه في القائمة
        if(emp.full_name !== currentUserProfile.full_name) {
            teamList.innerHTML += `
                <div class="glass-card p-3 mb-2 d-flex justify-content-between align-items-center">
                    <div>
                        <h6 class="text-white m-0">${emp.full_name}</h6>
                        <small class="text-white-50">${emp.job_title}</small>
                    </div>
                    <span class="badge bg-primary">${emp.role}</span>
                </div>
            `;
        }
    });
}

// ==========================================
// 4. الوظائف الأساسية (Login/Logout)
// ==========================================
window.loginSystem = async () => {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passInput').value;
    
    if(!email || !pass) return Swal.fire('تنبيه', 'اكتب البيانات كاملة', 'warning');

    try {
        Swal.showLoading();
        await signInWithEmailAndPassword(auth, email, pass);
        // الـ onAuthStateChanged هتشتغل لوحدها وتكمل الباقي
    } catch (error) {
        Swal.fire('خطأ', 'البيانات غير صحيحة', 'error');
    }
};

window.logout = () => {
    signOut(auth).then(() => location.reload());
};

// ==========================================
// 5. أدوات مساعدة
// ==========================================
function startClock() {
    setInterval(() => {
        const now = new Date();
        const clock = document.getElementById('clock');
        if(clock) clock.innerText = now.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
        document.getElementById('date').innerText = now.toLocaleDateString('ar-EG', {weekday:'long', day:'numeric', month:'short'});
    }, 1000);
}

window.switchTab = (sectionId, btn) => {
    document.querySelectorAll('main section').forEach(el => el.classList.add('d-none'));
    document.getElementById(sectionId).classList.remove('d-none');
    document.querySelectorAll('.glass-nav a').forEach(a => a.classList.remove('active'));
    btn.classList.add('active');
};