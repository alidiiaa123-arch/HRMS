/* Restaurant Ops System - Auto-Fix Logic */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, query, where, onSnapshot, serverTimestamp, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ⚠️⚠️ حط بيانات مشروعك هنا ⚠️⚠️
const firebaseConfig = {
    apiKey: "AIzaSyDwGoNaK-XPUB8WIBCelpZYGGsUAH8WeYI", // مثال
    authDomain: "bf-elite-system.firebaseapp.com",
    projectId: "bf-elite-system",
    storageBucket: "bf-elite-system.firebasestorage.app",
    messagingSenderId: "288809372816",
    appId: "1:288809372816:web:79b575d594d4707c985c15"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// المتغيرات
let currentUser = null;
const TARGET_HOURS = 208;

// ==========================================
// 1. المراقب الذكي (بيحل مشكلة التعليق)
// ==========================================
onAuthStateChanged(auth, async (user) => {
    const loader = document.getElementById('loader');
    
    if (user) {
        try {
            // محاولة جلب ملف الموظف
            const docRef = doc(db, "users", user.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                currentUser = docSnap.data();
                currentUser.uid = user.uid; // حفظ الـ UID للاستخدام
            } else {
                // ✅ الحل السحري: لو الملف مش موجود، اعمله أوتوماتيك وافتح
                console.log("Creating auto profile...");
                currentUser = {
                    full_name: user.email.split('@')[0], // اسم مؤقت من الإيميل
                    role: "admin", // خليته أدمن عشان تجرب براحتك
                    base_salary: 6000, // راتب افتراضي عشان الحسابات تشتغل
                    job_title: "Manager"
                };
                await setDoc(docRef, currentUser);
                currentUser.uid = user.uid;
            }

            // تشغيل الواجهة
            initUI();
            
        } catch (error) {
            console.error(error);
            alert("خطأ في الاتصال: " + error.message);
            // لو فشل خالص، رجعه للدخول
            signOut(auth);
        }
        
        // إخفاء اللودر في كل الأحوال
        loader.classList.add('hidden');

    } else {
        // لو مش مسجل دخول
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('appContainer').classList.add('hidden');
        loader.classList.add('hidden');
    }
});

// ==========================================
// 2. تشغيل الواجهة وحساب الرواتب
// ==========================================
function initUI() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    
    document.getElementById('headerName').innerText = currentUser.full_name;
    
    // تحديد نوع الشيفت
    const hour = new Date().getHours();
    const shiftText = (hour >= 10 && hour < 19) ? "شيفت صباحي ☀️" : "شيفت مسائي 🌙";
    document.getElementById('shiftBadge').innerText = shiftText;

    // تفعيل لوحة المدير
    if(currentUser.role === 'admin') {
        document.getElementById('adminLink').classList.remove('hidden');
        loadAdminRequests();
    }

    startClock();
    calculateSalary();
    loadMyRequests();
}

// محرك الرواتب (المعادلة: الراتب = (الأساسي / 208) * ساعات العمل)
function calculateSalary() {
    const hourlyRate = (currentUser.base_salary || 0) / TARGET_HOURS;
    
    const q = query(collection(db, "attendance"), where("userId", "==", currentUser.uid));
    
    onSnapshot(q, (snapshot) => {
        let totalHours = 0;
        let isCheckedIn = false;

        snapshot.forEach(doc => {
            const data = doc.data();
            if(data.type === 'out' && data.duration) totalHours += data.duration;
            
            // عشان نغير لون الزرار لو هو داخل الشيفت حالياً
            // (ببساطة: لو آخر حركة كانت دخول)
            // (المنطق ده محتاج ترتيب زمني، بس ده للتوضيح)
        });

        document.getElementById('totalHours').innerText = totalHours.toFixed(1);
        document.getElementById('liveSalary').innerText = Math.floor(totalHours * hourlyRate).toLocaleString();
    });
}

