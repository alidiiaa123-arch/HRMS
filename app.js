/* Restaurant Ops System - Core Logic */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, query, where, onSnapshot, updateDoc, serverTimestamp, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- إعدادات فايربيس (ضع بياناتك هنا) ---
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

// --- المتغيرات العامة ---
let currentUser = null;
const RESTAURANT_LOCATION = { lat: 30.0444, lng: 31.2357 }; // إحداثيات المطعم (القاهرة كمثال)
const MAX_DISTANCE_METERS = 200; // المسافة المسموحة للبصمة
const TARGET_HOURS = 208; // هدف الشهر

// --- 1. التهيئة ---
onAuthStateChanged(auth, async (user) => {
    const loader = document.getElementById('loader');
    if (user) {
        await loadUserData(user.uid);
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('appContainer').classList.remove('hidden');
        loader.classList.add('hidden');
        startClock();
    } else {
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('appContainer').classList.add('hidden');
        loader.classList.add('hidden');
    }
});

// --- 2. تحميل البيانات والرواتب ---
async function loadUserData(uid) {
    const docSnap = await getDoc(doc(db, "users", uid));
    if (docSnap.exists()) {
        currentUser = docSnap.data();
        currentUser.uid = uid;
        
        // تحديث الواجهة
        document.getElementById('headerName').innerText = currentUser.full_name.split(' ')[0];
        document.getElementById('userAvatar').src = `https://ui-avatars.com/api/?name=${currentUser.full_name}&background=6366f1&color=fff`;

        // تفعيل وضع الأدمن
        if (currentUser.role === 'admin' || currentUser.role === 'hr') {
            document.getElementById('adminTab').classList.remove('hidden');
            loadAdminRequests();
        }

        // حساب الراتب اللايف
        calculateMonthlySalary(uid);
        
        // تحميل طلباتي
        loadMyRequests(uid);

    } else {
        Swal.fire('خطأ', 'حسابك غير مسجل كموظف', 'error');
    }
}

// === المحرك الأساسي للرواتب (Payroll Engine) ===
async function calculateMonthlySalary(uid) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0,0,0,0);

    const q = query(collection(db, "attendance"), 
        where("userId", "==", uid),
        where("timestamp", ">=", startOfMonth)
    );

    onSnapshot(q, (snapshot) => {
        let totalHoursWorked = 0;
        let isCurrentlyCheckedIn = false;

        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data.type === 'out' && data.duration) {
                totalHoursWorked += data.duration;
            }
            // فحص آخر حالة
            if (data.timestamp.toDate().toDateString() === new Date().toDateString()) {
                if (data.type === 'in') isCurrentlyCheckedIn = true;
                if (data.type === 'out') isCurrentlyCheckedIn = false;
            }
        });

        // تحديث زر البصمة
        updateAttendanceButton(isCurrentlyCheckedIn);

        // المعادلة: الراتب = (الأساسي / 208) * الساعات
        const baseSalary = currentUser.base_salary || 0;
        const hourlyRate = baseSalary / TARGET_HOURS;
        const currentNet = totalHoursWorked * hourlyRate;

        // تحديث الشاشة
        document.getElementById('totalHours').innerText = totalHoursWorked.toFixed(1);
        document.getElementById('liveSalary').innerText = Math.floor(currentNet).toLocaleString();
        
        // شريط التقدم
        const percent = Math.min((totalHoursWorked / TARGET_HOURS) * 100, 100);
        document.getElementById('salaryProgress').style.width = `${percent}%`;
    });
}

