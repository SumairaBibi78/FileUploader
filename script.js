// constants
const MAX_COUNT = 10;
const MAX_TOTAL_MB = 10;
const STORAGE_KEY = 'uploadedImages';

//element references
const dropArea = document.getElementById('drop-area');
const fileInput = document.getElementById('fileElem');
const gallery   = document.getElementById('gallery');
const errorMsg  = document.getElementById('error-msg');
const themeTgl  = document.getElementById('theme-toggle');

let images = [];

// Apply saved theme
if (localStorage.getItem('theme') === 'dark') { document.body.classList.add('dark'); }

// Theme toggle
themeTgl.addEventListener('click', () => {
  const dark = document.body.classList.toggle('dark');
  localStorage.setItem('theme', dark ? 'dark' : 'light');
});

// Load saved Images
try { images = JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } 
catch { images = []; }
images.forEach(dataURL => renderThumb(dataURL));

// Setup Drag & Drop
['dragover','dragleave','drop'].forEach(evt => {
  dropArea.addEventListener(evt, e => {
    e.preventDefault();

    if (evt === 'dragover') {dropArea.classList.add('dragover');}
    else {dropArea.classList.remove('dragover');}

    if (evt === 'drop' && e.dataTransfer.files.length) {
      handleFiles(e.dataTransfer.files);
    }

    /*if (evt === 'drop') {
      const dt = e.dataTransfer;
      //only handle true file drops
      if (dt?.files?.length) {
        handleFiles(dt.files);
      }
    }*/
  });
});

// Gallery drop handler for reorder
gallery.addEventListener('dragover', e=>{
  e.preventDefault();
  const dragging = gallery.querySelector('.thumb.dragging');
  if (!dragging) return;

  const siblings = [...gallery.querySelectorAll('.thumb:not(.dragging)')];
  const after = siblings.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = e.clientY - box.top - box.height/2;
    return (offset < 0 && offset > closest.offset)
      ? { offset, node: child } : closest;
  }, { offset: Number.NEGATIVE_INFINITY }).node;

  if (after) gallery.insertBefore(dragging, after);
  else gallery.appendChild(dragging);
});

// Open file dialog on click (browse)
dropArea.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
  fileInput.value = '';
});

// Display error messages
let errorTimeoutId = null;
function showError(msg) {
  clearTimeout(errorTimeoutId);
  if (errorMsg.parentNode) {errorMsg.remove();}

  //always re-insert and ensuring errorbox displays just before gallery
  gallery.parentNode.insertBefore(errorMsg, gallery);

  errorMsg.textContent = msg;
  errorMsg.classList.add('visible');
  errorTimeoutId = setTimeout(() => {
    errorMsg.classList.remove('visible');
    if (errorMsg.parentNode) {errorMsg.remove();}
  }, 5000);
}

//Validate limits
function exceedsLimit(newFiles) {
  if (images.length + newFiles.length > MAX_COUNT) {
    showError(`Max ${MAX_COUNT} Images Allowed.`);
    return true;
  }

  // Calculate existing bytes
  const currBytes = images.reduce((sum, d) => {
    const head = d.indexOf(',') + 1;
    return sum + atob(d.slice(head)).length;
  }, 0);
  const newBytes = Array.from(newFiles).reduce((sum, f) => sum + f.size, 0);

  if ((currBytes + newBytes) / (1024 * 1024) > MAX_TOTAL_MB) {
    showError(`Total size exceeds ${MAX_TOTAL_MB} MB.`);
    return true;
  }
  return false;
}

// Main file handler
function handleFiles(files) {
  if (exceedsLimit(files)) return;

  for (const file of files) {
    if (!/^image\/(jpe?g|png|gif)$/i.test(file.type)) {
      showError('Only JPG, PNG, and GIF are allowed.');
      continue;
    }
    simulateUpload(file);
  }
}