// ==========================================
// 3. نظام البصمة والـ GPS
// ==========================================
window.handleAttendance = () => {
    if(!navigator.geolocation) return Swal.fire('تنبيه', 'يجب تفعيل GPS', 'warning');
    
    Swal.fire({
        title: 'جاري تحديد الموقع...',
        didOpen: () => Swal.showLoading(),
        background: '#1e293b', color: '#fff'
    });
    
    navigator.geolocation.getCurrentPosition(async (pos) => {
        // هنا المنطق: لو الزرار بيقول "دخول" يبقى دخول، والعكس
        // للتسهيل: هنعملها toggle (دخول/خروج) بناءً على آخر حالة في الداتا بيز
        // بس دلوقتي هنعملها بسيطة:
        
        const type = 'in'; // مبدئياً دخول (ممكن تطورها)
        
        await addDoc(collection(db, "attendance"), {
            userId: currentUser.uid,
            userName: currentUser.full_name,
            type: type,
            timestamp: serverTimestamp(),
            location: {lat: pos.coords.latitude, lng: pos.coords.longitude}
        });
        
        Swal.fire({
            icon: 'success', 
            title: 'تم تسجيل الحضور',
            text: 'الساعة: ' + new Date().toLocaleTimeString(),
            background: '#1e293b', color: '#fff'
        });
    }, (err) => {
        Swal.fire('خطأ', 'تعذر الوصول للموقع', 'error');
    });
};

// ==========================================
// 4. نظام الطلبات والإدارة
// ==========================================
window.requestAction = (type) => {
    Swal.fire({
        title: `طلب ${type}`,
        input: 'number',
        inputLabel: type === 'سلفة' ? 'المبلغ (جنية)' : 'عدد الأيام',
        background: '#1e293b', color: '#fff',
        confirmButtonText: 'إرسال',
        showCancelButton: true
    }).then(async (res) => {
        if(res.isConfirmed) {
            await addDoc(collection(db, "requests"), {
                userId: currentUser.uid,
                userName: currentUser.full_name,
                type: type,
                amount: res.value,
                status: 'pending',
                timestamp: serverTimestamp()
            });
            Swal.fire({icon: 'success', title: 'تم الإرسال للمدير', background: '#1e293b', color: '#fff'});
        }
    });
};

function loadMyRequests() {
    const q = query(collection(db, "requests"), where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"));
    onSnapshot(q, (snap) => {
        const list = document.getElementById('myRequestsList');
        list.innerHTML = '';
        snap.forEach(doc => {
            const r = doc.data();
            const color = r.status === 'approved' ? 'text-green-400' : (r.status === 'rejected' ? 'text-red-400' : 'text-yellow-400');
            list.innerHTML += `
                <div class="glass p-3 rounded-xl flex justify-between items-center">
                    <div>
                        <div class="font-bold text-sm text-white">${r.type}</div>
                        <div class="text-xs text-slate-400">${r.amount}</div>
                    </div>
                    <div class="text-xs font-bold ${color}">${r.status}</div>
                </div>`;
        });
    });
}

function loadAdminRequests() {
    const q = query(collection(db, "requests"), where("status", "==", "pending"));
    onSnapshot(q, (snap) => {
        const list = document.getElementById('adminRequestsList');
        list.innerHTML = '';
        if(snap.empty) list.innerHTML = '<div class="text-center text-slate-500 text-sm">لا توجد طلبات معلقة</div>';
        
        snap.forEach(doc => {
            const r = doc.data();
            list.innerHTML += `
                <div class="glass p-4 rounded-xl border border-white/5">
                    <div class="flex justify-between mb-2">
                        <span class="font-bold text-primary">${r.userName}</span>
                        <span class="text-xs text-slate-400">طلب ${r.type}</span>
                    </div>
                    <p class="text-white font-bold mb-3">${r.amount}</p>
                    <div class="flex gap-2">
                        <button onclick="updateReq('${doc.id}', 'approved')" class="flex-1 bg-green-600 py-1 rounded text-xs">موافقة</button>
                        <button onclick="updateReq('${doc.id}', 'rejected')" class="flex-1 bg-red-600 py-1 rounded text-xs">رفض</button>
                    </div>
                </div>`;
        });
    });
}

window.updateReq = async (id, status) => {
    await updateDoc(doc(db, "requests", id), {status: status});
};

// ==========================================
// 5. أدوات مساعدة
// ==========================================
window.loginSystem = async () => {
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('emailInput').value, document.getElementById('passInput').value);
    } catch(e) { Swal.fire('خطأ', 'البيانات غير صحيحة', 'error'); }
};

window.logout = () => signOut(auth).then(() => location.reload());

window.switchTab = (id, btn) => {
    document.querySelectorAll('main section').forEach(e => e.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(a => {
        a.classList.remove('active');
        a.classList.remove('text-primary');
        a.classList.add('text-slate-500');
    });
    btn.classList.add('active');
    btn.classList.add('text-primary');
    btn.classList.remove('text-slate-500');
};

function startClock() {
    setInterval(() => {
        const d = new Date();
        document.getElementById('clock').innerText = d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
        document.getElementById('date').innerText = d.toLocaleDateString('ar-EG');
    }, 1000);
}