// --- 3. نظام البصمة الذكي (GPS + Logic) ---
window.handleAttendance = () => {
    if (!navigator.geolocation) return Swal.fire('خطأ', 'الـ GPS غير مدعوم', 'error');

    Swal.fire({
        title: 'جاري تحديد الموقع...',
        text: 'يرجى الانتظار للتأكد من تواجدك بالمطعم',
        didOpen: () => Swal.showLoading(),
        background: '#1e293b', color: '#fff'
    });

    navigator.geolocation.getCurrentPosition(async (position) => {
        const dist = getDistanceFromLatLonInM(
            position.coords.latitude, position.coords.longitude,
            RESTAURANT_LOCATION.lat, RESTAURANT_LOCATION.lng
        );

        if (dist > MAX_DISTANCE_METERS) {
            return Swal.fire({
                icon: 'error', 
                title: 'خارج النطاق', 
                text: `أنت بعيد عن المطعم مسافة ${Math.floor(dist)} متر`,
                background: '#1e293b', color: '#fff'
            });
        }

        // تحديد نوع البصمة (دخول أم خروج)
        const lastStatus = document.getElementById('statusText').innerText;
        const type = lastStatus === 'داخل الشيفت' ? 'out' : 'in';

        // حساب الساعات لو خروج
        let duration = 0;
        if (type === 'out') {
            // هنا بنجيب آخر بصمة دخول ونحسب الفرق
            const lastInQuery = query(collection(db, "attendance"), 
                where("userId", "==", currentUser.uid), 
                where("type", "==", "in"),
                orderBy("timestamp", "desc"), 
                limit(1)
            );
            const lastInSnap = await getDocs(lastInQuery);
            if (!lastInSnap.empty) {
                const inTime = lastInSnap.docs[0].data().timestamp.toDate();
                const now = new Date();
                const diffMs = now - inTime;
                duration = diffMs / (1000 * 60 * 60); // تحويل لساعات
            }
        }

        // تسجيل في الداتا بيز
        await addDoc(collection(db, "attendance"), {
            userId: currentUser.uid,
            userName: currentUser.full_name,
            type: type,
            timestamp: serverTimestamp(),
            duration: duration, // هيكون 0 لو دخول
            location: { lat: position.coords.latitude, lng: position.coords.longitude }
        });

        Swal.fire({
            icon: 'success', 
            title: type === 'in' ? 'تم تسجيل الدخول' : 'تم الانصراف',
            text: type === 'out' ? `عملت ${duration.toFixed(1)} ساعة` : 'نتمنى لك شيفت سعيد',
            background: '#1e293b', color: '#fff'
        });

    }, (err) => {
        Swal.fire('خطأ', 'تعذر الوصول للموقع. تأكد من تفعيل GPS', 'error');
    });
};

function updateAttendanceButton(isCheckedIn) {
    const statusDot = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const btnIcon = document.querySelector('#attendanceBtn i');
    
    if (isCheckedIn) {
        statusDot.className = "w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)] mx-auto mb-1";
        statusText.innerText = "داخل الشيفت";
        statusText.className = "text-[10px] text-green-400";
        btnIcon.className = "fas fa-check fa-4x text-green-500";
    } else {
        statusDot.className = "w-3 h-3 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)] mx-auto mb-1";
        statusText.innerText = "خارج الخدمة";
        statusText.className = "text-[10px] text-slate-400";
        btnIcon.className = "fas fa-fingerprint fa-4x text-white/80 group-hover:text-white transition-colors";
    }
}

// --- 4. إدارة الطلبات (Workflow) ---
window.openRequestModal = (type) => {
    Swal.fire({
        title: `تقديم طلب ${type}`,
        input: 'number',
        inputLabel: type === 'سلفة' ? 'المبلغ المطلوب' : 'عدد الأيام',
        inputAttributes: { placeholder: 'أدخل القيمة' },
        showCancelButton: true,
        confirmButtonText: 'إرسال للمراجعة',
        background: '#1e293b', color: '#fff'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await addDoc(collection(db, "requests"), {
                userId: currentUser.uid,
                userName: currentUser.full_name,
                type: type,
                amount: result.value,
                status: 'pending', // معلق
                timestamp: serverTimestamp()
            });
            Swal.fire({icon: 'success', title: 'تم الإرسال للـ HR', background: '#1e293b', color: '#fff'});
        }
    });
};

