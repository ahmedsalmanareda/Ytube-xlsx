// المتغيرات العامة

const apiKey = "AIzaSyDd031joZZBk0ykKd5f_F0hypH-3NCYVYo"; // استبدل بمفتاحك الخاص
const videoCache = {};
const MAX_HISTORY = 30;
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 ساعة
let deleteQueue = null;
let debounceTimer;
let history = [];
let videos = [];
let copyOrder = 'titleFirst'; // أو 'idFirst'

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

// دالة مساعدة للحصول على رابط الصورة المصغرة
function getThumbnailUrl(videoId, quality = 'medium') {
  const qualities = {
    'default': 'default.jpg',
    'medium': 'mqdefault.jpg',
    'high': 'hqdefault.jpg',
    'standard': 'sddefault.jpg',
    'maxres': 'maxresdefault.jpg'
  };
  return `https://img.youtube.com/vi/${videoId}/${qualities[quality]}`;
}

function saveState() {
  history.push(JSON.parse(JSON.stringify(videos)));
  if (history.length > MAX_HISTORY) history.shift();
  updateUndoButton();
}

// دالة التراجع
function undoAction() {
  if (history.length > 0) {
    videos = history.pop();
    updateTable();
    saveToLocalStorage();
    updateUndoButton();
    showToast("تم التراجع عن الإجراء الأخير", false);
  }
}

// تحديث حالة زر التراجع
function updateUndoButton() {
  const undoBtn = document.getElementById('undoBtn');
  undoBtn.disabled = history.length === 0;
}

// دالة اللصق من الحافظة
// دالة اللصق من الحافظة
async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('videoURL').value = text;
    showToast("تم لصق الرابط من الحافظة", false);
  } catch (err) {
    showToast("تعذر الوصول إلى الحافظة. يرجى استخدام Ctrl+V", true);
    console.error("Failed to read clipboard:", err);
    
    // حل بديل للمتصفحات التي لا تدعم Clipboard API
    document.getElementById('videoURL').focus();
    document.execCommand('paste');
  }
}

// دالة مساعدة لتنظيف العنوان
function cleanTitle(title) {
  if (!title) return "غير معروف";
  
  if (title.includes("|")) {
    title = title.split("|")[0].trim();
  }
  
  title = title.replace(/%/g, "");
  
  return title.trim() || "غير معروف";
}

