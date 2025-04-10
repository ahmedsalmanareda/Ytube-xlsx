// المتغيرات العامة
const videos = [];
const apiKey = "AIzaSyDd031joZZBk0ykKd5f_F0hypH-3NCYVYo"; // استبدل بمفتاحك الخاص

// عرض التنبيهات
function showToast(message, isError = true) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.style.backgroundColor = isError ? '#ff4757' : '#2ed573';
  toast.style.display = 'block';
  
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3000);
}

// عرض/إخفاء مؤشر التحميل
function toggleLoading(show) {
  document.getElementById('loading').style.display = show ? 'block' : 'none';
}

// استخراج ID من رابط يوتيوب
function extractYouTubeID(url) {
  const regExp = /^.*(?:youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[1].length === 11) ? match[1] : null;
}

// جلب عنوان الفيديو من YouTube API
async function fetchVideoTitle(videoId) {
  try {
    toggleLoading(true);
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    return data.items[0]?.snippet?.title || "غير معروف";
  } catch (e) {
    console.error("فشل جلب البيانات:", e);
    showToast(`خطأ: ${e.message}`, true);
    return "غير معروف";
  } finally {
    toggleLoading(false);
  }
}

// جلب فيديوهات قائمة التشغيل
async function fetchPlaylistVideos(playlistUrl) {
  const playlistId = new URL(playlistUrl).searchParams.get("list");
  if (!playlistId) {
    showToast("الرابط لا يحتوي على قائمة تشغيل صحيحة.");
    return;
  }

  try {
    toggleLoading(true);
    let nextPageToken = "";
    do {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}&pageToken=${nextPageToken}`);
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        showToast("لا توجد فيديوهات في قائمة التشغيل هذه.");
        return;
      }

      data.items.forEach(item => {
        const videoId = item.snippet.resourceId.videoId;
        const title = item.snippet.title;
        if (videoId && title) {
          videos.push({ id: videoId, title });
        }
      });

      nextPageToken = data.nextPageToken || "";
    } while (nextPageToken);

    updateTable();
    showToast(`تم إضافة ${videos.length} فيديو من قائمة التشغيل`, false);
  } catch (error) {
    console.error(error);
    showToast("حدث خطأ أثناء جلب بيانات قائمة التشغيل");
  } finally {
    toggleLoading(false);
  }
}

// إضافة فيديو
async function addVideo() {
  const url = document.getElementById('videoURL').value.trim();
  document.getElementById('videoURL').value = '';

  if (!url) {
    showToast("من فضلك أدخل رابط الفيديو أو قائمة التشغيل.");
    return;
  }

  if (url.includes("list=")) {
    await fetchPlaylistVideos(url);
    return;
  }

  const id = extractYouTubeID(url);
  if (!id) {
    showToast("الرابط غير صحيح أو لا يمكن استخراج ID منه.");
    return;
  }

  const title = await fetchVideoTitle(id);
  videos.push({ id, title });
  updateTable();
  showToast("تم إضافة الفيديو بنجاح", false);
}

// تحديث الجدول
function updateTable() {
  const tbody = document.querySelector('#resultTable tbody');
  tbody.innerHTML = '';
  videos.forEach((video, index) => {
    const tr = document.createElement('tr');

    const tdId = document.createElement('td');
    const idLink = document.createElement('a');
    idLink.href = `https://youtu.be/${video.id}`;
    idLink.target = "_blank";
    idLink.textContent = video.id;
    idLink.style.color = 'var(--primary-color)';
    idLink.style.textDecoration = "none";
    tdId.appendChild(idLink);

    const tdTitle = document.createElement('td');
    tdTitle.textContent = video.title;

    // زر الحذف
    const tdDelete = document.createElement('td');
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.className = 'btn btn-danger';
    deleteBtn.onclick = () => {
      videos.splice(index, 1); // نحذف الفيديو من المصفوفة
      updateTable();           // نحدث الجدول
      showToast("تم حذف الفيديو", false);
    };
    tdDelete.appendChild(deleteBtn);

    tr.appendChild(tdId);
    tr.appendChild(tdTitle);
    tr.appendChild(tdDelete);
    tbody.appendChild(tr);
  });

  // تحديث العداد
  document.getElementById('counter').textContent = `عدد الفيديوهات: ${videos.length}`;
}

// تنزيل ملف Excel
function downloadExcel() {
  if (videos.length === 0) {
    showToast("لا توجد فيديوهات لاستخراجها.");
    return;
  }

  try {
    const worksheetData = videos.map(video => ({ 'Video ID': video.id, 'اسم الفيديو': video.title }));
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Videos');
    XLSX.writeFile(workbook, 'youtube_videos.xlsx');
    showToast("تم تنزيل الملف بنجاح", false);
  } catch (error) {
    console.error(error);
    showToast("حدث خطأ أثناء إنشاء الملف");
  }
}

// مسح جميع الفيديوهات
function clearAll() {
  if (videos.length === 0) return;
  
  if (confirm("هل أنت متأكد من مسح جميع الفيديوهات؟")) {
    videos.length = 0;
    updateTable();
    showToast("تم مسح جميع الفيديوهات", false);
  }
}

// دالة تبديل الوضع الليلي
function toggleDarkMode() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  localStorage.setItem('darkMode', isDark);
  
  const icon = document.querySelector('#themeToggle i');
  if (isDark) {
    icon.classList.replace('fa-moon', 'fa-sun');
  } else {
    icon.classList.replace('fa-sun', 'fa-moon');
  }
}

// التحقق من تفضيلات المستخدم
function checkDarkModePreference() {
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const savedMode = localStorage.getItem('darkMode');
  
  if (savedMode === 'true' || (prefersDark && savedMode !== 'false')) {
    document.body.classList.add('dark-mode');
    document.querySelector('#themeToggle i').classList.replace('fa-moon', 'fa-sun');
  }
}

// تهيئة الأحداث عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', function() {
  checkDarkModePreference();
  document.getElementById('themeToggle').addEventListener('click', toggleDarkMode);
});