// Simulate upload with progress bar then preview
function simulateUpload(file) {
  const thumb = document.createElement('div');
  thumb.classList.add('thumb');
  thumb.setAttribute('draggable', true);

  const prog = document.createElement('div');
  prog.classList.add('progress');
  thumb.append(prog);
  gallery.append(thumb);

  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 20; // random speed
    prog.style.width = `${Math.min(progress,100)}%`;
    if (progress >= 100) {
      clearInterval(interval);
      previewFile(file, thumb);
    }
  }, 200);
}

//preview function
function previewFile(file, thumb) {
  const reader = new FileReader();

  reader.onload = e => {
    const dataURL = e.target.result;
    // if duplicate (or error), remove the placeholder and bail
    if (!persistImage(dataURL, 'add')) {
      thumb.remove();
      return;
    }

    // now that it's saved, show the preview
    thumb.innerHTML = '';
    addThumbnail(dataURL, thumb);
  };

  reader.onerror = () => {
    showError('Failed to Read File.');
    thumb.remove();
  };

  reader.readAsDataURL(file);
}

//render existing thumbnail
function renderThumb(dataURL) {
  const thumb = document.createElement('div');
  thumb.classList.add('thumb');
  thumb.setAttribute('draggable', true);
  gallery.append(thumb);
  addThumbnail(dataURL, thumb);
}

// Create an img inside thumb-container
function addThumbnail(dataURL, thumb) {
  /*if (!thumb) {
    thumb = document.createElement('div');
    thumb.classList.add('thumb');
    thumb.setAttribute('draggable', true);
    thumb.setAttribute('tabindex', '0'); //focusable container
  }*/
  //always append idempotently
  if (!gallery.contains(thumb)) {gallery.append(thumb);}
  thumb.tabIndex = 0;

  //create image with alt
  const img = document.createElement('img');
  img.src = dataURL;
  img.alt = 'Uploaded Image';
  thumb.append(img);
    
  // create remove button
  const btn = document.createElement('button');
  btn.textContent = 'x';
  btn.className = 'remove-btn';
  btn.setAttribute('aria-label', 'Remove Image');
  btn.addEventListener('click', () => {
    if (persistImage(dataURL, 'remove')) {thumb.remove();}
  });
  thumb.append(btn);

  //drag-to-reorder
  thumb.addEventListener('dragstart', () => thumb.classList.add('dragging'));
  thumb.addEventListener('dragend', () => {
    thumb.classList.remove('dragging');
    updateSavedOrder();
  });
}
//persist into localStorage new code
function persistImage(dataURL, action = 'add') {
  // 1) Build the next state, but don’t touch `images` yet
  let next;
  if (action === 'add') {
    if (images.includes(dataURL)) {
      showError('File Already Exists.');
      return false;
    }
    next = [...images, dataURL];
  } else {
    if (!images.includes(dataURL)) {
      showError('Image not Found to Remove.');
      return false;
    }
    next = images.filter(item => item !== dataURL);
  }

  // 2) Attempt to persist
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    showError('Failed to Update Images.');
    return false;
  }

  // 3) Only now replace in-memory state
  images = next;
  return true;
}


//persist into localStorage old code
/*function persistImage(dataURL, action = 'add') {
  try {
    if (action === 'add') {
      if (images.includes(dataURL)) {
        showError('File Already Exists.');
        return false;
      }
      images.push(dataURL);
    } 
    else { // remove
      const idx = images.indexOf(dataURL);
      if (idx === -1) {
        showError('Image not Found to remove.');
        return false;
      }
      images.splice(idx, 1);
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
    return true;
  } catch (err) {
    showError('Failed to update images.');
    return false;
  }
}*/

//NEW CODE
function updateSavedOrder() {
  const next = [...gallery.querySelectorAll('img')].map(img => img.src);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    showError('Failed to Save Order.');
    return;
  }
  images = next;
}

//OLD CODE
/*function updateSavedOrder() {
  images = [...gallery.querySelectorAll('img')].map(img => img.src);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(images));
}*/