/* BF Elite System - Connected to Real Firebase
   Configured for: bf-elite-system
*/

// استدعاء المكتبات من سيرفرات جوجل مباشرة
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
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// إعدادات الاتصال الخاصة بمشروعك (تتصل بقاعدة بياناتك)
const firebaseConfig = {
    apiKey: "AIzaSyDwGoNaK-XPUB8WIBCelpZYGGsUAH8WeYI",
    authDomain: "bf-elite-system.firebaseapp.com",
    projectId: "bf-elite-system",
    storageBucket: "bf-elite-system.firebasestorage.app",
    messagingSenderId: "288809372816",
    appId: "1:288809372816:web:79b575d594d4707c985c15"
};

// بدء تشغيل التطبيق
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ===============================================
// 1. نظام الحماية وإدارة الجلسات
// ===============================================

// هذا الكود يعمل تلقائياً عند تحميل الصفحة لفحص حالة المستخدم
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("المستخدم مسجل دخول:", user.email);
        
        // إظهار النظام وإخفاء شاشة الدخول
        document.getElementById('loginScreen').classList.add('d-none');
        document.getElementById('appContainer').classList.remove('d-none');
        
        // عرض البيانات الأساسية
        updateUI(user);
        
        // تشغيل الأنيميشن والساعة
        if(typeof AOS !== 'undefined') AOS.init();
        startClock();

    } else {
        console.log("لا يوجد مستخدم مسجل");
        // إظهار شاشة الدخول فقط
        document.getElementById('loginScreen').classList.remove('d-none');
        document.getElementById('appContainer').classList.add('d-none');
        
        // تشغيل الأنيميشن لشاشة الدخول
        if(typeof AOS !== 'undefined') AOS.init();
    }
});

// ===============================================
// 2. وظائف النظام (مربوطة بالـ HTML)
// ===============================================

// دالة تسجيل الدخول
window.loginSystem = async () => {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passInput').value;

    if(!email || !pass) {
        return Swal.fire({
            icon: 'warning', 
            title: 'تنبيه', 
            text: 'يرجى إدخال البريد الإلكتروني وكلمة المرور',
            background: '#1a1a40', color: '#fff'
        });
    }

    try {
        Swal.fire({
            title: 'جاري الاتصال بالسيرفر...',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading(),
            background: '#1a1a40', color: '#fff'
        });

        // أمر الاتصال بفايربيس
        await signInWithEmailAndPassword(auth, email, pass);
        
        Swal.close();
        const Toast = Swal.mixin({toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, background: '#1a1a40', color: '#fff'});
        Toast.fire({icon: 'success', title: 'تم تسجيل الدخول بنجاح'});

    } catch (error) {
        Swal.close();
        let msg = "خطأ في الاتصال";
        if(error.code === 'auth/invalid-credential') msg = "بيانات الدخول غير صحيحة";
        if(error.code === 'auth/too-many-requests') msg = "محاولات كثيرة خاطئة، انتظر قليلاً";
        
        Swal.fire({icon: 'error', title: 'فشل الدخول', text: msg, background: '#1a1a40', color: '#fff'});
    }
};

// دالة تسجيل الخروج
window.logout = () => {
    Swal.fire({
        title: 'تسجيل الخروج؟',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'نعم، خروج',
        cancelButtonText: 'إلغاء',
        background: '#1a1a40', color: '#fff'
    }).then((result) => {
        if (result.isConfirmed) {
            signOut(auth).then(() => {
                location.reload(); // إعادة تحميل الصفحة لتنظيف الذاكرة
            });
        }
    });
};

// دالة تحديث الواجهة بالبيانات
function updateUI(user) {
    // نأخذ الاسم من الإيميل مؤقتاً حتى نربط قاعدة البيانات بالكامل
    const shortName = user.email.split('@')[0];
    document.getElementById('userNameDisplay').innerText = shortName;
    document.getElementById('profileName').innerText = shortName;
    document.getElementById('profileEmail').innerText = user.email;
}

// ===============================================
// 3. أدوات مساعدة (ساعة، تنقل)
// ===============================================

function startClock() {
    setInterval(() => {
        const now = new Date();
        const clockEl = document.getElementById('clock');
        if(clockEl) {
            clockEl.innerText = now.toLocaleTimeString('en-GB', {hour: '2-digit', minute:'2-digit'});
            document.getElementById('date').innerText = now.toLocaleDateString('ar-EG', {weekday:'long', day:'numeric', month:'short'});
        }
    }, 1000);
}

window.switchTab = (sectionId, btn) => {
    document.querySelectorAll('main section').forEach(el => el.classList.add('d-none'));
    document.getElementById(sectionId).classList.remove('d-none');
    
    document.querySelectorAll('.glass-nav a').forEach(a => a.classList.remove('active'));
    btn.classList.add('active');
    
    // تغيير العنوان
    const titles = {'homeSection': 'الرئيسية', 'servicesSection': 'الخدمات', 'teamSection': 'الفريق', 'profileSection': 'الملف الشخصي'};
    document.getElementById('pageTitle').innerText = titles[sectionId] || 'النظام';
};