// جلب عنوان الفيديو مع التخزين المؤقت
async function fetchVideoTitle(videoId) {
  if (videoCache[videoId]) return videoCache[videoId].title;

  try {
    toggleLoading(true);
    const response = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const data = await response.json();
    let title = cleanTitle(data.items[0]?.snippet?.title);
    
    // تجاهل الفيديوهات الخاصة
    if (title.toLowerCase().includes('private video') || 
        title.toLowerCase().includes('video unavailable')) {
      return null;
    }
    
    videoCache[videoId] = { title, timestamp: Date.now() };
    return title;
  } catch (e) {
    console.error("فشل جلب البيانات:", e);
    return null;
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
    let addedVideos = 0;
    
    do {
      const response = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${apiKey}&pageToken=${nextPageToken}`);
      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        showToast("لا توجد فيديوهات في قائمة التشغيل هذه.");
        return;
      }

      for (const item of data.items) {
        const videoId = item.snippet.resourceId.videoId;
        const title = cleanTitle(item.snippet.title);
        
        // تجاهل الفيديوهات الخاصة
        if (videoId && title && !title.toLowerCase().includes('private video')) {
          videos.unshift({ id: videoId, title });
          videoCache[videoId] = { title, timestamp: Date.now() };
          addedVideos++;
        }
      }

      nextPageToken = data.nextPageToken || "";
    } while (nextPageToken);

    if (addedVideos > 0) {
      saveState(); // حفظ الحالة قبل التعديل
      updateTable();
      saveToLocalStorage();
      showToast(`تم إضافة ${addedVideos} فيديو من قائمة التشغيل`, false);
    } else {
      showToast("لم يتم إضافة أي فيديو (قد تكون جميعها خاصة)", true);
    }
  } catch (error) {
    console.error(error);
    showToast("حدث خطأ أثناء جلب بيانات قائمة التشغيل", true);
  } finally {
    toggleLoading(false);
  }
}

// إضافة فيديو مع Debounce
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
  if (!title) {
    showToast("تم تجاهل فيديو خاص أو غير متاح", true);
    return;
  }

  saveState(); // حفظ الحالة قبل التعديل
  videos.unshift({ id, title });
  updateTable();
  saveToLocalStorage();
  showToast("تم إضافة الفيديو بنجاح", false);
}

// تحديث الجدول مع كل الميزات الجديدة
function updateTable() {
  const tbody = document.querySelector('#resultTable tbody');
  tbody.innerHTML = '';
  
  videos.forEach((video, index) => {
    const tr = document.createElement('tr');
    tr.className = 'new-row';
    tr.dataset.index = index;
    tr.draggable = true;

    // الصورة المصغرة مع Lazy Loading
    const tdThumbnail = document.createElement('td');
    const thumbnailImg = document.createElement('img');
    thumbnailImg.className = 'lazy lazy-img';
    thumbnailImg.dataset.src = getThumbnailUrl(video.id);
    thumbnailImg.alt = `Thumbnail for ${video.title}`;
    thumbnailImg.style.width = '120px';
    thumbnailImg.loading = 'lazy';
    thumbnailImg.onerror = function() {
      this.src = 'assets/no-thumbnail.png';
    };
    tdThumbnail.appendChild(thumbnailImg);

    // Video ID
    const tdId = document.createElement('td');
    const idLink = document.createElement('a');
    idLink.href = `https://youtu.be/${video.id}`;
    idLink.target = "_blank";
    idLink.textContent = video.id;
    idLink.style.color = 'var(--primary-color)';
    idLink.style.textDecoration = "none";
    idLink.setAttribute('tooltip', 'فتح الفيديو في يوتيوب');
    tdId.appendChild(idLink);

    // العنوان
    const tdTitle = document.createElement('td');
    tdTitle.textContent = video.title;
    tdTitle.setAttribute('tooltip', video.title);

    // أزرار الإجراءات
    const tdActions = document.createElement('td');
    tdActions.style.display = 'flex';
    tdActions.style.gap = '5px';
    tdActions.style.justifyContent = 'center';
    
    // زر التحريك لأعلى
    const moveUpBtn = document.createElement('button');
    moveUpBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
    moveUpBtn.className = 'btn btn-primary btn-sm';
    moveUpBtn.setAttribute('tooltip', 'تحريك لأعلى');
    moveUpBtn.onclick = () => moveVideo(index, 'up');
    if (index === 0) moveUpBtn.disabled = true;
    
    // زر التحريك لأسفل
    const moveDownBtn = document.createElement('button');
    moveDownBtn.innerHTML = '<i class="fas fa-arrow-down"></i>';
    moveDownBtn.className = 'btn btn-primary btn-sm';
    moveDownBtn.setAttribute('tooltip', 'تحريك لأسفل');
    moveDownBtn.onclick = () => moveVideo(index, 'down');
    if (index === videos.length - 1) moveDownBtn.disabled = true;
    
    // زر الحذف
    const deleteBtn = document.createElement('button');
    deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
    deleteBtn.className = 'btn btn-danger btn-sm';
    deleteBtn.setAttribute('tooltip', 'حذف الفيديو');
    deleteBtn.onclick = () => confirmDelete(index, video.id);
    
    tdActions.appendChild(moveUpBtn);
    tdActions.appendChild(moveDownBtn);
    tdActions.appendChild(deleteBtn);
    
    tr.appendChild(tdThumbnail);
    tr.appendChild(tdId);
    tr.appendChild(tdTitle);
    tr.appendChild(tdActions);
    tbody.appendChild(tr);
  });

  document.getElementById('counter').textContent = `عدد الفيديوهات: ${videos.length}`;
  setupLazyLoading();
  setupDragAndDrop();
}

window.addEventListener('click', function(event) {
  const modal = document.getElementById('deleteModal');
  if (event.target === modal) {
    modal.style.display = 'none';
  }
});

// إغلاق النافذة عند الضغط على Esc
document.addEventListener('keydown', function(event) {
  const modal = document.getElementById('deleteModal');
  if (event.key === 'Escape' && modal.style.display === 'flex') {
    modal.style.display = 'none';
  }
});

function deleteVideo(index) {
  if (index >= 0 && index < videos.length) {
    saveState(); // حفظ الحالة قبل الحذف
    const deletedVideo = videos.splice(index, 1)[0];
    updateTable();
    saveToLocalStorage();
    showToast(`تم حذف "${deletedVideo.title}"`, false);
    updateUndoButton();
  }
}