function loadMyRequests(uid) {
    const q = query(collection(db, "requests"), where("userId", "==", uid), orderBy("timestamp", "desc"));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('myRequestsList');
        list.innerHTML = '';
        snapshot.forEach(doc => {
            const req = doc.data();
            const statusColors = { 'pending': 'text-yellow-400', 'approved': 'text-green-400', 'rejected': 'text-red-400' };
            const statusNames = { 'pending': 'قيد المراجعة', 'approved': 'تمت الموافقة', 'rejected': 'مرفوض' };
            
            list.innerHTML += `
                <div class="glass p-3 rounded-xl flex justify-between items-center">
                    <div>
                        <div class="font-bold text-sm text-white">${req.type}</div>
                        <div class="text-xs text-slate-400">${req.amount} ${req.type === 'سلفة' ? 'جنية' : 'يوم'}</div>
                    </div>
                    <div class="text-xs font-bold ${statusColors[req.status]} bg-slate-800 px-2 py-1 rounded-lg">
                        ${statusNames[req.status]}
                    </div>
                </div>
            `;
        });
    });
}

// --- 5. لوحة المدير (Approve Requests) ---
function loadAdminRequests() {
    // فقط الطلبات المعلقة
    const q = query(collection(db, "requests"), where("status", "==", "pending"));
    onSnapshot(q, (snapshot) => {
        const list = document.getElementById('adminRequestsList');
        list.innerHTML = '';
        if (snapshot.empty) {
            list.innerHTML = '<div class="text-center text-slate-500 py-4">لا توجد طلبات معلقة</div>';
            return;
        }
        snapshot.forEach(doc => {
            const req = doc.data();
            list.innerHTML += `
                <div class="glass p-4 rounded-xl border border-white/5">
                    <div class="flex justify-between mb-2">
                        <span class="font-bold text-primary">${req.userName}</span>
                        <span class="text-xs text-slate-400">${new Date(req.timestamp?.toDate()).toLocaleDateString('ar-EG')}</span>
                    </div>
                    <p class="text-sm text-white mb-3">طلب ${req.type}: <span class="font-bold">${req.amount}</span></p>
                    <div class="flex gap-2">
                        <button onclick="updateRequestStatus('${doc.id}', 'approved')" class="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded-lg text-xs font-bold transition-colors">
                            موافقة
                        </button>
                        <button onclick="updateRequestStatus('${doc.id}', 'rejected')" class="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-xs font-bold transition-colors">
                            رفض
                        </button>
                    </div>
                </div>
            `;
        });
    });
}

window.updateRequestStatus = async (docId, status) => {
    await updateDoc(doc(db, "requests", docId), { status: status });
    Swal.fire({
        toast: true, position: 'top-end', icon: 'success', 
        title: status === 'approved' ? 'تمت الموافقة' : 'تم الرفض',
        showConfirmButton: false, timer: 2000, background: '#1e293b', color: '#fff'
    });
};

// --- أدوات مساعدة ---
window.loginSystem = async () => {
    const email = document.getElementById('emailInput').value;
    const pass = document.getElementById('passInput').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
        Swal.fire('خطأ', 'بيانات الدخول غير صحيحة', 'error');
    }
};

window.logout = () => signOut(auth).then(() => location.reload());

window.switchTab = (sectionId, btn) => {
    document.querySelectorAll('main section').forEach(el => el.classList.add('hidden'));
    document.getElementById(sectionId).classList.remove('hidden');
    document.querySelectorAll('.nav-item').forEach(a => {
        a.classList.remove('active', 'text-primary');
        a.classList.add('text-slate-500');
    });
    btn.classList.add('active', 'text-primary');
    btn.classList.remove('text-slate-500');
};

function startClock() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('clock').innerText = now.toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'});
        document.getElementById('date').innerText = now.toLocaleDateString('ar-EG', {weekday:'long', day:'numeric', month:'long'});
    }, 1000);
}

// حساب المسافة بين نقطتين (Haversine Formula)
function getDistanceFromLatLonInM(lat1,lon1,lat2,lon2) {
    var R = 6371; 
    var dLat = deg2rad(lat2-lat1);  
    var dLon = deg2rad(lon2-lon1); 
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    var d = R * c; 
    return d * 1000;
}
function deg2rad(deg) { return deg * (Math.PI/180); }