// تأكيد الحذف مع عرض الصورة المصغرة
function confirmDelete(index, videoId) {
  if (videos.length === 0) {
    showToast("لا يوجد فيديوهات للحذف", true);
    return;
  }

  const modal = document.getElementById('deleteModal');
  const thumbnail = document.getElementById('deleteThumbnail');
  
  // تعيين صورة مصغرة افتراضية إذا لم يتم تحميلها
  thumbnail.src = getThumbnailUrl(videoId);
  thumbnail.onerror = function() {
    this.src = 'assets/no-thumbnail.png';
  };

  // عرض النافذة في وسط الشاشة
  modal.style.display = 'flex';
  
  // إعداد أحداث الأزرار
  document.getElementById('confirmDelete').onclick = function() {
    deleteVideo(index);
    modal.style.display = 'none';
  };
  
  document.getElementById('cancelDelete').onclick = function() {
    modal.style.display = 'none';
  };
}

// إعداد Lazy Loading للصور
function setupLazyLoading() {
  const lazyImages = document.querySelectorAll('img.lazy');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        img.src = img.dataset.src;
        img.classList.remove('lazy');
        observer.unobserve(img);
      }
    });
  });

  lazyImages.forEach(img => observer.observe(img));
}

// تحريك الفيديو لأعلى أو لأسفل
function moveVideo(index, direction) {
  if ((direction === 'up' && index === 0) || (direction === 'down' && index === videos.length - 1)) {
    return;
  }

  const newIndex = direction === 'up' ? index - 1 : index + 1;
  [videos[index], videos[newIndex]] = [videos[newIndex], videos[index]];
  updateTable();
  saveToLocalStorage();
}

// التصدير إلى Excel
function downloadExcel() {
  if (videos.length === 0) {
    showToast("لا توجد فيديوهات لاستخراجها.");
    return;
  }

  try {
    const worksheet = XLSX.utils.json_to_sheet(videos.map(video => ({
      'ID': video.id,
      'العنوان': video.title
    })), {skipHeader: true});
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Videos');
    XLSX.writeFile(workbook, 'youtube_videos.xlsx');
    showToast("تم تنزيل ملف Excel بنجاح", false);
  } catch (error) {
    console.error(error);
    showToast("حدث خطأ أثناء إنشاء ملف Excel");
  }
}

// التصدير إلى CSV
function downloadCSV() {
  if (videos.length === 0) {
    showToast("لا توجد فيديوهات لاستخراجها.");
    return;
  }

  try {
    let csvContent = videos.map(video => 
      `"${video.id}","${video.title.replace(/"/g, '""')}"`
    ).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'youtube_videos.csv';
    link.click();
    showToast("تم تنزيل ملف CSV بنجاح", false);
  } catch (error) {
    console.error(error);
    showToast("حدث خطأ أثناء إنشاء ملف CSV");
  }
}

// التصدير إلى JSON
function downloadJSON() {
  if (videos.length === 0) {
    showToast("لا توجد فيديوهات لاستخراجها.");
    return;
  }

  try {
    const dataStr = JSON.stringify(videos, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'youtube_videos.json';
    link.click();
    showToast("تم تنزيل ملف JSON بنجاح", false);
  } catch (error) {
    console.error(error);
    showToast("حدث خطأ أثناء إنشاء ملف JSON");
  }
}

// نسخ القائمة إلى الحافظة
function copyToClipboard() {
  if (videos.length === 0) {
    showToast("لا توجد فيديوهات لنسخها.");
    return;
  }

  // إنشاء محتوى نصي منسق للنسخ
  const textToCopy = videos.map(v => 
    copyOrder === 'titleFirst' 
      ? `${v.title.replace(/\n/g, ' ')}\t${v.id}`
      : `${v.id}\t${v.title.replace(/\n/g, ' ')}`
  ).join('\n');
  
  navigator.clipboard.writeText(textToCopy)
    .then(() => showToast("تم نسخ القائمة إلى الحافظة (جاهز للصق في Excel)", false))
    .catch(err => {
      console.error('Failed to copy:', err);
      // حل بديل للمتصفحات القديمة
      const textarea = document.createElement('textarea');
      textarea.value = textToCopy;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      showToast("تم النسخ (باستخدام الطريقة القديمة)", false);
    });
}

function toggleCopyOrder() {
  copyOrder = copyOrder === 'titleFirst' ? 'idFirst' : 'titleFirst';
  showToast(`تم تغيير ترتيب النسخ إلى: ${copyOrder === 'titleFirst' ? 'العنوان أولاً' : 'ID أولاً'}`, false);
}


function setupDragAndDrop() {
  const tbody = document.querySelector('#resultTable tbody');
  
  tbody.addEventListener('dragstart', (e) => {
    if (e.target.tagName === 'TR') {
      e.target.classList.add('dragging');
      e.dataTransfer.setData('text/plain', e.target.rowIndex - 1);
      e.dataTransfer.effectAllowed = 'move';
    }
  });
  
  tbody.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggingRow = document.querySelector('.dragging');
    const rowUnder = e.target.closest('tr');
    
    if (rowUnder && rowUnder !== draggingRow) {
      const rect = rowUnder.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      
      if (e.clientY < mid) {
        tbody.insertBefore(draggingRow, rowUnder);
      } else {
        tbody.insertBefore(draggingRow, rowUnder.nextSibling);
      }
    }
  });
  
  tbody.addEventListener('dragend', (e) => {
    if (e.target.tagName === 'TR') {
      e.target.classList.remove('dragging');
      
      // تحديث مصفوفة videos بناءً على الترتيب الجديد
      const newVideos = [];
      const rows = tbody.querySelectorAll('tr');
      rows.forEach(row => {
        const index = parseInt(row.dataset.index);
        newVideos.push(videos[index]);
      });
      
      saveState();
      videos = newVideos;
      saveToLocalStorage();
    }
  });
  
  // جعل جميع الصفوف قابلة للسحب
  tbody.querySelectorAll('tr').forEach(row => {
    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      e.target.style.opacity = '0.5';
    });
    row.addEventListener('dragend', (e) => {
      e.target.style.opacity = '1';
    });
  });
}


// مسح جميع الفيديوهات
function clearAll() {
  if (videos.length === 0) return;
  
  if (confirm("هل أنت متأكد من مسح جميع الفيديوهات؟")) {
    saveState(); // حفظ الحالة قبل المسح
    videos.length = 0;
    updateTable();
    localStorage.removeItem('youtubeExtractorData');
    showToast("تم مسح جميع الفيديوهات", false);
    updateUndoButton();
  }
}

// حفظ البيانات في localStorage
function saveToLocalStorage() {
  const data = {
    videos,
    timestamp: Date.now()
  };
  localStorage.setItem('youtubeExtractorData', JSON.stringify(data));
}

// تحميل البيانات من localStorage
function loadFromLocalStorage() {
  const savedData = localStorage.getItem('youtubeExtractorData');
  if (savedData) {
    const { videos: savedVideos, timestamp } = JSON.parse(savedData);
    
    if (Date.now() - timestamp < CACHE_EXPIRY) {
      videos.push(...savedVideos);
      updateTable();
      showToast(`تم استعادة ${savedVideos.length} فيديو من الجلسة السابقة`, false);
    } else {
      localStorage.removeItem('youtubeExtractorData');
    }
  }
}

// تبديل الوضع الليلي
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

// التحقق من تفضيلات الوضع الليلي
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
  loadFromLocalStorage();
  
  document.getElementById('themeToggle').addEventListener('click', toggleDarkMode);
  document.getElementById('confirmDelete').addEventListener('click', () => {
    if (deleteQueue) {
      const tr = document.querySelector(`#resultTable tbody tr:nth-child(${deleteQueue.index + 1})`);
      if (tr) tr.classList.add('removing-row');
      
      setTimeout(() => {
        videos.splice(deleteQueue.index, 1);
        updateTable();
        saveToLocalStorage();
        document.getElementById('deleteModal').style.display = 'none';
        showToast("تم حذف الفيديو", false);
      }, 400);
    }
  });
  
  document.getElementById('cancelDelete').addEventListener('click', () => {
    document.getElementById('deleteModal').style.display = 'none';
  });
  
  document.querySelector('.close').addEventListener('click', () => {
    document.getElementById('deleteModal').style.display = 'none';
  });

  // Debounce لحقل الإدخال
  document.getElementById('videoURL').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addVideo();
    }
  });
});